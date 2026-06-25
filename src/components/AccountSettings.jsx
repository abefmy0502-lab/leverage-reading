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
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { toMessage } from '../lib/errors';
import FeedbackForm from './FeedbackForm';
import { exportUserDataAsCSV, exportMemosAsMarkdown } from '../lib/exportData';
import { forceUpdate as forceAppUpdate } from '../lib/swUpdate';
import { useSubscription } from '../hooks/useSubscription';
import { startCheckout, openBillingPortal, PLAN_LABELS } from '../lib/billing';
import { isNative, purchasePlan, openManageSubscriptions, APP_PLAN_LABELS } from '../lib/iap';
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
  zIndex: 880,
  background: 'rgba(30,25,20,0.45)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  fontFamily: "var(--font-app)",
};

const cardStyle = {
  background: '#faf6f0',
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
  borderBottom: '1px solid #e4ddd0',
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: '#5c5043',
  cursor: 'pointer',
  width: 44,
  height: 44,
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
  border: '1px solid #e4ddd0',
  borderRadius: 12,
};

const dangerSection = { ...sectionStyle, border: '1px solid #d8b8b0', background: '#faf2ee' };

// グループ見出し — 関連セクションを束ねる小さなラベル。モーダルのクリーム/ブラウン
// 配色（serif）に合わせ、SectionHeader（sans 系トークン）ではなく軽量なインライン
// 見出しを使う。表示専用で挙動には一切関与しない。
const groupLabelStyle = {
  fontSize: 11,
  color: '#6b5f4d',
  margin: '8px 0 -2px 2px',
  fontWeight: 600,
  letterSpacing: 0.5,
};

function GroupLabel({ children }) {
  // 装飾的な見出しラベル。各 section は自前の見出し <p> を持つため、
  // グループラベルはスクリーンリーダーでは補助的な小見出しとして読み上げる。
  return <p style={groupLabelStyle} role="heading" aria-level={2}>{children}</p>;
}

// 全 section 共通の見出し（13px / 600）。色だけ差し替え可能（破壊操作は赤）。
const sectionTitleStyle = { fontSize: 13, margin: '0 0 4px', fontWeight: 600, color: '#3d362c' };
// 全 section 共通の説明文（11px / 行間 1.7 / ボタンとの間隔 10px）。
const sectionDescStyle = { fontSize: 11, color: '#6b5f4d', margin: '0 0 10px', lineHeight: 1.7 };
// 無効/準備中など、ボタンを出さず案内文のみのときの末尾余白なしバリアント。
const sectionNoteStyle = { fontSize: 11, color: '#6b5f4d', margin: 0, lineHeight: 1.7 };

const btnPrimary = {
  width: '100%',
  padding: '12px 18px',
  borderRadius: 10,
  border: 'none',
  background: '#5c5043',
  color: '#faf6f0',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  letterSpacing: 1,
  minHeight: 44,
};

const btnDanger = { ...btnPrimary, background: '#a05040' };

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  border: '1px solid #d4ccbe',
  borderRadius: 10,
  background: '#fff',
  color: '#3d362c',
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

export default function AccountSettings({ onClose, onAfterDelete }) {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [exporting, setExporting] = useState(false);
  const [exportingMd, setExportingMd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  // フィードバック（入れ子モーダル）を開いている間は、そちらのトラップに譲るため無効化。
  const trapRef = useFocusTrap(!feedbackOpen);
  // 💳 課金状態。subscriptions 未適用なら subscription=null / isActive=false で
  // 静かに縮退する（useSubscription 側で schema-error を握りつぶす）。
  const { subscription, isActive, loading: subLoading, refresh: refreshSub } = useSubscription();
  // 表示ラベルはチャネル別（Web=Stripe ¥1,280 / ネイティブ=App ¥1,480）。
  const planLabels = isNative ? APP_PLAN_LABELS : PLAN_LABELS;
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
  const pushNeedsA2HS = pushConfigured && isIOS() && !isStandalonePWA(); // iOS タブ内
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
          toast.success('週1で、過去のあなたのメモがそっと戻ってきます。');
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
      title: '🔄 アプリを最新版に更新',
      message: 'キャッシュを削除して再読み込みします。\n\n書きかけのメモや AI への入力中の文章は失われます。よろしいですか？',
      confirmLabel: '更新する',
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
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        '本・メモ・写真・対話履歴・行動リスト・タグ — すべてのデータが完全に削除されます。\n\nこの操作は取り消せません。',
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

    // schema-error（テーブル/列が存在しない）を判定して許容するためのヘルパー。
    // 未適用 DB（移行 SQL 未実行）でも退会を止めないために、これらは失敗扱いしない。
    const isSchemaError = (err) => {
      const msg = String(err?.message || err || '').toLowerCase();
      const code = String(err?.code || '');
      return (
        code === '42P01'        // undefined_table
        || code === '42703'     // undefined_column
        || msg.includes('does not exist')
        || msg.includes('could not find')
        || msg.includes('schema cache')
        || msg.includes('relation')
        || msg.includes('column')
      );
    };

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
      try {
        await supabase.from('account_deletion_requests').insert([
          {
            user_id: user.id,
            user_email: user.email || null,
            notes: warnParts.length > 0 ? warnParts.join(' | ') : null,
          },
        ]);
      } catch (e) {
        // Table may not exist if migration unrun — surface as warning.
        console.warn('account_deletion_requests insert failed:', e);
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
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 16, color: '#3d362c', margin: 0, fontWeight: 500, flex: 1 }}>⚙️ アカウント設定</h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div style={bodyStyle}>
          <div>
            <p style={{ fontSize: 12, color: '#6b5f4d', margin: 0 }}>サインイン中</p>
            <p style={{ fontSize: 14, color: '#3d362c', margin: '2px 0 0', fontWeight: 500, wordBreak: 'break-all' }}>{user?.email || '(未取得)'}</p>
          </div>

          {/* ── 💳 プラン・お支払い ── */}
          <GroupLabel>💳 プラン・お支払い</GroupLabel>

          {/* 💳 Billing / プラン */}
          <section style={sectionStyle} aria-label="プラン・お支払い">
            <p style={sectionTitleStyle}>
              💳 プラン
            </p>
            {subLoading ? (
              <p style={sectionNoteStyle}>確認中…</p>
            ) : isActive ? (
              <>
                <p style={{ fontSize: 12, color: '#6b5f4d', margin: '0 0 4px', lineHeight: 1.7 }}>
                  状態：<strong style={{ color: '#3d362c' }}>{billingStatusLabel(subscription?.status)}</strong>
                  {formatPeriodEnd(subscription?.currentPeriodEnd) && (
                    <>（次回更新 {formatPeriodEnd(subscription.currentPeriodEnd)}）</>
                  )}
                </p>
                <p style={sectionDescStyle}>
                  {isNative
                    ? '解約・プラン変更は App Store のサブスク設定から。いつでも解約でき、データは保持されます。'
                    : '解約・カード変更・請求履歴はこちらから。いつでも解約でき、データは保持されます。'}
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
                ) : (
                  <p style={sectionNoteStyle}>
                    プラン管理画面は次回更新後にご利用いただけます。
                  </p>
                )}
              </>
            ) : (
              <>
                <p style={sectionDescStyle}>
                  すべての機能を使うにはご契約が必要です。いつでも解約でき、データは保持されます。
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    aria-label={`${planLabels.annual.name}で契約（おすすめ）`}
                    style={{ ...btnPrimary, opacity: billingBusy ? 0.6 : 1 }}
                    disabled={billingBusy}
                    onClick={() => handleUpgrade('annual')}
                  >
                    {billingBusy ? '移動中…' : `${planLabels.annual.name}で契約（おすすめ）`}
                  </button>
                  <button
                    type="button"
                    aria-label={`${planLabels.monthly.name}で契約`}
                    style={{
                      ...btnPrimary,
                      background: 'transparent',
                      color: '#5c5043',
                      border: '1px solid #d4ccbe',
                      opacity: billingBusy ? 0.6 : 1,
                    }}
                    disabled={billingBusy}
                    onClick={() => handleUpgrade('monthly')}
                  >
                    {planLabels.monthly.name}で契約
                  </button>
                </div>
              </>
            )}
          </section>

          {/* ── 📥 データ・アプリ ── */}
          <GroupLabel>📥 データ・アプリ</GroupLabel>

          {/* 🔔 通知 — データ・アプリ群の一機能として配置（独立グループにしない） */}
          <section style={sectionStyle} aria-label="想起の通知">
            <p style={sectionTitleStyle}>
              🔔 想起の通知
            </p>
            <p style={sectionDescStyle}>
              週1回ほど、過去のあなたの気づきがそっと戻ってきます。
            </p>

            {!pushConfigured ? (
              // VAPID 鍵未設定 = 機能準備中（env 投入前）。静かに案内のみ。
              <p style={{ ...sectionNoteStyle, color: '#6b5f4d' }}>
                ただいま準備中です。もう少しお待ちください。
              </p>
            ) : pushNeedsA2HS ? (
              // iOS タブ内 = ホーム画面に追加しないと通知は使えない。
              <p style={sectionNoteStyle}>
                📲 iPhone / iPad では、<strong>ホーム画面に追加</strong>したアプリから開くと通知を受け取れます。<br />
                共有メニュー（□↑）→「ホーム画面に追加」→ 追加したアイコンから開いてください。
              </p>
            ) : !pushSupported ? (
              // 非対応ブラウザ等。
              <p style={{ ...sectionNoteStyle, color: '#6b5f4d' }}>
                この端末・ブラウザでは通知に対応していません。
              </p>
            ) : pushDenied && !pushOn ? (
              // OS で拒否済み = 自前ダイアログは出せない。設定からの手動許可を案内。
              <p style={sectionNoteStyle}>
                通知がオフになっています。端末の「設定 → 通知」から Orime の通知を許可すると受け取れます。
              </p>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={pushOn}
                aria-label="想起の通知"
                style={{
                  ...btnPrimary,
                  background: pushOn ? '#5c5043' : 'transparent',
                  color: pushOn ? '#faf6f0' : '#5c5043',
                  border: pushOn ? 'none' : '1px solid #d4ccbe',
                  opacity: pushBusy ? 0.6 : 1,
                }}
                disabled={pushBusy}
                onClick={handleTogglePush}
              >
                {pushBusy
                  ? '設定中…'
                  : pushOn
                    ? '🔔 通知オン（タップでオフ）'
                    : '🔕 通知を受け取る'}
              </button>
            )}
          </section>

          {/* Export */}
          <section style={sectionStyle} aria-label="データをダウンロード">
            <p style={sectionTitleStyle}>
              📥 データをダウンロード
            </p>
            <p style={sectionDescStyle}>
              本・メモ・タグ・行動・対話履歴を CSV でダウンロードします。Excel / Numbers でそのまま開けます。
            </p>
            <button type="button" aria-label="CSV をダウンロード" style={{ ...btnPrimary, opacity: exporting ? 0.6 : 1 }} disabled={exporting} onClick={handleExport}>
              {exporting ? '準備中…' : '📥 CSV をダウンロード'}
            </button>
            <p style={{ ...sectionDescStyle, margin: '14px 0 10px' }}>
              メモを 1 つの Markdown にまとめて書き出します。NotebookLM や Obsidian に取り込んで活用できます。
            </p>
            <button type="button" aria-label="Markdown で書き出す" style={{ ...btnPrimary, opacity: exportingMd ? 0.6 : 1 }} disabled={exportingMd} onClick={handleExportMarkdown}>
              {exportingMd ? '書き出し中…' : '📝 Markdown で書き出す'}
            </button>
          </section>

          {/* 📊 利用状況の記録（製品改善のためのファーストパーティ計測） */}
          <section style={sectionStyle} aria-label="利用状況の記録">
            <p style={sectionTitleStyle}>
              📊 利用状況の記録（製品改善のため）
            </p>
            <p style={sectionDescStyle}>
              どの機能がよく使われているかを、機能名や回数だけ（個人を特定する内容は含めず）そっと記録し、Orime の改善に役立てます。外部のサービスには送らず、いつでもオフにできます。
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={analyticsOn}
              aria-label="利用状況の記録"
              style={{
                ...btnPrimary,
                minHeight: 44,
                background: analyticsOn ? '#5c5043' : 'transparent',
                color: analyticsOn ? '#faf6f0' : '#5c5043',
                border: analyticsOn ? 'none' : '1px solid #d4ccbe',
              }}
              onClick={handleToggleAnalytics}
            >
              {analyticsOn ? '📊 記録オン（タップでオフ）' : '🚫 記録はオフです'}
            </button>
          </section>

          {/* App update */}
          <section style={sectionStyle} aria-label="アプリを最新版に更新">
            <p style={sectionTitleStyle}>
              🔄 アプリを最新版に更新
            </p>
            <p style={sectionDescStyle}>
              新しいバージョンが反映されない時はこちら。キャッシュを消して再読み込みします。
            </p>
            <button
              type="button"
              aria-label="最新版に更新する"
              style={{
                ...btnPrimary,
                background: 'transparent',
                color: '#5c5043',
                border: '1px solid #d4ccbe',
                opacity: updating ? 0.6 : 1,
              }}
              disabled={updating}
              onClick={handleForceUpdate}
            >
              {updating ? '更新中…' : '🔄 最新版に更新する'}
            </button>
          </section>

          {/* Feedback */}
          <section style={sectionStyle} aria-label="フィードバック・要望を送る">
            <p style={sectionTitleStyle}>
              📩 フィードバック・要望を送る
            </p>
            <p style={sectionDescStyle}>
              バグ報告 / 機能要望 / 感想など、開発者へ直接届きます。
            </p>
            <button type="button" aria-label="フィードバックを送る" style={btnPrimary} onClick={() => setFeedbackOpen(true)}>
              📩 フィードバックを送る
            </button>
          </section>

          {/* ── ⚠️ アカウント（破壊的操作・最下部に分離） ── */}
          <GroupLabel>⚠️ アカウント</GroupLabel>

          {/* Delete */}
          <section style={dangerSection} aria-label="アカウント削除">
            <p style={{ ...sectionTitleStyle, color: '#a05040' }}>
              ⚠️ アカウント削除
            </p>
            <p style={sectionDescStyle}>
              本・メモ・写真・対話履歴がすべて削除されます。認証アカウント自体の完全削除は、管理者の最終確認後（通常 7 日以内）に実行されます。
            </p>
            {!deleteOpen ? (
              <button type="button" aria-label="アカウントの削除を開始" style={btnDanger} onClick={() => setDeleteOpen(true)}>
                アカウントの削除を開始
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 12, color: '#5c5548', margin: 0, lineHeight: 1.7 }}>
                  確認のため、ご自身のメールアドレス <strong>{expectedConfirm}</strong> を入力してください。
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={expectedConfirm}
                  aria-label="確認用メールアドレス"
                  style={inputStyle}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    aria-label="削除をキャンセル"
                    style={{ ...btnPrimary, background: 'transparent', color: '#5c5043', border: '1px solid #d4ccbe', flex: 1 }}
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
            <a href="/legal/terms" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#6b5f4d', textDecoration: 'underline' }}>
              利用規約
            </a>
            <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#6b5f4d', textDecoration: 'underline' }}>
              プライバシーポリシー
            </a>
            {/* 特商法は Web 販売特有（Web価格 ¥1,280 を表示）。ネイティブでは
                反ステアリング順守のため非表示にし、価格開示は App Store に委ねる。 */}
            {!isNative && (
              <a href="/legal/sct" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#6b5f4d', textDecoration: 'underline' }}>
                特定商取引法に基づく表記
              </a>
            )}
            <a href="mailto:leverage.book0502@gmail.com" style={{ fontSize: 12, color: '#6b5f4d', textDecoration: 'underline' }}>
              お問い合わせ
            </a>
          </div>
        </div>
      </div>

      {feedbackOpen && <FeedbackForm onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
