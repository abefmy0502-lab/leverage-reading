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
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { toMessage } from '../lib/errors';
import FeedbackForm from './FeedbackForm';
import { exportUserDataAsCSV } from '../lib/exportData';
import { forceUpdate as forceAppUpdate } from '../lib/swUpdate';
import { useSubscription } from '../hooks/useSubscription';
import { startCheckout, openBillingPortal, PLAN_LABELS } from '../lib/billing';

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
  fontFamily: "'Noto Serif JP', Georgia, serif",
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
  color: '#8a7e6b',
  margin: '6px 0 -4px 2px',
  fontWeight: 600,
  letterSpacing: 0.5,
};

function GroupLabel({ children }) {
  return <p style={groupLabelStyle}>{children}</p>;
}

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

async function listAllUserPhotos(userId) {
  if (!isSupabaseConfigured) return [];
  const all = [];
  // Top level: user_id/<book_id>/<file>
  const { data: bookFolders, error } = await supabase.storage
    .from('book-memo-photos')
    .list(userId, { limit: 1000 });
  if (error || !bookFolders) return all;
  for (const folder of bookFolders) {
    if (!folder?.name) continue;
    const { data: files } = await supabase.storage
      .from('book-memo-photos')
      .list(`${userId}/${folder.name}`, { limit: 1000 });
    (files || []).forEach((f) => {
      if (f?.name) all.push(`${userId}/${folder.name}/${f.name}`);
    });
  }
  return all;
}

export default function AccountSettings({ onClose, onAfterDelete }) {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  // 💳 課金状態。subscriptions 未適用なら subscription=null / isActive=false で
  // 静かに縮退する（useSubscription 側で schema-error を握りつぶす）。
  const { subscription, isActive, loading: subLoading } = useSubscription();
  const [billingBusy, setBillingBusy] = useState(false);

  const handleManageBilling = async () => {
    if (billingBusy) return;
    setBillingBusy(true);
    try {
      // 成功時はページ遷移するので戻らない。
      await openBillingPortal();
    } catch (e) {
      toast.error(toMessage(e, 'プラン管理ページを開けませんでした。'));
      setBillingBusy(false);
    }
  };

  const handleUpgrade = async (plan) => {
    if (billingBusy) return;
    setBillingBusy(true);
    try {
      await startCheckout(plan);
    } catch (e) {
      toast.error(toMessage(e, '決済ページを開けませんでした。'));
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
      toast.success(`CSV ${summary.filter((s) => !s.skipped).length} 件をダウンロード（計 ${total} 行）`);
    } catch (e) {
      toast.error(toMessage(e, 'エクスポートに失敗しました。'));
    } finally {
      setExporting(false);
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
    let dbError = null;
    try {
      // 1. Delete photos from Storage
      try {
        const paths = await listAllUserPhotos(user.id);
        if (paths.length > 0) {
          const { error } = await supabase.storage.from('book-memo-photos').remove(paths);
          if (error) storageError = error;
        }
      } catch (e) {
        storageError = e;
      }

      // 2. Delete data tables. books deletion CASCADES to book_memos / book_tags
      // / actions in our schema, but we also delete personal memos (book_id null)
      // and chat_messages explicitly.
      try {
        await supabase.from('chat_messages').delete().eq('user_id', user.id);
      } catch (e) { /* table may not exist if migration unrun */ }
      await supabase.from('book_memos').delete().eq('user_id', user.id);
      await supabase.from('book_tags').delete().eq('user_id', user.id);
      await supabase.from('actions').delete().eq('user_id', user.id);
      const { error: booksErr } = await supabase.from('books').delete().eq('user_id', user.id);
      if (booksErr) dbError = booksErr;

      // 3. Record the deletion request so the admin can finish off auth.users.
      try {
        await supabase.from('account_deletion_requests').insert([
          {
            user_id: user.id,
            user_email: user.email || null,
            notes: storageError ? `storage_warn: ${storageError.message || storageError}` : null,
          },
        ]);
      } catch (e) {
        // Table may not exist if migration unrun — surface as warning.
        console.warn('account_deletion_requests insert failed:', e);
      }

      if (dbError) {
        toast.error(toMessage(dbError, 'データの削除中にエラーが発生しました。'));
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
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 16, color: '#3d362c', margin: 0, fontWeight: 500, flex: 1 }}>⚙️ アカウント設定</h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div style={bodyStyle}>
          <div>
            <p style={{ fontSize: 12, color: '#8a7e6b', margin: 0 }}>サインイン中</p>
            <p style={{ fontSize: 14, color: '#3d362c', margin: '2px 0 0', fontWeight: 500, wordBreak: 'break-all' }}>{user?.email || '(未取得)'}</p>
          </div>

          {/* ── 💳 プラン・お支払い ── */}
          <GroupLabel>💳 プラン・お支払い</GroupLabel>

          {/* 💳 Billing / プラン */}
          <section style={sectionStyle}>
            <p style={{ fontSize: 13, color: '#3d362c', margin: '0 0 4px', fontWeight: 600 }}>
              💳 プラン
            </p>
            {subLoading ? (
              <p style={{ fontSize: 12, color: '#8a7e6b', margin: '4px 0 0' }}>確認中…</p>
            ) : isActive ? (
              <>
                <p style={{ fontSize: 12, color: '#8a7e6b', margin: '0 0 4px', lineHeight: 1.7 }}>
                  状態：<strong style={{ color: '#3d362c' }}>{billingStatusLabel(subscription?.status)}</strong>
                  {formatPeriodEnd(subscription?.currentPeriodEnd) && (
                    <>（次回更新 {formatPeriodEnd(subscription.currentPeriodEnd)}）</>
                  )}
                </p>
                <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 10px', lineHeight: 1.7 }}>
                  解約・カードの変更・請求履歴はこちらから。いつでも解約でき、データは保持されます。
                </p>
                {subscription?.stripeCustomerId ? (
                  <button
                    type="button"
                    style={{ ...btnPrimary, opacity: billingBusy ? 0.6 : 1 }}
                    disabled={billingBusy}
                    onClick={handleManageBilling}
                  >
                    {billingBusy ? '移動中…' : '⚙️ プランを管理する'}
                  </button>
                ) : (
                  <p style={{ fontSize: 11, color: '#8a7e6b', margin: 0, lineHeight: 1.7 }}>
                    プラン管理画面は次回更新後にご利用いただけます。
                  </p>
                )}
              </>
            ) : (
              <>
                <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 10px', lineHeight: 1.7 }}>
                  すべての機能を使うにはご契約が必要です。いつでも解約でき、データは保持されます。
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    style={{ ...btnPrimary, opacity: billingBusy ? 0.6 : 1 }}
                    disabled={billingBusy}
                    onClick={() => handleUpgrade('annual')}
                  >
                    {billingBusy ? '移動中…' : `${PLAN_LABELS.annual.name}で契約（おすすめ）`}
                  </button>
                  <button
                    type="button"
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
                    {PLAN_LABELS.monthly.name}で契約
                  </button>
                </div>
              </>
            )}
          </section>

          {/* ── 📥 データ・アプリ ── */}
          <GroupLabel>📥 データ・アプリ</GroupLabel>

          {/* Export */}
          <section style={sectionStyle}>
            <p style={{ fontSize: 13, color: '#3d362c', margin: '0 0 4px', fontWeight: 600 }}>
              📥 データをダウンロード
            </p>
            <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 10px', lineHeight: 1.7 }}>
              本・メモ・タグ・行動・対話履歴をテーブル別の CSV ファイルでダウンロードします。Excel / Numbers でそのまま開けます（UTF-8 BOM 付き）。
            </p>
            <button type="button" style={{ ...btnPrimary, opacity: exporting ? 0.6 : 1 }} disabled={exporting} onClick={handleExport}>
              {exporting ? '準備中…' : '📥 CSV をダウンロード'}
            </button>
          </section>

          {/* App update */}
          <section style={sectionStyle}>
            <p style={{ fontSize: 13, color: '#3d362c', margin: '0 0 4px', fontWeight: 600 }}>
              🔄 アプリを最新版に更新
            </p>
            <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 10px', lineHeight: 1.7 }}>
              新しいバージョンが反映されない時はこちら。キャッシュをクリアして再読み込みします。
            </p>
            <button
              type="button"
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
          <section style={sectionStyle}>
            <p style={{ fontSize: 13, color: '#3d362c', margin: '0 0 4px', fontWeight: 600 }}>
              📩 フィードバック・要望を送る
            </p>
            <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 10px', lineHeight: 1.7 }}>
              バグ報告 / 機能要望 / 感想など、開発者へ直接届きます。
            </p>
            <button type="button" style={btnPrimary} onClick={() => setFeedbackOpen(true)}>
              📩 フィードバックを送る
            </button>
          </section>

          {/* ── ⚠️ アカウント（破壊的操作・最下部に分離） ── */}
          <GroupLabel>⚠️ アカウント</GroupLabel>

          {/* Delete */}
          <section style={dangerSection}>
            <p style={{ fontSize: 13, color: '#a05040', margin: '0 0 4px', fontWeight: 600 }}>
              ⚠️ アカウント削除
            </p>
            <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 10px', lineHeight: 1.7 }}>
              本・メモ・写真・対話履歴がすべて削除されます。<br />
              認証アカウント自体の完全削除は管理者の最終確認後 (通常 7 日以内) に実行されます。
            </p>
            {!deleteOpen ? (
              <button type="button" style={btnDanger} onClick={() => setDeleteOpen(true)}>
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
                  style={inputStyle}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    style={{ ...btnPrimary, background: 'transparent', color: '#5c5043', border: '1px solid #d4ccbe', flex: 1 }}
                    onClick={() => { setDeleteOpen(false); setConfirmText(''); }}
                    disabled={deleting}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
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
            <a href="/legal/terms" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#8a7e6b' }}>
              利用規約
            </a>
            <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#8a7e6b' }}>
              プライバシーポリシー
            </a>
            <a href="/legal/sct" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#8a7e6b' }}>
              特定商取引法に基づく表記
            </a>
            <a href="mailto:leverage.book0502@gmail.com" style={{ fontSize: 12, color: '#8a7e6b' }}>
              お問い合わせ
            </a>
          </div>
        </div>
      </div>

      {feedbackOpen && <FeedbackForm onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
