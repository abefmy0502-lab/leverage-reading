// 💬 使い方＝実際の 1 つの相談を、チャットの形で（2026-11-11 オーナー「もっとわかりやすく。LINE のチャットみたいな感じで」）。
//   右＝自分の吹き出し（--accent-soft）、左＝本の丸いアイコン＋吹き出し（--surface）。上から順に 1 本の会話。
//   本の吹き出しの中に、根拠のメモ（小さく・左に栗色の線）。最後の「明日からできる一歩」も本からの吹き出し＋塗りの「行動に追加」の形。
//   文はオーナーの実際の相談そのまま（lpCopy.js の TALK）。色・余白・角丸はトークンだけ。
//   2026-11-22 オーナー「LP の UI が悪い・特にこのチャットの場面」: 本の吹き出しをアイコンの列から外して全幅に（狭くて語の途中で割れていた）、
//   アイコンと名前は吹き出しの上の 1 行に。「相談する本」は会話の上の 1 行へ。答え・根拠・問いを区切り、文は文節でだけ折り返す（Phrases＋.lp-wbr・数と単位も割らない＝語の途中で割れるのがオーナーの不満の本体だった）。
import { BookOpen, Target, Circle, NotebookPen } from 'lucide-react';
import { TALK as T, TALK_NOTE } from './lpCopy';
import Phrases from './LpPhrases';

export function Me({ children }) {
  return (
    <li className="lp-chat-row is-me">
      <div className="lp-chat-bubble">
        <p className="lp-chat-text lp-wbr"><Phrases phrase>{children}</Phrases></p>
      </div>
    </li>
  );
}

export function Book({ from, children }) {
  return (
    <li className="lp-chat-row is-book">
      {/* 同じ本の 2 回目からは名前の行を出さない（左寄せのカードで本だと分かる・読み上げには書名） */}
      {from ? (
        <p className="lp-chat-from">
          <span className="lp-chat-avatar" aria-hidden="true"><BookOpen size={14} /></span>
          {from}
        </p>
      ) : <span className="lp-sr">稲盛和夫『考え方』</span>}
      <div className="lp-chat-bubble">{children}</div>
    </li>
  );
}

export default function LpTalkFlow() {
  const [ask, answer, step] = T.steps;
  // 一歩の最初の段落（考え方）と、そのあとの具体（やること）を分ける（lpCopy の action は段落の配列）。
  const [stepLead, ...stepRestParas] = [].concat(step.action);
  return (
    <>
      {/* 広い画面では会話（相談する本の行＋会話）を右の列にまとめる（landing.css の .lp-chat-wrap） */}
      <div className="lp-chat-wrap">
      <p className="lp-chat-partner"><BookOpen size="1.1em" aria-hidden="true" /><span>相談する本</span><b>稲盛和夫『考え方』</b></p>
      <ol className="lp-chat" aria-label="相談の流れの見本">
        <Me>{ask.ask}</Me>
        <Book from={answer.from}>
          <div className="lp-chat-answer">
            <p className="lp-chat-text is-read lp-wbr"><Phrases phrase>{answer.answer}</Phrases></p>
            {/* 答えのもとのメモ（2026-11-23 LP の仕上げ: 自分のメモが答えになることを、引用で一目に） */}
            {answer.memo && (
              <figure className="lp-chat-memo">
                <blockquote className="lp-wbr"><Phrases phrase>{answer.memo}</Phrases></blockquote>
                <figcaption>{answer.memoMeta}</figcaption>
              </figure>
            )}
            {!answer.memo && <p className="lp-chat-evidence-line"><NotebookPen size="1.1em" aria-hidden="true" /><span className="lp-wbr">あなたのメモ<wbr /><b>{'\u00a03\u00a0件'}</b>から<wbr />答えています。</span></p>}
          </div>
          <div className="lp-chat-ask">
            <p className="lp-chat-label">あなたに聞きたいこと</p>
            <p className="lp-chat-text is-read lp-wbr"><Phrases phrase>{answer.question}</Phrases></p>
          </div>
        </Book>
        <Me>{T.reply}</Me>
        <Book>
          <p className="lp-chat-text is-lead lp-wbr"><Phrases phrase>{stepLead}</Phrases></p>
          <div className="lp-chat-step">
            <p className="lp-chat-label"><Target size="1.1em" aria-hidden="true" /> 明日からできる一歩</p>
            {stepRestParas.map((t) => <p key={t} className="lp-chat-text is-read lp-wbr"><Phrases phrase>{t}</Phrases></p>)}
          </div>
        </Book>
        {/* 2026-11-11 オーナー「行動に追加ボタンは初めて見た人だとわからない」: ボタンの絵をやめ、押したあとに起きること（明日の行動リストに入る）を見せる */}
        <li className="lp-chat-row is-result">
          <div className="lp-chat-result">
            <p className="lp-chat-result-lead">この一歩は、行動リストに入ります</p>
            <div className="lp-chat-todo" aria-label="行動リストに入った例">
              <Circle size={20} strokeWidth={1.5} aria-hidden="true" />
              <div>
                <p className="lp-chat-todo-text lp-wbr">{T.todo.map((t) => <span key={t}><Phrases phrase>{t}</Phrases></span>)}</p>
                <p className="lp-chat-todo-meta">{T.todoMeta}</p>
              </div>
            </div>
          </div>
        </li>
      </ol>
      {/* 注記は 1 か所だけ・会話の真下（広い画面でも右の列＝見出しと重ならない・2026-11-23） */}
      <p className="lp-shot-note lp-shot-note--lines">{TALK_NOTE.map((t) => <span key={t}>{t}</span>)}</p>
      </div>
    </>
  );
}
