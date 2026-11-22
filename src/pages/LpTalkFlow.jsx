// 💬 使い方＝実際の 1 つの相談を、チャットの形で（2026-11-11 オーナー「もっとわかりやすく。LINE のチャットみたいな感じで」）。
//   右＝自分の吹き出し（--accent-soft）、左＝本の丸いアイコン＋吹き出し（--surface）。上から順に 1 本の会話。
//   本の吹き出しの中に、根拠のメモ（小さく・左に栗色の線）。最後の「明日からできる一歩」も本からの吹き出し＋塗りの「行動に追加」の形。
//   文はオーナーの実際の相談そのまま（lpCopy.js の TALK）。色・余白・角丸はトークンだけ。
//   2026-11-22 オーナー「LP の UI が悪い・特にこのチャットの場面」: 本の吹き出しをアイコンの列から外して全幅に（狭くて語の途中で割れていた）、
//   アイコンと名前は吹き出しの上の 1 行に。「相談する本」は会話の上の 1 行へ。答え・根拠・問いを区切り、文は本の組みと同じく文字の単位で詰め、禁則は strict（文節で割ると吹き出しの右がでこぼこになる）。
import { BookOpen, Target, Circle, NotebookPen } from 'lucide-react';
import { TALK as T } from './lpCopy';
import LpPartnerDiagram from './LpPartnerDiagram';

function Me({ children }) {
  return (
    <li className="lp-chat-row is-me">
      <div className="lp-chat-bubble">
        <p className="lp-chat-text">{children}</p>
      </div>
    </li>
  );
}

function Book({ from, children }) {
  return (
    <li className="lp-chat-row is-book">
      <p className="lp-chat-from">
        <span className="lp-chat-avatar" aria-hidden="true"><BookOpen size={14} /></span>
        {from}
      </p>
      <div className="lp-chat-bubble">{children}</div>
    </li>
  );
}

export default function LpTalkFlow() {
  const [ask, answer, step] = T.steps;
  // 一歩の最初の 1 文（考え方）と、そのあとの具体（やること）を分ける。
  const [stepLead, ...stepRest] = String(step.action).split(/(?<=。)/);
  return (
    <>
      <p className="lp-chat-partner"><BookOpen size="1.1em" aria-hidden="true" /><span>相談する本</span><b>稲盛和夫『考え方』</b></p>
      <ol className="lp-chat" aria-label="相談の流れの見本">
        <Me>{ask.ask}</Me>
        <Book from={answer.from}>
          <p className="lp-chat-text is-read">{answer.answer}</p>
          <p className="lp-chat-evidence-line"><NotebookPen size="1em" aria-hidden="true" />{answer.evidenceLine}</p>
          <div className="lp-chat-ask">
            <p className="lp-chat-label">あなたに聞きたいこと</p>
            <p className="lp-chat-text">{answer.question}</p>
          </div>
        </Book>
        <Me>{T.reply}</Me>
        <Book from={T.replyFrom}>
          <p className="lp-chat-text is-read">{stepLead}</p>
          <div className="lp-chat-step">
            <p className="lp-chat-label"><Target size="1em" aria-hidden="true" /> 明日からできる一歩</p>
            <p className="lp-chat-text">{stepRest.join('')}</p>
          </div>
        </Book>
        {/* 2026-11-11 オーナー「行動に追加ボタンは初めて見た人だとわからない」: ボタンの絵をやめ、押したあとに起きること（明日の行動リストに入る）を見せる */}
        <li className="lp-chat-row is-result">
          <div className="lp-chat-result">
            <p className="lp-chat-result-lead">この一歩は、行動リストに入ります</p>
            <div className="lp-chat-todo" aria-label="行動リストに入った例">
              <Circle size={20} aria-hidden="true" />
              <div>
                <p className="lp-chat-todo-text">{T.todo.map((t) => <span key={t}>{t}</span>)}</p>
                <p className="lp-chat-todo-meta">{T.todoMeta}</p>
              </div>
            </div>
          </div>
        </li>
      </ol>
      {/* 相談する相手（2026-11-15 オーナー「1 冊でも、本棚ぜんぶでも、をデザインで」・ui-critic: 節の頭の図は 1 つにし、見本の 1 冊の相談のあとに「ほかの相手も」として置く） */}
      <div className="lp-partner">
        <h3 className="lp-partner-h">相談する相手は、選べます。</h3>
        <LpPartnerDiagram />
      </div>
      {/* 通常の AI との違いを、実例のすぐ下で 1 文（読み手テスト 2026-11-12・2026-11-15 に ChatGPT から言い換え） */}
      {/* 2026-11-15 オーナー「見やすく」: 題の行と 2 文を分ける */}
      <div className="lp-chat-diff">
        <p className="lp-chat-diff-title">通常の AI との違い</p>
        <p className="lp-chat-diff-body"><span>答えの根拠は、ネットの一般論ではなく、</span><span>あなたが残したメモです。</span><span>本を一から説明する必要もありません。</span></p>
      </div>
      {/* 2026-11-15 オーナー「改行を自然に」: 1 文ずつ改行（一度消したが戻した） */}
      <p className="lp-shot-note lp-shot-note--lines"><span>画面は見本です。</span><span>答えは AI によるもので、著者本人の言葉ではありません。</span><span>あなたのメモで、答えは変わります。</span></p>
    </>
  );
}
