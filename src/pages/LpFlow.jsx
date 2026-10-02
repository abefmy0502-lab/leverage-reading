// 🎞 LP「悩みから、明日の一歩まで」— 相談の流れを、実際の画面 4 枚で約 15 秒（2026-10-02 オーナー承認の構成 ②）。
//
//   1. 困っていることを書く → 2. あなたのメモの一節が返る → 3. 状況を 1 つ聞き返す → 4. 明日やることを 1 つ決める
//
// - 画面はお試しモード（サンプルのメモ）で撮った実際のアプリ（npm run lp:shots の flow-*）。動画は使わない（軽さ）。
// - 画面に入ったら 1 回だけ自動で進む（1 枚 3.75 秒・最後で止まる）。画面から外れたら止め、戻ったら続きから。
// - 動きを減らす設定では自動で進めない（最初の 1 枚を出し、手順を押すと切り替わる）。止める／もう一度見るボタンあり
//   （5 秒を超えて動くものは止められること・WCAG 2.2.2）。ボタンは進み具合の行の右端（動いている間も見える）。
//   説明の読み上げ（aria-live）は手順を押したあとだけ。
// - 記録: 画面に入った（flow_view・1 回）／手順を押した（flow_step）／もう一度見た（flow_replay）。
import { useCallback, useEffect, useRef, useState } from 'react';
import Shot from './LpShot';

export const FLOW_STEPS = [
  {
    name: 'flow-worry',
    title: '困っていることを書く',
    body: '「部下が報告をくれない」。悩みをそのまま送ります。',
    alt: '相談の画面。「部下が報告をくれなくて困っています」と送り、答えを書きはじめている',
  },
  {
    name: 'flow-memo',
    title: 'あなたのメモの一節が返る',
    body: '前に読んで残したメモから、関係する一節を探して答えます。',
    alt: '答えの「根拠を見る」を開いた画面。『イシューからはじめよ』『1兆ドルコーチ』p.95『数値化の鬼』に残したメモの一節が並ぶ',
  },
  {
    name: 'flow-ask',
    title: '状況を 1 つ聞き返す',
    body: '最初から行動を決めつけず、あなたの状況を聞いてから深めます。',
    alt: '答えの最後に「あなたに聞きたいこと：報告が遅れるのは、どんな場面が多いですか？」。入力欄の上に「会議の前」「急ぎのとき」「悪い知らせ」「行動を決める」のチップ',
  },
  {
    name: 'flow-action',
    title: '明日やることを 1 つ決める',
    body: '話しながら決めた一歩は、ボタン 1 つで行動リストに入ります。',
    alt: '「会議の前」と答えたあとの答え。「明日からできる一歩」と「行動に追加」のボタン',
  },
];
export const FLOW_STEP_MS = 3750; // 4 枚で 15 秒

function prefersStatic() {
  if (typeof window === 'undefined') return true;
  try {
    // 🧪 開発中だけ ?motion=static で、動きを減らす設定の見た目を撮れる。
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('motion') === 'static') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function LpFlow({ onEvent = () => {} }) {
  const [still] = useState(prefersStatic);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false); // 自動で進んでいる
  const [inView, setInView] = useState(false);
  const [finished, setFinished] = useState(false); // 最後まで見た（または止めた）
  const startedRef = useRef(false);
  const rootRef = useRef(null);

  // 画面に入ったら 1 回だけ自動で始める。外れたら止める。
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => {
      setInView(e.isIntersecting);
      if (e.isIntersecting && !startedRef.current) {
        startedRef.current = true;
        onEvent('flow_view', { still });
        if (!still) setPlaying(true);
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [onEvent, still]);

  // 1 枚ずつ進める（最後の 1 枚で止まる）。
  const running = playing && inView;
  useEffect(() => {
    if (!running) return undefined;
    const t = window.setTimeout(() => {
      setStep((s) => {
        if (s >= FLOW_STEPS.length - 1) { setPlaying(false); setFinished(true); return s; }
        return s + 1;
      });
    }, FLOW_STEP_MS);
    return () => window.clearTimeout(t);
  }, [running, step]);

  // 手順を押したら、その枚に切り替えて自動では進めない。
  // 読み上げ（aria-live）は、手順を押したあとだけ（自動で進む間に 3.75 秒ごとに読み上げない・2026-10-02 ui-critic）。
  const [announce, setAnnounce] = useState(false);
  const pick = useCallback((i) => {
    setAnnounce(true);
    setStep(i);
    setPlaying(false);
    setFinished(true);
    onEvent('flow_step', { i });
  }, [onEvent]);
  const replay = () => {
    setStep(0);
    setFinished(false);
    setPlaying(true);
    onEvent('flow_replay', {});
  };
  const pause = () => { setPlaying(false); setFinished(true); };

  // 止める／もう一度見る／次へ は、進み具合の行の右端（動いている間も見える場所・2026-10-02 ui-critic）。
  let control = null;
  if (playing) control = <button type="button" className="lp-textbtn" onClick={pause}>止める</button>;
  else if (still) {
    control = step < FLOW_STEPS.length - 1
      ? <button type="button" className="lp-textbtn" onClick={() => pick(step + 1)}>次へ</button>
      : <button type="button" className="lp-textbtn" onClick={() => pick(0)}>最初から</button>;
  } else if (finished) control = <button type="button" className="lp-textbtn" onClick={replay}>もう一度見る</button>;

  return (
    <div className={`lp-flow${running ? ' is-playing' : ''}`} ref={rootRef}>
      <div className="lp-flow-progress">
      <ol className="lp-flow-steps" aria-label="相談の流れ">
        {FLOW_STEPS.map((s, i) => {
          const state = i < step ? 'is-done' : i === step ? 'is-active' : '';
          return (
            <li key={s.name} className={state}>
              <button type="button" onClick={() => pick(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="lp-flow-bar" aria-hidden="true">
                  {/* 進んでいる枚だけ、時間に合わせて伸びる（key で枚ごとに最初から） */}
                  <span key={`${i}-${step}-${running}`} className={i === step && running ? 'is-run' : ''} style={{ animationDuration: `${FLOW_STEP_MS}ms` }} />
                </span>
                <span className="lp-flow-num">{i + 1}</span>
                <span className="lp-flow-title">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
        <div className="lp-flow-controls">{control}</div>
      </div>
      <div className="lp-flow-main">
        <p className="lp-flow-caption" aria-live={announce ? 'polite' : undefined}>
          <span className="lp-flow-caption-title">{step + 1}. {FLOW_STEPS[step].title}</span>
          <span className="lp-flow-caption-body">{FLOW_STEPS[step].body}</span>
        </p>
        <div className="lp-flow-stage">
          {FLOW_STEPS.map((s, i) => (
            <div key={s.name} className={`lp-flow-frame${i === step ? ' is-on' : ''}`}>
              <Shot name={s.name} alt={s.alt} hidden={i !== step} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
