// 👥 フォロー（2026-11-21 オーナー「フォロー、フォロワーにすることができるようにして、フォロー認証をされたら常に見ることができるように」）。
//   相手を見つけるのは、相手のリンク（/u/<public_id>）か ID だけ（名前で探さない・オーナー裁定）。
//   申し込み → 相手が承認 → 承認された人は相手の本棚と「この本のまとめ」をいつでも見られる（公開がオフでも）。
//   ブロック・通報ができる（App 審査 1.2）。データベースは supabase_follows.sql（関数だけが書く）。
//   アプリの画面は VITE_SOCIAL=on のビルドだけ（1.0.1 から・ビルド 7 には入れない＝オーナー裁定）。お試しモードは &social=1。
import { supabase, isSupabaseConfigured, isDemo } from './supabase';
import { profileTextIssue } from './profileFilter';
import { SITE_URL } from './legalLinks';

const demoOn = isDemo && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('social') === '1';
export const SOCIAL_ON = import.meta.env.VITE_SOCIAL === 'on' || demoOn;

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
  return { ok: true, lists: { following: pick('following'), followers: pick('followers'), requests: pick('requests'), sent: pick('sent'), blocked: pick('blocked') } };
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
    favCover: /^https:\/\//.test(String(d.fav_cover || '')) ? String(d.fav_cover) : '', favLine: own(d.fav_line),
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
      cover: /^https:\/\//.test(String(b.cover || '')) ? String(b.cover) : '',
      status: SHELF_ORDER.includes(b.status) ? b.status : 'want',
      rating: b.status === 'done' ? Math.max(0, Math.min(5, Math.round(Number(b.rating) || 0))) : 0,
      summary: profileTextIssue(b.summary, 'own') ? '' : String(b.summary || '').trim(),
    }));
  return { profile: { ...cleanPerson(p), ...cleanShared(p) }, books };
}

/** 通報（公開のページと同じ窓口・理由の文だけ）。 */
export async function reportProfile(publicId, reason = '', { fetchImpl = globalThis.fetch } = {}) {
  try {
    const body = new URLSearchParams({ id: publicId, reason: String(reason || '').slice(0, 500) });
    // アプリ（capacitor://localhost）からは別のオリジンなので no-cors で送る（答えは読めない・届けば受け付けている）。
    await fetchImpl(`${SITE_URL}/api/profile-report`, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    return true;
  } catch {
    return false;
  }
}

/** 申し込みの答えを画面の 1 文に。 */
export function followResultMessage(result) {
  return ({
    pending: '申し込みました。相手が承認すると、本棚を見られます。',
    accepted: 'もうフォローしています。',
    self: '自分はフォローできません。',
    not_found: 'その人は見つかりませんでした。リンクか ID を確かめてください。',
    no_profile: 'フォローを申し込むには、先にプロフィールでニックネームを決めてください。',
    anonymous: 'フォローを申し込むには、アカウントを作ってください（設定のいちばん上から）。',
    too_many: '今日はこれ以上申し込めません。明日もう一度お試しください。',
    not_ready: 'フォローはまだ使えません。少し時間をおいてお試しください。',
  })[result] || '申し込めませんでした。少し時間をおいてお試しください。';
}

/** 自分の ID を渡す文（公開していればページのリンクも・公開していなければ ID だけ＝/u/<id> は見つからないので）。 */
export function myIdShareText(me) {
  if (!me?.publicId) return { text: '', url: '' };
  const url = me.isPublic ? `${SITE_URL}/u/${me.publicId}` : '';  // profile.js の profileUrl と同じ形（profile.js がこのファイルを読むので循環させない）
  const text = url
    ? 'Orime で、わたしの本棚をフォローしてください。'
    : `Orime で、わたしの本棚をフォローしてください。\nID: ${me.publicId}\n（Orime の 設定 › フォロー の「フォローを申し込む」に入れてください）`;
  return { text, url };
}
