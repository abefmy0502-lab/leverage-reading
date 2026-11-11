// 🎞 LP「一方通行の読書から、会話する読書へ」— 1 冊の本との会話を、実際の画面 4 枚で見せる（2026-10-02 → 2026-10-11 → 2026-10-12 作り直し）。
//
//   1. 気になった一行をメモ → 2. 本に相談する → 3. 本の語り口で返ってくる → 4. どのメモからの答えか分かる
//
// - 画面はお試しモード（サンプルのメモ）で撮った実際のアプリ（npm run lp:shots の flow-line・flow-talk・flow-voice。4 枚目「根拠のページが分かる」（flow-source）は 2026-11-11 オーナー「削除で」でやめた＝3 枚）。
//   iPhone のステータスバー・ホームバーを描き足した 390×844 の画面を、端末の枠（landing.css の .lp-shot）に入れる。
//   答えの名前の行の著者名・本の表紙は写ってよい（2026-10-13 オーナー判断「ブクログなども載せている」・iPhone で撮った本物の画面に差し替える予定）。
//   「（本の語り口で・AI）」は残し、ヒーローの「画面は見本です。」と FAQ の「著者本人の言葉ではありません」も残す。「著者と話せる」とは書かない。
// - 2026-10-12（LP を 100 点へ・ui-critic）: 自動で進む 1 枚ずつのタブをやめ、4 枚を並べる。
//   スマホは横にスワイプ（1 枚ずつ止まる・次の枚の端が見える）、広い画面は 4 枚を横に並べる。
//   「画面は見本です。」と語り口の注記は、ヒーローが写真のときはヒーローの下にあるので、ここでは出さない（note）。
// - 記録: 画面に入った（flow_view・1 回）／横にスワイプした（flow_step・どこまで見たか）。
import { useEffect, useRef, useState } from 'react';
import { SAMPLE_NOTE, VOICE_NOTE } from './lpCopy';
import Phrases from './LpPhrases';
import Shot from './LpShot';

export const FLOW_STEPS = [
  // 2026-11-11 オーナー「この流れを見せたいな」: 実際の 1 つの相談を 3 枚で（相談 → 本の考え方で答える・聞き返し → 本をまとめた答え → 明日からできる一歩）
  {
    name: 'flow-talk',
    title: '本に相談する',
    body: '悩みをそのまま送ります。相談相手は 1 冊でも、何冊かでも。',
    alt: '相談の画面。相談相手を選んだ 2 冊にして「仕事に対して自信が持てなくなってきた時はどうすればいい？」と送ると、稲盛和夫『考え方』が「自信の喪失は、「できると信じ切る」という心の土台が揺らいでいるサインです」と答え、根拠に 3 週間前のメモ、「あなたに聞きたいこと」の問いが続く',
  },
  {
    name: 'flow-voice',
    title: 'メモを根拠に、AI が答える',
    body: 'いきなり結論は出さず、まず状況を聞き、本の考え方で答えます。',
    alt: '2 冊の本をまとめた答え。「営業数字が伸びない根本的な原因は、課題が見えないのではなく、できると心から信じ切れていない状態にあります」と、根拠になった『考え方』の 3 週間前のメモ',
  },
  {
    name: 'flow-step',
    title: '明日の一歩が決まる',
    body: '答えの最後に、明日からできる一歩。押せば行動リストに入ります。',
    alt: '答えの最後の「明日からできる一歩」。営業活動の前日の夜と当日の朝の計 10 分間で試す工夫を手帳に書き、営業後に 3 行メモして 1 週間続ける。下に「行動に追加」のボタンと「あなたのメモ 4 件から答えました」',
  },
];

export default function LpFlow({ onEvent = () => {}, note = true }) {
  const rootRef = useRef(null);
  const seenRef = useRef(0);
  // スマホの横スワイプで今どの枚か（下の 4 つの点・2026-10-12）
  const [at, setAt] = useState(0);

  // 画面に入ったら 1 回だけ記録。横にスワイプしたら、どの枚まで見たかを記録（増えたときだけ）。
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    let sent = false;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !sent) { sent = true; onEvent('flow_view', {}); }
    }, { threshold: 0.35 });
    io.observe(el);
    const track = el.querySelector('.lp-gallery');
    const onScroll = () => {
      const w = track.firstElementChild?.getBoundingClientRect().width || 1;
      const i = Math.round(track.scrollLeft / w);
      setAt(Math.min(FLOW_STEPS.length - 1, i));
      if (i > seenRef.current) { seenRef.current = i; onEvent('flow_step', { i }); }
    };
    track?.addEventListener('scroll', onScroll, { passive: true });
    return () => { io.disconnect(); track?.removeEventListener('scroll', onScroll); };
  }, [onEvent]);

  return (
    <div className="lp-flow" ref={rootRef}>
      <ol className="lp-gallery" aria-label="会話の流れ">
        {FLOW_STEPS.map((s, i) => (
          <li key={s.name}>
            {/* 本当に順番のある 3 つなので番号を付ける（frontend-design の原則・2026-11-11） */}
            <h3 className="lp-gallery-title lp-wbr"><span className="lp-gallery-num" aria-hidden="true">{i + 1}</span><Phrases clause>{s.title}</Phrases></h3>
            <Shot name={s.name} alt={s.alt} className="lp-shot lp-gallery-shot" sizes="(min-width: 768px) 260px, 68vw" />
          </li>
        ))}
      </ol>
      <p className="lp-gallery-dots" aria-hidden="true">
        {FLOW_STEPS.map((s, i) => <span key={s.name} className={i === at ? 'is-on' : undefined} />)}
      </p>
      {/* 「画面は見本です。」と語り口の注記（ヒーローがイラストのときの置き場・写真のときはヒーローの下だけ） */}
      {note && <p className="lp-shot-note lp-wbr"><Phrases>{`${SAMPLE_NOTE}${VOICE_NOTE}`}</Phrases></p>}
    </div>
  );
}
