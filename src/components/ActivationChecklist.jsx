// 🌱 初週オンボーディング — 新規ユーザーを aha まで運ぶ 3 ステップのチェックリスト。
// ホーム（本棚）の先頭に、未完了かつ未 dismiss のときだけ控えめに表示する。
//
// book/memo は track() イベントに連動して自動で埋まり、consult は「相談（マイ読書脳）で
// 答えを1回受け取った」ときに MyBookBrain.jsx が直接マークする（activation.js）。
// 達成バー / カウンタ / 祝福などの煽り演出は置かない（Apple Reminders 級の控えめさ）。

import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { C } from '../styles/ui';
import { getActivation, isActivationDismissed, dismissActivation, ACTIVATION_STEPS } from '../lib/activation';

const STEP_META = {
  book: { label: '本を1冊、本棚に追加する', hint: '右上の ＋ から検索して追加', cta: '追加' },
  memo: { label: '心が動いた一行をメモに残す', hint: '本を開いて「メモ」から一行でOK。ここから全部が始まります' },
  consult: { label: '「相談」で、自分のメモから答えをもらう', hint: '困っていることを書くと、あなたが読んだ本のメモを根拠に答えます', cta: '開く' },
};

export default function ActivationChecklist({ books = [], onAddBook, onOpenConsult }) {
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
      style={{
        margin: '4px 0 14px', padding: 16, borderRadius: 16,
        background: C.card, border: `1px solid ${C.hairline}`, boxShadow: 'var(--shadow-1)',
      }}
      className="detail-enter"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>はじめの一歩</span>
        <button
          type="button"
          onClick={dismissActivation}
          aria-label="閉じる"
          style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: C.ink3, cursor: 'pointer', padding: 4, marginRight: -4, display: 'inline-flex' }}
        >
          <X size={16} />
        </button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: C.ink2, lineHeight: 1.6 }}>
        一行を残すほど、あなただけの相談相手が育っていきます。まずはこの順で試してみてください。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {steps.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
            {s.done
              ? <CheckCircle2 size={20} strokeWidth={2} color={C.brand} style={{ flex: '0 0 auto' }} />
              : <Circle size={20} strokeWidth={1.75} color={C.hairlineStrong} style={{ flex: '0 0 auto' }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: s.done ? C.ink3 : C.ink, textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</p>
              {!s.done && s.hint && <p style={{ margin: '2px 0 0', fontSize: 11, color: C.ink3 }}>{s.hint}</p>}
            </div>
            {!s.done && s.cta && (
              <button
                type="button"
                onClick={() => onCta(s.key)}
                style={{ flex: '0 0 auto', minHeight: 44, padding: '10px 16px', borderRadius: 10, border: 'none', background: C.brand, color: C.brandInk, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
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
