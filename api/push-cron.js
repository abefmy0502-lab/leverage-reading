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
import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';

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
  // 制御文字を除去してから空白を畳む。通知本文はロック画面に出るため、
  // 改行・タブ等は空白化し、その他の制御文字・双方向制御 (RTL override)・
  // ゼロ幅/不可視文字 (ZWSP / BOM) は載せない。
  const clean = String(text)
    // C0 制御 (NUL-US) + DEL + C1 制御 (0x80-0x9F)。
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    // 双方向制御 / ゼロ幅 / 不可視フォーマット (RTL override, ZWSP, BOM 等)。
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

// 間隔反復（spaced repetition / SM-2 lite）。recall.js のミラー。
// recall_count に応じて次の想起までの間隔を伸ばし、「忘れた頃に戻す」を機械的に保証する。
const RECALL_INTERVALS = [1, 3, 7, 16, 35, 70, 140]; // 日。recall_count で index（上限クランプ）
function dueGapDays(recallCount) {
  const i = Math.min(Math.max(0, recallCount || 0), RECALL_INTERVALS.length - 1);
  return RECALL_INTERVALS[i];
}
function isCondensedSource(sourceType) {
  return sourceType === 'summary' || sourceType === 'personal';
}

// 「忘れた頃に戻ってくる」メモを 1 件選ぶ（recall.js の pickRecallMemo と同ポリシー = 間隔反復）。
// notes 要素は { id, text, createdAt, lastRecalledAt?, recallCount?, sourceType?, isMemoRow? }。
// due 判定: 未想起なら作成から minAgeDays、想起済なら前回想起 + dueGapDays(recallCount) 経過で due。
// 既に最近想起した / 定着したメモはプッシュで送らない（due でない = 候補から除外）。
function pickRecallMemo(notes, { now, minAgeDays = 14, seed = 0 } = {}) {
  if (!Array.isArray(notes) || notes.length === 0) return null;
  const minAgeMs = minAgeDays * 86400000;

  const candidates = [];
  for (const n of notes) {
    if (!n || !n.text || !String(n.text).trim()) continue;
    const created = new Date(n.createdAt).getTime();
    if (Number.isNaN(created)) continue;

    const count = n.recallCount || 0;
    const lastRecalled = n.lastRecalledAt ? new Date(n.lastRecalledAt).getTime() : null;
    const dueTime =
      lastRecalled == null || Number.isNaN(lastRecalled)
        ? created + minAgeMs
        : lastRecalled + dueGapDays(count) * 86400000;
    if (now < dueTime) continue; // まだ間隔が来ていない → 除外

    const overdueDays = (now - dueTime) / 86400000;
    let score = overdueDays; // ① 長く overdue なほど優先
    score += Math.max(0, 6 - count) * 2; // ② 未定着ほど優先
    if (isCondensedSource(n.sourceType)) score += 5; // ③ 凝縮系を軽くブースト
    candidates.push({ note: n, score });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score || String(a.note.id).localeCompare(String(b.note.id)));
  const pool = candidates.slice(0, Math.min(5, candidates.length));
  const idx = Math.abs(Math.floor((seed * 9301 + 49297) % 233280)) % pool.length;
  return (pool[idx] || pool[0]).note;
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

  // book_memos は間隔反復列（last_recalled_at / recall_count / source_type）付きで取りに行く。
  // これらの列が未適用の DB では error が返るため、staged fallback で基本列のみ再取得する
  // （エラーで空配列に倒すと「間隔反復未適用の DB では通知が来ない」退行になるのを防ぐ）。
  const fetchMemos = async () => {
    const full = await supabase
      .from('book_memos')
      .select('id, text, created_at, last_recalled_at, recall_count, source_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500)
      .then((r) => r, () => ({ data: null, error: true }));
    if (full && !full.error && Array.isArray(full.data)) return full.data;
    // schema-error fallback: 間隔反復列なしで再取得（未適用 DB でも従来どおり動く）。
    const base = await supabase
      .from('book_memos')
      .select('id, text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500)
      .then((r) => r, () => ({ data: null }));
    return base?.data || [];
  };

  // book_memos と books は互いに独立したクエリ（同じ user_id で絞るだけ）なので同時に発射する。
  const [memoRows, bookRes] = await Promise.all([
    fetchMemos(),
    supabase
      .from('books')
      .select('id, leverage_memo, updated_at, created_at')
      .eq('user_id', userId)
      .limit(500)
      .then((r) => r, () => ({ data: null })),
  ]);

  for (const m of memoRows || []) {
    if (m && m.text && String(m.text).trim()) {
      notes.push({
        id: m.id,
        text: m.text,
        createdAt: m.created_at,
        // 未適用 DB では undefined になり、pickRecallMemo が null / 0 として扱う。
        lastRecalledAt: m.last_recalled_at,
        recallCount: m.recall_count,
        sourceType: m.source_type,
        isMemoRow: true, // 実 book_memos 行 = 送信成功時に last_recalled_at を更新できる
      });
    }
  }
  for (const b of bookRes?.data || []) {
    if (b && b.leverage_memo && String(b.leverage_memo).trim()) {
      notes.push({
        id: `summary-${b.id}`,
        text: b.leverage_memo,
        createdAt: b.updated_at || b.created_at,
        sourceType: 'summary', // まとめメモ = 凝縮系（選定で軽くブースト）
        isMemoRow: false, // 合成 id なので last_recalled_at 更新の対象外
      });
    }
  }

  return notes;
}

function getBearerToken(req) {
  const raw = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('Bearer ')) return null;
  return raw.slice(7).trim() || null;
}

// 固定時間比較（タイミング攻撃を避ける）。標準の crypto.timingSafeEqual を使用
// （revenuecat-webhook.js の safeEqual と同流儀）。長さ差は早期 return するが、
// 秘密長の露出はこの用途では許容範囲。
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return cryptoTimingSafeEqual(bufA, bufB);
}

// 既知のプッシュサービスのホストだけを許可（SSRF 防御）。endpoint は
// クライアントが書き込めるため、HTTPS かつ正規のプッシュゲートウェイに限定する。
const PUSH_HOST_SUFFIXES = [
  '.push.services.mozilla.com', // Firefox
  'fcm.googleapis.com',         // Chrome / Android (FCM)
  '.notify.windows.com',        // Edge / Windows (WNS)
  'web.push.apple.com',         // Safari / iOS (Apple)
  '.push.apple.com',
];
function isAllowedPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint) return false;
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((s) =>
    s.startsWith('.') ? host.endsWith(s) : host === s,
  );
}

// Cron 認証: Vercel Cron の Authorization: Bearer <CRON_SECRET> を検証。
// 注意: x-vercel-cron ヘッダはクライアントが偽装可能な公開ヘッダなので
// 認証根拠にしない（CRON_SECRET の Bearer 一致のみを唯一のゲートにする）。
function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 未設定なら開けない（fail-closed）
  const token = getBearerToken(req);
  if (!token) return false;
  return timingSafeEqual(token, secret);
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
  // 多重送信ガードの境界は数値(ms)で比較する。last_sent_at は Postgres timestamptz で
  // "+00:00" 表記やマイクロ秒を含みうるため、ISO 文字列の辞書順比較は不正確になる。
  const resendCutoffMs = now - RESEND_GUARD_DAYS * 86400000;

  let subs = [];
  try {
    // 注意: push_subscriptions には preferred_hour / tz_offset_min 列も存在するが、
    // MVP の配信ロジックは「Cron が叩かれたタイミングで一括送信」であり、時刻
    // ターゲティングを行わないため、これらは意図的に SELECT しない（取得しても
    // 使わないと「設定したのに反映されない」誤解を生むため）。将来、ユーザー
    // ごとの希望時刻に寄せた配信（tz_offset_min でローカル時刻を求め
    // preferred_hour 近傍でのみ送る）を実装する際に SELECT へ追加する。
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

  // 1 件ずつ完全直列で処理すると、購読者数が数百〜数千に増えたとき
  // Vercel の実行時間上限に対して線形に時間がかかり、後半の購読者が
  // 静かに送信されないまま Cron が打ち切られる恐れがある。かといって
  // 全件 Promise.all は push サービスへの同時接続数が無制限に跳ね上がる
  // ため、PUSH_BATCH_SIZE 件ずつのバッチ並列に留める。
  const PUSH_BATCH_SIZE = 15;

  const processSub = async (sub) => {
    try {
      if (sub.frequency === 'off') return 'skipped';
      // SSRF ガード: endpoint はクライアントが RLS upsert で自由に書ける。
      // service_role の cron が任意 URL に POST するのを防ぐため、既知の
      // プッシュサービスのホストにのみ送る（169.254.169.254 等への悪用を封じる）。
      if (!isAllowedPushEndpoint(sub.endpoint)) return 'skipped';
      // 多重送信ガード: 直近 RESEND_GUARD_DAYS 日以内に送っていればスキップ。
      // 数値比較（パース失敗時は未送信扱いで送る側に倒す = fail-open）。
      if (sub.last_sent_at) {
        const lastMs = Date.parse(sub.last_sent_at);
        if (!Number.isNaN(lastMs) && lastMs > resendCutoffMs) return 'skipped';
      }

      let notes = notesCache.get(sub.user_id);
      if (!notes) {
        notes = await gatherUserNotes(supabase, sub.user_id, now);
        notesCache.set(sub.user_id, notes);
      }
      if (notes.length < MIN_NOTES_TO_SEND) return 'skipped';

      // seed は user_id + 当日でばらけさせる（端末間で同じメモ・日替わりで別メモ）。
      const seed = (hashStr(sub.user_id) + Math.floor(now / 86400000)) >>> 0;
      const memo = pickRecallMemo(notes, { now, seed });
      if (!memo) return 'skipped';

      const payload = JSON.stringify({
        title: `💭 ${recallFraming(memo.createdAt, now)}`,
        body: memoExcerpt(memo.text),
        url: `/?recall=${encodeURIComponent(memo.id)}`,
        tag: 'orime-recall',
      });

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        // last_sent_at を更新（fire-and-forget でよいが await で確実に）。
        // これは端末単位の多重送信ガード（既存挙動・変更しない）。
        await supabase
          .from('push_subscriptions')
          .update({ last_sent_at: nowIso })
          .eq('id', sub.id);
        // 送信成功 = そのメモを「想起した」とみなし、間隔反復の last_recalled_at を
        // 更新する（次の想起を dueGapDays 分先送り = すぐ再プッシュしない）。recall_count は
        // プッシュでは増やさない（「覚えた」フィードバックはアプリ内のカードでのみ発生）。
        // 実 book_memos 行のみ対象（まとめメモは合成 id なので更新しない）。
        // 列が未適用でも error を握りつぶすだけで送信結果には影響しない。
        if (memo.isMemoRow && memo.id) {
          try {
            await supabase
              .from('book_memos')
              .update({ last_recalled_at: nowIso })
              .eq('id', memo.id);
          } catch {
            /* last_recalled_at 列が無い / 更新失敗でも送信は成立している */
          }
        }
        return 'sent';
      } catch (sendErr) {
        const status = sendErr && (sendErr.statusCode || sendErr.status);
        if (status === 404 || status === 410) {
          // 失効した購読 → 削除対象に積む。
          expiredSubIds.push(sub.id);
        } else {
          console.warn('[push-cron] send failed (kept):', status, sendErr?.message);
        }
        return 'skipped';
      }
    } catch (loopErr) {
      console.warn('[push-cron] loop error (skipped):', loopErr?.message);
      return 'skipped';
    }
  };

  for (let i = 0; i < subs.length; i += PUSH_BATCH_SIZE) {
    const batch = subs.slice(i, i + PUSH_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(batch.map(processSub));
    for (const r of results) {
      if (r === 'sent') sent += 1;
      else skipped += 1;
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
