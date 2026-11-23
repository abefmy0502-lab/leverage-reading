// 👥 フォロー（2026-11-21 オーナー「フォロー、フォロワーにすることができるようにして、フォロー認証をされたら常に見ることができるように」）。
//   相手を見つけるのは、相手のリンク（/u/<public_id>）か ID だけ（名前で探さない・オーナー裁定）。
//   申し込み → 相手が承認 → 承認された人は相手の本棚と「この本のまとめ」をいつでも見られる（公開がオフでも）。
//   ブロック・通報ができる（App 審査 1.2）。データベースは supabase_follows.sql（関数だけが書く）。
//   承認された人は相手のフォロー中・フォロワーも見られ、その場でフォローできる（本人は隠せる・2026-11-23）。
//   Web は既定で出す。iPhone のアプリは VITE_SOCIAL=on のビルドだけ（1.0.1 から・ビルド 7 には入れない＝オーナー裁定）。
import { Capacitor } from '@capacitor/core';
import { supabase, isSupabaseConfigured, isDemo } from './supabase';
import { profileTextIssue } from './profileFilter';
import { SITE_URL } from './legalLinks';
import { checkCoverImageUrl } from '../../api/_coverImageUrl.js';

// ほかの人に見せる表紙は、書店・図書館などの配信元のものだけ（自分で上げた表紙＝Supabase の book-covers は出さない・
// 公開のページ api/_profilePage.js と同じ決まり・App 審査 1.2＝利用者が上げた画像を確かめずに人に見せない）。
export function sharedCoverUrl(raw) {
  const c = raw ? checkCoverImageUrl(String(raw)) : { ok: false };
  return c.ok ? c.url : '';
}

// 2026-11-21 オーナー「入れてください」: Web は既定で出す（VITE_SOCIAL=off で止める）。
//   iPhone のアプリはビルドに VITE_SOCIAL=on を入れたときだけ（1.0.1 から・ビルド 7 には出さない）。
const flag = String(import.meta.env?.VITE_SOCIAL || '').toLowerCase();
const native = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();
const demoOn = isDemo && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('social') === '1';
export const SOCIAL_ON = flag === 'on' || (flag !== 'off' && !native) || demoOn;

const PUBLIC_ID_RE = /^[a-z0-9]{10}$/;

/** リンク・ID の文字から public_id を取り出す（https://…/u/abc… ・ /u/abc…/b/… ・ abc… のどれでも）。無ければ ''。 */
export function publicIdFrom(text) {
  const s = String(text || '').trim().toLowerCase();
  if (PUBLIC_ID_RE.test(s)) return s;
  const m = s.match(/\/u\/([a-z0-9]{10})(?:[/?#]|$)/) || s.match(/[?&]follow=([a-z0-9]{10})(?:&|$)/);
  return m ? m[1] : '';
}

const notReady = (e) => !!e && (e.code === 'PGRST202' || e.code === '42883' || /Could not find the function|does not exist/.test(String(e.message || '')));

async function call(name, args, { client = supabase } = {}) {
  if (!client || (client === supabase && !isSupabaseConfigured)) return { ok: false, reason: 'not_ready' };
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (notReady(error)) return { ok: false, reason: 'not_ready' };
    throw error;
  }
  return { ok: true, data };
}

const cleanPerson = (p) => ({
  publicId: String(p?.public_id || ''),
  nickname: profileTextIssue(p?.nickname, 'own') ? '' : String(p?.nickname || ''),
  avatar: String(p?.avatar || ''),
  since: p?.since || null,
});

/** 自分の一覧。{ ok, lists: { following, followers, requests, sent, blocked } } */
export async function loadFollows(opts) {
  const r = await call('my_follows', {}, opts);
  if (!r.ok) return r;
  const d = r.data || {};
  const pick = (k) => (Array.isArray(d[k]) ? d[k] : []).map(cleanPerson).filter((p) => p.publicId);
  return {
    ok: true,
    lists: { following: pick('following'), followers: pick('followers'), requests: pick('requests'), sent: pick('sent'), blocked: pick('blocked') },
    // 自分のフォロー中・フォロワーをほかの人に見せるか（2026-11-23・SQL が古いと無い＝見せている扱い）
    followsVisible: d.me?.follows_visible !== false,
  };
}

const RELATIONS = ['self', 'accepted', 'pending', 'none'];
/**
 * 承認されたフォロー先（か自分）のフォロー中・フォロワー（2026-11-23 オーナー「相手のフォローしている人、フォロワーの中身を見れて
 * その人とも繋がれるようにしたい」）。答え: null（見られない・まだ使えない）／{ visible: false }（本人が隠している）／
 * { visible: true, following, followers }（人ごとに見る人から見た relation: self・accepted・pending・none）。
 */
export async function loadFolloweeConnections(publicId, opts) {
  const r = await call('followee_connections', { p_public_id: publicId }, opts);
  if (!r.ok || !r.data) return null;
  if (r.data.visible === false) return { visible: false, following: [], followers: [] };
  const pick = (k) => (Array.isArray(r.data[k]) ? r.data[k] : [])
    .map((p) => ({ ...cleanPerson(p), relation: RELATIONS.includes(p?.relation) ? p.relation : 'none' }))
    .filter((p) => p.publicId && p.nickname);
  return { visible: true, following: pick('following'), followers: pick('followers') };
}

/** 一覧の人の関係を書きかえる（その場でフォローしたとき・すべての一覧で同じ人を）。 */
export function withRelation(conn, publicId, relation) {
  if (!conn || typeof conn !== 'object' || !conn.visible) return conn;
  const fix = (list) => list.map((p) => (p.publicId === publicId && p.relation !== 'self' ? { ...p, relation } : p));
  return { ...conn, following: fix(conn.following), followers: fix(conn.followers) };
}

/** 自分のフォロー中・フォロワーを見せるか。答え: 'ok'・'no_profile'（プロフィールがまだ無い）・'not_ready' */
export async function setFollowsVisible(visible, opts) {
  const r = await call('set_follows_visible', { p_visible: !!visible }, opts);
  if (!r.ok) return r.reason;
  return r.data ? 'ok' : 'no_profile';
}

/** 申し込む。答え: pending・accepted・self・not_found・no_profile・anonymous・too_many・not_ready */
export async function requestFollow(publicId, opts) {
  const r = await call('follow_request', { p_public_id: publicId }, opts);
  return r.ok ? String(r.data || 'not_found') : r.reason;
}
export async function respondFollow(publicId, accept, opts) {
  const r = await call('follow_respond', { p_public_id: publicId, p_accept: !!accept }, opts);
  return r.ok ? String(r.data || '') : r.reason;
}
/** as: 'following'＝フォローをやめる（申し込みの取り消しも）／'follower'＝フォロワーから外す */
export async function removeFollow(publicId, as, opts) {
  const r = await call('follow_remove', { p_public_id: publicId, p_as: as }, opts);
  return r.ok;
}
export async function blockUser(publicId, opts) {
  const r = await call('block_user', { p_public_id: publicId }, opts);
  return r.ok && !!r.data;
}
export async function unblockUser(publicId, opts) {
  const r = await call('unblock_user', { p_public_id: publicId }, opts);
  return r.ok;
}

/** 人の様子（null＝見つからない）。 */
export async function previewProfile(publicId, opts) {
  const r = await call('profile_preview', { p_public_id: publicId }, opts);
  if (!r.ok) return r.reason === 'not_ready' ? { notReady: true } : null;
  const d = r.data;
  if (!d) return null;
  return { ...cleanPerson(d), relation: String(d.relation || 'none'), ...cleanShared(d) };
}

function cleanShared(d) {
  const own = (v) => (profileTextIssue(v, 'own') ? '' : String(v || ''));
  const book = (v) => (profileTextIssue(v, 'book') ? '' : String(v || ''));
  return {
    bio: own(d.bio), favTitle: book(d.fav_title), favAuthor: book(d.fav_author),
    favCover: sharedCoverUrl(d.fav_cover), favLine: own(d.fav_line),
  };
}

export const SHELF_ORDER = ['reading', 'done', 'before', 'want'];

/** 承認されたフォロー先の本棚（null＝見られない）。まとめに公開に向かない言葉・連絡先があれば出さない。 */
export async function loadFolloweeShelf(publicId, opts) {
  const r = await call('followee_shelf', { p_public_id: publicId }, opts);
  if (!r.ok || !r.data) return null;
  const p = r.data.profile || {};
  const books = (Array.isArray(r.data.books) ? r.data.books : [])
    .filter((b) => b && b.id && String(b.title || '').trim() && !profileTextIssue(b.title, 'book') && !profileTextIssue(b.author, 'book'))
    .map((b) => ({
      id: String(b.id), title: String(b.title).trim(), author: String(b.author || ''), isbn: String(b.isbn || ''),
      cover: sharedCoverUrl(b.cover),
      status: SHELF_ORDER.includes(b.status) ? b.status : 'want',
      rating: b.status === 'done' ? Math.max(0, Math.min(5, Math.round(Number(b.rating) || 0))) : 0,
      summary: profileTextIssue(b.summary, 'own') ? '' : String(b.summary || '').trim(),
    }));
  return { profile: { ...cleanPerson(p), ...cleanShared(p) }, books };
}

/** 通報の理由（えらぶ・書き足すのは任意）。 */
export const REPORT_REASONS = [
  { id: 'offensive', label: '攻撃的・差別的な内容' },
  { id: 'sexual', label: '性的・暴力的な内容' },
  { id: 'spam', label: '宣伝・なりすまし・迷惑な申し込み' },
  { id: 'contact', label: '連絡先・個人情報が書かれている' },
  { id: 'other', label: 'そのほか' },
];
export function reportReasonText(reasonId, detail = '') {
  const label = REPORT_REASONS.find((r) => r.id === reasonId)?.label || 'そのほか';
  const d = String(detail || '').replace(/\s+/g, ' ').trim();
  return `アプリから：${label}${d ? `／${d}` : ''}`.slice(0, 500);
}

/**
 * 通報。答え: 'ok'（受け付けた）・'rejected'（届いたが受け付けられなかった）・'failed'（送れなかった）。
 * まずデータベースの関数（report_profile・届いたかが分かる）。関数がまだ無いときだけ公開のページと同じ窓口へ
 * （アプリからは別のオリジンなので答えを読めない・送れたら受け付けたとみなす）。
 */
export async function reportProfile(publicId, reason = '', { fetchImpl = globalThis.fetch, client } = {}) {
  const why = String(reason || '').slice(0, 500);
  try {
    const r = await call('report_profile', { p_public_id: publicId, p_reason: why }, client ? { client } : undefined);
    if (r.ok) return r.data === 'ok' || r.data === 'self' ? 'ok' : 'rejected';
  } catch {
    return 'failed';
  }
  try {
    const body = new URLSearchParams({ id: publicId, reason: why });
    await fetchImpl(`${SITE_URL}/api/profile-report`, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    return 'ok';
  } catch {
    return 'failed';
  }
}

/** 申し込みの答えを画面の 1 文に。 */
export function followResultMessage(result) {
  return ({
    pending: 'フォローしました。相手が承認すると、本棚を見られます。',
    accepted: 'もうフォローしています。',
    self: '自分はフォローできません。',
    not_found: 'その人は見つかりませんでした。リンクか ID を確かめてください。',
    no_profile: 'フォローするには、先にプロフィールでニックネームを決めてください。',
    anonymous: 'フォローするには、アカウントを作ってください（設定のいちばん上から）。',
    too_many: '今日はこれ以上フォローできません。明日もう一度お試しください。',
    not_ready: 'フォローはまだ使えません。少し時間をおいてお試しください。',
  })[result] || 'フォローできませんでした。少し時間をおいてお試しください。';
}

/** 自分の ID を渡す文（公開していればページのリンクも・公開していなければ ID だけ＝/u/<id> は見つからないので）。 */
export function myIdShareText(me) {
  if (!me?.publicId) return { text: '', url: '' };
  const url = me.isPublic ? `${SITE_URL}/u/${me.publicId}` : '';  // profile.js の profileUrl と同じ形（profile.js がこのファイルを読むので循環させない）
  const text = url
    ? 'Orime で、わたしの本棚をフォローしてください。'
    : `Orime で、わたしの本棚をフォローしてください。\nID: ${me.publicId}\n（Orime の右上の自分のアイコン › 「ID でフォロー」に入れてください）`;
  return { text, url };
}

/** まとめの出だし（一覧に 3 行で出す・api/_profilePage.js の summaryExcerpt と同じ決まり）。 */
export function summaryExcerpt(text, max = 90) {
  const segs = String(text || '').replace(/\r\n?/g, '\n').trim().split(/\s*\n+\s*/).filter(Boolean);
  const one = segs.reduce((acc, seg) => (acc ? (/[。！？」』）]$/.test(acc) ? acc + seg : `${acc} ${seg}`) : seg), '');
  return one.length > max ? `${one.slice(0, max)}…` : one;
}
