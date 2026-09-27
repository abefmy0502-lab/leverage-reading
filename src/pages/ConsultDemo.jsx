// 💬 LP「試しに、相談してみる」— ダウンロード前に一番の価値（相談）を体験してもらう欄。
//
// 悩みを 1 つ選ぶと、アプリの相談と同じ形（結論 → 明日からできる一歩 → 根拠）で答えが返る。
// 答えは AI を呼ばない固定の例。根拠はお試しモードのサンプルのメモ（src/demo/seed.js）に
// 実在するものだけを使う（架空の本・架空のメモを書かない）。その旨は欄の下に明記する。
//
// 動き: 欄が画面に入ったら 1 つ目を自動で再生（1 回だけ）。「探しています」→ 文字が流れる →
// 一歩と根拠が出る。動きを減らす設定では即表示。答えの欄は aria-live で読み上げる。

import { useEffect, useRef, useState } from 'react';
import { Check, Target } from 'lucide-react';

const SCENARIOS = [
  {
    q: '部下が報告をくれなくて困っています',
    a: '報告の中身を求める前に、話しやすい関係と「報告の形」を先につくりましょう。『1兆ドルコーチ』では 1on1 を相手の近況から始めること、『数値化の鬼』では行動を「数」で決めることをメモしています。',
    step: '次の 1on1 は最初の 5 分を近況だけにして、最後に「週に何回、どんな形で報告するか」を一緒に決める。',
    sources: [
      { book: '1兆ドルコーチ', page: 'P.61', memo: '1on1 は仕事の話の前に、相手の近況や家族の話から始める。' },
      { book: '数値化の鬼', page: 'P.15', memo: '「頑張ります」は計測できない。行動を「数」で決める。' },
    ],
  },
  {
    q: '会議で話がまとまりません',
    a: '議題を並べる前に、「この会議で答えを出す問い」を 1 つに絞りましょう。『イシューからはじめよ』のメモに、答えるべき問いかを先に確かめること、結論のストーリーを先に作ることが残っています。',
    step: '次の会議の案内に「今日決めたいこと」を 1 行で書き、冒頭で読み上げる。',
    sources: [
      { book: 'イシューからはじめよ', page: 'P.25', memo: '答えを出す前に「本当に答えるべき問い（イシュー）」かを確かめる。' },
      { book: 'イシューからはじめよ', page: 'P.88', memo: '分析の前にストーリーラインと絵コンテを作る。' },
    ],
  },
  {
    q: '仕事を抱えすぎて手が回りません',
    a: '全部を片づける方法より、「やらないこと」を決めるほうが近道です。『エッセンシャル思考』のメモには、やらないことを決めるのがいちばん大事な仕事だとあり、頼まれごとは一度持ち帰るとも書いています。',
    step: '今日の予定から「絶対にやりたい」と言えないものを 1 つ選び、「確認して返事します」と伝えて持ち帰る。',
    sources: [
      { book: 'エッセンシャル思考', page: 'P.18', memo: '「全部やる」はできない。やらないことを決めることが、いちばん大事な仕事。' },
      { book: 'エッセンシャル思考', page: 'P.64', memo: '頼まれごとに即答しない。「確認して返事します」と一度持ち帰る。' },
    ],
  },
];

// 自由に書かれた悩みを、例のどれかに当てる。例ごとの言葉がいくつ含まれるかで決め、
// どれも含まれなければ「近いメモが無い」と正直に返す（アプリの振る舞いと同じ）。
const KEYWORDS = [
  ['部下', '報告', '1on1', 'メンバー', 'チーム', '後輩', '上司', '連絡', '相談してくれ', '育て', '関係'],
  ['会議', '打ち合わせ', 'ミーティング', '議論', 'まとま', '結論', '長引', '決まらな', '企画', '資料', 'プレゼン'],
  ['忙し', '抱え', '手が回', '時間', '断れ', '断る', '残業', 'やること', 'タスク', '締め切', '優先', '余裕'],
];
function nearestScenario(text) {
  const t = String(text).toLowerCase();
  let best = -1;
  let bestHit = 0;
  KEYWORDS.forEach((words, i) => {
    const hit = words.filter((w) => t.includes(w.toLowerCase())).length;
    if (hit > bestHit) { bestHit = hit; best = i; }
  });
  return best;
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// onEvent(event, props): LP の記録（src/lib/lpTrack.js）。入力された文章は渡さない。
export default function ConsultDemo({ cta, onEvent = () => {} }) {
  const rootRef = useRef(null);
  const [active, setActive] = useState(-1);
  const [phase, setPhase] = useState('idle'); // idle | thinking | typing | done
  const [shown, setShown] = useState(0); // 流れた文字数
  const [added, setAdded] = useState(false);
  const [question, setQuestion] = useState('');
  const [draft, setDraft] = useState('');
  const [noMatch, setNoMatch] = useState(false);
  const timers = useRef([]);

  const clearTimers = () => { timers.current.forEach((t) => clearTimeout(t)); timers.current = []; };

  const play = (i, customQ) => {
    clearTimers();
    setActive(i);
    setQuestion(customQ || SCENARIOS[i].q);
    setNoMatch(false);
    setAdded(false);
    if (reduceMotion()) {
      setShown(SCENARIOS[i].a.length);
      setPhase('done');
      return;
    }
    setShown(0);
    setPhase('thinking');
    timers.current.push(setTimeout(() => {
      setPhase('typing');
      const total = SCENARIOS[i].a.length;
      let n = 0;
      const tick = () => {
        n = Math.min(total, n + 3);
        setShown(n);
        if (n < total) timers.current.push(setTimeout(tick, 24));
        else timers.current.push(setTimeout(() => setPhase('done'), 150));
      };
      tick();
    }, 900));
  };

  // 画面に入ったら 1 つ目を 1 回だけ自動で再生
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        io.disconnect();
        setActive((cur) => { if (cur === -1) setTimeout(() => { play(0); onEvent('demo_pick', { i: 0, auto: true }); }, 0); return cur; });
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => { io.disconnect(); clearTimers(); };
    // play は毎回同じ振る舞い（state setter のみ）なので依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const i = nearestScenario(text);
    setDraft('');
    onEvent('demo_ask', { match: i >= 0, i });
    if (i >= 0) { play(i, text); return; }
    clearTimers();
    setActive(-2);
    setQuestion(text);
    setAdded(false);
    setNoMatch(true);
    setPhase(reduceMotion() ? 'done' : 'thinking');
    if (!reduceMotion()) timers.current.push(setTimeout(() => setPhase('done'), 900));
  };

  const s = active >= 0 ? SCENARIOS[active] : null;

  return (
    <div className="lp-demo" ref={rootRef}>
      <div className="lp-demo-side">
        <p className="lp-demo-label" id="lp-demo-pick">悩みを選んでください</p>
        <div className="lp-demo-chips" role="group" aria-labelledby="lp-demo-pick">
          {SCENARIOS.map((sc, i) => (
            <button
              key={sc.q}
              type="button"
              className={`lp-demo-chip${active === i ? ' is-active' : ''}`}
              aria-pressed={active === i}
              onClick={() => { play(i); onEvent('demo_pick', { i, auto: false }); }}
            >
              {sc.q}
            </button>
          ))}
        </div>
        <form className="lp-demo-form" onSubmit={ask}>
          <label className="lp-demo-label" htmlFor="lp-demo-input">自分の悩みで試す</label>
          <div className="lp-demo-form-row">
            <input
              id="lp-demo-input"
              className="lp-demo-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
              maxLength={100}
              placeholder="例：会議が長引く"
              enterKeyHint="send"
            />
            <button type="submit" className="lp-demo-send" disabled={!draft.trim()}>相談する</button>
          </div>
        </form>
        <p className="lp-demo-note">
          サンプルのメモ（10 冊・30 件）から作った答えの例です。アプリでは、あなたのメモをもとに AI が答えます。
        </p>
        <ul className="lp-demo-promises">
          <li><Check size={16} aria-hidden="true" />メモが 1 件からでも相談できます</li>
          <li><Check size={16} aria-hidden="true" />答えにはいつも、もとになったメモが付きます</li>
          <li><Check size={16} aria-hidden="true" />関係するメモが無いときは、無理に答えを作りません</li>
        </ul>
      </div>

      <div className="lp-demo-chat" aria-live="polite">
        <p className="lp-demo-head">あなたのメモ 30 件から答えます</p>
        {noMatch ? (
          <>
            <p className="lp-demo-q">{question}</p>
            {phase === 'thinking' ? (
              <p className="lp-demo-thinking">メモから探しています<span className="lp-demo-dots" aria-hidden="true"><i /><i /><i /></span></p>
            ) : (
              <div className="lp-demo-answer lp-demo-after">
                <p className="lp-demo-a">サンプルのメモには、この悩みに近いものがありませんでした。</p>
                <p className="lp-demo-nomatch">アプリでは、あなたが残したメモの中から探して答えます。関係するメモが無いときは、このように無理に答えを作りません。</p>
              </div>
            )}
          </>
        ) : s ? (
          <>
            <p className="lp-demo-q">{question}</p>
            {phase === 'thinking' ? (
              <p className="lp-demo-thinking">メモから探しています<span className="lp-demo-dots" aria-hidden="true"><i /><i /><i /></span></p>
            ) : (
              <div className="lp-demo-answer">
                <p className="lp-demo-a">{s.a.slice(0, shown)}{phase === 'typing' && <span className="lp-demo-caret" aria-hidden="true" />}</p>
                {phase === 'done' && (
                  <div className="lp-demo-after">
                    <div className="lp-demo-step">
                      <p className="lp-demo-step-label">明日からできる一歩</p>
                      <p>{s.step}</p>
                      <button type="button" className={`lp-demo-add${added ? ' is-added' : ''}`} onClick={() => { if (!added) onEvent('demo_add', { i: active }); setAdded(true); }} aria-pressed={added}>
                        {added ? <Check size={16} aria-hidden="true" /> : <Target size={16} aria-hidden="true" />}
                        {added ? '行動に追加しました' : '行動に追加'}
                      </button>
                      {added && <p className="lp-demo-added-note">アプリでは、ここから行動リストに入ります。</p>}
                    </div>
                    <p className="lp-demo-src-label">もとになったメモ</p>
                    <ul className="lp-demo-src">
                      {s.sources.map((src) => (
                        <li key={src.book + src.page}>
                          <span className="lp-demo-src-book">『{src.book}』<span>{src.page}</span></span>
                          <span className="lp-demo-src-memo">{src.memo}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="lp-demo-empty">悩みを選ぶと、ここに答えが返ってきます。</p>
        )}
        {phase === 'done' && cta && <div className="lp-demo-cta">{cta}</div>}
      </div>
    </div>
  );
}
