// 📊 App Store のキャンペーンリンク（ct=）— どの入口から入手されたかを App Store Connect で数える（2026-10-08・マーケ戦略 §6-4）。
//
// App Store Connect →「App 分析」→「キャンペーン」で、キャンペーン名（ct）ごとにページ閲覧数・入手数が見られる。
// リンクの形: <App Store の URL>?pt=<provider token>&ct=<キャンペーン名>&mt=8
//   pt は App Store Connect で発行する数字（VITE_APP_STORE_PT）。無ければ ct を付けても数えられないので付けない。
//
// キャンペーン名の決まり（docs/lp-measurement.md に一覧）:
//   share_<種類>   … 写真で共有の画像に添える文（share_record / share_stats / share_quote / share_month_record / share_year_record …）
//   lp_<場所>      … 紹介ページのボタン（lp_hero_3d など・lpTrack.js の storeUrlFor）
//   note_<記事>    … note の記事に貼るリンク（note_launch など）
//   partner_<名前> … 発信者・読書会ごとのリンク（partner_nekomachi など）
//   web_<場所>     … Web のアプリから iPhone アプリへ（web_paywall / web_gate）
// 名前は英小文字・数字・_ だけ、40 字まで（App Store Connect の上限）。
//
// このファイルは何も import しない（node のスクリプト scripts/store-link.mjs からも使う）。env を読むのは appStore.js。

export const CT_MAX = 40;
export const CT_KINDS = ['share', 'lp', 'note', 'partner', 'web'];

// 名前の部分を英小文字・数字・_ だけにする（それ以外は _ に・続く _ は 1 つに・前後の _ は外す）。
export function ctSlug(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// キャンペーン名（kind は CT_KINDS のどれか・違えば ''）。name が空なら kind だけ。
export function campaignToken(kind, name = '') {
  if (!CT_KINDS.includes(kind)) return '';
  const slug = ctSlug(name);
  return (slug ? `${kind}_${slug}` : kind).slice(0, CT_MAX).replace(/_$/, '');
}

// URL にキャンペーンを付ける。url が無ければ ''・pt か ct が無ければ url のまま。
export function withCampaign(url, { pt = '', ct = '' } = {}) {
  const base = String(url || '').trim();
  if (!base) return '';
  const p = String(pt || '').trim();
  const c = String(ct || '').trim().slice(0, CT_MAX);
  if (!p || !c) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}pt=${encodeURIComponent(p)}&ct=${encodeURIComponent(c)}&mt=8`;
}

// 共有・note・発信者に渡すリンク。App Store の URL がまだ無い（live でない）ときは ''（入れない）。
export function storeCampaignLink({ url, live, pt = '' }, ct) {
  if (!live) return '';
  return withCampaign(url, { pt, ct });
}

// 写真で共有のキャンペーン名。variant: 'record' | 'stats' | 'quote'（ShareSheet の重ね方）・month: 今月の記録か。
// period: 'month'（今月）| 'year'（今年・12 月だけ・2026-10-08）| null（本 1 冊）。month: true は period: 'month' と同じ（前の呼び方）。
export function shareCampaign({ variant = 'record', month = false, period = null } = {}) {
  const v = ['record', 'stats', 'quote'].includes(variant) ? variant : 'record';
  const p = period === 'year' || period === 'month' ? period : (month ? 'month' : null);
  return campaignToken('share', p ? `${p}_${v}` : v);
}
