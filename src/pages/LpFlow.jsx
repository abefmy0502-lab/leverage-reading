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
  {
    name: 'flow-line',
    title: '一行メモを残す', // 3 枚の題は動詞でそろえる（ui-critic 2026-11-11）
    body: '読みながら、引っかかった一行を書いておきます。',
    alt: '『レバレッジ・リーディング』（読了・★5）の本の詳細。メモ 20 件の一覧と、10/17 の一行「問題解決のヒントを探すと言うはっきりした目的意識があったので、余計なところ読まずに済み。ポイントを拾うのが早くなりました。」',
  },
  {
    name: 'flow-talk',
    title: '本に相談する',
    body: '悩みをそのまま送ります。1 冊にも、本棚の本ぜんぶにも聞けます。',
    alt: '相談の最初の画面。「あなたのメモ 51 件から答えます」「困っていることを、相談してください」と、たとえばの相談 3 つ、相談相手「すべての本」と答え方「まとめて」の選択、入力欄',
  },
  {
    name: 'flow-voice',
    // 2026-11-11: 3 枚目の実際の画面は本棚ぜんぶからの答え（根拠は 3 週間前のメモ）なので、題を画面に合わせた（前は「その本の口調で、AI が答える」）
    title: 'メモを根拠に、AI が答える',
    body: '何週間も前のメモまで根拠にして答え、いきなり結論は出さずに、まず状況を聞いてきます。',
    alt: '相談の答え。「まだ読んでいない本から、今の悩みに合う本は？」に、あなたの本棚から『嫌われる勇気』をすすめる答えと、根拠になった『考え方』の 3 週間前のメモ、「あなたに聞きたいこと」の問い。入力欄の上に答えの候補のチップ',
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
