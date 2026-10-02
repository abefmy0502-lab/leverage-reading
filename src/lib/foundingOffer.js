// 🌱 創業メンバー価格（2026-10-02 オーナー承認・公開から 30 日間）。
//
// 中身: 公開から 30 日間にプランを始めた方は、月額・年額どちらでも（7 日間無料で始めた方も）創業メンバー。
//   特典: 開発者への直接の窓口（要望を優先して読む）・次に作る機能への投票（2026-10-02 コーディネーター裁定）。
//   価格: 年額プランだけ、1 年目 ¥9,800（2 年目から ¥12,800）。
//   App Store では「年額プランの初回特典（先払い・1 年・¥9,800）」として出す（company/launch-founding-offer.md）。
//   人数の上限（先着 N 人）は付けない・書かない（守れない希少性の表示は景表法のリスク）。
//
// ここが決めるのは LP（紹介ページ）の文言と、有料プランの画面の「創業メンバー価格」という呼び名だけ。
// 金額の真実はストア（有料プランの画面は iap.js の introPrice を見る）。env が on でもストアに初回価格が
// 無ければ、アプリは初回特典の無い価格を出す（約束しない側に倒す）。
//
// env:
//   VITE_FOUNDING_OFFER=on               … 出す（それ以外は出さない）
//   VITE_FOUNDING_OFFER_END=2026-12-15   … 最後の日（日本時間・この日の 23:59 まで）。無い・読めないときは出さない
//   VITE_FOUNDING_PRICE_LABEL            … LP の値段の書き方（既定「1 年目 ¥9,800」）
// 🧪 開発中だけ ?founding=on（両方）/ env（LP の文言だけ）/ store（ストアの初回価格だけ）/ off で切り替えられる。

// 創業メンバー価格の金額（年額プランの 1 年目・税込）。LP・Web 版の文言はここから作る（金額の真実は App Store）。
export const FOUNDING_PRICE_YEN = 9800;
export const FOUNDING_PRICE_TEXT = `¥${FOUNDING_PRICE_YEN.toLocaleString('ja-JP')}`;
export const FOUNDING_DEFAULT_PRICE_LABEL = `1 年目 ${FOUNDING_PRICE_TEXT}`;
export const FOUNDING_NAME = '創業メンバー価格';
// 開発中のプレビューで env の終わる日が無いときに使う日（公開 11 月中旬＋30 日の目安）。
const DEV_DEFAULT_END = '2026-12-15';

const JST_MS = 9 * 3600 * 1000;

// 「2026-12-15」→ 終わりの時刻（日本時間の 12月16日 0:00＝UTC の 12月15日 15:00）。読めなければ NaN。
export function foundingEndTime(end) {
  const m = String(end || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d + 1) - JST_MS;
  // 2026-02-31 のような存在しない日は弾く
  const back = new Date(Date.UTC(y, mo - 1, d));
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN;
  return t;
}

// 純粋関数（テストあり）。
//   flag: env の値（'on' のときだけ）/ end: 'YYYY-MM-DD' / priceLabel: LP の値段 / now: いまの時刻（ms）
// 返す形: { active, end, endLabel: '12月15日', priceLabel }
export function foundingOfferState({ flag, end, priceLabel, now = Date.now() } = {}) {
  const endTime = foundingEndTime(end);
  const on = String(flag || '').trim().toLowerCase() === 'on';
  const active = on && Number.isFinite(endTime) && now < endTime;
  let endLabel = '';
  if (Number.isFinite(endTime)) {
    const d = new Date(endTime - 1 + JST_MS); // 最後の日（日本時間）
    endLabel = `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  }
  return {
    active,
    end: Number.isFinite(endTime) ? String(end).trim() : '',
    endLabel,
    priceLabel: String(priceLabel || '').trim() || FOUNDING_DEFAULT_PRICE_LABEL,
    price: FOUNDING_PRICE_TEXT,
  };
}

// 開発中だけの切り替え（?founding=on|env|store|off）。本番は常に null。
export function devFoundingParam() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  try {
    const v = new URLSearchParams(window.location.search).get('founding');
    return ['on', 'env', 'store', 'off'].includes(v) ? v : null;
  } catch {
    return null;
  }
}

// いまの状態（env＋開発中の切り替え）。
export function readFoundingOffer(now = Date.now()) {
  const env = import.meta.env || {};
  const dev = devFoundingParam();
  let flag = env.VITE_FOUNDING_OFFER;
  let end = env.VITE_FOUNDING_OFFER_END;
  if (dev === 'on' || dev === 'env') { flag = 'on'; end = end || DEV_DEFAULT_END; }
  if (dev === 'off' || dev === 'store') flag = 'off';
  return foundingOfferState({ flag, end, priceLabel: env.VITE_FOUNDING_PRICE_LABEL, now });
}
