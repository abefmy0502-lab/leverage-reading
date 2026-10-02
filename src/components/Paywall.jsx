// 💳 Paywall — 有料プランの画面（フリーミアム・2026-09-27〜）。
//
// 契約が無くてもアプリは使える（無料プラン: メモ・記録・シェア・相談 毎月 30 トークン）。この画面は
// アプリの上に重ねて開く（App の PaywallGate・いつでも × / 「あとで」で閉じられる）:
//   reason 'free_used' … 無料のトークンを使い切った（本人の本の表紙を並べる）
//   reason 'feature'   … プランで使える AI 機能を押した（feature＝機能の名前）
//   reason 'free_ocr_used' … 今月の無料の写真から書き起こし（毎月 10 回）を使い切った（2026-10-02・② プランの機能を押した扱い）
//   reason 'grown'     … 自分のメモが 10 件たまった（相談の「相談相手が育ってきました」・本人の本の表紙を並べる）
//   reason null        … 設定の「プランを見る」
// 7 日間無料（プランの無料期間）をすすめるのは、この 3 つ（① free_used ／ ② feature・free_ocr_used ／ ③ grown）と設定からだけ
// （lib/trialNudge.js）。「無料プラン（ずっと無料）」と「7 日間無料」を取り違えない書き方にする。
// 無料とプランの違いは 2 行の比較（トークンの量と、プランで増える機能）だけで見せる。
//
// 設計方針（DESIGN.md / brand-messaging.md 準拠）:
//   - 静か・誠実・控えめ（Apple メモ級）。煽らない・断定しない。絵文字は使わない（lucide の線アイコン）。
//   - 一番の価値「読むほど、自分だけの相談相手が育つ」を見出しに、相談＝主役・行動＝柱を 3 行で示す。
//   - 塗りの主ボタンは 1 つ（選んだプランで始める）。プランは選択式（年額が既定）。
//   - 価格の実数はストア（iap.js の getStoreLabels）/ env ラベル（billing.js の PLAN_LABELS）が真実。
//   - 解約自由・データ保持の安心コピーは規約文の中に 1 回だけ。
//
// App Store 審査ガイドライン 3.1.2（自動更新サブスク）の必須開示（ネイティブ版）:
//   プラン名・期間・価格（プランの行）/ 自動更新の条件（ボタン直下の文）/
//   購入を復元 / 利用規約・プライバシーポリシーへのリンク（文の下の 1 行）。
//
// 🌱 創業メンバー価格（2026-10-02・公開から 30 日間）: ストアが年額の初回特典に「先払い・1 年・¥9,800」を返すと、
//   年額の行は「1 年目 ¥9,800」＋「2 年目から ¥12,800」になり、年額には 7 日間無料を出さない（App Store の初回特典は
//   1 つの商品に 1 つ）。月額は 7 日間無料のまま。金額の真実はストア（lib/planOffers.js）。「創業メンバー価格」という
//   呼び名は、ストアに初回価格があり、かつ期間中（VITE_FOUNDING_OFFER・lib/foundingOffer.js）のときだけ。
//   特典（開発者への直接の窓口・機能への投票）の 1 行は期間中ならいつも（月額・年額・7 日間無料で始めた人も創業メンバー）。
//   env が on でもストアに初回価格が無ければ（対象外の人・未設定）初回価格の無い価格だけ。逆にストアにあって env が off なら、
//   値段は出して呼び名と特典は出さない。
//
// 🧪 表示プレビュー（開発専用）: お試しモードの ?demo=paywall&native=1 でネイティブ版の
//   見た目をブラウザで撮れる（showNative）。demoScenario は本番では常に null。
//   &founding=on（ストアの初回価格＋期間中）/ store（ストアの初回価格だけ）/ env（期間中だけ）で創業メンバー価格を確かめる。
//   プレビュー中は実際の購入・復元（RevenueCat）を一切呼ばない（isNative のときだけ呼ぶ）。

import { useEffect, useState, lazy, Suspense } from 'react';
import { Check, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { PLAN_LABELS } from '../lib/billing';
import {
  isNative,
  APP_PLAN_LABELS,
  getStoreLabels,
  purchasePlan,
  restorePurchases,
} from '../lib/iap';
import { toMessage } from '../lib/errors';
import { APP_STORE_URL, isAppStoreLive } from '../lib/appStore';
import { exportMemosAsMarkdown } from '../lib/exportData';
import { track, EVENTS } from '../lib/analytics';
import { demoScenario, isDemo, supabase, isSupabaseConfigured } from '../lib/supabase';
import { MiniCover } from './BookCards';
import { btnPrimary, btnPrimaryOff, btnLink, groupTitle, card } from '../styles/ui';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { TERMS_URL, PRIVACY_URL, SCT_URL } from '../lib/legalLinks';
import { FREE_TOKENS, PAID_TOKENS, TRIAL_TOKENS, TOKEN_COSTS, monthDayLabelJa } from '../lib/tokens';
import { FREE_OCR_PER_MONTH } from '../lib/tokenAmounts';
import { nextResetLabelJa } from '../lib/freeTrial';
import { normalizeTrialLabel, trialFirstPhrase } from '../lib/trialNudge';
import { introOfferOf, introPriceLabel, billedLineParts, planCtaLabel, trialPlanOf, renewalSentence, webRenewalSentence } from '../lib/planOffers';
import { readFoundingOffer, devFoundingParam, noBreak, FOUNDING_NAME, FOUNDING_PRICE_YEN, FOUNDING_PRICE_TEXT } from '../lib/foundingOffer';

// 未契約でもアカウントを削除できるように（App Store 審査 5.1.1(v)）。設定の削除欄をそのまま使う。
const AccountSettings = lazy(() => import('./AccountSettings'));

// 価格のラベル（billing.js / iap.js・VITE_PRICE_*_LABEL・ストアの値）を 2 行に分ける。
//   「年額 ¥12,800（税込・月あたり約¥1,066）」→ 1 行目「年額 ¥12,800（税込）」／2 行目「月あたり 約 ¥1,066」
//   「年額 ¥12,800（月あたり ¥1,066）」（ストア）→ 1 行目「年額 ¥12,800」／2 行目「月あたり ¥1,066」
// 括弧書きを途中で折り返すと書体によって行頭がずれるため、月あたりの額は別の行（--text-meta）にする。
// 分けられない形（括弧が無い・月あたりが無い）は、そのまま 1 行で出す。
function splitPriceLabel(text) {
  const s = String(text || '').trim();
  const m = s.match(/^(.*?)[（(]([^）)]*)[）)]\s*$/);
  if (!m) return { main: s, perMonth: '' };
  const parts = m[2].split(/[・、]/).map((x) => x.trim()).filter(Boolean);
  const perIdx = parts.findIndex((x) => x.startsWith('月あたり'));
  if (perIdx < 0) return { main: s, perMonth: '' };
  const rest = parts.filter((_, i) => i !== perIdx);
  const perMonth = parts[perIdx]
    .replace(/^月あたり\s*/, '月あたり ')
    .replace(/約\s*(?=[¥￥\d])/, '約 ');
  const head = m[1].trim();
  return { main: rest.length ? `${head}（${rest.join('・')}）` : head, perMonth };
}

function PriceText({ text }) {
  const { main, perMonth } = splitPriceLabel(text);
  return (
    <>
      <span style={{ display: 'block' }}>{main}</span>
      {perMonth && (
        <span style={planNote}>{perMonth}</span>
      )}
    </>
  );
}

// 開発専用のネイティブ表示プレビュー（本番は demoScenario=null で常に false）。
function readNativePreview() {
  if (!['paywall', 'free', 'freeused', 'freegrown'].includes(demoScenario) || typeof window === 'undefined') return { on: false, trial: '', price: '', storeIntro: false };
  const sp = new URLSearchParams(window.location.search);
  // &price=loading / fail で、ストア価格の読み込み中・失敗の表示を確かめられる。
  // 無料プランの人が開く 3 つ（①無料のトークンを使い切った＝freeused ②プランの機能を押した＝free
  // ③メモが 10 件たまった＝freegrown）は、GLOSSARY どおり 7 日間無料をすすめる場面なので、
  // 「7 日間無料を使える人」を既定にする（本番はストアの無料期間と本人の資格で決まる・2026-09-29 に ①② も）。
  // &trial=off で使えない人（年額／月額で始める）。paywall（契約なしの一般のプレビュー）は従来どおり無し。
  const t = sp.get('trial');
  const trial = t === 'off' ? '' : normalizeTrialLabel(t || (demoScenario === 'paywall' ? '' : '7日間無料'));
  // &founding=on|store: ストアが年額に「先払い・1 年・¥9,800」の初回特典を返したときの表示。
  const storeIntro = ['on', 'store'].includes(devFoundingParam());
  return { on: sp.get('native') === '1', trial, price: sp.get('price') || '', storeIntro };
}
const preview = readNativePreview();
// プレビューの年額の初回価格（ストアの introPrice と同じ形から作る）。
const PREVIEW_ANNUAL_INTRO = introPriceLabel(
  introOfferOf({ introPrice: { price: FOUNDING_PRICE_YEN, priceString: FOUNDING_PRICE_TEXT, periodUnit: 'YEAR', periodNumberOfUnits: 1, cycles: 1 } }),
  '¥12,800',
);
// 見た目の分岐だけに使う。購入・復元の実行可否は必ず isNative で判定する。
const showNative = isNative || preview.on;

// 無料プランとプランの違い（2 行・DESIGN §0-6: 説明の文は置かない）。量（トークン）を強く、中身は補足で。
// 「無料」だけの見出しにしない（7 日間無料と取り違えないよう「無料プラン（ずっと無料）」・GLOSSARY）。
const PLAN_COMPARE = [
  // 量の横に「相談なら何回か」を添える（トークンの数だけでは、どれだけ使えるか分からないため・2026-09-29）。
  // 写真から書き起こしは無料プランでも毎月 10 回（トークンとは別・2026-10-02）。
  { name: '無料プラン（ずっと無料）', amount: `毎月 ${FREE_TOKENS.toLocaleString()} トークン`, scope: `相談 約 ${Math.round(FREE_TOKENS / TOKEN_COSTS.consult).toLocaleString()} 回`, items: [`写真から書き起こし 毎月 ${FREE_OCR_PER_MONTH} 回`, 'メモ', '記録', '振り返り', 'シェア'] },
  // 機能名は語の途中で折り返さない（「写真から書き起こし」が割れないよう、名前ごとに nowrap で並べる）。
  { name: 'プラン', amount: `毎月 ${PAID_TOKENS.toLocaleString()} トークン`, scope: `相談なら 約 ${Math.round(PAID_TOKENS / TOKEN_COSTS.consult).toLocaleString()} 回`, lead: 'すべての AI：', items: ['AI 選書', '読書計画シート', '写真から書き起こし'] },
];
// 7 日間無料で使えるトークン（期間まるごと・2026-09-29 オーナー裁定で下の固定の欄に出す）。
// 折り返してよいのは「・」の後だけ（「150 トークン」「相談 約 15 回」は割らない・2026-09-30）。
const TRIAL_TOKENS_PARTS = [
  `${TRIAL_TOKENS.toLocaleString('ja-JP')} トークン・`,
  `相談 約 ${Math.round(TRIAL_TOKENS / TOKEN_COSTS.consult).toLocaleString('ja-JP')} 回`,
];
// トークンの目安（1 行）。
const TOKEN_EXAMPLE = `相談 1 回 約 ${TOKEN_COSTS.consult}・AI 選書 約 ${TOKEN_COSTS.advisor} トークン`;
// 無料の写真から書き起こしを使い切って開いたとき（free_ocr_used）は、プランで書き起こすといくつ使うかを先に（上限なしとは言わない）。
const TOKEN_EXAMPLE_OCR = `写真から書き起こし 1 回 約 ${TOKEN_COSTS.photoToText}・相談 1 回 約 ${TOKEN_COSTS.consult} トークン`;

// onlyPlan: 無料のトークンを使い切ったあと（本人の本の表紙を出すとき）はプランの行だけ（主ボタンを近くに）。
// trial: この人が使える無料期間（「7 日間無料」）。あればプランの行の名前に「（最初の 7 日間は無料）」。
//   選んだプランに無料期間があるときは下に固定の欄（「最初の 7 日間は無料」＋主ボタン）が言うので渡さない（繰り返さない）。
//   月額だけに無料期間があるとき（創業メンバー価格のあいだ）も渡さない（プランの行で月額にだけ出す・年額に無料期間があるように読ませない）。
function PlanCompare({ onlyPlan = false, trial = '', example = TOKEN_EXAMPLE }) {
  const rows = onlyPlan ? PLAN_COMPARE.filter((r) => r.name === 'プラン') : PLAN_COMPARE;
  return (
    <section aria-label={onlyPlan ? 'プランでできること' : '無料プランとプランの違い'} style={{ ...card, padding: 0, marginTop: 'var(--space-6)' }}>
      {rows.map((row, i) => (
        <div key={row.name} style={{ padding: 'var(--space-3) var(--space-4)', borderTop: i === 0 ? 'none' : '1px solid var(--separator)' }}>
          <p style={{ ...groupTitle, margin: 0 }}>{row.name}{row.name === 'プラン' && trial ? `（${trialFirstPhrase(trial)}）` : ''}</p>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
            <span style={{ whiteSpace: 'nowrap' }}>{row.amount}</span>
            {/* かっこの中は途中で折り返さない（「相談な／ら」のように割れないよう、まとまりで次の行へ）。 */}
            <span style={{ fontSize: 'var(--text-sub)', fontWeight: 400, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>（{row.scope}）</span>
          </p>
          <p style={{ ...metaText, marginTop: 'var(--space-1)' }}>
            {row.lead && <span style={{ whiteSpace: 'nowrap' }}>{row.lead}</span>}
            {row.items
              ? row.items.map((f, j) => <span key={f}>{j > 0 && '・'}<span style={{ whiteSpace: 'nowrap' }}>{f}</span></span>)
              : row.text}
          </p>
        </div>
      ))}
      <p style={{ ...metaText, padding: 'var(--space-2) var(--space-4) var(--space-3)', borderTop: '1px solid var(--separator)' }}>
        {/* 折り返すのは「・」の後だけ（「トー／クン」のように語の途中で割れないよう、まとまりごとに nowrap）。 */}
        {example.split('・').map((part, i, all) => (
          <span key={part} style={{ whiteSpace: 'nowrap' }}>{part}{i < all.length - 1 ? '・' : ''}</span>
        ))}
      </p>
    </section>
  );
}

// 文字ボタン（DESIGN §5 の btnLink＝アクセント色・15/600・高さ 44）。規約・復元・書き出し・
// アカウント切替もすべて同じ見た目にし、脇役であることは並び順と区切り線で示す。
const linkStyle = { ...btnLink, textDecoration: 'none' };
// 請求額の行＋主ボタンの欄（DESIGN §5「下に固定の保存」と同じ形）。スクロールする <main> の中で下に固定し、
// 横は <main> の余白（--space-4）の分だけ外へ広げて画面の幅いっぱいに区切り線を引く。
// 下の安全域はこの欄が持つ（<main> の下の余白は 0。sticky は親の余白の内側で止まるため）。
const stickyFooter = {
  position: 'sticky',
  bottom: 0,
  zIndex: 1,
  marginTop: 'var(--space-4)',
  marginLeft: 'calc(-1 * var(--space-4))',
  marginRight: 'calc(-1 * var(--space-4))',
  padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px))',
  background: 'var(--bg)',
  borderTop: '1px solid var(--separator)',
};
// 削除だけはエラー色（DESIGN §5）。ほかの文字ボタンとは行を分ける。
const dangerLinkStyle = { ...linkStyle, color: 'var(--error)' };
// 文字ボタンの並び（左端は文字の頭をほかの行とそろえる）。
const linkRow = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 var(--space-4)', marginLeft: 'calc(-1 * var(--space-1))' };

const metaText = {
  fontSize: 'var(--text-meta)',
  color: 'var(--text-2)',
  lineHeight: 1.6,
  margin: 0,
};

// プラン名は脇役（15/400/--text-2）。いちばん強いのは実際に請求される金額（17/600・審査 3.1.2）。
const planName = { fontSize: 'var(--text-sub)', fontWeight: 400, color: 'var(--text-2)', lineHeight: 1.3 };
// 「おすすめ」は押せない表示なので面を付けない（DESIGN §5「表示用ラベル」）。
const recommendTag = { fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)' };
const billedAmount = { display: 'block', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, marginTop: 'var(--space-1)', fontVariantNumeric: 'tabular-nums' };
// 補足の 2 行（月あたり・割引）は同じ大きさ・色にそろえる。
const planNote = { display: 'block', fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-2)', lineHeight: 1.5 };

// placeholder: 価格の読み込み中。本物の行と同じ中身を見えなくして重ね、読み込み後に高さが跳ねないようにする。
// tag: 名前の横の小さな表示（年額の「おすすめ」／創業メンバー価格のあいだは「創業メンバー価格」）。
// trialNote: この行にだけ無料期間があるとき（「最初の 7 日間は無料」・創業メンバー価格のあいだの月額）。
function PlanOption({ label, selected, onSelect, placeholder = false, tag = '', trialNote = '' }) {
  const Tag = placeholder ? 'div' : 'button';
  return (
    <Tag
      {...(placeholder
        ? { 'aria-hidden': true }
        : { type: 'button', role: 'radio', 'aria-checked': selected, onClick: onSelect })}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        width: '100%',
        minHeight: 44,
        padding: 'var(--space-3) var(--space-4)',
        textAlign: 'left',
        background: selected ? 'var(--accent-soft)' : 'var(--surface)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--separator)'}`,
        boxShadow: selected ? 'inset 0 0 0 1px var(--accent)' : 'none',
        borderRadius: 'var(--radius)',
        color: 'var(--text)',
        fontFamily: 'inherit',
        cursor: placeholder ? 'default' : 'pointer',
      }}
    >
      {/* 選択の印（はじめの一歩の本選びの丸と同じ形: 選択中は塗りの丸＋チェック、未選択は 2px の輪）。 */}
      <span
        aria-hidden="true"
        style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: selected ? 'var(--accent)' : 'transparent',
          border: selected ? 'none' : '2px solid var(--border)',
          visibility: placeholder ? 'hidden' : undefined,
        }}
      >
        {selected && <Check size={16} strokeWidth={3} color="var(--accent-ink)" />}
      </span>
      <span style={{ minWidth: 0, visibility: placeholder ? 'hidden' : undefined }}>
        <span style={{ ...planName, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {label.name}
          {/* 年額への後押し: 「おすすめ」（創業メンバー価格のあいだはその名前）。 */}
          {tag && <span style={recommendTag}>{tag}</span>}
        </span>
        {/* 実際に請求される金額をいちばん強く（審査 3.1.2）。割引は補足として弱く。
            有料の初回価格（創業メンバー価格）は「1 年目 ¥9,800」を強く、「2 年目から ¥12,800」を補足に。 */}
        {label.intro ? (
          <>
            <span style={billedAmount}>{label.intro.head}</span>
            {label.intro.after && <span style={planNote}>{label.intro.after}</span>}
          </>
        ) : (
          <span style={billedAmount}>
            <PriceText text={label.price} />
          </span>
        )}
        {label.save && <span style={planNote}>{label.save}</span>}
        {trialNote && <span style={planNote}>{trialNote}</span>}
      </span>
      {placeholder && (
        <SkeletonBlock height="auto" radius="var(--radius)" style={{ position: 'absolute', inset: 'var(--space-3) var(--space-4)', width: 'auto' }} />
      )}
    </Tag>
  );
}

// reason: 'free_used'（今月の無料のトークンを使い切った）のときは、本人の本の表紙を並べる
//   （一般的な特長より、自分の本が強い）。'feature' のときは見出しで機能の名前を出す。
// onClose: アプリの上に重ねて開いたときに渡る。閉じるとアプリに戻る。
export default function Paywall({ onPurchased, reason = null, feature = '', onClose = null }) {
  const { signOut, user } = useAuth();
  const toast = useToast();
  const [myBooks, setMyBooks] = useState([]);
  useEffect(() => {
    if ((reason !== 'free_used' && reason !== 'grown') || !user?.id || !isSupabaseConfigured) return undefined;
    let alive = true;
    (async () => {
      try {
        // 並べるのはメモのある本だけ（カード式のメモか「この本のまとめ」がある本・2026-09-30）。
        //   「育ってきた相談相手」の中身＝メモを書いた本。読みたいだけの本の表紙は並べない。
        const [{ data: memoRows }, { data: bookRows }] = await Promise.all([
          supabase.from('book_memos').select('book_id').eq('user_id', user.id)
            .order('created_at', { ascending: false }).limit(500),
          supabase.from('books').select('id, title, author, cover, leverage_memo').eq('user_id', user.id)
            .order('updated_at', { ascending: false }).limit(200),
        ]);
        const withMemo = new Set((memoRows || []).map((r) => r.book_id).filter(Boolean));
        const picked = (bookRows || [])
          .filter((b) => withMemo.has(b.id) || String(b.leverage_memo || '').trim())
          .slice(0, 4)
          .map(({ leverage_memo: _lm, ...b }) => b);
        if (alive) setMyBooks(picked);
      } catch { /* 表紙が無くても画面は出す */ }
    })();
    return () => { alive = false; };
  }, [reason, user?.id]);
  const fromFree = reason === 'free_used';
  const fromFeature = reason === 'feature';
  const fromFreeOcr = reason === 'free_ocr_used';
  // メモが 10 件たまって開いたとき（相談の「相談相手が育ってきました」）も、本人の本の表紙を並べる。
  const fromGrown = reason === 'grown';
  // 📊 課金転換率（CVR = purchase÷view）の分母。どこから開いたか（enum だけ）も添える。
  useEffect(() => { track(EVENTS.PAYWALL_VIEWED, { reason: reason || 'plan' }); }, [reason]);
  // 選んだプラン（年額が既定）。
  const [plan, setPlan] = useState('annual');
  // 購入手続き中のプラン（二度押し防止）。
  const [pending, setPending] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 創業メンバー価格の期間か（LP と同じ env・開くたびに読む＝終わる日を過ぎたら出ない）。
  const [founding] = useState(() => readFoundingOffer());
  // Web のキーボードの Esc で閉じる（アプリの上に重ねて開いたときだけ・2026-09-30）。購入の手続き中・上に設定を
  // 開いている間・ほかのダイアログが上にあるときは閉じない（そちらが Esc を受ける）。
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return;
      if (pending || settingsOpen) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending, settingsOpen]);
  // 表示ラベル: ネイティブ=App 既定 → ストア価格で上書き / Web=billing.js（env で上書き可）。
  const [labels, setLabels] = useState(() => (
    showNative
      ? {
        monthly: { ...APP_PLAN_LABELS.monthly, trial: isNative ? '' : preview.trial },
        annual: (!isNative && preview.storeIntro)
          ? { ...APP_PLAN_LABELS.annual, trial: '', save: '', intro: PREVIEW_ANNUAL_INTRO }
          : { ...APP_PLAN_LABELS.annual, trial: isNative ? '' : preview.trial },
      }
      : PLAN_LABELS
  ));
  // ストア価格の読み込み: 'loading' | 'ready' | 'failed'（ネイティブだけ。プレビュー・Web は最初から ready）。
  const [priceState, setPriceState] = useState(
    isNative ? 'loading' : preview.price === 'fail' ? 'failed' : preview.price === 'loading' ? 'loading' : 'ready',
  );
  const [priceTry, setPriceTry] = useState(0);

  // ネイティブ時のみ、App Store のローカライズ価格と無料期間をストアから取得する。
  // 取れるまでコードに書いた ¥ は見せない（他国のストアで通貨・金額が食い違うため）。
  useEffect(() => {
    if (!isNative) return undefined;
    let alive = true;
    setPriceState('loading');
    getStoreLabels(user?.id)
      .then((l) => {
        if (!alive) return;
        if (l?.ok) { setLabels(l); setPriceState('ready'); } else setPriceState('failed');
      })
      .catch(() => { if (alive) setPriceState('failed'); });
    return () => { alive = false; };
  }, [user?.id, priceTry]);

  const selected = labels[plan] || labels.annual;
  const trial = normalizeTrialLabel(selected.trial || '');
  // 両方のプランに無料期間があれば、比較のプランの行に「（最初の 7 日間は無料）」を出す。
  // 片方だけ（創業メンバー価格のあいだは月額だけ）のときは、その行にだけ「最初の 7 日間は無料」を出す（年額に無料期間があるように読ませない）。
  const trialPlan = priceState === 'ready' ? trialPlanOf(labels) : '';
  const anyTrial = trialPlan === 'both' ? normalizeTrialLabel(labels.annual?.trial || '') : '';
  const rowTrialNote = (id) => (trialPlan && trialPlan !== 'both' && labels[id]?.trial ? trialFirstPhrase(normalizeTrialLabel(labels[id].trial)) : '');
  // 創業メンバー価格と呼ぶのは、ストアが年額に有料の初回価格を返し、かつ期間中のときだけ（値段の真実はストア）。
  const foundingNamed = founding.active && !!labels.annual?.intro;
  // 年額の行の小さな表示。
  const annualTag = foundingNamed ? FOUNDING_NAME : 'おすすめ';

  // 契約できたときの知らせ。7 日間無料で始まったら「いつまで・何トークン」を言う（2026-09-29）。
  //   終わる日が分からないときは日付を省く。読める長さなので中央の ✓ を少し長めに出す。
  const showPurchasedToast = (trialEnd, startedTrial) => {
    if (!startedTrial) { toast.success('ご契約ありがとうございます。'); return; }
    const until = trialEnd ? monthDayLabelJa(trialEnd) : '';
    // 中央の ✓ は幅が狭いので、いつまで・何トークンは 2 行目に（括弧を外して、「トーク／ン」のように
    // 語の途中で折り返さない長さにする・数と単位も離さない）。
    const tokens = `${TRIAL_TOKENS}\u00a0トークン`;
    const message = until
      ? `7 日間無料がはじまりました\n${until}まで・${tokens}`
      : `7 日間無料がはじまりました\n${tokens}`;
    toast.show({ type: 'success', message, duration: 4000 });
  };

  const handleSubscribe = async () => {
    if (pending) return;
    if (!isNative && isDemo) {
      // お試しモード（開発専用）: 実際の購入は呼ばず、契約できたことにして先へ進める
      // （トークンの購入と同じ・「購入できません」の知らせが主ボタンに重なっていた・2026-09-29）。
      setPending(plan);
      try {
        const now = Date.now();
        const days = trial ? 7 : plan === 'monthly' ? 30 : 365;
        // 有料の初回価格（創業メンバー価格）で始めた＝period_type 'intro'（有料・無料期間ではない）。
        const periodType = trial ? 'trial' : selected.intro ? 'intro' : 'normal';
        const periodEnd = new Date(now + days * 86400000).toISOString();
        await supabase.from('subscriptions').upsert({
          user_id: user?.id, status: 'active', provider: 'demo',
          price_id: plan === 'monthly' ? 'orime_monthly' : 'orime_annual',
          period_type: periodType,
          current_period_end: periodEnd,
        }, { onConflict: 'user_id' });
        showPurchasedToast(trial ? periodEnd : null, !!trial);
        await onPurchased?.();
      } finally {
        setPending(null);
      }
      return;
    }
    if (!isNative) {
      // 表示プレビュー: 実際の購入は呼ばない。
      toast.info('プレビューでは購入できません。');
      return;
    }
    setPending(plan);
    // 📊 課金ファネルの計測（購入導線に入る直前・plan の enum だけ・PII なし）。
    track(EVENTS.CHECKOUT_STARTED, { plan });
    try {
      // App Store の購入シート（RevenueCat）。
      const res = await purchasePlan(plan, user?.id);
      if (res?.cancelled) { setPending(null); return; }
      // 購入成功 → 端末ローカルの entitlement で即アンロック（webhook 反映を待たない）。
      // onPurchased=PaywallGate の refresh → useSubscription が RevenueCat の
      // ローカル権利を見て isActive=true → App が自動で Paywall を外す。
      track(EVENTS.CHECKOUT_COMPLETED, { plan });
      // 無料期間で始まったか: ストアの答え（periodType）を優先し、取れなければ画面に出した無料期間で判断。
      // INTRO は有料の初回価格（創業メンバー価格）＝無料期間ではない（2026-10-02）。
      const startedTrial = res?.periodType ? /TRIAL/i.test(res.periodType) : !!trial;
      showPurchasedToast(res?.expiresAt || null, startedTrial);
      await onPurchased?.();
      setPending(null);
    } catch (e) {
      toast.error(toMessage(e, '購入手続きを開始できませんでした。少し時間をおいて、やり直してください。'));
      setPending(null);
    }
  };

  // 購入の復元（Apple 必須要件）。
  const handleRestore = async () => {
    if (restoring) return;
    if (!isNative) {
      toast.info('プレビューでは復元できません。');
      return;
    }
    setRestoring(true);
    try {
      const ok = await restorePurchases(user?.id);
      if (ok) {
        // 端末ローカル権利が有効 → 即アンロック（restore は webhook が出ない場合がある）。
        toast.success('購入を復元しました。');
        await onPurchased?.();
      } else {
        toast.info('復元できる購入が見つかりませんでした。');
      }
    } catch (e) {
      toast.error(toMessage(e, '購入の復元に失敗しました。'));
    } finally {
      setRestoring(false);
    }
  };

  // 「解約後もデータは残る」の約束を実効化する導線（未課金/解約後ユーザーの唯一の画面のため）。
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { memos } = await exportMemosAsMarkdown(user?.id);
      toast.success(`メモ ${memos} 件を書き出しました。`);
    } catch (e) {
      toast.error(toMessage(e, 'データの書き出しに失敗しました。'));
    } finally {
      setExporting(false);
    }
  };

  const ctaLabel = pending
    ? '購入手続き中…'
    : planCtaLabel({ ...selected, trial });

  return (
    <main
      aria-labelledby="paywall-title"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        // 下の余白は 0（下に固定の欄が <main> の下端に付くように）。代わりに中身の最後に余白を置く。
        padding: 'calc(var(--space-8) + env(safe-area-inset-top, 0px)) var(--space-4) 0',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div style={{ maxWidth: '36em', margin: '0 auto', display: 'flex', flexDirection: 'column', paddingBottom: 'calc(var(--space-8) + env(safe-area-inset-bottom, 0px))' }}>
        {/* 見出し。無料のトークンを使い切ったあとは「自分の相談相手」、機能から開いたときは機能の名前 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', minHeight: 44 }}>
          <p style={{ ...groupTitle, lineHeight: 1.5 }}>
            Orime
          </p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              style={{ width: 44, height: 44, marginRight: 'calc(-1 * var(--space-3))', display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', flexShrink: 0 }}
            >
              <X size={22} aria-hidden="true" />
            </button>
          )}
        </div>
        <h1
          id="paywall-title"
          style={{ fontSize: 'var(--text-title)', fontWeight: 700, lineHeight: 1.3, margin: 'var(--space-2) 0 0' }}
        >
          {fromFree
            ? <>この相談相手と、<br />もっと話しませんか</>
            : fromFreeOcr
              ? <>写真から書き起こしを、<br />もっと使いませんか</>
              : fromFeature
                ? <>{feature || 'この機能'}は、<br />プランで使えます</>
                : <>読むほど、<br />自分だけの相談相手が育つ</>}
        </h1>
        {fromFreeOcr && (
          // 無料プランの今月の分（月 10 回）を使い切ったことと、戻る日（日本時間の来月 1 日）。
          <p style={{ ...metaText, fontSize: 'var(--text-sub)', marginTop: 'var(--space-2)' }}>
            <span style={{ whiteSpace: 'nowrap' }}>今月の {FREE_OCR_PER_MONTH} 回を使い切りました。</span>
            <span style={{ whiteSpace: 'nowrap' }}>{nextResetLabelJa()}に戻ります。</span>
          </p>
        )}

        {(fromFree || fromGrown) && myBooks.length > 0 && (
          <>
            <div aria-hidden="true" style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
              {myBooks.map((b) => <MiniCover key={b.id} book={b} width={60} />)}
            </div>
            <p style={{ fontSize: 'var(--text-body)', lineHeight: 1.6, margin: 'var(--space-4) 0 0', wordBreak: 'auto-phrase', textWrap: 'pretty' }}>
              {myBooks.slice(0, 2).map((b) => `『${b.title}』`).join('')}{myBooks.length > 2 ? 'など' : ''}のメモを根拠に答える、あなただけの相談相手です。
            </p>
          </>
        )}

        {/* 無料プランとプランの違い（トークンの量と、プランで増える機能） */}
        <PlanCompare onlyPlan={(fromFree || fromGrown) && myBooks.length > 0} trial={showNative && !trial ? anyTrial : ''} example={fromFreeOcr ? TOKEN_EXAMPLE_OCR : TOKEN_EXAMPLE} />

        {showNative ? (
          <>
            {/* プラン（名前・期間・価格）。年額が既定。読み込めなかったときの案内は選択肢の外に出す。 */}
            {priceState === 'failed' ? (
              <div style={{ marginTop: 'var(--space-8)' }}>
                <ErrorMessage
                  icon={null}
                  title="価格を読み込めませんでした"
                  description="通信の状態を確かめて、もう一度お試しください。"
                  actions={[{ label: 'もう一度', onClick: () => setPriceTry((n) => n + 1) }]}
                />
              </div>
            ) : (
            <div
              role={priceState === 'ready' ? 'radiogroup' : undefined}
              aria-label={priceState === 'ready' ? 'プラン' : undefined}
              aria-busy={priceState === 'loading' || undefined}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-8)' }}
            >
              {priceState === 'loading' ? (
                ['annual', 'monthly'].map((id) => <PlanOption key={id} label={labels[id]} selected={false} placeholder />)
              ) : (
                ['annual', 'monthly'].map((id) => (
                  <PlanOption
                    key={id}
                    label={labels[id]}
                    selected={plan === id}
                    onSelect={() => { if (!pending) setPlan(id); }}
                    tag={id === 'annual' ? annualTag : ''}
                    trialNote={rowTrialNote(id)}
                  />
                ))
              )}
            </div>
            )}

            {/* 創業メンバー（期間中・2026-10-02 コーディネーター裁定）: 特典は期間中にプランを始めた全員（月額・年額・7 日間無料で
                始めた人も）。¥9,800 は年額だけ。特典は値段の約束ではないので、ストアの初回価格が無くても期間中なら出す。
                あわせて、初回特典は 1 つの Apple ID に 1 回であること（App Store の決まり）。 */}
            {priceState === 'ready' && founding.active && (
              <p style={{ ...metaText, marginTop: 'var(--space-3)' }}>
                {noBreak(founding.endLabel)}までにプランを始めた方は、月額・年額どちらでも創業メンバーです（開発者への直接の窓口・次に作る機能への投票）。
              </p>
            )}
            {priceState === 'ready' && labels.annual?.intro && labels.monthly?.trial && (
              <p style={{ ...metaText, marginTop: founding.active ? 'var(--space-1)' : 'var(--space-3)' }}>
                初回特典は 1 つの Apple ID に 1 回です（月額の {normalizeTrialLabel(labels.monthly.trial)}と、年額の {labels.annual.intro.head} は、どちらか一方）。
              </p>
            )}

            {/* 請求額の行＋主ボタンは画面の下に固定（DESIGN §5「下に固定の保存」と同じ形）。
                スクロールしても、押すボタンと実際に請求される金額がいつも一緒に見える（審査 3.1.2）。 */}
            <div style={stickyFooter}>
              {priceState === 'ready' && (
                // 実際に請求される金額を、無料期間より弱くしない（3.1.2）。無料期間はプランごと・使える人にだけ。
                <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 var(--space-3)' }}>
                  {/* 無料期間に使える量も添える（「無料で何ができるか」が分かる・2026-09-29 オーナー裁定） */}
                  {/* かっこで包まず「・」で続ける（2026-09-29）。折り返すのは「・」の後だけ（1 行目を「…無料・150 トークン・」まで使い、
                      「最初の 7 日間は無料・」だけの短い 1 行目にしない・2026-09-30）。 */}
                  {trial && [`${trialFirstPhrase(trial)}・`, ...TRIAL_TOKENS_PARTS].map((part) => (
                    <span key={part} style={{ whiteSpace: 'nowrap' }}>{part}</span>
                  ))}
                  {/* 創業メンバー価格（年額を選んでいるとき）: 呼び名と終わる日を小さく 1 行（金額は次の行で強く）。 */}
                  {!trial && selected.intro && plan === 'annual' && foundingNamed && (
                    <span style={{ display: 'block' }}>{FOUNDING_NAME}（{noBreak(founding.endLabel)}まで）</span>
                  )}
                  <span style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>
                    {billedLineParts({ ...selected, trial }).map((part) => (
                      <span key={part} style={{ whiteSpace: 'nowrap' }}>{part}</span>
                    ))}
                  </span>
                </p>
              )}
              {priceState === 'loading' && (
                // 読み込み中も請求額の行と同じ高さを取っておく（価格が届いたときに欄が伸びて跳ねないように）。
                <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', margin: '0 0 var(--space-3)', paddingTop: 'var(--space-1)' }}>
                  {trial && <SkeletonBlock width="40%" height={16} />}
                  <SkeletonBlock width="70%" height={20} />
                </div>
              )}
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={!!pending || priceState !== 'ready'}
                // 価格を読み込むまでは押せない見た目（薄くしない・DESIGN §5）。購入手続き中は塗りのまま文言で示す。
                style={{ ...(priceState !== 'ready' ? btnPrimaryOff : btnPrimary), cursor: pending || priceState !== 'ready' ? 'default' : 'pointer', opacity: 1 }}
              >
                {ctaLabel}
              </button>
              {/* 無料期間があるときは、ボタンのすぐ下で「期間中にやめれば払わない」を言う（ためらいを減らす・2026-09-29）。 */}
              {trial && priceState === 'ready' && (
                <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, margin: 'var(--space-2) 0 0', textAlign: 'center' }}>
                  {/* 「料金はか／かりません」のように語の途中で折り返さない（読点のあとで折る）。 */}
                  <span style={{ whiteSpace: 'nowrap' }}>無料期間が終わる 24 時間前までに解約すれば、</span><span style={{ whiteSpace: 'nowrap' }}>料金はかかりません。</span>
                </p>
              )}
              {/* 先払いの初回価格: いつ・何の分を払うかをボタンのすぐ下で（「¥9,800 は、始めるときに 1 年分をまとめてお支払いします。」） */}
              {!trial && selected.intro?.upfront && priceState === 'ready' && (
                <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, margin: 'var(--space-2) 0 0', textAlign: 'center' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>{selected.intro.priceString} は、</span><span style={{ whiteSpace: 'nowrap' }}>始めるときに {selected.intro.span || '1 年'}分をまとめてお支払いします。</span>
                </p>
              )}
            </div>

            {/* 自動更新の条件（3.1.2 必須開示） */}
            <p style={{ ...metaText, marginTop: 'var(--space-3)' }}>
              {/* 下に固定の欄（billedLineParts）と同じ値から作る（初回価格・無料期間のときに「同じ料金で」と食い違わない・2026-10-02） */}
              お支払いは App Store を通じて行われます。{priceState === 'ready'
                ? renewalSentence({ ...selected, trial })
                : '期間が終わる 24 時間前までに解約しない限り、選んだプランの料金で自動更新されます。'}解約は App Store のアカウント設定からいつでもでき、解約してもメモは残ります。
            </p>

            {/* 購入を復元・利用規約・プライバシーポリシー（3.1.2 必須） */}
            <div style={{ ...linkRow, marginTop: 'var(--space-2)' }}>
              <button type="button" onClick={handleRestore} disabled={restoring} style={{ ...linkStyle, opacity: 1 }}>
                {restoring ? '復元中…' : '購入を復元'}
              </button>
              <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>利用規約</a>
              <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>プライバシーポリシー</a>
            </div>
          </>
        ) : (
          <>
            {/* Web: 契約は App Store（iOS アプリ）一本化。ここでは価格の表示と入手導線だけ */}
            <section aria-label="プラン" style={{ ...card, padding: 0, marginTop: 'var(--space-8)' }}>
              {['annual', 'monthly'].map((id, i) => (
                <div
                  key={id}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderTop: i === 0 ? 'none' : '1px solid var(--separator)',
                  }}
                >
                  <p style={{ ...planName, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', margin: 0 }}>
                    {labels[id].name}
                    {id === 'annual' && <span style={recommendTag}>{founding.active ? FOUNDING_NAME : 'おすすめ'}</span>}
                  </p>
                  {/* 金額はネイティブ版と同じく本文の大きさ・600＝いちばん強く（月あたりは補足の文字） */}
                  <p style={{ ...billedAmount, margin: 'var(--space-1) 0 0' }}><PriceText text={labels[id].price} /></p>
                  {/* Web では本人が初回特典を使えるか分からないので、「初めての方」と条件を添える（金額の真実は App Store）。 */}
                  {id === 'annual' && founding.active && (
                    <p style={{ ...planNote, margin: 'var(--space-1) 0 0' }}>{noBreak(founding.endLabel)}までに始めると {founding.priceLabel}（税込・初めての方）</p>
                  )}
                </div>
              ))}
            </section>

            {/* Web でも入手の主ボタンは画面の下に固定（ネイティブと同じ形）。 */}
            <div style={stickyFooter}>
              {isAppStoreLive ? (
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...btnPrimary, boxSizing: 'border-box', textDecoration: 'none' }}
                >
                  App Store で入手
                </a>
              ) : (
                // 公開前は、公開後と同じ場所・形の押せない主ボタン（LP・Web 利用の案内と同じ・薄くしない）。
                <button type="button" disabled style={btnPrimaryOff}>
                  App Store で近日公開
                </button>
              )}
            </div>

            <p style={{ ...metaText, marginTop: 'var(--space-3)' }}>
              ご契約・お支払い・解約は iOS アプリ（App Store）で行います。{webRenewalSentence({ labels, foundingPrice: founding.active ? founding.price : '' })}解約してもメモは残ります。
            </p>

            <div style={{ ...linkRow, marginTop: 'var(--space-2)' }}>
              <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>利用規約</a>
              <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>プライバシーポリシー</a>
              {/* 特商法リンクはネイティブでは反ステアリング順守のため非表示（Web のみ） */}
              <a href={SCT_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>特定商取引法に基づく表記</a>
            </div>
          </>
        )}

        {/* 「あとで」は主ボタンのまとまり（自動更新の文・規約の行）のすぐ下に、1 行だけで中央に置く（区切り線より上）。 */}
        {onClose && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-2)' }}>
            <button type="button" onClick={onClose} style={{ ...linkStyle, width: '100%' }}>
              あとで
            </button>
          </div>
        )}

        {/* 脇役: メモの書き出し・アカウント切替（・Web のみサービス紹介）。
            アプリの上に重ねて開いた（× で閉じられる）ときは出さない（2026-09-29）: 機能を押して開いた画面に
            ログイン中のメール・退会まで並ぶと唐突で、閉じればアプリの設定に同じものがある。閉じられない画面（ゲート）でだけ出す。 */}
        {!onClose && (
        <div
          style={{
            marginTop: 'var(--space-8)',
            paddingTop: 'var(--space-4)',
            borderTop: '1px solid var(--separator)',
          }}
        >
          {user?.email && (
            <p style={{ ...metaText, color: 'var(--text-3)', wordBreak: 'break-all' }}>
              {user.email} でログイン中
            </p>
          )}
          <div style={{ ...linkRow, marginTop: 'var(--space-1)' }}>
            <button type="button" onClick={handleExport} disabled={exporting} style={{ ...linkStyle, opacity: 1 }}>
              {exporting ? '書き出し中…' : 'メモをダウンロード'}
            </button>
            <button
              type="button"
              onClick={async () => {
                try { await signOut(); } catch (e) { toast.error(toMessage(e, 'ログアウトできませんでした。もう一度お試しください。')); }
              }}
              style={linkStyle}
            >
              別のアカウントでログイン
            </button>
            {/* LP は価格と比較表を含むため、反ステアリング順守でネイティブでは出さない（Web のみ） */}
            {!showNative && (
              <a href="/lp" style={linkStyle}>サービス紹介を見る</a>
            )}
          </div>
          {/* 削除は取り消せない操作なので、ほかの文字ボタンと行を分け、エラー色で示す（審査 5.1.1(v)）。 */}
          <div style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--separator)' }}>
            <div style={linkRow}>
              <button type="button" onClick={() => setSettingsOpen(true)} style={dangerLinkStyle}>
                アカウントを削除
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
      {settingsOpen && (
        <Suspense fallback={null}>
          <AccountSettings onClose={() => setSettingsOpen(false)} onAfterDelete={() => setSettingsOpen(false)} focusDelete />
        </Suspense>
      )}
    </main>
  );
}
