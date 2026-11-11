// 💬 使い方＝実際の 1 つの相談を、チャットの形で（2026-11-11 オーナー「もっとわかりやすく。LINE のチャットみたいな感じで」）。
//   右＝自分の吹き出し（--accent-soft）、左＝本の丸いアイコン＋吹き出し（--surface）。上から順に 1 本の会話。
//   本の吹き出しの中に、根拠のメモ（小さく・左に栗色の線）。最後の「明日からできる一歩」も本からの吹き出し＋塗りの「行動に追加」の形。
//   文はオーナーの実際の相談そのまま（lpCopy.js の TALK）。色・余白・角丸はトークンだけ。
import { BookOpen, Target, Circle } from 'lucide-react';
import { TALK as T, VOICE_NOTE } from './lpCopy';

function Me({ meta, children }) {
  return (
    <li className="lp-chat-row is-me">
      <div className="lp-chat-bubble">
        {meta && <p className="lp-chat-meta">{meta}</p>}
        <p className="lp-chat-text">{children}</p>
      </div>
    </li>
  );
}

function Book({ from, children }) {
  return (
    <li className="lp-chat-row is-book">
      <span className="lp-chat-avatar" aria-hidden="true"><BookOpen size={16} /></span>
      <div className="lp-chat-col">
        {from && <p className="lp-chat-from">{from}</p>}
        <div className="lp-chat-bubble">{children}</div>
      </div>
    </li>
  );
}

export default function LpTalkFlow() {
  const [ask, answer, step] = T.steps;
  return (
    <>
      <ol className="lp-chat" aria-label="実際の相談の流れ">
        <Me meta={`相談相手：${ask.partner}`}>{ask.ask}</Me>
        <Book from={answer.from}>
          <p className="lp-chat-text is-read">{answer.answer}</p>
          <blockquote className="lp-chat-evidence">
            <p className="lp-chat-evidence-meta">{answer.evidenceMeta}</p>
            <p className="lp-chat-evidence-text">{answer.evidence}</p>
          </blockquote>
          <p className="lp-chat-label">あなたに聞きたいこと</p>
          <p className="lp-chat-text">{answer.question}</p>
        </Book>
        <Me>{T.reply}</Me>
        <Book from={T.replyFrom}>
          <p className="lp-chat-label"><Target size="1em" aria-hidden="true" /> 明日からできる一歩</p>
          <p className="lp-chat-text is-read">{step.action}</p>
        </Book>
        {/* 2026-11-11 オーナー「行動に追加ボタンは初めて見た人だとわからない」: ボタンの絵をやめ、押したあとに起きること（明日の行動リストに入る）を見せる */}
        <li className="lp-chat-row is-result">
          <div className="lp-chat-result">
            <p className="lp-chat-result-lead">この一歩は、そのまま「明日の行動」になります</p>
            <div className="lp-chat-todo" aria-label="行動リストに入った例">
              <Circle size={20} aria-hidden="true" />
              <div>
                <p className="lp-chat-todo-text">{T.todo}</p>
                <p className="lp-chat-todo-meta">{T.todoMeta}</p>
              </div>
            </div>
          </div>
        </li>
      </ol>
      <p className="lp-shot-note lp-wbr">実際の相談です。答えは、あなたのメモで変わります。{VOICE_NOTE}</p>
    </>
  );
}
