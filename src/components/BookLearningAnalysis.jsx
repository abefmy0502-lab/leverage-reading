// 📊 この本の学びを分析 → 行動提案。
// 本に残したメモを「読む目的・課題」と照らし合わせ、AI が
// 「目的に対して得たもの / 新しく見えた視点 / 次の一歩(3つ)」に整理する。
// 提案された行動は「＋追加」で、その本の行動リスト（フォーム）に1タップで入る。
// = ユーザー or AI のタスク作成支援（本田哲学: 学び→行動）。

import { useEffect, useRef, useState } from 'react';
import { analyzeBookLearnings } from '../lib/ai';
import { toMessage } from '../lib/errors';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import MarkdownSections from './MarkdownSections';
import Spinner from './Spinner';
import { Sparkles, Target, Check, Plus } from 'lucide-react';

// 「## ✅ 次の一歩」セクションの "- " 行を行動候補として取り出す。
function extractSuggestedActions(md) {
  if (!md || typeof md !== 'string') return [];
  const lines = md.split('\n');
  let inSec = false;
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) { inSec = /次の一歩|✅/.test(line); continue; }
    if (inSec && /^[-*]\s+/.test(line)) {
      const t = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim();
      if (t) out.push(t.slice(0, 280));
    }
  }
  return out.slice(0, 5);
}

// 行動セクションを除いた本文（学び・視点だけを MarkdownSections で描く）。
function stripActionSection(md) {
  if (!md || typeof md !== 'string') return md || '';
  const lines = md.split('\n');
  const out = [];
  let dropping = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) { dropping = /次の一歩|✅/.test(line); }
    if (!dropping) out.push(raw);
  }
  return out.join('\n').trim();
}

const card = {
  background: 'var(--c-soft)', border: '1px solid var(--c-hairline)', borderRadius: 'var(--radius-md)',
  padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
};
const analyzeBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  width: '100%', minHeight: 44, padding: '11px 16px', borderRadius: 11, border: 'none',
  background: 'var(--c-brand)', color: 'var(--c-card)', fontSize: 13, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer',
};
const addChip = (added) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '8px 12px',
  borderRadius: 10, border: `1px solid ${added ? 'var(--c-brand)' : 'var(--c-hairline-strong)'}`,
  background: added ? 'var(--c-soft-2)' : 'var(--c-card)', color: 'var(--c-brand)',
  fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: added ? 'default' : 'pointer',
  textAlign: 'left', flex: 1,
});

export default function BookLearningAnalysis({ book, onAddToActions, onSaveToBook }) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [state, setState] = useState({ status: 'idle' }); // idle|loading|done|thin|error
  const [added, setAdded] = useState(() => new Set());
  const [saved, setSaved] = useState(false);

  // unmount（本詳細を閉じる/タブ切替）で進行中の SMART ストリームを中止する。
  // これが無いと誰も見ない生成が完走し、AI コストと月次コール枠を空費していた。
  const abortRef = useRef(null);
  useEffect(() => () => { try { abortRef.current?.abort(); } catch { /* ignore */ } }, []);

  const run = async () => {
    if (state.status === 'loading' || !book?.id) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'loading' });
    try {
      const r = await analyzeBookLearnings({
        bookId: book.id,
        title: book.title,
        author: book.author,
        purpose: book.investPurpose,
        challenge: book.currentChallenge,
        // まとめ式メモ派も分析できるよう、まとめメモも材料に渡す。
        summaryMemo: book.leverageMemo,
        // ⚡ ストリーミング表示 — 全文生成を待たず最初の 1 行から見せる。
        // 行動抽出・保存は完了時（下の 'done'）で確定するので途中文は表示のみ。
        onChunk: (text) => {
          if (controller.signal.aborted) return;
          setState((st) => (st.status === 'loading' ? { status: 'loading', partial: text } : st));
        },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return; // unmount 済み — setState しない
      if (r?.tooThin) { setState({ status: 'thin' }); return; }
      setSaved(false);
      // 再分析では「＋追加」済みマークをリセット（前回のインデックスが新しい
      // 提案に残ると、新しい行動を追加できなくなる）。
      setAdded(new Set());
      setState({ status: 'done', content: r.content, actions: extractSuggestedActions(r.content), body: stripActionSection(r.content) });
    } catch (e) {
      if (controller.signal.aborted) return; // 中止はエラー表示しない
      setState({ status: 'error', msg: toMessage(e, '分析に失敗しました。少し時間をおいて再度お試しください。') });
    }
  };

  const addOne = (text, i) => {
    if (added.has(i) || !onAddToActions) return;
    onAddToActions(text);
    setAdded((s) => new Set(s).add(i));
    // form.actions に入るだけ（確定は 保存）。「保存済み」と誤認させない文言にする。
    toast.success('🎯 下の行動リストに追加（保存で確定）。');
  };

  // 📌 学び・新視点を本の AI まとめとして保存 → gatherKnowledge 経由で
  //   マイ読書脳・テーマまとめ・🕰足あと、振り返りの想起にも自動で流れる（複利）。
  const save = async () => {
    if (saved || state.status !== 'done' || !onSaveToBook) return;
    const ok = await onSaveToBook(state.body);
    if (ok) { setSaved(true); toast.success('保存しました。マイ読書脳・振り返りにも活かされます。'); }
    else toast.error('保存に失敗しました。');
  };

  return (
    <div style={card}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-ink)', margin: 0 }}>
          <Sparkles size={15} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--c-brand)' }} />
          この本の学びを分析して、行動を提案
        </p>
        <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '4px 0 0', lineHeight: 1.7 }}>
          残したメモを「読む目的」と照らし合わせて、得た学び・新しく見えた視点を整理し、次の一歩を提案します。
        </p>
      </div>

      {state.status !== 'done' && (
        <button type="button" style={{ ...analyzeBtn, opacity: state.status === 'loading' ? 0.6 : 1 }} disabled={state.status === 'loading'} onClick={run}>
          <Sparkles size={15} aria-hidden="true" />
          {state.status === 'loading' ? '分析中…' : '学びを分析する'}
        </button>
      )}

      {state.status === 'loading' && !state.partial && <Spinner message="メモを目的と照らし合わせています…" />}
      {state.status === 'loading' && state.partial && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-live="polite" aria-busy="true">
          <MarkdownSections text={stripActionSection(state.partial)} />
        </div>
      )}

      {state.status === 'thin' && (
        <p style={{ fontSize: 12, color: 'var(--c-ink-2)', lineHeight: 1.7, margin: 0 }}>
          🌱 まだこの本のメモが少ないようです。メモ（カード式でも、まとめ式でも）を少し残すと、目的に照らした学びを分析できます。
        </p>
      )}

      {state.status === 'error' && (
        <p style={{ fontSize: 12, color: 'var(--c-critical)', background: 'var(--c-critical-soft)', padding: '10px 12px', borderRadius: 8, lineHeight: 1.7, margin: 0 }}>
          {state.msg}
        </p>
      )}

      {state.status === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="tab-content">
          <MarkdownSections text={state.body} />

          {state.actions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-ink)', margin: 0 }}>
                <Target size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5, color: 'var(--c-brand)' }} />
                次の一歩（タップで行動に追加）
              </p>
              {state.actions.map((a, i) => (
                <button key={i} type="button" style={addChip(added.has(i))} disabled={added.has(i)} onClick={() => addOne(a, i)}>
                  {added.has(i) ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                  <span style={{ flex: 1 }}>{a}</span>
                </button>
              ))}
            </div>
          )}

          {/* 📌 全体に還流：本の AI まとめとして保存（複利の核心） */}
          {onSaveToBook && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                type="button"
                style={{ ...analyzeBtn, background: saved ? 'transparent' : 'var(--c-brand)', color: saved ? 'var(--c-brand)' : 'var(--c-card)', border: saved ? '1px solid var(--c-brand)' : 'none', cursor: saved ? 'default' : 'pointer' }}
                disabled={saved}
                onClick={save}
              >
                {saved ? <><Check size={15} aria-hidden="true" />保存しました</> : <><Plus size={15} aria-hidden="true" />この学びを保存して、全体に活かす</>}
              </button>
              <p style={{ fontSize: 10.5, color: 'var(--c-ink-3)', margin: '2px 2px 0', lineHeight: 1.6 }}>
                保存すると、この学びがマイ読書脳・テーマまとめ・足あと・振り返りの想起にも使われます。
              </p>
            </div>
          )}

          <button
            type="button"
            style={{ ...analyzeBtn, background: 'transparent', color: 'var(--c-ink-2)', border: '1px solid var(--c-hairline-strong)', minHeight: 44 }}
            onClick={async () => {
              // 今の結果は破棄される（AI コールも再消費）。無警告でやり直さない。
              const ok = await confirmDialog({
                title: 'もう一度分析しますか？',
                message: '今の分析結果は新しい結果に置き換わります。',
                confirmLabel: '分析し直す',
                cancelLabel: 'キャンセル',
              });
              if (ok) run();
            }}
          >
            もう一度分析する
          </button>
        </div>
      )}
    </div>
  );
}
