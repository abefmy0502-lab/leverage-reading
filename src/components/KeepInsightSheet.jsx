// ✍️ 気づきを書き残す（2026-11-25 対話の世界・オーナー「対話から生まれた気づきの記録」）。
//   相談の答えのあと、AI の答えではなく、本人が自分の言葉で気づいたことを残す。学び（本に結びつかないメモ・タグ @対話）として
//   保存し、次の相談の材料になる（＝話すほど相談相手が育つ）。頭に「相談：〈問い〉」の 1 行。AI もトークンも使わない。
import { useRef, useState } from 'react';
import BottomSheet from './BottomSheet';
import { withPhraseBreaks } from './TightBubble';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useAuth } from '../hooks/useAuth';
import { autoGrowTextarea } from '../hooks/useComposerHeight';
import { btnPrimary, btnPrimaryOff, input as uiInput } from '../styles/ui';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { invalidateKnowledgeCache } from '../lib/ai';
import { toSaveMessage } from '../lib/errors';
import { track } from '../lib/analytics';

export const INSIGHT_TAG = '@対話';
export const INSIGHT_MAX = 1000;

/** 保存する学びの文（頭に「相談：〈問い〉」の 1 行）。 */
export function insightMemoText({ question, text, max = 5000 }) {
  const body = String(text || '').trim();
  if (!body) return '';
  const q = String(question || '').replace(/\s+/g, ' ').trim();
  const head = q ? `相談：${[...q].length > 60 ? `${[...q].slice(0, 59).join('')}…` : q}\n` : '';
  return (head + body).slice(0, max);
}

const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };

export default function KeepInsightSheet({ question = '', onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  const dirty = text.trim().length > 0;

  const save = async () => {
    const body = insightMemoText({ question, text });
    if (!body || saving) return;
    if (!user?.id || !isSupabaseConfigured) { toast.error('ログインが必要です。'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('book_memos').insert([{
        user_id: user.id, book_id: null, source_type: 'personal', page_number: null, text: body, tags: [INSIGHT_TAG], photo_path: null,
      }]);
      if (error) throw error;
      invalidateKnowledgeCache();
      track('dialogue_insight_saved', {});
      toast.success('気づきを残しました。次の相談で使えます。');
      onClose?.();
    } catch (e) {
      toast.error(toSaveMessage(e));
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      title="気づきを書き残す"
      dismissLabel="キャンセル"
      onClose={onClose}
      beforeClose={async () => !dirty || saving || !!(await confirm({ title: '書いた気づきを残していません', message: '閉じると、書いた気づきは消えます。', confirmLabel: '破棄する', cancelLabel: '書き続ける', danger: true }))}
      footer={(
        <button type="button" onClick={save} disabled={!dirty || saving} style={{ ...(dirty ? btnPrimary : btnPrimaryOff), width: '100%' }}>
          {saving ? '残しています…' : '気づきとして残す'}
        </button>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {question && <p style={{ ...meta, color: 'var(--text-3)' }}>{withPhraseBreaks(`相談：${question}`)}</p>}
        <textarea
          ref={ref} value={text} autoFocus maxLength={INSIGHT_MAX} rows={4} aria-label="気づき"
          onChange={(e) => { setText(e.target.value); autoGrowTextarea(e.target); }}
          placeholder="話してみて気づいたことを、自分の言葉で"
          style={{ ...uiInput, fontSize: 'max(16px, var(--text-read))', resize: 'none', overflowY: 'hidden', minHeight: 'calc(var(--text-read) * 1.6 * 4 + var(--space-6))', fontFamily: 'var(--font-read)', lineHeight: 1.6 }}
        />
        <p style={{ ...meta, color: 'var(--text-3)' }}>{withPhraseBreaks('AI の答えではなく、あなたの言葉が学びとして残り、次の相談の材料になります。')}</p>
      </div>
    </BottomSheet>
  );
}
