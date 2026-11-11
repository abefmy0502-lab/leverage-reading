// 🗣 使い方＝実際の 1 つの相談を、スマホの枠に入れずに会話として組む（2026-11-11 オーナー「画面を映す感じだと見にくい・スマホ画面を再現しなくてもいい」）。
//   3 段: ① 本に相談する（吹き出し）→ ② 本の考え方で答える（『考え方』の答え＋根拠のメモ＋聞き返し）→ ③ 明日の一歩が決まる（一歩＋「行動に追加」の形）。
//   文はオーナーの実際の相談そのまま（lpCopy.js の TALK）。色・余白・角丸はトークンだけ。動きは無し（読む物）。
import { BookOpen, Target } from 'lucide-react';
import { TALK as T, VOICE_NOTE } from './lpCopy';

export default function LpTalkFlow() {
  return (
    <>
    <ol className="lp-tf" aria-label="実際の相談の流れ">
      {T.steps.map((st, i) => (
        <li key={st.title} className="lp-tf-step">
          <h3 className="lp-tf-title"><span className="lp-gallery-num" aria-hidden="true">{i + 1}</span>{st.title}</h3>
          {st.ask && <p className="lp-tf-ask"><span><span className="lp-tf-ask-meta">相談相手：{st.partner}</span>{st.ask}</span></p>}
          {st.from && (
            <div className="lp-tf-answer">
              <p className="lp-tf-from"><span className="lp-tf-avatar" aria-hidden="true"><BookOpen size={14} /></span>{st.from}</p>
              <p className="lp-tf-text">{st.answer}</p>
              {st.evidence && (
                <blockquote className="lp-tf-evidence">
                  <p className="lp-tf-evidence-meta">{st.evidenceMeta}</p>
                  <p className="lp-tf-evidence-text">{st.evidence}</p>
                </blockquote>
              )}
              {st.question && (
                <div className="lp-tf-box">
                  <p className="lp-tf-box-label">あなたに聞きたいこと</p>
                  <p className="lp-tf-box-text">{st.question}</p>
                </div>
              )}
            </div>
          )}
          {st.action && (
            <div className="lp-tf-box is-action">
              <p className="lp-tf-box-label"><Target size="1em" aria-hidden="true" /> 明日からできる一歩</p>
              <p className="lp-tf-box-text lp-tf-action">{st.action}</p>
              <p className="lp-tf-fake-btn" aria-hidden="true"><Target size="1.1em" /> 行動に追加</p>
            </div>
          )}
        </li>
      ))}
    </ol>
    {/* 実際の相談であること・AI の答えであること（景品表示法・著者本人の言葉ではない） */}
    <p className="lp-shot-note lp-wbr">実際の相談です。答えは、あなたのメモで変わります。{VOICE_NOTE}</p>
    </>
  );
}
