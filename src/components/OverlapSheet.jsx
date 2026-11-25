// 🔗 重なり（2026-11-25 オーナー「知識が重なり、答えが生まれる」・設計は company/orime-core-2026-11-25.md）。
//   2 つの記録（本のメモ・本以外の学び）を、ロゴの 2 本の帯のように少し重ねて並べる → 「重なって見えること」（AI・任意）
//   ＝共通していること・違うところ・考えてみたい問い → 本人が「自分の答え」を書いて、学びとして残す（相談の材料になる）。
//   AI は結論を書かない。AI を使わなくても、決まった問いを頼りに自分で書ける（無料・トークンなし）。
//   重ねる相手は、端末の中で似ている記録をすすめ（lib/overlap.js）、自分で選び直せる（言葉で探す）。
import { useEffect, useMemo, useRef, useState } from 'react';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useAuth } from '../hooks/useAuth';
import { useAllMemoRows } from '../hooks/useAllMemoRows';
import { btnPrimary, btnPrimaryOff, btnGhost, btnLinkQuiet, input as uiInput } from '../styles/ui';
import {
  overlapCandidates, searchOverlapRows, whereOf, isPersonal, overlapMemoText, markOverlapDone,
  OVERLAP_ANSWER_MAX, OVERLAP_TAG, OVERLAP_FIXED_QUESTIONS,
} from '../lib/overlap';
import { ensureAiConsent } from '../lib/aiConsent';
import { generateOverlap, invalidateKnowledgeCache } from '../lib/ai';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { toSaveMessage } from '../lib/errors';
import { track } from '../lib/analytics';

const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5 };
const label = { margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text-2)' };
const readText = { margin: 0, fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)', wordBreak: 'normal', lineBreak: 'strict', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' };

// ロゴの 2 本の帯のように、2 枚目を少し右下へずらして重ねる（重なった所が「余白＝自分の答え」の入口）。
function RecordCard({ where, text, second = false, action = null }) {
  return (
    <div style={{
      position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: 'var(--space-3) var(--space-4)', marginLeft: second ? 'var(--space-6)' : 0, marginRight: second ? 0 : 'var(--space-6)',
      marginTop: second ? 'calc(-1 * var(--space-3))' : 0, zIndex: second ? 1 : 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
        <p style={{ ...meta, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{where}</p>
        {action}
      </div>
      <p style={{ ...readText, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{text}</p>
    </div>
  );
}

/**
 * props:
 *   source   … { id, text, bookId }（いま書いた・開いたメモ）
 *   targetId … はじめに重ねる相手のメモの id（無ければ、いちばん似ている記録）
 *   books    … 本棚の本（出どころの書名に使う）
 */
export default function OverlapSheet({ source, targetId = null, books = [], onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { rows, status, retry } = useAllMemoRows({ userId: user?.id || null, books, active: true });
  const bookById = useMemo(() => new Map((books || []).map((b) => [String(b.id), b])), [books]);
  const candidates = useMemo(() => (rows ? overlapCandidates({ source, rows }) : []), [rows, source]);
  const [pickedId, setPickedId] = useState(targetId);
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const [ai, setAi] = useState({ status: 'idle', result: null, error: '' });
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const answerRef = useRef(null);

  const target = useMemo(() => {
    if (!rows) return null;
    const id = pickedId || candidates[0]?.memo?.id || null;
    return id ? rows.find((r) => String(r.id) === String(id)) || null : null;
  }, [rows, pickedId, candidates]);

  // 相手が決まらない（似た記録が無い）ときは、はじめから自分で選ぶ一覧を出す。
  useEffect(() => {
    if (status === 'ready' && rows && !target && !choosing) setChoosing(true);
  }, [status, rows, target, choosing]);

  // 相手を変えたら、前の相手の AI の答えは消す。
  useEffect(() => { setAi({ status: 'idle', result: null, error: '' }); }, [target?.id]);

  const aWhere = whereOf({ book_id: source.bookId }, bookById);
  const bWhere = target ? whereOf(target, bookById) : '';

  const askAi = async () => {
    if (!target || ai.status === 'loading') return;
    if (!(await ensureAiConsent('overlap'))) return;
    setAi({ status: 'loading', result: null, error: '' });
    try {
      const result = await generateOverlap({ a: { text: source.text, where: aWhere }, b: { text: target.text, where: bWhere } });
      setAi({ status: 'ready', result, error: '' });
      track('overlap_ai', { personal: isPersonal(target) });
    } catch (e) {
      setAi({ status: 'error', result: null, error: e?.message || '重なりを見られませんでした。' });
    }
  };

  const save = async () => {
    const text = overlapMemoText({ answer, aWhere, bWhere });
    if (!text || saving || !target) return;
    if (!user?.id || !isSupabaseConfigured) { toast.error('ログインが必要です。'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('book_memos').insert([{
        user_id: user.id, book_id: null, source_type: 'personal', page_number: null, text, tags: [OVERLAP_TAG], photo_path: null,
      }]);
      if (error) throw error;
      invalidateKnowledgeCache(); // 直後の相談で、この答えを使えるように
      markOverlapDone(source.id, target.id);
      track('overlap_saved', { personal: isPersonal(target), ai: ai.status === 'ready' });
      toast.success('自分の答えを残しました。相談で使えます。');
      onClose?.();
    } catch (e) {
      toast.error(toSaveMessage(e));
      setSaving(false);
    }
  };

  const question = ai.result?.question || OVERLAP_FIXED_QUESTIONS[1];
  const dirty = answer.trim().length > 0;
  const chooseList = useMemo(() => {
    if (!rows) return [];
    const q = query.trim();
    if (q) return searchOverlapRows({ rows, query: q, excludeId: source.id, bookById });
    const sugg = candidates.map((c) => rows.find((r) => r.id === c.memo.id)).filter(Boolean);
    const rest = searchOverlapRows({ rows, query: '', excludeId: source.id, bookById, limit: 20 }).filter((r) => !sugg.some((s) => s.id === r.id));
    return [...sugg, ...rest];
  }, [rows, query, candidates, source.id, bookById]);
  const suggestedIds = useMemo(() => new Set(candidates.map((c) => String(c.memo.id))), [candidates]);

  return (
    <BottomSheet
      title="重なり"
      onClose={onClose}
      beforeClose={async () => !dirty || saving || !!(await confirm({ title: '書いた答えを残していません', message: '閉じると、書いた答えは消えます。', confirmLabel: '破棄する', cancelLabel: '書き続ける', danger: true }))}
      footer={choosing ? null : (
        <button type="button" onClick={save} disabled={!dirty || saving || !target} style={{ ...(!dirty || !target ? btnPrimaryOff : btnPrimary), width: '100%' }}>
          {saving ? '残しています…' : '自分の答えとして残す'}
        </button>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {status === 'error' && !rows && (
          <ErrorMessage title="メモを読めませんでした" description="通信状況を確認して、もう一度お試しください。" actions={[{ label: 'もう一度', onClick: retry }]} />
        )}
        {!rows && status !== 'error' && (
          <div aria-label="読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SkeletonBlock height={96} radius="var(--radius)" />
            <SkeletonBlock height={96} radius="var(--radius)" />
          </div>
        )}

        {rows && choosing && (
          <section aria-labelledby="overlap-choose-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <RecordCard where={aWhere} text={source.text} />
            <h3 id="overlap-choose-h" style={label}>重ねる相手を選ぶ</h3>
            <input
              type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={60}
              placeholder="言葉や書名で探す" aria-label="重ねる相手を、言葉や書名で探す" style={uiInput}
            />
            {chooseList.length === 0 ? (
              <p style={meta}>{withPhraseBreaks(query ? '見つかりませんでした。別の言葉で探してください。' : 'まだ重ねられる記録がありません。本のメモか学びを書くと、ここに出ます。')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {chooseList.map((r) => (
                  <li key={r.id} style={{ borderBottom: '1px solid var(--separator)' }}>
                    <button type="button" onClick={() => { setPickedId(r.id); setChoosing(false); setQuery(''); }}
                      style={{ width: '100%', minHeight: 'var(--tap-min)', display: 'block', background: 'none', border: 'none', padding: 'var(--space-3) 0', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
                      <span style={{ ...meta, display: 'block' }}>{whereOf(r, bookById)}{suggestedIds.has(String(r.id)) ? '・似ている記録' : ''}</span>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 'var(--text-body)', lineHeight: 1.5, marginTop: 'var(--space-1)' }}>{r.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {target && <button type="button" onClick={() => setChoosing(false)} style={{ ...btnLinkQuiet, alignSelf: 'flex-start' }}>選び直さずに戻る</button>}
          </section>
        )}

        {rows && !choosing && target && (
          <>
            <div>
              <RecordCard where={aWhere} text={source.text} />
              <RecordCard where={bWhere} text={target.text} second action={(
                <button type="button" onClick={() => setChoosing(true)} style={{ ...btnLinkQuiet, minHeight: 'var(--tap-min)', margin: 'calc(-1 * var(--space-3)) calc(-1 * var(--space-1)) calc(-1 * var(--space-3)) 0', flexShrink: 0 }}>相手を変える</button>
              )} />
            </div>

            <section aria-labelledby="overlap-ai-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <h3 id="overlap-ai-h" style={label}>重なって見えること</h3>
              {ai.status === 'idle' && (
                <>
                  <button type="button" onClick={askAi} style={btnGhost}>AI に見てもらう</button>
                  <p style={meta}>{withPhraseBreaks('2 つのメモの文だけを材料に、共通点・違い・問いを 1 つずつ。答えは書きません。1 回 約 1 トークン。')}</p>
                </>
              )}
              {ai.status === 'loading' && (
                <div aria-label="考えています" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <SkeletonBlock width="90%" height={14} /><SkeletonBlock width="80%" height={14} /><SkeletonBlock width="70%" height={14} />
                </div>
              )}
              {ai.status === 'error' && (
                <ErrorMessage title="重なりを見られませんでした" description={ai.error} actions={[{ label: 'もう一度', onClick: askAi }]} />
              )}
              {ai.status === 'ready' && ai.result && (
                <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[['共通していること', ai.result.common], ['違うところ', ai.result.diff], ['考えてみたい問い', ai.result.question]].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}>
                      <dt style={meta}>{k}</dt>
                      <dd style={{ ...readText, margin: 'var(--space-1) 0 0' }}>{withPhraseBreaks(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <section aria-labelledby="overlap-answer-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <h3 id="overlap-answer-h" style={label}>自分の答え</h3>
              {/* AI の問いは上の「考えてみたい問い」に出ているので、ここでは繰り返さない（無いときだけ決まった問い）。 */}
              {!ai.result?.question && <p style={{ ...meta, color: 'var(--text-2)' }}>{withPhraseBreaks(question)}</p>}
              <textarea
                ref={answerRef} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={OVERLAP_ANSWER_MAX} rows={4}
                aria-label="自分の答え" placeholder="いま思うことを、自分の言葉で"
                style={{ ...uiInput, resize: 'vertical', minHeight: 120, fontFamily: 'var(--font-read)', lineHeight: 1.6 }}
              />
              <p style={meta}>{withPhraseBreaks('学びとして残り、相談の材料になります。')}</p>
            </section>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
