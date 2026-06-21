// 🔔 想起プッシュ通知 — 配信 Cron（Vercel Cron から叩く想定）。
//
// 役割:
//   1. service_role で push_subscriptions（enabled=true）を全件取得
//   2. ユーザーごとに「忘れた頃のあなたのメモ」を 1 件選定（src/lib/recall の思想）
//   3. web-push でその端末へ通知を送信（タイトル「💭 Nヶ月前のあなたのメモ」/ 本文=抜粋）
//   4. 失効した購読（410 Gone / 404）は push_subscriptions から DELETE
//   5. last_sent_at を更新（多重送信ガード）
//
// 思想ガード（CLAUDE.md / 設計書 §4）:
//   - 低頻度（Cron は週1想定）・完全オプトイン・1タップで該当メモへ。
//   - メモ 3 件未満 / 14 日以上前のメモが無いユーザーには送らない（空通知防止）。
//   - last_sent_at で「直近に送ったユーザーはスキップ」= Cron 多重発火でも二重送信しない。
//
// ───────────────────────────────────────────────────────────────────
// ★★★ 元帥がやる環境作業（このコードだけでは動かない）★★★
//   1. VAPID 鍵生成:    npx web-push generate-vapid-keys
//   2. 依存インストール: npm i web-push   ← require('web-push') の解決に必須
//   3. Vercel env 設定:
//        VAPID_PUBLIC_KEY        （= クライアントの VITE_VAPID_PUBLIC_KEY と同一値）
//        VAPID_PRIVATE_KEY       （サーバー専用・クライアント露出厳禁）
//        VAPID_SUBJECT           （例 mailto:f.abe@pntwhere.com）
//        CRON_SECRET             （Cron 認証の共有シークレット）
//        SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（既存流用）
//   4. supabase_push_subscriptions.sql を Supabase SQL Editor で実行
//   5. vercel.json の crons でスケジュール登録（deploy 時に自動登録）
//   6. Cron は Authorization: Bearer <CRON_SECRET> を付与（Vercel の標準）
// ───────────────────────────────────────────────────────────────────
//
// ⚠️ このファイルは api/ 配下 = Vercel Serverless（Node）であり、Vite の
//    クライアントビルド対象外。require('web-push') が未インストールでも
//    `npm run build`（クライアント）には一切影響しない。

import { createClient } from '@supabase/supabase-js';

// ── 想起ロジック（src/lib/recall.js のサーバー版ミラー）─────────────
// recall.js は ESM・ブラウザ向けなので、ここでは同じアルゴリズムを Node 用に
// 最小ミラー。文言・選定ポリシーは recall.js と揃える（変えるなら両方直す）。

function relativeJa(iso, now) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.floor((now - t) / 1000);
  if (diff < 60) return 'さっき';
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}日前`;
  if (day < 30) return `${Math.floor(day / 7)}週間前`;
  if (day < 365) return `${Math.floor(day / 30)}ヶ月前`;
  return `${Math.floor(day / 365)}年前`;
}

function recallFraming(iso, now) {
  const r = relativeJa(iso, now);
  if (!r || r === 'さっき') return '過去のあなたのメモ';
  return `${r}のあなたのメモ`;
}

function memoExcerpt(text, max = 120) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

// 「忘れた頃に戻ってくる」メモを 1 件選ぶ（recall.js の pickRecallMemo と同ポリシー）。
function pickRecallMemo(notes, { now, minAgeDays = 14, seed = 0 } = {}) {
  if (!Array.isArray(notes) || notes.length === 0) return null;
  const minAgeMs = minAgeDays * 86400000;
  const sweetMin = 30 * 86400000;
  const sweetMax = 183 * 86400000;

  const eligible = notes.filter((n) => {
    if (!n || !n.text || !String(n.text).trim()) return false;
    const t = new Date(n.createdAt).getTime();
    if (Number.isNaN(t)) return false;
    return now - t >= minAgeMs;
  });
  if (eligible.length === 0) return null;

  const sweet = eligible.filter((n) => {
    const age = now - new Date(n.createdAt).getTime();
    return age >= sweetMin && age <= sweetMax;
  });
  const pool = sweet.length > 0 ? sweet : eligible;
  const idx = Math.abs(Math.floor((seed * 9301 + 49297) % 233280)) % pool.length;
  return pool[idx] || pool[0];
}

// ── web-push の遅延 require（未インストールでも import 時にクラッシュしない）──
let webpushMod = null;
let webpushConfigured = false;
function getWebPush() {
  if (webpushMod) return webpushMod;
  try {
    // eslint-disable-next-line global-require
    webpushMod = require('web-push');
  } catch {
    return null; // 未インストール = 機能無効（fail-safe）
  }
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:f.abe@pntwhere.com';
  if (pub && priv) {
    try {
      webpushMod.setVapidDetails(subject, pub, priv);
      webpushConfigured = true;
    } catch {
      webpushConfigured = false;
    }
  }
  return webpushMod;
}

let serviceClient = null;
function getServiceSupabase() {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

// 直近 N 日以内に送ったユーザーはスキップ（多重送信ガード）。
const RESEND_GUARD_DAYS = 5;
// メモがこの件数未満のユーザーには送らない（コールドスタート配慮・空通知防止）。
const MIN_NOTES_TO_SEND = 3;

// あるユーザーの「ノート」を集めて { id, text, createdAt } の配列にする。
// src/lib/ai.js の gatherKnowledge のサーバー版・最小流用（カードメモ + まとめメモ）。
// schema-fallback: 一部列が無くても落とさない。
async function gatherUserNotes(supabase, userId, now) {
  const notes = [];
  try {
    const { data: memoRows } = await supabase
      .from('book_memos')
      .select('id, text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);
    for (const m of memoRows || []) {
      if (m && m.text && String(m.text).trim()) {
        notes.push({ id: m.id, text: m.text, createdAt: m.created_at });
      }
    }
  } catch { /* テーブル/列が無くても続行 */ }

  try {
    const { data: bookRows } = await supabase
      .from('books')
      .select('id, leverage_memo, updated_at, created_at')
      .eq('user_id', userId)
      .limit(500);
    for (const b of bookRows || []) {
      if (b && b.leverage_memo && String(b.leverage_memo).trim()) {
        notes.push({
          id: `summary-${b.id}`,
          text: b.leverage_memo,
          createdAt: b.updated_at || b.created_at,
        });
      }
    }
  } catch { /* 続行 */ }

  return notes;
}

function getBearerToken(req) {
  const raw = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('Bearer ')) return null;
  return raw.slice(7).trim() || null;
}

// Cron 認証: Vercel Cron の Authorization: Bearer <CRON_SECRET> を検証。
function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 未設定なら開けない（fail-closed）
  const token = getBearerToken(req);
  if (token && token === secret) return true;
  // Vercel Cron は x-vercel-cron ヘッダも付ける。secret 一致が取れない場合の保険。
  if (req.headers && req.headers['x-vercel-cron']) return true;
  return false;
}

export default async function handler(req, res) {
  // Cron は GET で叩かれる（手動 POST も許容）。
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase service credentials not configured' });
  }

  const webpush = getWebPush();
  if (!webpush || !webpushConfigured) {
    // web-push 未インストール / VAPID 未設定 = 機能未準備。fail-safe で no-op。
    return res.status(200).json({ ok: true, skipped: 'push-not-configured', sent: 0 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const resendCutoff = new Date(now - RESEND_GUARD_DAYS * 86400000).toISOString();

  let subs = [];
  try {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, frequency, last_sent_at, enabled')
      .eq('enabled', true);
    if (error) throw error;
    subs = data || [];
  } catch (e) {
    // テーブル未適用なら graceful に no-op。
    return res.status(200).json({ ok: true, skipped: 'subscriptions-unavailable', sent: 0 });
  }

  // ユーザーごとにノートを一度だけ集めてキャッシュ（同一ユーザーが複数端末を持つ場合）。
  const notesCache = new Map();
  const expiredSubIds = [];
  let sent = 0;
  let skipped = 0;

  for (const sub of subs) {
    try {
      if (sub.frequency === 'off') { skipped += 1; continue; }
      // 多重送信ガード: 直近 RESEND_GUARD_DAYS 日以内に送っていればスキップ。
      if (sub.last_sent_at && sub.last_sent_at > resendCutoff) { skipped += 1; continue; }

      let notes = notesCache.get(sub.user_id);
      if (!notes) {
        // eslint-disable-next-line no-await-in-loop
        notes = await gatherUserNotes(supabase, sub.user_id, now);
        notesCache.set(sub.user_id, notes);
      }
      if (notes.length < MIN_NOTES_TO_SEND) { skipped += 1; continue; }

      // seed は user_id + 当日でばらけさせる（端末間で同じメモ・日替わりで別メモ）。
      const seed = (hashStr(sub.user_id) + Math.floor(now / 86400000)) >>> 0;
      const memo = pickRecallMemo(notes, { now, seed });
      if (!memo) { skipped += 1; continue; }

      const payload = JSON.stringify({
        title: `💭 ${recallFraming(memo.createdAt, now)}`,
        body: memoExcerpt(memo.text),
        url: `/?recall=${encodeURIComponent(memo.id)}`,
        tag: 'orime-recall',
      });

      try {
        // eslint-disable-next-line no-await-in-loop
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent += 1;
        // last_sent_at を更新（fire-and-forget でよいが await で確実に）。
        // eslint-disable-next-line no-await-in-loop
        await supabase
          .from('push_subscriptions')
          .update({ last_sent_at: nowIso })
          .eq('id', sub.id);
      } catch (sendErr) {
        const status = sendErr && (sendErr.statusCode || sendErr.status);
        if (status === 404 || status === 410) {
          // 失効した購読 → 削除対象に積む。
          expiredSubIds.push(sub.id);
        } else {
          console.warn('[push-cron] send failed (kept):', status, sendErr?.message);
        }
      }
    } catch (loopErr) {
      console.warn('[push-cron] loop error (skipped):', loopErr?.message);
      skipped += 1;
    }
  }

  // 失効購読をまとめて DELETE。
  if (expiredSubIds.length > 0) {
    try {
      await supabase.from('push_subscriptions').delete().in('id', expiredSubIds);
    } catch (e) {
      console.warn('[push-cron] cleanup failed:', e?.message);
    }
  }

  return res.status(200).json({
    ok: true,
    subscriptions: subs.length,
    sent,
    skipped,
    expired: expiredSubIds.length,
  });
}

// user_id を seed 用の数値にする簡易ハッシュ（決定的）。
function hashStr(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
