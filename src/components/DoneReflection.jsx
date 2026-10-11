// 📗 読了の本の詳細の 2 つの小さな区画（2026-10-11・AI を使わない・lib/doneReflection.js）。
//   DoneQuestions … 読了の 3 つの問い（押すとメモを書くシートに問いを出して開く・× で閉じる）
//   BeforeAfter  … 読む前に書いたこと（得たいこと・課題・仮説・各 2 行まで）→ 「答えは見つかった？」
import { ChevronRight, MessageCircle, PencilLine, X } from 'lucide-react';
import { card, groupTitle, btnLink } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';

// カードの見出し（17/600・本の詳細の区画の見出し「メモ」「行動」20 より 1 段弱く＝メモ一覧の下の添えもの）。
const h2 = { fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 };
const label = { ...groupTitle, margin: '0 0 var(--space-1)' };
const readText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)', margin: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' };

export function DoneQuestions({ questions, onPick, onDismiss }) {
  if (!questions || questions.length === 0) return null;
  return (
    <section aria-labelledby="done-questions-title" style={{ ...card, paddingBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="done-questions-title" style={h2}>読み終えて、ひとこと</h2>
        </div>
        {onDismiss && (
          // 右上の ×（押せる範囲は 44・カードの内側の余白に重ねて、見た目の位置をそろえる）
          <button
            type="button"
            onClick={onDismiss}
            aria-label="読み終えての問いを閉じる"
            style={{ width: 'var(--tap-min)', height: 'var(--tap-min)', margin: 'calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) 0 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', flexShrink: 0 }}
          >
            <X size="1.2em" aria-hidden="true" />
          </button>
        )}
      </div>
      <ul style={{ listStyle: 'none', margin: 'var(--space-2) 0 0', padding: 0 }}>
        {questions.map((q) => (
          <li key={q.key} style={{ borderTop: '1px solid var(--separator)' }}>
            <button
              type="button"
              onClick={() => onPick?.(q)}
              style={{ width: '100%', minHeight: 'var(--space-12)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) 0', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' }}
            >
              <PencilLine size="1.1em" aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-body)', lineHeight: 1.5 }}>{q.text}</span>
              <ChevronRight size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BeforeAfter({ items, onFoundAnswer }) {
  if (!items || items.length === 0) return null;
  return (
    <section aria-labelledby="before-after-title" style={card}>
      <h2 id="before-after-title" style={h2}>読む前に書いたこと</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        {items.map((x) => (
          <div key={x.key}>
            <p style={label}>{x.label}</p>
            {/* 2 行まで（全文は下の「読書計画」の中で読める） */}
            <p style={{ ...readText, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{withPhraseBreaks(x.text)}</p>
          </div>
        ))}
      </div>
      {onFoundAnswer && (
        <button
          type="button"
          onClick={onFoundAnswer}
          style={{ ...btnLink, padding: 0, justifyContent: 'flex-start', gap: 'var(--space-2)', marginTop: 'var(--space-2)', marginBottom: 'calc(-1 * var(--space-3))' }}
        >
          <MessageCircle size="1.1em" aria-hidden="true" />答えは見つかった？
        </button>
      )}
    </section>
  );
}
