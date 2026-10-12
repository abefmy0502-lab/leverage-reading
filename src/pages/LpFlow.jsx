// 🎞 LP「一方通行の読書から、会話する読書へ」— 1 冊の本との会話を、実際の画面 4 枚で見せる（2026-10-02 → 2026-10-11 → 2026-10-12 作り直し）。
//
//   1. 気になった一行をメモ → 2. 本に相談する → 3. 本の語り口で返ってくる → 4. どのメモからの答えか分かる
//
// - 画面はお試しモード（サンプルのメモ）で撮った実際のアプリ（npm run lp:shots の flow-line・flow-talk・flow-voice・flow-source）。
//   iPhone のステータスバー・ホームバーを描き足した 390×844 の画面を、端末の枠（landing.css の .lp-shot）に入れる。
//   答えの名前の行の著者名は写さない（「（本の語り口で・AI）」は残す）。
// - 2026-10-12（LP を 100 点へ・ui-critic）: 自動で進む 1 枚ずつのタブをやめ、4 枚を並べる。
//   スマホは横にスワイプ（1 枚ずつ止まる・次の枚の端が見える）、広い画面は 4 枚を横に並べる。
//   「画面は見本です。」と語り口の注記は、ヒーローが写真のときはヒーローの下にあるので、ここでは出さない（note）。
// - 記録: 画面に入った（flow_view・1 回）／横にスワイプした（flow_step・どこまで見たか）。
import { useEffect, useRef } from 'react';
import { SAMPLE_NOTE, VOICE_NOTE } from './lpCopy';
import Phrases from './LpPhrases';
import Shot from './LpShot';

export const FLOW_STEPS = [
  {
    name: 'flow-line',
    title: '気になった一行をメモ',
    body: '読みながら、引っかかった一行を書いておくだけ。',
    alt: '『嫌われる勇気』の本の詳細のメモの一覧。今日残した一行「人にどう思われるかより、自分がどうしたいかを先に考える。」と、「この本に相談する」',
  },
  {
    name: 'flow-talk',
    title: '本に相談する',
    body: '悩みをそのまま送ります。1 冊にも、本棚の本ぜんぶにも聞けます。',
    alt: '相談の画面。相談相手を『嫌われる勇気』にして「相手が自分をどう思うかが気になって、意見が言えません」と送り、本の語り口の答えを書きはじめている',
  },
  {
    name: 'flow-voice',
    title: '本の語り口で返ってくる',
    body: 'いきなり結論は出さず、まず状況を聞いてきます。',
    alt: '本の語り口の答え「私の考え方で言えば、他人の課題と自分の課題を分ける」と、「意見を言いにくいのは、どんな会議ですか？」という問い。入力欄の上に答えの候補のチップ',
  },
  {
    name: 'flow-source',
    title: 'どのメモからの答えか分かる',
    body: 'もとになった本とページが付くので、すぐ読み返せます。',
    alt: '答えの「根拠を見る」を開いた画面。『嫌われる勇気』p.40 に残したメモの一節と、もとになった本',
  },
];

export default function LpFlow({ onEvent = () => {}, note = true }) {
  const rootRef = useRef(null);
  const seenRef = useRef(0);

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
            <p className="lp-gallery-num" aria-hidden="true">{i + 1}</p>
            <h3 className="lp-gallery-title lp-wbr"><Phrases>{s.title}</Phrases></h3>
            <p className="lp-gallery-body lp-wbr"><Phrases>{s.body}</Phrases></p>
            <Shot name={s.name} alt={s.alt} className="lp-shot lp-gallery-shot" sizes="(min-width: 768px) 260px, 68vw" />
          </li>
        ))}
      </ol>
      {/* 「画面は見本です。」と語り口の注記（ヒーローがイラストのときの置き場・写真のときはヒーローの下だけ） */}
      {note && <p className="lp-shot-note lp-wbr"><Phrases>{`${SAMPLE_NOTE}${VOICE_NOTE}`}</Phrases></p>}
    </div>
  );
}
