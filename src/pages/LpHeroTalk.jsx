// 🗣 会話そのもののヒーロー（2026-11-11・?hero=talk）。
//   スマホの枠に入れた小さな画面写真ではなく、実際の会話を読める大きさで置く＝相談の吹き出し → 「あなたの本棚」の答え（明朝）→ 根拠のメモ → 聞き返し。
//   動きはここだけ 1 回（開いたときに上から順に現れる・動きを減らす設定では最初から全部）。色・余白・角丸はトークンだけ。
import { Library } from 'lucide-react';
import { HERO_TALK as T } from './lpCopy';

export default function LpHeroTalk({ note }) {
  return (
    <figure className="lp-hero-shot lp-talk-wrap">
      <div className="lp-talk lp-reveal" aria-label="実際の相談の例">
        <p className="lp-talk-ask"><span>{T.ask}</span></p>
        <div className="lp-talk-answer">
          <p className="lp-talk-from"><span className="lp-talk-avatar" aria-hidden="true"><Library size={14} /></span>{T.from}</p>
          <p className="lp-talk-text">{T.answer}</p>
          <blockquote className="lp-talk-evidence">
            <p className="lp-talk-evidence-meta">{T.evidenceMeta}</p>
            <p className="lp-talk-evidence-text">{T.evidence}</p>
          </blockquote>
          <div className="lp-talk-question">
            <p className="lp-talk-question-label">あなたに聞きたいこと</p>
            <p className="lp-talk-question-text">{T.question}</p>
          </div>
        </div>
      </div>
      {note}
    </figure>
  );
}
