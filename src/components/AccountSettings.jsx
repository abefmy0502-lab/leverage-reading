// 🛡️ AccountSettings — Modal opened from the header settings menu.
//
// Two destructive / sensitive operations:
//   1. 📥 データをダウンロード — exports books / memos / tags / actions /
//      chat history as a single JSON file. Photo paths only (signed URLs are
//      time-limited and would expire by the time the user opens the export).
//   2. ⚠️ アカウント削除 — wipes all user-owned rows + Storage photos, then
//      writes an account_deletion_requests row that the admin must process to
//      delete the auth.users entry (service_role required for that final step).

import { useEffect, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { SUPPORT_EMAIL } from '../lib/contact';
import { LIMITS } from '../lib/limits';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { toMessage, isSchemaError } from '../lib/errors';
import FeedbackForm from './FeedbackForm';
import { exportUserDataAsCSV, exportMemosAsMarkdown } from '../lib/exportData';
import { forceUpdate as forceAppUpdate } from '../lib/swUpdate';
import { useSubscription } from '../hooks/useSubscription';
import { startCheckout, openBillingPortal, PLAN_LABELS } from '../lib/billing';
import { isNative, purchasePlan, openManageSubscriptions, APP_PLAN_LABELS, getStoreLabels } from '../lib/iap';
import { btnPrimary as uiBtnPrimary, btnDanger as uiBtnDanger } from '../styles/ui';
import {
  Settings as IcSettings, CreditCard as IcCard, Bell as IcBell, Download as IcDownload,
  FileText as IcFileText, BarChart3 as IcBar, RefreshCw as IcRefresh, Mail as IcMail,
  Eraser as IcEraser, AlertTriangle as IcWarn, X as IcClose,
} from 'lucide-react';
import { track, EVENTS, isAnalyticsOptedOut, setAnalyticsOptOut } from '../lib/analytics';
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

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--z-popover)',
  background: 'rgba(30,25,20,0.45)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  fontFamily: "var(--font-app)",
};

const cardStyle = {
  background: 'var(--c-card)',
  borderRadius: 14,
  width: 'min(440px, 100%)',
  maxHeight: 'min(85vh, 85dvh)',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 16px 48px rgba(30,25,20,0.18)',
  overflow: 'hidden',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 14px',
  borderBottom: '1px solid var(--c-hairline)',
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: 'var(--c-brand)',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  padding: 0,
};

const bodyStyle = {
  padding: '16px 18px',
  overflowY: 'auto',
  flex: 1,
  WebkitOverflowScrolling: 'touch',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const sectionStyle = {
  padding: 14,
  background: '#fff',
  border: '1px solid var(--c-hairline)',
  borderRadius: 12,
};

const dangerSection = { ...sectionStyle, border: '1px solid #d8b8b0', background: '#faf2ee' };

// グループ見出し — 関連セクションを束ねる小さなラベル。モーダルのクリーム/ブラウン
// 配色（serif）に合わせ、SectionHeader（sans 系トークン）ではなく軽量なインライン
// 見出しを使う。表示専用で挙動には一切関与しない。
const groupLabelStyle = {
  fontSize: 11,
  color: 'var(--c-ink-3)',
  // 5 グループに整理したので、前のカードとの間を少し広めに取り、グループの
  // 切れ目を分かりやすくする（body の gap:14 に加算される）。下は詰めて
  // 直下のカードと結びつける（iOS「設定」のセクション見出し相当）。
  margin: '10px 0 2px 2px',
  fontWeight: 600,
  letterSpacing: 0.6,
};

function GroupLabel({ children }) {
  // 装飾的な見出しラベル。各 section は自前の見出し <p> を持つため、
  // グループラベルはスクリーンリーダーでは補助的な小見出しとして読み上げる。
  return <p style={groupLabelStyle} role="heading" aria-level={2}>{children}</p>;
}

// iOS 風トグルスイッチ。on/off が「色＋ノブ位置」で一目で分かるので、
// 「オン（タップでオフ）」のように状態と操作をラベルに詰め込む分かりにくさを解消する。
function ToggleSwitch({ checked, onChange, disabled = false, busy = false, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={onChange}
      style={{
        position: 'relative',
        flexShrink: 0,
        width: 51,
        height: 31,
        borderRadius: 999,
        border: 'none',
        padding: 0,
        cursor: disabled || busy ? 'default' : 'pointer',
        background: checked ? 'var(--c-brand)' : '#d6cfc2',
        transition: 'background 220ms ease',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 27,
          height: 27,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transition: 'left 220ms cubic-bezier(0.3, 1.3, 0.6, 1)',
        }}
      />
    </button>
  );
}

// 設定行: 左にタイトル＋説明、右にスイッチ（or 任意のコントロール）。
// iOS「設定」アプリと同じ並びで、トグル系の設定はこれで統一する。
function SettingRow({ title, desc, control, titleColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...sectionTitleStyle, margin: 0, ...(titleColor ? { color: titleColor } : null) }}>{title}</p>
        {desc && <p style={{ ...sectionDescStyle, margin: '4px 0 0' }}>{desc}</p>}
      </div>
      {control && <div style={{ paddingTop: 2 }}>{control}</div>}
    </div>
  );
}

// 全 section 共通の見出し（13px / 600）。色だけ差し替え可能（破壊操作は赤）。
const sectionTitleStyle = { fontSize: 13, margin: '0 0 4px', fontWeight: 600, color: 'var(--c-ink)' };
// 見出し＝lucide 線アイコン＋テキスト（脱・絵文字）。色はオプションで上書き。
function SecTitle({ icon: Icon, children, color }) {
  return (
    <p style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 7, ...(color ? { color } : null) }}>
      <Icon size={15} aria-hidden="true" /> {children}
    </p>
  );
}
// 全 section 共通の説明文（11px / 行間 1.7 / ボタンとの間隔 10px）。
const sectionDescStyle = { fontSize: 11, color: 'var(--c-ink-2)', margin: '0 0 10px', lineHeight: 1.7 };
// 無効/準備中など、ボタンを出さず案内文のみのときの末尾余白なしバリアント。
const sectionNoteStyle = { fontSize: 11, color: 'var(--c-ink-2)', margin: 0, lineHeight: 1.7 };

const btnPrimary = uiBtnPrimary;
const btnDanger = uiBtnDanger;

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  border: '1px solid var(--c-hairline-strong)',
  borderRadius: 10,
  background: '#fff',
  color: 'var(--c-ink)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

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

// current_period_end（ISO 文字列）を「YYYY/MM/DD」へ。失敗時は null。
function formatPeriodEnd(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

async function listAllUserPhotos(userId, bucket = 'book-memo-photos') {
  if (!isSupabaseConfigured) return [];
  const all = [];
  // Top level: user_id/<book_id>/<file>
  const { data: bookFolders, error } = await supabase.storage
    .from(bucket)
    .list(userId, { limit: 1000 });
  if (error || !bookFolders) return all;
  for (const entry of bookFolders) {
    if (!entry?.name) continue;
    // Supabase storage の list 規約: フォルダは id=null、ファイルは id を持つ。
    if (entry.id) {
      // user_id 直下のファイル（例: book-covers/<userId>/<file>）。
      all.push(`${userId}/${entry.name}`);
      continue;
    }
    // フォルダ → 配下のファイルを列挙（例: book-memo-photos/<userId>/<bookId>/<file>）。
    const { data: files } = await supabase.storage
      .from(bucket)
      .list(`${userId}/${entry.name}`, { limit: 1000 });
    (files || []).forEach((f) => {
      if (f?.name) all.push(`${userId}/${entry.name}/${f.name}`);
    });
  }
  return all;
}

export default function AccountSettings({ onClose, onAfterDelete, isAdmin, onOpenAdmin }) {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [exporting, setExporting] = useState(false);
  const [exportingMd, setExportingMd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  // フィードバック（入れ子モーダル）を開いている間は、そちらのトラップに譲るため無効化。
  const trapRef = useFocusTrap(!feedbackOpen);
  // 💳 課金状態。subscriptions 未適用なら subscription=null / isActive=false で
  // 静かに縮退する（useSubscription 側で schema-error を握りつぶす）。
  const { subscription, isActive, loading: subLoading, refresh: refreshSub } = useSubscription();
  // 表示ラベルはチャネル別（ネイティブ=App / Web パスは休眠中）。
  // ネイティブでは App Store のローカライズ価格をストアから取得して上書きする
  // （Paywall と同じ。App Store Connect の設定価格と表示を一致させ、審査での
  //  価格不一致リスクを避ける）。取れない時だけ既定ラベルにフォールバック。
  const [planLabels, setPlanLabels] = useState(isNative ? APP_PLAN_LABELS : PLAN_LABELS);
  useEffect(() => {
    if (!isNative) return undefined;
    let alive = true;
    getStoreLabels(user?.id)
      .then((l) => { if (alive && l) setPlanLabels(l); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.id]);
  const [billingBusy, setBillingBusy] = useState(false);

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
  const pushConfigured = isPushConfigured(); // VAPID 公開鍵が env にあるか
  const pushSupported = isPushSupported();   // 端末 + iOS standalone 条件込み
  // A2HS 案内は Web(ブラウザ)のみ。ネイティブ(Capacitor WKWebView)では isIOS()=true /
  // isStandalonePWA()=false になり「ホーム画面に追加」を誤って促してしまうため !isNative で封じる。
  const pushNeedsA2HS = !isNative && pushConfigured && isIOS() && !isStandalonePWA(); // iOS ブラウザタブ内
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDenied, setPushDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setPushDenied(getPushPermission() === 'denied');
        const on = await isPushSubscribed();
        if (alive) setPushOn(on);
      } catch { /* graceful: トグルは OFF のまま */ }
    })();
    return () => { alive = false; };
  }, []);

  const handleTogglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        // OFF にする — 購読解除 + DB 行削除。失敗しても静かに。
        await unsubscribeFromPush();
        setPushOn(false);
        toast.info('想起の通知をオフにしました。');
      } else {
        // ON にする — ここは必ずユーザージェスチャ内なので許可要求してよい。
        const res = await subscribeToPush({ frequency: 'weekly' });
        if (res.ok) {
          setPushOn(true);
          track(EVENTS.PUSH_ENABLED); // ON 成功時のみ（props なし・fire-and-forget）
          toast.success('通知をオンにしました。メモが育つと、忘れた頃にそっと戻ってきます。');
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

  const handleUpgrade = async (plan) => {
    if (billingBusy) return;
    setBillingBusy(true);
    // 📊 課金転換ファネル（PII なし・plan の enum だけ）。
    if (plan === 'monthly' || plan === 'annual') track(EVENTS.CHECKOUT_STARTED, { plan });
    try {
      if (isNative) {
        // ネイティブ(IAP): App Store の購入シート。成功後は端末ローカル権利で即反映。
        const res = await purchasePlan(plan, user?.id);
        if (res?.cancelled) { setBillingBusy(false); return; }
        toast.success('ご契約ありがとうございます。');
        await refreshSub?.();
        setBillingBusy(false);
        return;
      }
      await startCheckout(plan);
    } catch (e) {
      toast.error(toMessage(e, '購入手続きを開始できませんでした。'));
      setBillingBusy(false);
    }
  };

  const handleForceUpdate = async () => {
    if (updating) return;
    // 確認ダイアログ必須 — 押した瞬間に reload するので、メモ書き / AI 会話の
    // 途中で誤タップすると入力が消える。意図的な操作だけ通す。
    const ok = await confirm({
      title: '🔄 読み込み直しますか？',
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
      if (e.key === 'Escape' && !feedbackOpen && !e.isComposing && !e.nativeEvent?.isComposing) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, feedbackOpen]);

  const expectedConfirm = (user?.email || 'DELETE').trim();

  const handleExport = async () => {
    if (!user || !isSupabaseConfigured) {
      toast.error('ログインが必要です。');
      return;
    }
    setExporting(true);
    try {
      const summary = await exportUserDataAsCSV(user.id);
      const total = summary.reduce((acc, s) => acc + (s.count || 0), 0);
      track(EVENTS.EXPORT_USED, { kind: 'csv' }); // 成功確定後のみ（fire-and-forget）
      toast.success(`CSV ${summary.filter((s) => !s.skipped).length} 件をダウンロード（計 ${total} 行）`);
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
      toast.success(`Markdown を書き出しました（メモ ${memos} 件）`);
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
        '本・メモ・写真・行動リスト・対話履歴・タグ・テーマ履歴など、あなたのデータをすべて消去して、まっさらな状態に戻します。\n\nアカウント（ログイン）は残ります。この操作は取り消せません。',
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
      setTimeout(() => { try { window.location.reload(); } catch { /* ignore */ } }, 600);
    } catch (e) {
      toast.error(toMessage(e, '初期化に失敗しました。'));
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !isSupabaseConfigured) {
      toast.error('ログインが必要です。');
      return;
    }
    if (confirmText.trim() !== expectedConfirm) {
      toast.error('確認入力が一致しません。');
      return;
    }
    const ok = await confirm({
      title: '本当にすべて削除しますか？',
      message:
        '本・メモ・写真・対話履歴・行動リスト・タグ — すべてのデータが完全に削除されます。\n\nログイン情報の完全削除は管理者の最終確認後（通常 7 日以内）に実行されます。この操作は取り消せません。',
      confirmLabel: '削除を実行',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;

    setDeleting(true);
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
      await deleteOwn('theme_reports');     // 📊 テーマレポート履歴
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
        toast.error('削除リクエストの登録に失敗しました。お手数ですがサポートにご連絡ください。');
        return;
      }

      // 1 つでも本当の削除失敗があれば成功トーストを出さず、サポート連絡を案内。
      // （削除リクエストの insert は上で済ませているので、管理者が追って手当て可能）。
      if (dbErrors.length > 0) {
        console.error('account deletion partial failure:', dbErrors);
        toast.error('一部のデータ削除に失敗しました。お手数ですがサポートにご連絡ください。');
        return;
      }

      toast.success('すべてのデータを削除しました。サインアウトします。');
      // Sign out then bubble up to the parent
      try { await signOut(); } catch { /* ignore */ }
      onAfterDelete?.();
    } catch (e) {
      toast.error(toMessage(e, '削除処理に失敗しました。'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="アカウント設定" onClick={onClose}>
      <div ref={trapRef} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 16, color: 'var(--c-ink)', margin: 0, fontWeight: 500, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}><IcSettings size={18} aria-hidden="true" /> アカウント設定</h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="閉じる"><IcClose size={20} aria-hidden="true" /></button>
        </div>

        <div style={bodyStyle}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--c-ink-2)', margin: 0 }}>サインイン中</p>
            <p style={{ fontSize: 14, color: 'var(--c-ink)', margin: '2px 0 0', fontWeight: 500, wordBreak: 'break-all' }}>{user?.email || '(未取得)'}</p>
          </div>

          {/* 🛰️ 運営（管理者のみ表示） */}
          {isAdmin && (
            <>
              <GroupLabel>運営</GroupLabel>
              <section style={sectionStyle} aria-label="運営ダッシュボード">
                <SecTitle icon={IcBar}>運営ダッシュボード</SecTitle>
                <p style={sectionDescStyle}>
                  アクティブ人数・売上・AI コスト・機能別の利用状況・問い合わせを一画面で確認できます。
                </p>
                <button type="button" style={btnPrimary} onClick={onOpenAdmin}>
                  ダッシュボードを開く
                </button>
              </section>
            </>
          )}

          {/* ── プラン・お支払い ── */}
          <GroupLabel>プラン・お支払い</GroupLabel>

          {/* 💳 Billing / プラン */}
          <section style={sectionStyle} aria-label="プラン・お支払い">
            <SecTitle icon={IcCard}>プラン</SecTitle>
            {subLoading ? (
              <p style={sectionNoteStyle}>確認中…</p>
            ) : isActive ? (
              <>
                <p style={{ fontSize: 12, color: 'var(--c-ink-2)', margin: '0 0 4px', lineHeight: 1.7 }}>
                  状態：<strong style={{ color: 'var(--c-ink)' }}>{subscription?.status ? billingStatusLabel(subscription.status) : '利用中'}</strong>
                  {formatPeriodEnd(subscription?.currentPeriodEnd) && (
                    <>（次回更新 {formatPeriodEnd(subscription.currentPeriodEnd)}）</>
                  )}
                </p>
                {/* 管理ボタンを出せる状態かどうかで説明文を出し分ける。
                    出せない（Web で stripeCustomerId 未同期 / 付与契約 等）のに
                    「こちらから」と書くと、ボタンが無いのに導線を匂わせて分かりにくいため。 */}
                <p style={sectionDescStyle}>
                  {isNative
                    ? '解約・プラン変更は App Store のサブスク設定から。いつでも解約でき、データは保持されます。'
                    : subscription?.stripeCustomerId
                      ? '解約・カード変更・請求履歴は下のボタンから。いつでも解約でき、データは保持されます。'
                      : 'いつでも解約でき、データは保持されます。解約・変更のご希望は、画面下部の「お問い合わせ」よりご連絡ください。'}
                </p>
                {isNative ? (
                  <button
                    type="button"
                    aria-label="サブスクリプションを管理する"
                    style={{ ...btnPrimary, opacity: billingBusy ? 0.6 : 1 }}
                    disabled={billingBusy}
                    onClick={handleManageBilling}
                  >
                    {billingBusy ? '移動中…' : '⚙️ サブスクリプションを管理（App Store）'}
                  </button>
                ) : subscription?.stripeCustomerId ? (
                  <button
                    type="button"
                    aria-label="プランを管理する"
                    style={{ ...btnPrimary, opacity: billingBusy ? 0.6 : 1 }}
                    disabled={billingBusy}
                    onClick={handleManageBilling}
                  >
                    {billingBusy ? '移動中…' : '⚙️ プランを管理する'}
                  </button>
                ) : null}
              </>
            ) : isNative ? (
              <>
                <p style={sectionDescStyle}>
                  すべての機能を使うにはご契約が必要です。いつでも解約でき、データは保持されます。
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    aria-label={`${planLabels.annual.price} で契約（おすすめ）`}
                    style={{ ...btnPrimary, flexDirection: 'column', gap: 2, height: 'auto', paddingTop: 12, paddingBottom: 12, opacity: billingBusy ? 0.6 : 1 }}
                    disabled={billingBusy}
                    onClick={() => handleUpgrade('annual')}
                  >
                    <span>{billingBusy ? '移動中…' : `${planLabels.annual.price}`}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>おすすめ・{planLabels.annual.note}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`${planLabels.monthly.price} で契約`}
                    style={{
                      ...btnPrimary,
                      flexDirection: 'column',
                      gap: 2,
                      height: 'auto',
                      paddingTop: 12,
                      paddingBottom: 12,
                      background: 'transparent',
                      color: 'var(--c-brand)',
                      border: '1px solid var(--c-hairline-strong)',
                      opacity: billingBusy ? 0.6 : 1,
                    }}
                    disabled={billingBusy}
                    onClick={() => handleUpgrade('monthly')}
                  >
                    <span>{planLabels.monthly.price}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.75 }}>{planLabels.monthly.note}</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* App-only 配信: Orime は App Store の iOS アプリでのみ提供・課金。
                    Web/PWA から開かれた場合も、契約・利用ともアプリへ誘導する
                    （「Web 版」という別プロダクトは存在しないため、そう見せない）。 */}
                <p style={sectionDescStyle}>
                  Orime のご契約・ご利用は iOS アプリ（App Store）から行えます。アプリを入手して、同じアカウントでサインインしてください。
                </p>
                <a
                  href={import.meta.env.VITE_APP_STORE_URL || 'https://apps.apple.com/jp/app/orime'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...btnPrimary, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  📱 App Store で Orime を入手
                </a>
              </>
            )}
          </section>

          {/* ── 通知 ── */}
          <GroupLabel>通知</GroupLabel>

          {/* 🔔 想起の通知 */}
          <section style={sectionStyle} aria-label="想起の通知">
            {/* 操作可能な状態（許可要求できる）のときだけ右にスイッチを出す。
                準備中 / A2HS 必要 / 非対応 / OS で拒否済み の各状態は案内文に倒す。 */}
            {(() => {
              const canToggle = pushConfigured && pushSupported && !pushNeedsA2HS && !(pushDenied && !pushOn);
              return (
                <SettingRow
                  title={<><IcBell size={15} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />想起の通知</>}
                  desc="週1回ほど、過去のあなたの気づきがそっと戻ってきます。"
                  control={canToggle ? (
                    <ToggleSwitch
                      checked={pushOn}
                      busy={pushBusy}
                      ariaLabel="想起の通知"
                      onChange={handleTogglePush}
                    />
                  ) : null}
                />
              );
            })()}

            {isNative ? (
              // ネイティブ(iOS アプリ)は Web Push 非対応。APNs 対応は今後のアップデート。
              // 「ブラウザ非対応」等の誤案内を出さず、正直に準備中と伝える。
              <p style={{ ...sectionNoteStyle, color: 'var(--c-ink-2)', marginTop: 10 }}>
                📱 想起の通知は、今後のアップデートで対応予定です。
              </p>
            ) : !pushConfigured ? (
              // VAPID 鍵未設定 = 機能準備中（env 投入前）。静かに案内のみ。
              <p style={{ ...sectionNoteStyle, color: 'var(--c-ink-2)', marginTop: 10 }}>
                ただいま準備中です。もう少しお待ちください。
              </p>
            ) : pushNeedsA2HS ? (
              // iOS タブ内 = ホーム画面に追加しないと通知は使えない。
              <p style={{ ...sectionNoteStyle, marginTop: 10 }}>
                📲 iPhone / iPad では、<strong>ホーム画面に追加</strong>したアプリから開くと通知を受け取れます。<br />
                共有メニュー（□↑）→「ホーム画面に追加」→ 追加したアイコンから開いてください。
              </p>
            ) : !pushSupported ? (
              // 非対応ブラウザ等。
              <p style={{ ...sectionNoteStyle, color: 'var(--c-ink-2)', marginTop: 10 }}>
                この端末・ブラウザでは通知に対応していません。
              </p>
            ) : pushDenied && !pushOn ? (
              // OS で拒否済み = 自前ダイアログは出せない。設定からの手動許可を案内。
              <p style={{ ...sectionNoteStyle, marginTop: 10 }}>
                通知がオフになっています。端末の「設定 → 通知」から Orime の通知を許可すると受け取れます。
              </p>
            ) : null}
          </section>

          {/* ── データとプライバシー ── */}
          <GroupLabel>データとプライバシー</GroupLabel>

          {/* Export */}
          <section style={sectionStyle} aria-label="データをダウンロード">
            <SecTitle icon={IcDownload}>データをダウンロード</SecTitle>
            <p style={sectionDescStyle}>
              あなたのデータはいつでも書き出せます。用途に合わせて選んでください。
            </p>
            <button type="button" aria-label="表で見る（CSV をダウンロード）" style={{ ...btnPrimary, opacity: exporting ? 0.6 : 1 }} disabled={exporting} onClick={handleExport}>
              {exporting ? '準備中…' : '表で見る（CSV）'}
            </button>
            <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '6px 0 14px', lineHeight: 1.6 }}>
              本・メモ・タグ・行動・対話履歴をまとめた表。Excel / Numbers で開けます。
            </p>
            <button type="button" aria-label="文章で読み返す（Markdown で書き出す）" style={{ ...btnPrimary, background: 'transparent', color: 'var(--c-brand)', border: '1px solid var(--c-hairline-strong)', opacity: exportingMd ? 0.6 : 1 }} disabled={exportingMd} onClick={handleExportMarkdown}>
              {exportingMd ? '書き出し中…' : '文章で読み返す（Markdown）'}
            </button>
            <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '6px 0 0', lineHeight: 1.6 }}>
              メモを 1 枚の読み物に。NotebookLM や Obsidian、AI への読み込みにも。
            </p>
          </section>

          {/* 📊 利用状況の記録（製品改善のためのファーストパーティ計測） */}
          <section style={sectionStyle} aria-label="利用状況の記録">
            <SettingRow
              title={<><IcBar size={15} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />利用状況の記録（製品改善のため）</>}
              desc="どの機能がよく使われているかを、機能名や回数だけ（個人を特定する内容は含めず）そっと記録し、Orime の改善に役立てます。外部のサービスには送らず、いつでもオフにできます。"
              control={(
                <ToggleSwitch
                  checked={analyticsOn}
                  ariaLabel="利用状況の記録"
                  onChange={handleToggleAnalytics}
                />
              )}
            />
          </section>

          {/* ── アプリ・サポート ── */}
          <GroupLabel>アプリ・サポート</GroupLabel>

          {/* App update — 通常は自動更新（autoApply）。困った時の復旧用に顧客語で控えめに置く。 */}
          <section style={sectionStyle} aria-label="画面がうまく表示されないとき">
            <SecTitle icon={IcRefresh}>画面がうまく表示されないとき</SecTitle>
            <p style={sectionDescStyle}>
              表示が古いまま・崩れている場合に、いったん読み込み直します。書きかけのメモや入力中の文章は失われます。
            </p>
            <button
              type="button"
              aria-label="読み込み直す"
              style={{
                ...btnPrimary,
                background: 'transparent',
                color: 'var(--c-brand)',
                border: '1px solid var(--c-hairline-strong)',
                opacity: updating ? 0.6 : 1,
              }}
              disabled={updating}
              onClick={handleForceUpdate}
            >
              {updating ? '更新中…' : '読み込み直す'}
            </button>
          </section>

          {/* Feedback */}
          <section style={sectionStyle} aria-label="フィードバック・要望を送る">
            <SecTitle icon={IcMail}>フィードバック・要望を送る</SecTitle>
            <p style={sectionDescStyle}>
              バグ報告 / 機能要望 / 感想など、運営に直接届きます。いただいた声はサービス改善に活用します。
            </p>
            <button type="button" aria-label="フィードバックを送る" style={btnPrimary} onClick={() => setFeedbackOpen(true)}>
              フィードバックを送る
            </button>
          </section>

          {/* ── アカウント（破壊的操作・最下部に分離） ── */}
          <GroupLabel>アカウント</GroupLabel>

          {/* 🧹 データ初期化（アカウントは残す） */}
          <section style={sectionStyle} aria-label="データを初期化">
            <SecTitle icon={IcEraser}>データを初期化（ログインは残す）</SecTitle>
            <p style={sectionDescStyle}>
              <strong>ログインはそのまま、データだけ</strong>をすべて消して、まっさらな状態から始め直します。本・メモ・写真・行動・対話履歴・テーマ履歴が対象です。この操作は取り消せません。
            </p>
            <button
              type="button"
              aria-label="データを初期化する"
              style={{ ...btnPrimary, background: 'transparent', color: 'var(--c-critical)', border: '1px solid var(--c-critical-line)', boxShadow: 'none', opacity: resetting ? 0.6 : 1 }}
              disabled={resetting}
              onClick={handleResetData}
            >
              {resetting ? '初期化中…' : 'データをすべて初期化する'}
            </button>
          </section>

          {/* Delete */}
          <section style={dangerSection} aria-label="アカウント削除">
            <SecTitle icon={IcWarn} color="var(--c-critical)">アカウント削除（退会）</SecTitle>
            <p style={sectionDescStyle}>
              <strong>アカウントごと退会</strong>します。本・メモ・写真・対話履歴はすぐ削除され、ログイン情報の完全削除は管理者の最終確認後（通常 7 日以内）に実行されます。この操作は取り消せません。
            </p>
            {/* 退会してもサブスク（App Store / 決済）は自動では止まらない旨を明示。
                Apple ガイドライン要件＋過剰請求トラブルの防止。 */}
            {isActive && (
              <p style={{ fontSize: 12, color: 'var(--c-critical)', margin: '0 0 10px', lineHeight: 1.7, fontWeight: 600 }}>
                ⚠️ 退会してもサブスクの課金は自動で止まりません。
                {isNative
                  ? '先に「プラン管理」から App Store でサブスクを解約してください。'
                  : '先に「プラン管理」からサブスクを解約してください。'}
              </p>
            )}
            {!deleteOpen ? (
              <button type="button" aria-label="アカウントの削除を開始" style={btnDanger} onClick={() => setDeleteOpen(true)}>
                アカウントの削除を開始
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', margin: 0, lineHeight: 1.7 }}>
                  確認のため、ご自身のメールアドレス <strong>{expectedConfirm}</strong> を入力してください。
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
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    aria-label="削除をキャンセル"
                    style={{ ...btnPrimary, background: 'transparent', color: 'var(--c-brand)', border: '1px solid var(--c-hairline-strong)', flex: 1 }}
                    onClick={() => { setDeleteOpen(false); setConfirmText(''); }}
                    disabled={deleting}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    aria-label="アカウントを完全に削除"
                    style={{ ...btnDanger, flex: 1, opacity: deleting || confirmText.trim() !== expectedConfirm ? 0.5 : 1 }}
                    disabled={deleting || confirmText.trim() !== expectedConfirm}
                    onClick={handleDelete}
                  >
                    {deleting ? '削除中…' : '完全に削除'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Legal links — LP と同じ /legal/* ページを参照 (単一ソース)。
              新規タブで開いて、設定モーダルの状態を保つ。 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 4 }}>
            <a href="/legal/terms" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--c-ink-2)', textDecoration: 'underline' }}>
              利用規約
            </a>
            <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--c-ink-2)', textDecoration: 'underline' }}>
              プライバシーポリシー
            </a>
            {/* 特商法リンクはネイティブでは反ステアリング順守のため非表示にし、価格開示は
                App Store に委ねる（特商法ページ自体は ¥1,480 / App Store 課金前提に更新済み）。 */}
            {!isNative && (
              <a href="/legal/sct" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--c-ink-2)', textDecoration: 'underline' }}>
                特定商取引法に基づく表記
              </a>
            )}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ fontSize: 12, color: 'var(--c-ink-2)', textDecoration: 'underline' }}>
              お問い合わせ
            </a>
          </div>
        </div>
      </div>

      {feedbackOpen && <FeedbackForm onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
