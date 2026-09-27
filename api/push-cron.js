// 🔔 想起プッシュ通知 — 配信 Cron（Vercel Cron から叩く想定）。
//
// 役割:
//   1. service_role で push_subscriptions（enabled=true）を全件取得
//   2. ユーザーごとに「忘れた頃のあなたのメモ」を 1 件選定（src/lib/recall の思想）
//   3. web-push でその端末へ通知を送信（タイトル「💭 N か月前のあなたのメモ」/ 本文=抜粋）
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
import { timingSafeEqual as cryptoTimingSafeEqual, sign as cryptoSign } from 'node:crypto';
import http2 from 'node:http2';
// package.json は "type":"module" なので require は使えない（以前は require('web-push') が常に失敗し、
// Web Push が一度も送られていなかった）。依存に入っているので静的に読み込む。
import webpushLib from 'web-push';

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
  // 表記はアプリ（src/lib/recall.js・ai.js）と同じ「5 か月前」（数字の前後に半角スペース）
  if (min < 60) return `${min} 分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 時間前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 日前`;
  if (day < 30) return `${Math.floor(day / 7)} 週間前`;
  if (day < 365) return `${Math.floor(day / 30)} か月前`;
  return `${Math.floor(day / 365)} 年前`;
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
  webpushMod = webpushLib;
  if (!webpushMod) return null;
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

// ── APNs(Apple Push Notification service)送信 — ネイティブ(iOS)行用 ──────
//
// ネイティブ(App Store アプリ)は Web Push が WKWebView で動かないため、
// platform='ios' の購読は APNs 経由で送る。JWT(ES256)をプロバイダ認証に使い、
// HTTP/2 で api.push.apple.com へ POST する。認証キー(.p8)はサーバー env のみ。
//
// ★★★ 元帥がやる環境作業 ★★★
//   1. Xcode: iOS プロジェクトに Push Notifications capability +
//      Background Modes(Remote notifications) を追加
//   2. Apple Developer: APNs 認証キー(.p8)を発行（Key ID を控える）
//   3. Vercel env:
//        APNS_KEY_ID        （.p8 の Key ID）
//        APNS_TEAM_ID       （Apple Developer の Team ID）
//        APNS_PRIVATE_KEY   （.p8 の中身。-----BEGIN PRIVATE KEY----- を含む全文。
//                             改行は \n エスケープでも実改行でも可）
//        APNS_BUNDLE_ID     （アプリの Bundle ID = apns-topic）
//        APNS_PRODUCTION    （'true' で本番 api.push.apple.com。未設定/false は
//                             sandbox api.sandbox.push.apple.com＝TestFlight/開発ビルド）
//   4. supabase_push_native.sql を Supabase SQL Editor で実行
//   ※ APNS_* が未設定なら ios 行は静かにスキップ（fail-safe・web 送信には無影響）。

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

let _apnsCfg = null;
let _apnsCfgResolved = false;
function getApnsConfig() {
  if (_apnsCfgResolved) return _apnsCfg;
  _apnsCfgResolved = true;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  let privateKey = process.env.APNS_PRIVATE_KEY;
  if (!keyId || !teamId || !bundleId || !privateKey) {
    _apnsCfg = null; // 未設定 = APNs 無効（web は無影響）
    return null;
  }
  // env に \n エスケープで入れられた PEM を実改行へ戻す。
  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  const production = String(process.env.APNS_PRODUCTION || '').toLowerCase() === 'true';
  _apnsCfg = {
    keyId,
    teamId,
    bundleId,
    privateKey,
    host: production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com',
  };
  return _apnsCfg;
}

// APNs プロバイダ JWT(ES256)。有効期限は最大 60 分だが、Cron 1 実行内で使い回すため
// 実行ごとに 1 度だけ生成する。iss=TeamID / kid=KeyID / iat=now。
let _apnsJwt = null;
let _apnsJwtAt = 0;
function makeApnsJwt(cfg) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (_apnsJwt && nowSec - _apnsJwtAt < 1800) return _apnsJwt; // 30 分キャッシュ
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const payload = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSec }));
  const signingInput = `${header}.${payload}`;
  // ES256 は ECDSA(P-256)+SHA-256。JWT は JOSE 形式(生 r||s の 64byte)を要求するため
  // dsaEncoding:'ieee-p1363' を指定（DER ではなく固定長）。
  const sig = cryptoSign('sha256', Buffer.from(signingInput), {
    key: cfg.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  _apnsJwt = `${signingInput}.${b64url(sig)}`;
  _apnsJwtAt = nowSec;
  return _apnsJwt;
}

// HTTP/2 セッションを Cron 1 実行内で使い回す（毎回 connect すると遅い）。
let _apnsSession = null;
function getApnsSession(host) {
  if (_apnsSession && !_apnsSession.destroyed && !_apnsSession.closed) return _apnsSession;
  _apnsSession = http2.connect(host);
  _apnsSession.on('error', () => { /* 個別 request 側で拾う */ });
  return _apnsSession;
}
function closeApnsSession() {
  try { if (_apnsSession && !_apnsSession.destroyed) _apnsSession.close(); } catch { /* ignore */ }
  _apnsSession = null;
}

// APNs デバイストークンの形式検証（16 進のみ・妥当な長さ）。apns_token は
// クライアントが RLS upsert で書けるため、:path に載せる前に軽く検証する。
function isValidApnsToken(token) {
  return typeof token === 'string' && /^[0-9a-fA-F]{32,200}$/.test(token);
}

// 1 件 APNs 送信。戻り値 { status, reason }（status=200 で成功）。
function sendApns(cfg, jwt, token, payloadObj) {
  return new Promise((resolve) => {
    let session;
    try {
      session = getApnsSession(cfg.host);
    } catch (e) {
      resolve({ status: 0, reason: e?.message || 'connect-failed' });
      return;
    }
    const body = Buffer.from(JSON.stringify(payloadObj));
    let req;
    try {
      req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': cfg.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
        'content-length': body.length,
      });
    } catch (e) {
      resolve({ status: 0, reason: e?.message || 'request-failed' });
      return;
    }
    let status = 0;
    let data = '';
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    req.setEncoding('utf8');
    req.on('response', (headers) => { status = headers[':status'] || 0; });
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      let reason = '';
      if (status !== 200 && data) {
        try { reason = JSON.parse(data)?.reason || ''; } catch { /* ignore */ }
      }
      done({ status, reason });
    });
    req.on('error', (e) => done({ status: 0, reason: e?.message || 'stream-error' }));
    req.setTimeout(10000, () => { try { req.close(); } catch { /* ignore */ } done({ status: 0, reason: 'timeout' }); });
    req.end(body);
  });
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
    // 新しいメモ 250 件と、思い出していない期間がいちばん長いメモ 250 件を合わせる
    // （新しい順だけだと、メモが多い人ほど古い＝忘れかけたメモが通知に出てこなかった）。
    const cols = 'id, text, created_at, last_recalled_at, recall_count, source_type';
    const [recent, oldest] = await Promise.all([
      supabase.from('book_memos').select(cols).eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(250)
        .then((r) => r, () => ({ data: null, error: true })),
      supabase.from('book_memos').select(cols).eq('user_id', userId)
        .order('last_recalled_at', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true }).limit(250)
        .then((r) => r, () => ({ data: null, error: true })),
    ]);
    if (recent && !recent.error && Array.isArray(recent.data)) {
      const seen = new Set();
      return [...recent.data, ...((oldest && !oldest.error && oldest.data) || [])]
        .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
    }
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
  const apnsCfg = getApnsConfig();
  const webReady = Boolean(webpush && webpushConfigured);
  const apnsReady = Boolean(apnsCfg);
  if (!webReady && !apnsReady) {
    // web-push 未インストール/VAPID 未設定 かつ APNs 未設定 = 機能未準備。fail-safe で no-op。
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
      .select('id, user_id, endpoint, p256dh, auth, frequency, last_sent_at, enabled, platform, apns_token')
      .eq('enabled', true)
      // 公平性: 最後に送ってから長い人を先に処理する（null=未送信を最優先）。
      // 実行時間上限で末尾が打ち切られても、毎回同じ人が飢餓しないようにする。
      .order('last_sent_at', { ascending: true, nullsFirst: true });
    if (error) throw error;
    subs = data || [];
  } catch (e) {
    // platform/apns_token 列が未適用の DB では上の SELECT が error になるため、
    // 基本列のみで再取得する（supabase_push_native.sql 未適用でも web 送信は動く）。
    try {
      const { data, error: e2 } = await supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth, frequency, last_sent_at, enabled')
        .eq('enabled', true)
        .order('last_sent_at', { ascending: true, nullsFirst: true });
      if (e2) throw e2;
      subs = (data || []).map((s) => ({ ...s, platform: 'web', apns_token: null }));
    } catch {
      // テーブル自体が未適用なら graceful に no-op。
      return res.status(200).json({ ok: true, skipped: 'subscriptions-unavailable', sent: 0 });
    }
  }

  // 同じ iPhone（同じ APNs トークン）に複数アカウントの行が残っている場合は、updated_at が
  // いちばん新しい 1 行だけに送る（アカウントを替えた端末に前の人のメモが届かないように）。
  // updated_at が取れないときは、誤配信を避けてそのトークンには送らない。
  const iosByToken = new Map();
  subs.filter((x) => x.platform === 'ios' && x.apns_token).forEach((x) => {
    const list = iosByToken.get(x.apns_token) || [];
    list.push(x);
    iosByToken.set(x.apns_token, list);
  });
  const dupTokens = [...iosByToken.entries()].filter(([, list]) => list.length > 1);
  if (dupTokens.length > 0) {
    const ids = dupTokens.flatMap(([, list]) => list.map((x) => x.id));
    let latestById = new Map();
    try {
      const { data } = await supabase.from('push_subscriptions').select('id, updated_at').in('id', ids);
      latestById = new Map((data || []).map((r) => [r.id, r.updated_at || '']));
    } catch { /* 取れなければ下の既定（どれにも送らない）へ */ }
    const drop = new Set();
    dupTokens.forEach(([, list]) => {
      const sorted = [...list].sort((a, b) => String(latestById.get(b.id) || '').localeCompare(String(latestById.get(a.id) || '')));
      // 最新が判定できないときは、誤配信を避けてこのトークンには送らない
      const keep = latestById.size > 0 ? sorted[0].id : null;
      list.forEach((x) => { if (x.id !== keep) drop.add(x.id); });
    });
    subs = subs.filter((x) => !drop.has(x.id));
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

  // 送信成功後の共通後処理（last_sent_at 多重送信ガード + 間隔反復の last_recalled_at）。
  const afterSend = async (sub, memo) => {
    await supabase
      .from('push_subscriptions')
      .update({ last_sent_at: nowIso })
      .eq('id', sub.id);
    // 送信成功 = そのメモを「想起した」とみなし、間隔反復の last_recalled_at を更新
    // （次の想起を dueGapDays 分先送り）。recall_count は増やさない（アプリ内カードのみ）。
    // 実 book_memos 行のみ対象（まとめメモは合成 id）。列未適用でも握りつぶす。
    if (memo.isMemoRow && memo.id) {
      try {
        await supabase.from('book_memos').update({ last_recalled_at: nowIso }).eq('id', memo.id);
      } catch { /* last_recalled_at 列が無い / 更新失敗でも送信は成立 */ }
    }
  };

  const isIosSub = (sub) => sub.platform === 'ios';

  const processSub = async (sub) => {
    try {
      if (sub.frequency === 'off') return 'skipped';
      const ios = isIosSub(sub);
      // 送信経路の準備状況で早期スキップ（片方だけ設定済みでも他方は動く）。
      if (ios && !apnsReady) return 'skipped';
      if (!ios && !webReady) return 'skipped';
      if (ios) {
        // APNs トークンの形式検証（クライアントが書ける値を :path に載せる前に）。
        if (!isValidApnsToken(sub.apns_token)) return 'skipped';
      } else {
        // SSRF ガード: endpoint はクライアントが RLS upsert で自由に書ける。
        // service_role の cron が任意 URL に POST するのを防ぐため、既知の
        // プッシュサービスのホストにのみ送る（169.254.169.254 等への悪用を封じる）。
        if (!isAllowedPushEndpoint(sub.endpoint)) return 'skipped';
      }
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

      const title = `💭 ${recallFraming(memo.createdAt, now)}`;
      const body = memoExcerpt(memo.text);
      const url = `/?recall=${encodeURIComponent(memo.id)}`;

      // ── ネイティブ(iOS/APNs)経路 ─────────────────────────────
      if (ios) {
        const jwt = makeApnsJwt(apnsCfg);
        const apnsPayload = {
          aps: { alert: { title, body }, sound: 'default' },
          url,
          recall: String(memo.id),
        };
        const { status, reason } = await sendApns(apnsCfg, jwt, sub.apns_token, apnsPayload);
        if (status === 200) {
          await afterSend(sub, memo);
          return 'sent';
        }
        // 削除は「トークンが恒久的に無効」= 410 / Unregistered のみ。
        // ⚠️ BadDeviceToken(400) や DeviceTokenNotForTopic(400) は env 誤設定
        // (APNS_PRODUCTION の本番/sandbox 取り違え・APNS_BUNDLE_ID 誤り) でも返る。
        // これを削除条件に含めると、設定ミス時に全 iOS 購読が 1 回の cron で消える
        // (ユーザーは再許可・再登録が必要=非可逆)。恒久失効の 410/Unregistered だけを
        // 削除し、それ以外は行を保持してログのみ(設定を直せば次回から復旧する)。
        if (status === 410 || reason === 'Unregistered') {
          expiredSubIds.push(sub.id);
        } else {
          console.warn('[push-cron] apns send failed (kept):', status, reason);
        }
        return 'skipped';
      }

      // ── Web(VAPID)経路（既存）─────────────────────────────────
      const payload = JSON.stringify({ title, body, url, tag: 'orime-recall' });
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        await afterSend(sub, memo);
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

  // APNs の HTTP/2 セッションを閉じる（開いていれば）。
  closeApnsSession();

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
