// 🌱 初週オンボーディング — 新規ユーザーを aha まで運ぶ 3 ステップのチェックリスト。
// ホーム（本棚）の先頭に、未完了かつ未 dismiss のときだけ控えめに表示する。
//
// book/memo は track() イベントに連動して自動で埋まり、consult は「相談（マイ読書脳）で
// 答えを1回受け取った」ときに MyBookBrain.jsx が直接マークする（activation.js）。
// 達成バー / カウンタ / 祝福などの煽り演出は置かない（Apple Reminders 級の控えめさ）。

import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { card, btnGhost, btnText } from '../styles/ui';
import { getActivation, isActivationDismissed, dismissActivation, ACTIVATION_STEPS } from '../lib/activation';

const STEP_META = {
  book: { label: '本を1冊、本棚に追加する', hint: '右上の ＋ から検索して追加', cta: '追加' },
  memo: { label: '心が動いた一行をメモに残す', hint: '本を開いて「メモ」から一行でOK。ここから全部が始まります' },
  consult: { label: '「相談」で、自分のメモから答えをもらう', hint: '困っていることを書くと、あなたが読んだ本のメモを根拠に答えます', cta: '開く' },
};

export default function ActivationChecklist({ books = [], onAddBook, onOpenConsult, onQuickstart }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener('orime-activation', on);
    return () => window.removeEventListener('orime-activation', on);
  }, []);

  if (isActivationDismissed()) return null;

  const flags = getActivation();
  // 現在の books からも判定（既存データを尊重）。
  const hasBook = flags.book || books.length > 0;
  // 旧ステップ review（想起体験）を終えている端末は consult 完了扱い（再出現させない）。
  const done = { book: hasBook, memo: !!flags.memo, consult: !!flags.consult || !!flags.review };
  const doneCount = ACTIVATION_STEPS.filter((s) => done[s]).length;

  // 全ステップ終わったら静かに消える（祝福演出は出さない）。
  if (doneCount >= ACTIVATION_STEPS.length) return null;

  const steps = ACTIVATION_STEPS.map((key) => ({ key, ...STEP_META[key], done: done[key] }));
  const onCta = (key) => {
    if (key === 'book') onAddBook?.();
    else if (key === 'consult') onOpenConsult?.();
  };

  return (
    <div
      style={card}
      className="detail-enter"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>はじめの一歩</h2>
        <button
          type="button"
          onClick={dismissActivation}
          aria-label="閉じる"
          style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', width: 44, height: 44, marginRight: -12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6 }}>
        一行を残すほど、あなただけの相談相手が育っていきます。まずはこの順で試してみてください。
      </p>
      {!hasBook && onQuickstart && (
        <button
          type="button"
          onClick={onQuickstart}
          style={{ ...btnGhost, marginBottom: 12 }}
        >
          これまで読んだ本から始める
        </button>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {steps.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0', minHeight: 44 }}>
            {s.done
              ? <CheckCircle2 size={22} strokeWidth={2} color="var(--success)" aria-label="完了" style={{ flex: '0 0 auto' }} />
              : <Circle size={22} strokeWidth={1.75} color="var(--border)" aria-hidden="true" style={{ flex: '0 0 auto' }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: s.done ? 'var(--text-3)' : 'var(--text)', textDecoration: s.done ? 'line-through' : 'none', lineHeight: 1.4 }}>{s.label}</p>
              {!s.done && s.hint && <p style={{ margin: '4px 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5 }}>{s.hint}</p>}
            </div>
            {!s.done && s.cta && (
              <button
                type="button"
                onClick={() => onCta(s.key)}
                style={{ ...btnText, flex: '0 0 auto', fontSize: 'var(--text-sub)' }}
              >
                {s.cta}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
