// 🛡️ AccountSettings — Modal opened from the header settings menu.
//
// Two destructive / sensitive operations:
//   1. データをダウンロード — exports books / memos / tags / actions /
//      chat history (CSV) or memos (Markdown). Photo paths only (signed URLs are
//      time-limited and would expire by the time the user opens the export).
//   2. アカウント削除 — wipes all user-owned rows + Storage photos, then
//      writes an account_deletion_requests row that the admin must process to
//      delete the auth.users entry (service_role required for that final step).
//
// 見た目は DESIGN.md のトークンのみ（iOS「設定」風: グループ見出し＋カード＋44 以上の行）。
// 形は下から上がる全画面のシート（2026-09-27〜。以前の中央のモーダルは、枠・カード・本文の余白が
// 三重になり本文の幅が狭かった）。面は「上に重なるものほど明るく」（DESIGN §4）: 明るい画面は
// シート --bg ＋カード --surface、暗い画面はシート --surface ＋カード --fill。
// 塗りの主ボタンは「その状態で一番大事な 1 つ」だけ（未契約時の購入/入手）。
// 削除の塗りボタン（btnDanger）は退会の最終確定だけに使う。

import { TERMS_URL, PRIVACY_URL, SCT_URL } from '../lib/legalLinks';
import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { supabase, isSupabaseConfigured, isDemo } from '../lib/supabase';
import { SUPPORT_EMAIL } from '../lib/contact';
import { LIMITS } from '../lib/limits';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { toMessage, isSchemaError } from '../lib/errors';
import ErrorMessage from './ErrorMessage';
import FeedbackForm from './FeedbackForm';
import WhatsNewSheet from './WhatsNewSheet';
import { RELEASES, markReleaseSeen, releaseHeading } from '../lib/whatsNew';
import { exportUserDataAsCSV, exportMemosAsMarkdown } from '../lib/exportData';
import { forceUpdate as forceAppUpdate } from '../lib/swUpdate';
import { useSubscription } from '../hooks/useSubscription';
import { openBillingPortal } from '../lib/billing';
import { isNative, openManageSubscriptions } from '../lib/iap';
import { usePaywall } from '../state/PaywallContext';
import { planNameFor, trialRenewalLine, trialCancelNote, trialCancelByTime } from '../lib/trialNudge';
import { PAID_TOKENS, TOKEN_COSTS, FREE_TOKENS } from '../lib/tokens';
import { FREE_OCR_PER_MONTH } from '../lib/tokenAmounts';
import { nextResetLabelJa } from '../lib/freeTrial';
import { btnPrimary, btnPrimaryOff, btnGhost, btnGhostOff, btnDanger, btnLink, input as uiInput } from '../styles/ui';
import { ChevronRight, Download as IcDownload, RefreshCw as IcRefresh } from 'lucide-react';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { track, EVENTS, isAnalyticsOptedOut, setAnalyticsOptOut } from '../lib/analytics';
import { closeDelayMs } from '../lib/motion';
import ToggleSwitch from './ToggleSwitch';
import { useViewpointMap } from '../hooks/useViewpointMap';
import { readAiConsent, requestAiConsent, isAiConsentCurrent, AI_CONSENT_CHANGED_EVENT } from '../lib/aiConsent';
import {
  isPushSupported,
  isPushConfigured,
  isStandalonePWA,
  isIOS,
  isSubscribed as isPushSubscribed,
  getPermission as getPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/push';
import {
  isNativePushCapable,
  isNativePushSubscribed,
  getNativePushPermission,
  subscribeNativePush,
  unsubscribeNativePush,
} from '../lib/nativePush';

// トークンの数は 3 桁ごとに区切る（1,000 など・どの画面でも同じ書き方）。
const fmtTokens = (n) => (n != null && Number.isFinite(Number(n)) ? Number(n).toLocaleString() : String(n ?? ''));

// 下から上がる全画面のシート。上端だけステータスバーぶん空けて、後ろの画面が少し見える（iOS のシート）。
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--z-popover)',
  background: 'var(--backdrop)',
  WebkitBackdropFilter: 'var(--backdrop-blur)',
  backdropFilter: 'var(--backdrop-blur)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
  fontFamily: 'var(--font-ui)',
  animation: 'leverage-fade-in .15s ease',
};

// シートの面と中のカードの面は、明暗で重ね方が変わるので CSS 変数で切り替える（下の SHEET_CSS）。
const modalStyle = {
  background: 'var(--settings-sheet-bg)',
  borderTopLeftRadius: 'var(--radius)',
  borderTopRightRadius: 'var(--radius)',
  width: 'min(560px, 100%)',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: 'var(--shadow-overlay)',
  overflow: 'hidden',
  animation: 'leverage-sheet-up .25s cubic-bezier(0.2,0.9,0.3,1)',
};

const SHEET_CSS = `
.lvg-settings-sheet { --settings-sheet-bg: var(--bg); --settings-card: var(--surface); }
@media (prefers-color-scheme: dark) {
  :root[data-dark-ready] .lvg-settings-sheet { --settings-sheet-bg: var(--surface); --settings-card: var(--fill); }
}`;

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: '0 var(--space-4) var(--space-2)',
  borderBottom: '1px solid var(--separator)',
};

// 右上の「完了」（設定はその場で効くので、閉じる＝完了。DESIGN §5 のシート）。
const doneBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  cursor: 'pointer',
  minWidth: 44,
  minHeight: 44,
  flexShrink: 0,
  fontFamily: 'inherit',
  fontSize: 'var(--text-body)',
  fontWeight: 600,
  // 押せる範囲は 44 のまま、文字の右端を画面の右余白 16 にそろえる（左右に 12 の内側・右へ 12 はみ出す）。
  padding: '0 var(--space-3)',
  marginRight: 'calc(-1 * var(--space-3))',
};

const bodyStyle = {
  padding: 'var(--space-4) var(--space-4) calc(var(--space-8) + env(safe-area-inset-bottom, 0px))',
  overflowY: 'auto',
  flex: 1,
  WebkitOverflowScrolling: 'touch',
  overscrollBehavior: 'contain',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)', // グループ間は 24（グループ内 8〜12 より必ず広く）
};

// カード＝行を縦に並べる器。左右 16 の内側余白、上下は各行が持つ。
const groupCardStyle = {
  background: 'var(--settings-card)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: '0 var(--space-4)',
};

// カード内の行と行の区切り線。
const divider = { borderTop: '1px solid var(--separator)' };

// 行のタイトル（17・400）と、その下の説明（13・--text-2）。
const rowTitleStyle = { fontSize: 'var(--text-body)', fontWeight: 400, color: 'var(--text)', margin: 0, lineHeight: 1.5 };
const rowDescStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 'var(--space-1) 0 0', lineHeight: 1.5 };
// ボタンを出さず案内だけのときの一行（状態の説明）。
const noteStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 };

// 行全体が押せるボタン（iOS「設定」の一覧行）。
const rowButtonStyle = {
  width: '100%',
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) 0',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  color: 'var(--text)',
};

// 処理中の行（薄くしない・DESIGN §5「押せないボタン」）。文字を --text-3 にして、押せないことを色で示す。
// 全体の button:disabled{opacity:.4} を打ち消すため opacity: 1 を明示する。
const rowButtonBusy = { ...rowButtonStyle, color: 'var(--text-3)', cursor: 'default', opacity: 1 };

// 文章＋ボタンのまとまり（プラン・初期化・退会など）。
const blockStyle = { padding: 'var(--space-3) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

// 破壊的操作の副ボタン（枠線＋エラー色の文字）。塗りの btnDanger は最終確定だけ。
const btnDestructiveGhost = { ...btnGhost, color: 'var(--error)' };

// グループ見出し（12・600・--text-2）。直下のカードと結びつけるため下は 8 だけ空ける。
const groupLabelStyle = {
  fontSize: 'var(--text-caption)',
  fontWeight: 600,
  color: 'var(--text-2)',
  margin: '0 0 var(--space-2) var(--space-4)',
  lineHeight: 1.3,
};

function Group({ label, ariaLabel, children }) {
  return (
    <section aria-label={ariaLabel || label}>
      {label && <h3 style={groupLabelStyle}>{label}</h3>}
      <div style={groupCardStyle}>{children}</div>
    </section>
  );
}

// 設定行: 左にタイトル＋説明、右にスイッチ（or 任意のコントロール）。
// iOS「設定」アプリと同じ並びで、トグル系の設定はこれで統一する。
function SettingRow({ title, desc, extra, control, style }) {
  // タイトルとスイッチを 1 行に並べ、説明は下に全幅で置く（iOS「設定」の脚注と同じ）。
  return (
    <div style={{ padding: 'var(--space-3) 0', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 44 }}>
        <p style={{ ...rowTitleStyle, flex: 1, minWidth: 0 }}>{title}</p>
        {control}
      </div>
      {/* 説明は文節の切れ目でだけ折り返す（「期限／の日」「でき／ます」と語の途中で切らない・2026-10-04）。 */}
      {desc && <p style={{ ...rowDescStyle, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{typeof desc === 'string' ? withPhraseBreaks(desc) : desc}</p>}
      {extra && <p style={{ ...rowDescStyle, marginTop: 'var(--space-2)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{typeof extra === 'string' ? withPhraseBreaks(extra) : extra}</p>}
    </div>
  );
}

// 値を右に出すだけの行（状態・次回更新など）。
// sub: 値の下に小さく 1 行（無料プランの「M月1日に 30 トークンに戻ります」など）。
function ValueRow({ label, value, sub = null, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', minHeight: 44, padding: 'var(--space-3) 0', ...style }}>
      <span style={{ fontSize: 'var(--text-body)', color: 'var(--text)', flexShrink: 0 }}>{label}</span>
      {sub ? (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0, textAlign: 'right' }}>
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--text-2)' }}>{value}</span>
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>{sub}</span>
        </span>
      ) : (
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--text-2)', textAlign: 'right' }}>{value}</span>
      )}
    </div>
  );
}

const inputStyle = uiInput;

// Stripe の status を日本語の短いラベルに。entitlement 判定そのものは
// useSubscription（status==='active'）が真実。ここは表示専用。
function billingStatusLabel(status) {
  switch (status) {
    case 'active': return '利用中';
    case 'trialing': return 'トライアル中';
    case 'past_due': return 'お支払い確認中';
    case 'canceled': return '解約済み';
    case 'unpaid': return 'お支払い未完了';
    case 'incomplete': return '手続き中';
    case 'incomplete_expired': return '手続き期限切れ';
    default: return status || '未契約';
  }
}

// 日付を「10月27日」（今年でなければ「2027年2月25日」）へ（日本時間）。失敗時は null。
// 次回更新・無料期間の終わり・追加分の期限で同じ書き方にそろえる（2026/10/27 と 2月25日を混ぜない）。
function dateLabelJa(time) {
  const t = typeof time === 'number' ? time : Date.parse(time || '');
  if (!Number.isFinite(t)) return null;
  const JST = 9 * 3600 * 1000;
  const d = new Date(t + JST);
  const y = d.getUTCFullYear();
  const thisYear = new Date(Date.now() + JST).getUTCFullYear();
  return `${y !== thisYear ? `${y}年` : ''}${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

// current_period_end（ISO 文字列）を日付の表示へ。失敗時は null。
function formatPeriodEnd(iso) {
  if (!iso) return null;
  return dateLabelJa(iso);
}

// 値が読み込み中の行（ValueRow と同じ高さ）。
function ValueRowSkeleton({ label, style }) {
  return (
    <div role="status" aria-label={`${label}を読み込んでいます`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', minHeight: 44, padding: 'var(--space-3) 0', ...style }}>
      <span style={{ fontSize: 'var(--text-body)', color: 'var(--text)' }}>{label}</span>
      <SkeletonBlock width="30%" height="var(--text-body)" radius="var(--radius)" />
    </div>
  );
}

async function listAllUserPhotos(userId, bucket = 'book-memo-photos') {
  if (!isSupabaseConfigured) return [];
  const all = [];
  // offset ページングで全件列挙する。旧実装は limit:1000 の 1 ページのみで、
  // 1000 件超のユーザーは退会/初期化時に Storage へ消し残りが出ていた
  // （「すべて削除」のプライバシー約束違反）。上限 20 ページは安全弁。
  const PAGE = 1000;
  const listAll = async (path) => {
    const out = [];
    for (let page = 0; page < 20; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(path, { limit: PAGE, offset: page * PAGE });
      if (error || !data) break;
      out.push(...data);
      if (data.length < PAGE) break;
    }
    return out;
  };
  // Top level: user_id/<book_id>/<file>
  const bookFolders = await listAll(userId);
  for (const entry of bookFolders) {
    if (!entry?.name) continue;
    // Supabase storage の list 規約: フォルダは id=null、ファイルは id を持つ。
    if (entry.id) {
      // user_id 直下のファイル（例: book-covers/<userId>/<file>）。
      all.push(`${userId}/${entry.name}`);
      continue;
    }
    // フォルダ → 配下のファイルを列挙（例: book-memo-photos/<userId>/<bookId>/<file>）。
    // eslint-disable-next-line no-await-in-loop
    const files = await listAll(`${userId}/${entry.name}`);
    files.forEach((f) => {
      if (f?.name) all.push(`${userId}/${entry.name}/${f.name}`);
    });
  }
  return all;
}

// 🧪 お試しモードの通知のオン・オフ（設定を閉じて開き直しても残す・再読み込みで初期化）。
let demoPushOn = false;

export default function AccountSettings({ onClose, onAfterDelete, isAdmin, onOpenAdmin, onOpenImport, onOpenHelp, focusDelete = false }) {
  const { user, signOut } = useAuth();
  // 有料プランの画面の「アカウントを削除」から開いたときは、削除の欄まで送る。
  const deleteRef = useRef(null);
  useEffect(() => {
    if (!focusDelete) return undefined;
    const t = setTimeout(() => { try { deleteRef.current?.scrollIntoView({ block: 'center' }); } catch { /* ignore */ } }, 150);
    return () => clearTimeout(t);
  }, [focusDelete]);
  const toast = useToast();
  // 🗺 視点の地図（メモのタグのひな形・2026-10-08）。切り替えはすぐ効く（アカウントには後ろで保存）。
  const viewpoint = useViewpointMap();
  const confirm = useConfirm();
  // 閉じるときも滑り下ろす（入りは下から .25s で上がるのに、出だけ瞬間に消えると所作が非対称・
  // QuickMemoSheet の animateClose と同じ・2026-09-29）。「完了」・外側のタップ・Esc で使う。
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(closeTimerRef.current), []);
  const animateClose = () => {
    if (closing) return;
    // 動きを減らす設定では待たずに閉じる（透明の背景が残って下の画面を押せない時間を作らない・2026-09-30）。
    const wait = closeDelayMs(220); // アニメの長さと同じ
    if (!wait) { onClose?.(); return; }
    setClosing(true);
    closeTimerRef.current = setTimeout(() => onClose?.(), wait);
  };
  const [exporting, setExporting] = useState(false);
  const [exportingMd, setExportingMd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 削除の失敗は、押したボタンのすぐ下に ErrorMessage で残す（消えるトーストだけだと、取り消せない操作の結果を見逃す・2026-10-04）。
  const [deleteError, setDeleteError] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // 🆕 新しくなったこと（2026-10-05）: 設定の上に重ねて全部の版を見せる。
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  // フィードバック（入れ子モーダル）を開いている間は、そちらのトラップに譲るため無効化。
  const trapRef = useFocusTrap(!feedbackOpen);
  // 💳 課金状態。subscriptions 未適用なら subscription=null / isActive=false で
  // 静かに縮退する（useSubscription 側で schema-error を握りつぶす）。
  const { subscription, isActive, loading: subLoading } = useSubscription();
  // 🪙 プランと残りのトークン（PaywallGate が配る）。契約は「プランを見る」→ 有料プランの画面で
  //    （価格・自動更新の条件・復元・規約を 1 か所で見せる＝審査 3.1.2）。
  const { plan, tokensRemaining, tokenAllowance, openPaywall, purchasedTokens, purchasedExpiresAt, canBuyTokens, openTokenSheet } = usePaywall();
  // 🪙➕ 追加トークンの行（残りがあるときだけ・いちばん近い期限つき）。
  //    2 行: 量（本文 17）と、その下に右寄せで期限（13）。
  const lotExpiry = purchasedExpiresAt ? dateLabelJa(purchasedExpiresAt) : null;
  const lotRow = purchasedTokens > 0 ? (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', minHeight: 44, padding: 'var(--space-3) 0', ...divider }}>
      <span style={{ fontSize: 'var(--text-body)', color: 'var(--text)' }}>追加分</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{purchasedTokens.toLocaleString()} トークン</span>
        {lotExpiry && (
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{lotExpiry}まで</span>
        )}
      </span>
    </div>
  ) : null;
  // 残りのトークンは契約の確認のあとに読み込む。読み込み中（最大 4 秒）は同じ高さの枠を出す（行が後から差し込まれて画面が跳ねないように）。
  const [tokenWaitOver, setTokenWaitOver] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTokenWaitOver(true), 4000);
    return () => clearTimeout(t);
  }, []);
  const tokensLoading = tokensRemaining == null && tokenAllowance != null && !tokenWaitOver;
  const [billingBusy, setBillingBusy] = useState(false);

  // 🤝 AI へのデータ送信（同意・lib/aiConsent.js）。「10月1日に同意」／「まだ同意していません」。読み込むまでは undefined。
  const [aiConsent, setAiConsent] = useState(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => { readAiConsent().then((r) => { if (alive) setAiConsent(r); }, () => { if (alive) setAiConsent(null); }); };
    load();
    window.addEventListener(AI_CONSENT_CHANGED_EVENT, load);
    return () => { alive = false; window.removeEventListener(AI_CONSENT_CHANGED_EVENT, load); };
  }, []);
  const aiConsentLabel = aiConsent === undefined ? null
    : isAiConsentCurrent(aiConsent) ? (dateLabelJa(aiConsent.at) ? `${dateLabelJa(aiConsent.at)}に同意` : '同意しています') : 'まだ同意していません';

  // 📊 利用状況の記録（製品改善のためのファーストパーティ計測）。既定 ON。
  //   analyticsOn=true なら記録する（= オプトアウトしていない）。オフ操作で
  //   setAnalyticsOptOut(true) を呼ぶ。fail-silent（localStorage 不可でも壊さない）。
  const [analyticsOn, setAnalyticsOn] = useState(() => !isAnalyticsOptedOut());
  const handleToggleAnalytics = () => {
    setAnalyticsOn((prev) => {
      const next = !prev;
      setAnalyticsOptOut(!next); // next=ON → optout=false
      return next;
    });
  };

  // 🔔 想起の通知（Web Push）。デフォルト OFF・完全オプトイン。
  //   pushOn       : この端末が現在購読済みか（トグルの初期/反映状態）
  //   pushBusy     : 許可要求/購読処理中のロック
  //   pushDenied   : OS で許可を拒否済み（自前ダイアログは二度と出せない → 案内に倒す）
  // ネイティブ(iOS/APNs)と Web(VAPID)で「準備済み/対応済み」の意味が異なる。
  //   - Web:      VAPID 公開鍵の有無 + SW/PushManager/standalone 条件
  //   - ネイティブ: Capacitor プラグインで APNs 登録できるか（VAPID 不要）
  // 🧪 お試しモード（開発専用）では、鍵が無くても通知の欄を出し、スイッチは端末の中の状態だけを切り替える
  //   （「設定からオフにできる」を確かめられるように・2026-09-29）。
  const pushConfigured = isDemo || (isNative ? isNativePushCapable : isPushConfigured());
  const pushSupported = isDemo || (isNative ? isNativePushCapable : isPushSupported());
  // A2HS 案内は Web(ブラウザ)のみ。ネイティブ(Capacitor WKWebView)では isIOS()=true /
  // isStandalonePWA()=false になり「ホーム画面に追加」を誤って促してしまうため !isNative で封じる。
  const pushNeedsA2HS = !isDemo && !isNative && isPushConfigured() && isIOS() && !isStandalonePWA(); // iOS ブラウザタブ内
  const [pushOn, setPushOn] = useState(() => (isDemo ? demoPushOn : false));
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDenied, setPushDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    if (isDemo) return undefined; // お試しモードは端末の中の状態（demoPushOn）だけ
    (async () => {
      try {
        if (isNative) {
          // ネイティブ(APNs): 権限と DB 上の ios 購読行から初期状態を決める。
          setPushDenied((await getNativePushPermission()) === 'denied');
          const on = await isNativePushSubscribed();
          if (alive) setPushOn(on);
        } else {
          setPushDenied(getPushPermission() === 'denied');
          const on = await isPushSubscribed();
          if (alive) setPushOn(on);
        }
      } catch { /* graceful: トグルは OFF のまま */ }
    })();
    return () => { alive = false; };
  }, []);

  // オンにしたときの知らせは短く（いつ届くかはスイッチの行の説明に書いてある＝同じことを 2 回言わない・2026-09-30）。
  const PUSH_ON_MESSAGE = '通知をオンにしました';
  const handleTogglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (isDemo) {
        demoPushOn = !pushOn;
        setPushOn(demoPushOn);
        if (demoPushOn) toast.success(PUSH_ON_MESSAGE); else toast.info('通知をオフにしました。');
        return;
      }
      if (pushOn) {
        // OFF にする — 購読解除 + DB 行削除。失敗しても静かに。
        if (isNative) await unsubscribeNativePush(); else await unsubscribeFromPush();
        setPushOn(false);
        toast.info('通知をオフにしました。');
      } else {
        // ON にする — ここは必ずユーザージェスチャ内なので許可要求してよい。
        const res = isNative
          ? await subscribeNativePush({ frequency: 'weekly' })
          : await subscribeToPush({ frequency: 'weekly' });
        if (res.ok) {
          setPushOn(true);
          track(EVENTS.PUSH_ENABLED); // ON 成功時のみ（props なし・fire-and-forget）
          toast.success(PUSH_ON_MESSAGE);
        } else if (res.reason === 'denied') {
          setPushDenied(true);
          toast.error('通知が許可されていません。端末の設定からオンにできます。');
        } else if (res.reason === 'unsupported') {
          toast.error('この端末では通知をまだ使えません。');
        } else {
          toast.error('通知の設定に失敗しました。少し時間をおいて再度お試しください。');
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  const handleManageBilling = async () => {
    if (billingBusy) return;
    setBillingBusy(true);
    try {
      if (isNative) {
        // ネイティブ(IAP): 解約・プラン変更は App Store のサブスク設定で行う。
        await openManageSubscriptions();
        setBillingBusy(false);
        return;
      }
      // Web(Stripe): 成功時はページ遷移するので戻らない。
      await openBillingPortal();
    } catch (e) {
      toast.error(toMessage(e, 'プラン管理ページを開けませんでした。'));
      setBillingBusy(false);
    }
  };

  const handleForceUpdate = async () => {
    if (updating) return;
    // 確認ダイアログ必須 — 押した瞬間に reload するので、メモ書き / AI 会話の
    // 途中で誤タップすると入力が消える。意図的な操作だけ通す。
    const ok = await confirm({
      title: '読み込み直しますか？',
      message: 'いったん閉じて読み込み直します。\n\n書きかけのメモや AI への入力中の文章は失われます。よろしいですか？',
      confirmLabel: '読み込み直す',
      cancelLabel: 'キャンセル',
    });
    if (!ok) return;
    setUpdating(true);
    toast.info('アプリを最新版に更新中…');
    // 内部で SW.update() → cache 全消去 → reload。reload するので
    // setUpdating(false) には到達しないが、エラー時の保険として finally。
    try { await forceAppUpdate(); }
    finally { setUpdating(false); }
  };

  useEffect(() => {
    const onKey = (e) => {
      // フィードバックシートが開いている間は、Escape はシート側に任せる
      // （ここで拾うと設定モーダルごと閉じ、送信中の入力が失われる）。
      // IME 変換中の Esc はガード（変換キャンセルで設定ごと閉じない）。
      if (e.key === 'Escape' && !feedbackOpen && !whatsNewOpen && !e.isComposing && !e.nativeEvent?.isComposing) animateClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, feedbackOpen, whatsNewOpen, closing]);

  const expectedConfirm = (user?.email || 'DELETE').trim();

  const handleExport = async () => {
    if (!user || !isSupabaseConfigured) {
      toast.error('ログインが必要です。');
      return;
    }
    setExporting(true);
    try {
      const summary = await exportUserDataAsCSV(user.id);
      // 知らせは「行」ではなく本とメモの数で（何が入ったかが分かる・2026-09-30）。
      const countOf = (table) => summary.find((s) => s.table === table)?.count || 0;
      track(EVENTS.EXPORT_USED, { kind: 'csv' }); // 成功確定後のみ（fire-and-forget）
      toast.success(`本 ${countOf('books')} 冊・メモ ${countOf('book_memos')} 件を書き出しました`);
    } catch (e) {
      toast.error(toMessage(e, 'エクスポートに失敗しました。'));
    } finally {
      setExporting(false);
    }
  };

  const handleExportMarkdown = async () => {
    if (!user || !isSupabaseConfigured) {
      toast.error('ログインが必要です。');
      return;
    }
    setExportingMd(true);
    try {
      const { memos } = await exportMemosAsMarkdown(user.id);
      track(EVENTS.EXPORT_USED, { kind: 'markdown' }); // 成功確定後のみ（fire-and-forget）
      toast.success(`Markdown を書き出しました（メモ ${memos} 件）。`);
    } catch (e) {
      toast.error(toMessage(e, '書き出しに失敗しました。'));
    } finally {
      setExportingMd(false);
    }
  };

  // 🧹 データ初期化 — アカウントは残したまま、本・メモ・行動・対話履歴・写真など
  // 自分のデータを全消去して「まっさら」に戻す。アカウント削除と違いサインアウト
  // せず、account_deletion_requests も作らない。完了後はリロードして空状態に。
  const handleResetData = async () => {
    if (!user || !isSupabaseConfigured) {
      toast.error('ログインが必要です。');
      return;
    }
    const ok = await confirm({
      title: 'データを初期化しますか？',
      message:
        '本・メモ・写真・行動・相談の履歴・タグなど、あなたのデータをすべて消去して、まっさらな状態に戻します。\n\nアカウント（ログイン）は残ります。この操作は取り消せません。',
      confirmLabel: '初期化する',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;

    setResetting(true);
    // schema-error（テーブル/列が存在しない）判定は lib/errors.js の isSchemaError
    //（唯一の真実）を使う。未適用 DB（移行 SQL 未実行）でも初期化を止めないため、
    // これらは失敗扱いせずスキップする。
    const dbErrors = [];
    const deleteOwn = async (table) => {
      try {
        const { error } = await supabase.from(table).delete().eq('user_id', user.id);
        if (error && !isSchemaError(error)) dbErrors.push({ table, error });
      } catch (e) {
        if (!isSchemaError(e)) dbErrors.push({ table, error: e });
      }
    };
    try {
      // 写真（メモ写真 + 手動アップロード表紙）を Storage から削除。
      for (const bucket of ['book-memo-photos', 'book-covers']) {
        try {
          const paths = await listAllUserPhotos(user.id, bucket);
          if (paths.length > 0) await supabase.storage.from(bucket).remove(paths);
        } catch { /* 写真の消し残しは致命ではない */ }
      }
      // データテーブルを子 → 親で削除（books は子に CASCADE）。
      await deleteOwn('chat_messages');
      await deleteOwn('book_memos');
      await deleteOwn('book_tags');
      await deleteOwn('actions');
      await deleteOwn('theme_reports');
      await deleteOwn('advisor_sessions');
      await deleteOwn('push_subscriptions');
      await deleteOwn('books');

      if (dbErrors.length > 0) {
        console.error('data reset partial failure:', dbErrors);
        toast.error('一部のデータ初期化に失敗しました。もう一度お試しください。');
        setResetting(false);
        return;
      }
      // 端末ローカルの一時状態（想起のクリア時刻・週次の問い等）も掃除して完全に空へ。
      try {
        ['brain-cleared-at', 'brain-weekly-q', 'brain-weekly-dismissed', 'leverage-memo-snap'].forEach((k) => localStorage.removeItem(k));
      } catch { /* ignore */ }
      toast.success('データを初期化しました。まっさらな状態で読み込み直します。');
      // 全 state / キャッシュを確実に空へ戻すためリロード（初期化操作なので妥当）。
      // reload がブロックされた場合でもボタンが「初期化中…」で永久固定しないよう解除。
      setResetting(false);
      setTimeout(() => { try { window.location.reload(); } catch { /* ignore */ } }, 600);
    } catch (e) {
      toast.error(toMessage(e, '初期化に失敗しました。'));
      setResetting(false);
    }
  };

  // retry: 失敗の「もう一度」から（確かめるダイアログはもう答えてあるので出さない）。
  const handleDelete = async (opts) => {
    const retry = opts?.retry === true;
    if (!user || !isSupabaseConfigured) {
      toast.error('ログインが必要です。');
      return;
    }
    if (confirmText.trim().toLowerCase() !== String(expectedConfirm || '').toLowerCase()) {
      toast.error('確認入力が一致しません。');
      return;
    }
    const ok = retry || await confirm({
      title: '本当にすべて削除しますか？',
      message:
        '本・メモ・写真・行動・相談の履歴・タグ・AI 選書の履歴など、すべてのデータが完全に削除されます。\n\nログイン情報の完全削除は管理者の最終確認後（通常 7 日以内）に実行されます。この操作は取り消せません。',
      confirmLabel: '削除する',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;

    setDeleting(true);
    setDeleteError(false);
    let storageError = null;
    // 本当の削除失敗（RLS 拒否・接続断など）だけを集める。テーブル/列が無い
    // schema-error は未適用 DB 互換のため握りつぶしてスキップする。
    const dbErrors = [];

    // schema-error（テーブル/列が存在しない）の判定は lib/errors.js の isSchemaError
    //（唯一の真実）を使う。未適用 DB（移行 SQL 未実行）でも退会を止めないために、
    // これらは失敗扱いしない。
    // 1 テーブルを削除し、本当の失敗のみ dbErrors に積む（schema-error はスキップ）。
    const deleteOwn = async (table) => {
      try {
        const { error } = await supabase.from(table).delete().eq('user_id', user.id);
        if (error && !isSchemaError(error)) dbErrors.push({ table, error });
      } catch (e) {
        if (!isSchemaError(e)) dbErrors.push({ table, error: e });
      }
    };

    try {
      // 1. Delete photos from Storage（メモ写真 + 手動アップロード表紙の両バケット）。
      //    「すべて削除」の約束を守るため book-covers の消し残し（孤児・公開残留）も無くす。
      for (const bucket of ['book-memo-photos', 'book-covers']) {
        try {
          const paths = await listAllUserPhotos(user.id, bucket);
          if (paths.length > 0) {
            const { error } = await supabase.storage.from(bucket).remove(paths);
            if (error) storageError = error;
          }
        } catch (e) {
          storageError = e;
        }
      }

      // 2. Delete data tables, child → parent.
      //
      // 本人が RLS の DELETE ポリシーで自分で消せるテーブルだけをここで消す。
      // books の削除は book_memos / book_tags / actions に CASCADE するが、
      // book_id が null の個人メモや chat_messages は books に紐づかないため
      // 明示削除する。theme_reports / advisor_sessions / push_subscriptions は
      // books と独立しており、かつ本人 DELETE ポリシーがあるので各自消す。
      //
      // ⚠️ analytics_events / subscriptions / ai_usage / feedback は RLS に
      //    ユーザー DELETE ポリシーが無い（設計上クライアントから消せない）ため、
      //    ここでは delete を呼ばない（呼ぶと必ず失敗するため）。これらは管理者が
      //    auth.users を最終削除した時に、各テーブル作成 SQL で定義された FK で
      //    処理される: analytics_events / subscriptions / ai_usage は ON DELETE
      //    CASCADE で消え、feedback は ON DELETE SET NULL で user_id を null 化して
      //    匿名で残す（supabase_feedback.sql の設計）。account_deletion_requests の
      //    記録を見て管理者が auth.users を削除する運用が前提。
      await deleteOwn('chat_messages');     // マイ読書脳の対話履歴（book_id null の学びログ含む）
      await deleteOwn('book_memos');        // カード式メモ（個人メモ含む）
      await deleteOwn('book_tags');         // タグ（user_id 列あり）
      await deleteOwn('actions');           // 行動リスト
      await deleteOwn('theme_reports');     // 📊 テーマまとめの履歴（機能は 2026-09-30 に廃止・過去の行は消す）
      await deleteOwn('advisor_sessions');  // 🕒 AI 選書の会話履歴
      await deleteOwn('push_subscriptions');// 🔔 想起プッシュ購読
      await deleteOwn('books');             // 親（残った子に CASCADE）

      // 3. Record the deletion request so the admin can finish off auth.users.
      //    一部削除に失敗した場合でも、これは必ず試みる（管理者が手当てできるよう
      //    残失敗の概要を notes に残す）。
      const warnParts = [];
      if (storageError) warnParts.push(`storage_warn: ${storageError.message || storageError}`);
      if (dbErrors.length > 0) {
        warnParts.push(
          `db_warn: ${dbErrors.map((d) => `${d.table}(${d.error?.message || d.error})`).join('; ')}`,
        );
      }
      // supabase-js は失敗を throw せず { error } で返す。この行が書けていないと
      // 管理者は auth.users を削除しない（「7日以内に完全削除」の約束が静かに
      // 破られる）ため、失敗したら成功トーストを出さずサポート連絡を案内する。
      const { error: reqError } = await supabase.from('account_deletion_requests').insert([
        {
          user_id: user.id,
          user_email: user.email || null,
          notes: warnParts.length > 0 ? warnParts.join(' | ') : null,
        },
      ]);
      // 23505 (unique violation) = 既に同一ユーザーの削除リクエストが登録済み
      // （supabase_account_deletion_hardening.sql の UNIQUE(user_id)）。前回の
      // リクエスト後に再ログインして再度削除を押したケースで、リクエスト自体は
      // 有効に存在するので「失敗」ではなく成功として先へ進める。
      if (reqError && reqError.code !== '23505') {
        console.error('account_deletion_requests insert failed:', reqError);
        setDeleteError(true);
        return;
      }

      // 1 つでも本当の削除失敗があれば成功トーストを出さず、サポート連絡を案内。
      // （削除リクエストの insert は上で済ませているので、管理者が追って手当て可能）。
      if (dbErrors.length > 0) {
        console.error('account deletion partial failure:', dbErrors);
        setDeleteError(true);
        return;
      }

      toast.success('すべてのデータを削除しました。ログアウトします。');
      // Sign out then bubble up to the parent
      try { await signOut(); } catch { /* ignore */ }
      onAfterDelete?.();
    } catch (e) {
      console.error('account deletion failed:', e);
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };


  // 通知: 操作可能な状態（許可要求できる）のときだけ右にスイッチを出す。
  // 準備中 / A2HS 必要 / 非対応 / OS で拒否済み の各状態は案内文に倒す。
  const canTogglePush = pushConfigured && pushSupported && !pushNeedsA2HS && !(pushDenied && !pushOn);
  const pushNote = !pushConfigured ? (
    // VAPID 鍵未設定 = 機能準備中（env 投入前）。静かに案内のみ。
    'ただいま準備中です。もう少しお待ちください。'
  ) : pushNeedsA2HS ? (
    // iOS タブ内 = ホーム画面に追加しないと通知は使えない。
    <>
      iPhone / iPad では、<strong style={{ fontWeight: 600 }}>ホーム画面に追加</strong>したアプリから開くと通知を受け取れます。<br />
      共有メニュー（□↑）→「ホーム画面に追加」→ 追加したアイコンから開いてください。
    </>
  ) : !pushSupported ? (
    // 非対応ブラウザ等。
    'この端末・ブラウザでは通知に対応していません。'
  ) : pushDenied && !pushOn ? (
    // OS で拒否済み = 自前ダイアログは出せない。設定からの手動許可を案内。
    '通知がオフになっています。端末の「設定 → 通知」から Orime の通知を許可すると受け取れます。'
  ) : null;

  // 規約・お問い合わせは文字ボタン（DESIGN §5 の btnLink。脇役でも色は変えず、並びと位置で控えめに）。
  const legalLinkStyle = { ...btnLink, textDecoration: 'none' };

  return (
    <div
      style={closing ? { ...overlayStyle, background: 'transparent', WebkitBackdropFilter: 'none', backdropFilter: 'none', transition: 'background-color .18s ease' } : overlayStyle}
      role="dialog" aria-modal="true" aria-label="設定" onClick={animateClose}
      data-closing={closing ? 'true' : undefined}
    >
      <style>{SHEET_CSS}</style>
      <div
        ref={trapRef}
        className="lvg-settings-sheet"
        style={closing ? { ...modalStyle, animation: 'leverage-sheet-down .22s cubic-bezier(0.3,0,0.8,0.3) forwards' } : modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden="true" style={{ padding: 'var(--space-2) 0 var(--space-1)' }}>
          <div className="lvg-sheet-handle" />
        </div>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 'var(--text-body)', color: 'var(--text)', margin: 0, fontWeight: 600, flex: 1, lineHeight: 1.3 }}>設定</h2>
          <button type="button" style={doneBtnStyle} onClick={animateClose}>完了</button>
        </div>

        <div style={bodyStyle}>
          {/* 上はメールアドレスだけ。ログアウトは下の「アカウント」の欄（削除の上）に置く。 */}
          <Group ariaLabel="ログイン中のアカウント">
            <div style={{ padding: 'var(--space-3) 0' }}>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>ログイン中</p>
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--text)', margin: 0, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{user?.email || '(未取得)'}</p>
            </div>
          </Group>

          {/* 運営（管理者のみ表示） */}
          {isAdmin && (
            <Group label="運営" ariaLabel="運営ダッシュボード">
              <button type="button" style={rowButtonStyle} onClick={onOpenAdmin}>
                <span style={{ ...rowTitleStyle, flex: 1 }}>運営ダッシュボード</span>
                <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
            </Group>
          )}

          {/* ── プラン・お支払い ── */}
          <Group label="プラン・お支払い">
            {subLoading ? (
              <div role="status" aria-label="契約の状態を確認しています" style={{ padding: 'var(--space-3) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <SkeletonBlock width="40%" height="var(--text-body)" radius="var(--radius)" />
                <SkeletonBlock width="70%" height="var(--text-meta)" radius="var(--radius)" />
              </div>
            ) : isActive ? (
              <>
                {/* プランの呼び名は 1 つだけ（無料プラン / 7 日間無料（◯月◯日まで）/ 月額プラン / 年額プラン・GLOSSARY）。
                    無料期間の終わる日はこの行に入れる（「無料期間の終わり」の行と二重にしない）。
                    支払いが止まっているなど「利用中」以外の状態のときだけ、状態の行を足す。 */}
                {/* 無料期間は「終わる」だけに読めないよう、同じ行の下に続くプランを添える
                    （「その後 年額 ¥12,800（税込）で自動更新」＝終わる日はすぐ上の行にあるので繰り返さない・月額か年額かは product id から・分からなければ「プラン」）。 */}
                {plan === 'trial' ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', minHeight: 44, padding: 'var(--space-3) 0' }}>
                    <span style={{ fontSize: 'var(--text-body)', color: 'var(--text)', flexShrink: 0 }}>プラン</span>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right', minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--text-body)', color: 'var(--text-2)' }}>
                        {planNameFor({ plan, priceId: subscription?.priceId, trialEnd: formatPeriodEnd(subscription?.currentPeriodEnd) || '' })}
                      </span>
                      {/* 語の途中（「自／動更新」）で折り返さない（文節の切れ目だけ）。 */}
                      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                        {withPhraseBreaks(trialRenewalLine({ priceId: subscription?.priceId, trialEnd: formatPeriodEnd(subscription?.currentPeriodEnd) || '' }))}
                      </span>
                    </span>
                  </div>
                ) : (
                  <ValueRow
                    label="プラン"
                    value={planNameFor({ plan, priceId: subscription?.priceId, trialEnd: formatPeriodEnd(subscription?.currentPeriodEnd) || '' })}
                  />
                )}
                {subscription?.status && subscription.status !== 'active' && (
                  <ValueRow label="状態" value={billingStatusLabel(subscription.status)} style={divider} />
                )}
                {plan !== 'trial' && formatPeriodEnd(subscription?.currentPeriodEnd) && (
                  <ValueRow label="次回更新" value={formatPeriodEnd(subscription.currentPeriodEnd)} style={divider} />
                )}
                {tokensRemaining != null ? (
                  // 有料プランは、いつ戻るかも一緒に（無料プランの行と同じ・2026-09-29）。無料期間のトークンは月で戻らないので出さない。
                  <ValueRow
                    label={plan === 'trial' ? '無料期間の残り' : '今月の残り'}
                    value={`${fmtTokens(tokensRemaining)} / ${fmtTokens(tokenAllowance)} トークン`}
                    // まだ使っていない（残り＝その月の分）ときは「戻ります」を出さない（戻るものが無い・2026-09-30）。
                    sub={plan === 'trial' || tokensRemaining >= tokenAllowance ? null : <><span style={{ whiteSpace: 'nowrap' }}>{nextResetLabelJa()}に</span> <span style={{ whiteSpace: 'nowrap' }}>{fmtTokens(tokenAllowance)} トークンに戻ります</span></>}
                    style={divider}
                  />
                ) : tokensLoading ? (
                  <ValueRowSkeleton label={plan === 'trial' ? '無料期間の残り' : '今月の残り'} style={divider} />
                ) : null}
                {lotRow}
                {canBuyTokens && (
                  // 設定を閉じてからシートを開く（設定の上に重ねるとシートが設定の下に隠れる・z-index 880 > 700）。
                  // シートを閉じたとき・「戻る」で設定に戻る（from: 'settings'・App の PaywallGate）。
                  <button type="button" onClick={() => { onClose?.(); openTokenSheet({ from: 'settings' }); }} style={{ ...rowButtonStyle, ...divider }}>
                    <span style={{ ...rowTitleStyle, flex: 1 }}>トークンを追加</span>
                    <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                )}
                <div style={{ ...blockStyle, ...divider }}>
                  {/* 管理ボタンを出せる状態かどうかで説明文を出し分ける。
                      出せない（Web で stripeCustomerId 未同期 / 付与契約 等）のに
                      「こちらから」と書くと、ボタンが無いのに導線を匂わせて分かりにくいため。 */}
                  {/* 7 日間無料のときだけ、いつまでに解約すれば料金がかからないかを日付で（App Store は終わる 24 時間前まで）。 */}
                  {plan === 'trial' && (
                    <p style={{ ...noteStyle, color: 'var(--text)', marginBottom: 'var(--space-2)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                      {withPhraseBreaks(trialCancelNote(dateLabelJa(trialCancelByTime(subscription?.currentPeriodEnd)) || ''))}
                    </p>
                  )}
                  {/* 解約したらどうなるか（無料プランで続けられる・メモは消えない）を、解約の案内のすぐ下に（2026-09-29）。 */}
                  {plan === 'trial' && (
                    <p style={{ ...noteStyle, marginBottom: 'var(--space-2)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                      {/* 「毎月 30 トークン」は 1 かたまり（「毎月 30／トークン」と割らない・2026-10-04）。 */}
                      {withPhraseBreaks('解約しても無料プラン（ずっと無料・相談は')}<span style={{ whiteSpace: 'nowrap' }}>毎月 {fmtTokens(FREE_TOKENS)} トークン</span>{withPhraseBreaks('）で使い続けられます。メモは残ります。')}
                    </p>
                  )}
                  {/* 文節の切れ目でだけ折り返す（「でき／ます」と語の途中で切らない・2026-10-04）。 */}
                  <p style={{ ...noteStyle, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                    {withPhraseBreaks(isNative
                      ? '解約・プラン変更は App Store のサブスクリプションの設定から。いつでも解約でき、データは保持されます。'
                      : subscription?.stripeCustomerId
                        ? '解約・カード変更・請求履歴は下のボタンから。いつでも解約でき、データは保持されます。'
                        : 'App で購入した場合、解約は iPhone の「設定」→ 名前 →「サブスクリプション」から、いつでもできます。データは保持されます。')}
                  </p>
                  {isNative ? (
                    <button
                      type="button"
                      aria-label="サブスクリプションを管理する"
                      style={billingBusy ? btnGhostOff : btnGhost}
                      disabled={billingBusy}
                      onClick={handleManageBilling}
                    >
                      {billingBusy ? '移動中…' : 'サブスクリプションを管理（App Store）'}
                    </button>
                  ) : subscription?.stripeCustomerId ? (
                    <button
                      type="button"
                      aria-label="プランを管理する"
                      style={billingBusy ? btnGhostOff : btnGhost}
                      disabled={billingBusy}
                      onClick={handleManageBilling}
                    >
                      {billingBusy ? '移動中…' : 'プランを管理する'}
                    </button>
                  ) : null}
                </div>
                {/* 管理ボタンを出せない契約状態では、探させずにその場で連絡導線を置く
                    （旧: 「画面下部のお問い合わせから」と下端リンクを自力で
                    探させる行き止まりだった）。一覧の行として置く（枠のボタンにしない）。 */}
                {/* Web で見ている App Store の契約: App Store のサブスクリプション画面を開ける行（iPhone なら App Store が開く・2026-09-29）。 */}
                {!isNative && !subscription?.stripeCustomerId && (
                  <button type="button" onClick={() => openManageSubscriptions()} style={{ ...rowButtonStyle, ...divider }}>
                    <span style={{ ...rowTitleStyle, flex: 1 }}>サブスクリプションを管理</span>
                    <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                )}
                {!isNative && !subscription?.stripeCustomerId && (
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('解約・プラン変更について')}`}
                    style={{ ...rowButtonStyle, ...divider, textDecoration: 'none', boxSizing: 'border-box' }}
                  >
                    <span style={{ ...rowTitleStyle, flex: 1 }}>解約・変更について問い合わせる</span>
                    <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </a>
                )}
              </>
            ) : (
              <>
                <ValueRow label="プラン" value={planNameFor({ plan: 'free' })} />
                {tokensRemaining != null ? (
                  // いつ戻るかも一緒に（使い切った人が「いつまた相談できるか」を設定でも分かるように・2026-09-29）。
                  <ValueRow
                    label="今月の残り"
                    value={`${fmtTokens(tokensRemaining)} / ${fmtTokens(tokenAllowance)} トークン`}
                    // まだ使っていない（残り＝その月の分）ときは「戻ります」を出さない（2026-09-30）。
                    sub={tokensRemaining >= tokenAllowance ? null : <><span style={{ whiteSpace: 'nowrap' }}>{nextResetLabelJa()}に</span> <span style={{ whiteSpace: 'nowrap' }}>{fmtTokens(tokenAllowance)} トークンに戻ります</span></>}
                    style={divider}
                  />
                ) : tokensLoading ? (
                  <ValueRowSkeleton label="今月の残り" style={divider} />
                ) : null}
                {lotRow}
                <div style={{ ...blockStyle, ...divider }}>
                  <p style={noteStyle}>
                    無料プランはずっと無料で、AI は相談（<span style={{ whiteSpace: 'nowrap' }}>1 回 約 {TOKEN_COSTS.consult} トークン</span>）と<span style={{ whiteSpace: 'nowrap' }}>写真から書き起こし</span>（<span style={{ whiteSpace: 'nowrap' }}>毎月 {FREE_OCR_PER_MONTH} 回</span>）。プランは<span style={{ whiteSpace: 'nowrap' }}>毎月 {PAID_TOKENS.toLocaleString()} トークン</span>で、<span style={{ whiteSpace: 'nowrap' }}>すべての AI 機能。</span>
                  </p>
                  <button
                    type="button"
                    style={btnPrimary}
                    // 有料プランの画面は設定の上に重なる（閉じると設定に戻る）。
                    onClick={() => openPaywall(null)}
                  >
                    プランを見る
                  </button>
                </div>
              </>
            )}
          </Group>

          {/* ── 通知 ── 準備中（鍵が未設定）の間はグループごと出さない。 */}
          {pushConfigured && (
          <Group label="通知" ariaLabel="通知">
            {/* 1 つのスイッチで 2 種類（思い出しの通知・行動の期限）をまとめてオン/オフする。 */}
            <SettingRow
              title="思い出しと行動の通知"
              desc="思い出しの通知（多くても週に 1 回）と、行動の期限の日の朝 8 時ごろに 1 回。このスイッチでまとめてオン・オフします。"
              extra={pushNote}
              control={canTogglePush ? (
                <ToggleSwitch
                  checked={pushOn}
                  busy={pushBusy}
                  ariaLabel="思い出しと行動の通知"
                  onChange={handleTogglePush}
                />
              ) : null}
            />
          </Group>
          )}

          {/* ── メモのタグ: 視点の地図（振り返り › 記録に地図・合いそうなタグでもすすめる・やめてもタグは残る） ── */}
          <Group label="メモのタグ">
            <SettingRow
              title="視点の地図"
              desc="分野のタグのひな形を使い、振り返り › 記録に地図を出します。合いそうなタグでもすすめます。"
              control={(
                <ToggleSwitch
                  checked={viewpoint.on}
                  ariaLabel="視点の地図"
                  onChange={() => { viewpoint.setOn(!viewpoint.on); }}
                />
              )}
            />
          </Group>

          {/* ── ほかのアプリから取り込む（ブクログ・読書メーター・Kindle） ── */}
          {onOpenImport && (
            <Group label="取り込む">
              <button type="button" style={rowButtonStyle} onClick={onOpenImport}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...rowTitleStyle, display: 'block' }}>ほかのアプリから取り込む</span>
                  <span style={{ ...rowDescStyle, display: 'block' }}>ブクログ・読書メーター・Kindle</span>
                </span>
                <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
            </Group>
          )}

          {/* ── データをダウンロード ── */}
          <Group label="データをダウンロード">
            <button type="button" aria-label="表で見る（CSV をダウンロード）" style={exporting ? rowButtonBusy : rowButtonStyle} aria-busy={exporting || undefined} disabled={exporting} onClick={handleExport}>
              <span style={{ ...rowTitleStyle, flex: 1, color: 'inherit' }}>{exporting ? '準備中…' : '表で見る（CSV）'}</span>
              <IcDownload size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
            <button type="button" aria-label="文章で読み返す（Markdown で書き出す）" style={{ ...(exportingMd ? rowButtonBusy : rowButtonStyle), ...divider }} aria-busy={exportingMd || undefined} disabled={exportingMd} onClick={handleExportMarkdown}>
              <span style={{ ...rowTitleStyle, flex: 1, color: 'inherit' }}>{exportingMd ? '書き出し中…' : '文章で読み返す（Markdown）'}</span>
              <IcDownload size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
          </Group>

          {/* ── プライバシー: AI へのデータ送信（同意・App Review 5.1.2(i)）と、利用状況の記録（ファーストパーティ計測） ── */}
          <Group label="プライバシー">
            {/* 押すと同意のシート（送るもの・送り先）。同意済みなら「同意を取り消す」、まだなら「同意する」。 */}
            <button
              type="button"
              style={rowButtonStyle}
              onClick={() => { requestAiConsent({ mode: 'manage' }); }}
              aria-label={`AI へのデータ送信（${aiConsentLabel || '確かめています'}）`}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...rowTitleStyle, display: 'block' }}>AI へのデータ送信</span>
                <span style={{ ...rowDescStyle, display: 'block', ...(aiConsentLabel ? {} : { visibility: 'hidden' }) }}>{aiConsentLabel || 'まだ同意していません'}</span>
              </span>
              <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
            <SettingRow
              style={divider}
              title="利用状況の記録"
              desc="機能名と回数だけ。外部には送りません。"
              control={(
                <ToggleSwitch
                  checked={analyticsOn}
                  ariaLabel="利用状況の記録"
                  onChange={handleToggleAnalytics}
                />
              )}
            />
          </Group>

          {/* ── アプリ・サポート ── */}
          <Group label="アプリ・サポート">
            {/* 使い方（ヘルプ）。ホーム・振り返りでは右上の ？ から開けるが、設定からも探せるように（2026-09-29）。 */}
            {onOpenHelp && (
              <button type="button" style={rowButtonStyle} onClick={onOpenHelp}>
                <span style={{ ...rowTitleStyle, flex: 1 }}>ヘルプ・使い方</span>
                <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
            )}
            {/* 新しくなったこと（2026-10-05）: 版ごとの どこの・何が・これまで → これから・影響・意図。下はいちばん新しい版の日付。 */}
            {RELEASES.length > 0 && (
              <button
                type="button"
                style={{ ...rowButtonStyle, ...(onOpenHelp ? divider : null) }}
                onClick={() => { markReleaseSeen(); setWhatsNewOpen(true); }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...rowTitleStyle, display: 'block' }}>新しくなったこと</span>
                  <span style={{ ...rowDescStyle, display: 'block' }}>{releaseHeading(RELEASES[0])}</span>
                </span>
                <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
            )}
            {/* 通常は自動更新（autoApply）。困った時の復旧用に顧客語で控えめに置く。
                書きかけが消える注意は押した後の確認ダイアログで伝える。 */}
            <button
              type="button"
              aria-label="読み込み直す"
              style={{ ...(updating ? rowButtonBusy : rowButtonStyle), ...(onOpenHelp || RELEASES.length > 0 ? divider : null) }}
              aria-busy={updating || undefined}
              disabled={updating}
              onClick={handleForceUpdate}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...rowTitleStyle, display: 'block', color: 'inherit' }}>{updating ? '更新中…' : '画面を読み込み直す'}</span>
                <span style={{ ...rowDescStyle, display: 'block' }}>表示が古いまま・崩れているとき</span>
              </span>
              <IcRefresh size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
            <button type="button" aria-label="フィードバックを送る" style={{ ...rowButtonStyle, ...divider }} onClick={() => setFeedbackOpen(true)}>
              <span style={{ ...rowTitleStyle, flex: 1 }}>フィードバック・要望を送る</span>
              <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
          </Group>

          {/* ── アカウント（破壊的操作・最下部に分離） ── */}
          <Group label="アカウント">
            {/* データ初期化（アカウントは残す） */}
            <div style={blockStyle} role="group" aria-label="データを初期化">
              <div>
                <p style={{ ...rowTitleStyle, fontWeight: 600 }}>データを初期化（ログインは残す）</p>
                <p style={rowDescStyle}>本・メモ・行動をすべて消します。</p>
              </div>
              <button
                type="button"
                // 読み上げの名前は見えている文字と同じ（aria-label で別の名前にしない・2026-09-30）。
                style={resetting ? btnGhostOff : btnDestructiveGhost}
                aria-busy={resetting || undefined}
                disabled={resetting}
                onClick={handleResetData}
              >
                {resetting ? '初期化中…' : 'データをすべて初期化する'}
              </button>
            </div>

            {/* ログアウト（アカウントを切り替えたい人の導線・削除のすぐ上）。ふつうの一覧の行（本文色）。 */}
            <button
              type="button"
              style={{ ...rowButtonStyle, ...divider, fontSize: 'var(--text-body)' }}
              onClick={async () => {
                // 押し間違いで出てしまわないように、ひと声かける（消す操作ではないので赤くしない・2026-09-29）。
                const ok = await confirm({
                  title: 'ログアウトしますか？',
                  message: 'メモはアカウントに残ります',
                  confirmLabel: 'ログアウト',
                  cancelLabel: 'キャンセル',
                });
                if (!ok) return;
                try { await signOut(); onClose?.(); } catch { toast.error('ログアウトに失敗しました。'); }
              }}
            >
              ログアウト
            </button>

            {/* アカウント削除 */}
            <div ref={deleteRef} style={{ ...blockStyle, ...divider }} role="group" aria-label="アカウント削除">
              <div>
                <p style={{ ...rowTitleStyle, fontWeight: 600, color: 'var(--text)' }}>アカウント削除（退会）</p>
                <p style={rowDescStyle}>本・メモ・写真・相談の履歴が消えます。</p>
              </div>
              {/* 退会してもサブスク（App Store / 決済）は自動では止まらない旨を明示。
                  Apple ガイドライン要件＋過剰請求トラブルの防止。解約の手順は上の「プラン」の欄の 1 か所だけ。
                  赤は削除の 2 つのボタンだけにして、ここは補足の文字色の 1 文。 */}
              {isActive && (
                <p style={{ ...rowDescStyle, margin: 0 }}>
                  <span style={{ display: 'inline-block' }}>退会しても、プランの支払いは止まりません。</span><span style={{ display: 'inline-block' }}>先に<span style={{ whiteSpace: 'nowrap' }}>「プラン・お支払い」</span>の方法で</span><span style={{ display: 'inline-block' }}>解約してください。</span>
                </p>
              )}
              {!deleteOpen ? (
                <button type="button" aria-label="アカウントの削除を開始" style={btnDestructiveGhost} onClick={() => setDeleteOpen(true)}>
                  アカウントの削除を開始
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {/* 詳しい説明は開いてから（閉じた状態は 1 行だけ）。 */}
                  {/* 文節の切れ目でだけ折り返す（「くだ／さい」と語の途中で切らない・2026-10-04）。
                      文字は上の行の説明と同じ 13/--text-2（rowDescStyle）。「本・メモ・写真・相談の履歴が消えます」は上の行で言うので繰り返さない。 */}
                  <p style={{ ...rowDescStyle, margin: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                    {withPhraseBreaks('ログイン情報の完全な削除は、管理者の確認のあと（通常 7 日以内）に行います。この操作は取り消せません。')}
                  </p>
                  <p style={{ ...rowDescStyle, margin: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                    {withPhraseBreaks('確認のため、ご自身のメールアドレス')} <strong style={{ fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{expectedConfirm}</strong> {withPhraseBreaks('を入力してください。')}
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={expectedConfirm}
                    aria-label="確認用メールアドレス"
                    style={inputStyle}
                    maxLength={LIMITS.email}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {/* 活性判定は handleDelete と同じ正規化（trim + 小文字化）で統一する。
                      旧: ここだけ大文字小文字を区別していたため、メールを大文字混じりで
                      入力した人はボタンが薄いまま理由も分からず退会が詰んでいた。 */}
                  {(() => {
                    const confirmMatches =
                      confirmText.trim().toLowerCase() === String(expectedConfirm || '').toLowerCase();
                    return (
                      <>
                        {confirmText.trim() !== '' && !confirmMatches && (
                          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--error)', margin: 0, lineHeight: 1.5 }}>
                            メールアドレスが一致しません。
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
                          <button
                            type="button"
                            aria-label="削除をキャンセル"
                            // 削除中は押せない見た目（btnGhostOff・薄くしない・DESIGN §5）。
                            style={{ ...(deleting ? btnGhostOff : btnGhost), flex: 1, opacity: 1 }}
                            onClick={() => { setDeleteOpen(false); setConfirmText(''); setDeleteError(false); }}
                            disabled={deleting}
                          >
                            キャンセル
                          </button>
                          <button
                            type="button"
                            aria-label="アカウントを完全に削除"
                            // 一致するまでは押せない見た目（薄くしない・DESIGN §5）。削除中は塗りのまま文言で示す。
                            style={{ ...(confirmMatches ? btnDanger : btnPrimaryOff), flex: 1, opacity: 1 }}
                            disabled={deleting || !confirmMatches}
                            onClick={handleDelete}
                          >
                            {deleting ? '削除中…' : '完全に削除'}
                          </button>
                        </div>
                        {deleteError && !deleting && (
                          // ほかの画面の失敗と同じ ErrorMessage（題＋次にすること＋「もう一度」）。中の理由は出さない（toMessage はログだけ）。
                          <div style={{ marginTop: 'var(--space-1)' }}>
                            <ErrorMessage
                              title="削除を受け付けられませんでした"
                              description="時間をおいてもう一度お試しください。続くときはお問い合わせへ。"
                              actions={[{ label: 'もう一度', variant: 'secondary', onClick: () => handleDelete({ retry: true }) }]}
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </Group>

          {/* Legal links — LP と同じ /legal/* ページを参照 (単一ソース)。
              新規タブで開いて、設定モーダルの状態を保つ。 */}
          <nav aria-label="規約とお問い合わせ" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 var(--space-2)', justifyContent: 'center' }}>
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" style={legalLinkStyle}>
              利用規約
            </a>
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" style={legalLinkStyle}>
              プライバシーポリシー
            </a>
            {/* 特商法リンクはネイティブでは反ステアリング順守のため非表示にし、価格開示は
                App Store に委ねる（特商法ページ自体は ¥1,480 / App Store 課金前提に更新済み）。 */}
            {!isNative && (
              <a href={SCT_URL} target="_blank" rel="noopener noreferrer" style={legalLinkStyle}>
                特定商取引法に基づく表記
              </a>
            )}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={legalLinkStyle}>
              お問い合わせ
            </a>
          </nav>
        </div>
      </div>

      {feedbackOpen && <FeedbackForm onClose={() => setFeedbackOpen(false)} />}
      {/* 設定の外側（背景）を押すと設定を閉じる仕組みに、シートの中のタップが届かないようにする
          （畳んだ前の版を開こうとしたら設定ごと閉じていた・2026-10-05）。 */}
      {whatsNewOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <WhatsNewSheet releases={RELEASES} mode="all" layer="dialog" onClose={() => setWhatsNewOpen(false)} />
        </div>
      )}
    </div>
  );
}
