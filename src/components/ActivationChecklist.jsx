// 🌱 初週オンボーディング — 新規ユーザーを aha まで運ぶ4ステップのチェックリスト。
// ホーム（本棚）の先頭に、未完了かつ未 dismiss のときだけ控えめに表示する。
//
// 各ステップは既存の track() イベントに連動して自動で埋まる（activation.js）。
// 本・ステータスは現在の books からも判定して、既存ユーザーには余計に出さない。

import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, X, Sparkles } from 'lucide-react';
import { C } from '../styles/ui';
import { getActivation, isActivationDismissed, dismissActivation, ACTIVATION_STEPS } from '../lib/activation';

const STEP_META = {
  book: { label: '本を1冊、本棚に追加する', hint: '右上の ＋ から検索して追加', cta: '追加' },
  memo: { label: '気づきをメモに残す', hint: '本を開いて「メモ」から一行でOK' },
  review: { label: '「振り返り」で想起を体験する', hint: '残したメモが、あとで戻ってくる', cta: '開く' },
  status: { label: '本のステータスを進める', hint: '読みたい→読書中→読了' },
};

export default function ActivationChecklist({ books = [], onAddBook, onOpenReview }) {
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
  const hasStatus = flags.status || books.some((b) => b.status && b.status !== 'want');
  const done = { book: hasBook, memo: !!flags.memo, review: !!flags.review, status: hasStatus };
  const doneCount = ACTIVATION_STEPS.filter((s) => done[s]).length;

  // 全部終わったら自動で消える（祝福は一瞬出して dismiss）。
  if (doneCount >= ACTIVATION_STEPS.length) return null;

  const steps = ACTIVATION_STEPS.map((key) => ({ key, ...STEP_META[key], done: done[key] }));
  const onCta = (key) => {
    if (key === 'book') onAddBook?.();
    else if (key === 'review') onOpenReview?.();
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
        <Sparkles size={16} strokeWidth={2} color={C.brand} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>はじめの一歩</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: C.ink3 }}>{doneCount}/{ACTIVATION_STEPS.length}</span>
        <button
          type="button"
          onClick={dismissActivation}
          aria-label="閉じる"
          style={{ border: 'none', background: 'transparent', color: C.ink3, cursor: 'pointer', padding: 4, marginRight: -4, display: 'inline-flex' }}
        >
          <X size={16} />
        </button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: C.ink2, lineHeight: 1.6 }}>
        この4つを終えると、Orime の「読んで終わりにしない」体験がひと通り掴めます。
      </p>
      {/* 進捗バー */}
      <div style={{ height: 6, background: C.soft, borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${(doneCount / ACTIVATION_STEPS.length) * 100}%`, background: C.brand, borderRadius: 99, transition: 'width .4s var(--ease-spring, ease)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {steps.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
            {s.done
              ? <CheckCircle2 size={20} strokeWidth={2} color="#6b8e6b" style={{ flex: '0 0 auto' }} />
              : <Circle size={20} strokeWidth={1.75} color={C.hairlineStrong} style={{ flex: '0 0 auto' }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: s.done ? C.ink3 : C.ink, textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</p>
              {!s.done && s.hint && <p style={{ margin: '2px 0 0', fontSize: 11, color: C.ink3 }}>{s.hint}</p>}
            </div>
            {!s.done && s.cta && (
              <button
                type="button"
                onClick={() => onCta(s.key)}
                style={{ flex: '0 0 auto', minHeight: 34, padding: '7px 14px', borderRadius: 10, border: 'none', background: C.brand, color: C.brandInk, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
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
