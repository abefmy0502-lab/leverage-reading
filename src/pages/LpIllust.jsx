// 🎨 LP ヒーローのイラスト「いろいろな本と対話する」（2026-10-11 オーナー「お任せ」・A/B の 'illust'）。
//
// 架空の本 5 冊（色の面と線だけ・書名や人の顔は描かない）から小さな吹き出しが出て、真ん中の「あなたの一行」
// （角を折ったメモ＝Orime の名前の「折り目」）に集まり、そこから「明日の一歩」へ流れる。
// 色はすべてトークン（landing.css の .lp-ill-*）。座標・線の太さ・角の丸み・2 つの小さなラベルの大きさは絵の中の
// 寸法（viewBox の単位）で、絵と一緒に縮む（UI の余白・角丸・文字のトークンとは別）。
// 動き: 吹き出しと線が左から順にゆっくり現れるだけ（1 回・prefers-reduced-motion では止めて最初から全部見せる）。
// 読み上げ: 絵の意味を 1 文で（aria-label）。中の形は読ませない。
//
// 🖼 本番の絵（2026-10-11 オーナー）: public/lp/hero-illust-light-<390|780|1560>.webp（横長 4:3・元は 1448×1086 の PNG を
//   sharp で書き出した）。暗い版はまだ無く、暗い画面でも同じ絵を角丸の「絵のカード」（細い線・少し暗く）として出す。
//   hero-illust-dark-<390|780|1560>.webp を置くと、暗い画面ではそちらを出す（<picture>）。
//   絵があるかはビルドのときに焼き込む一覧（LpArt.jsx の hasArt）で決め、無いビルドだけ下の SVG（仮の絵）を予備として出す。
//   差し替えるときは同じ名前で 3 つ置き直す（手順は docs/lp-measurement.md）。読み上げの文は ILLUST_LABEL。
import { hasArt, artSet } from './LpArt';

const BOOKS = [
  { x: 22, y: 26, tone: 'a' },
  { x: 92, y: 14, tone: 'b' },
  { x: 160, y: 8, tone: 'c' },
  { x: 228, y: 14, tone: 'b' },
  { x: 298, y: 26, tone: 'a' },
];
const BOOK_W = 40;
const BOOK_H = 56;
const CARD = { x: 100, y: 184, w: 160, h: 58 };
const CX = CARD.x + CARD.w / 2;

export const ILLUST_LABEL = 'スマホで本に相談すると、本棚の本が答えてくれる様子のイラスト';
// 予備の SVG（画像が読めないとき）の読み上げ
const SVG_LABEL = 'いろいろな本から吹き出しが出て、真ん中の「あなたの一行」のメモに集まり、そこから「明日の一歩」へつながる絵';

function IllustSvg() {
  return (
    <svg className="lp-illust" viewBox="0 0 360 300" role="img" aria-label={SVG_LABEL}>
      {BOOKS.map((b, i) => {
        const cx = b.x + BOOK_W / 2;
        const by = b.y + BOOK_H + 14; // 吹き出しの上端
        const bubbleBottom = by + 22;
        return (
          <g key={b.x} className="lp-ill-talk" style={{ '--i': i }}>
            {/* 本（表紙は色の面と線だけ） */}
            <g className={`lp-ill-book lp-ill-book-${b.tone}`}>
              <rect x={b.x} y={b.y} width={BOOK_W} height={BOOK_H} rx="3" />
              <line x1={b.x + 7} y1={b.y + 3} x2={b.x + 7} y2={b.y + BOOK_H - 3} className="lp-ill-spine" />
              <line x1={b.x + 13} y1={b.y + 15} x2={b.x + 32} y2={b.y + 15} className="lp-ill-title" />
              <line x1={b.x + 13} y1={b.y + 21} x2={b.x + 26} y2={b.y + 21} className="lp-ill-title" />
            </g>
            {/* 本から出る小さな吹き出し */}
            <g className="lp-ill-pop">
              <path
                className="lp-ill-bubble"
                d={`M${cx - 21} ${by + 4} q0 -4 4 -4 h12 l5 -6 l5 6 h12 q4 0 4 4 v14 q0 4 -4 4 h-34 q-4 0 -4 -4 z`}
              />
              <line x1={cx - 13} y1={by + 8} x2={cx + 13} y2={by + 8} className="lp-ill-text" />
              <line x1={cx - 13} y1={by + 14} x2={cx + 5} y2={by + 14} className="lp-ill-text" />
              {/* 吹き出しから「あなたの一行」へ */}
              <path
                className="lp-ill-link"
                d={`M${cx} ${bubbleBottom + 2} C${cx} ${bubbleBottom + 40}, ${CX} ${CARD.y - 46}, ${CX} ${CARD.y - 4}`}
              />
            </g>
          </g>
        );
      })}

      {/* 真ん中の「あなたの一行」（右上の角を折ったメモ） */}
      <g className="lp-ill-card">
        <path
          className="lp-ill-card-face"
          d={`M${CARD.x + 8} ${CARD.y} h${CARD.w - 26} l18 18 v${CARD.h - 26} q0 8 -8 8 h-${CARD.w - 16} q-8 0 -8 -8 v-${CARD.h - 16} q0 -8 8 -8 z`}
        />
        <path className="lp-ill-fold" d={`M${CARD.x + CARD.w - 18} ${CARD.y} v12 q0 6 6 6 h12 z`} />
        <text x={CARD.x + 14} y={CARD.y + 22} className="lp-ill-label" fontSize="12">あなたの一行</text>
        <line x1={CARD.x + 14} y1={CARD.y + 36} x2={CARD.x + CARD.w - 22} y2={CARD.y + 36} className="lp-ill-text" />
        <line x1={CARD.x + 14} y1={CARD.y + 46} x2={CARD.x + CARD.w - 60} y2={CARD.y + 46} className="lp-ill-text" />
      </g>

      {/* 「明日の一歩」へ */}
      <g className="lp-ill-step">
        <line x1={CX} y1={CARD.y + CARD.h + 4} x2={CX} y2={CARD.y + CARD.h + 18} className="lp-ill-arrow" />
        <path d={`M${CX - 5} ${CARD.y + CARD.h + 13} l5 6 l5 -6`} className="lp-ill-arrow" />
        <rect x={CX - 62} y={CARD.y + CARD.h + 22} width="124" height="32" rx="16" className="lp-ill-pill" />
        <circle cx={CX - 42} cy={CARD.y + CARD.h + 38} r="7" className="lp-ill-check" />
        <path d={`M${CX - 45.5} ${CARD.y + CARD.h + 38} l2.5 2.5 l4.5 -5`} className="lp-ill-check" />
        <text x={CX - 28} y={CARD.y + CARD.h + 42.5} className="lp-ill-pill-label" fontSize="13">明日の一歩</text>
      </g>
    </svg>
  );
}

const IMG = (w) => `/lp/hero-illust-light-${w}.webp`;
const SET = [390, 780, 1560].map((w) => `${IMG(w)} ${w}w`).join(', ');
const SIZES = '(min-width: 768px) 420px, 92vw';

export default function LpIllust() {
  // 絵が置いてあるか（ビルドのときの一覧）。暗い画面用の版（hero-illust-dark-*.webp）があれば出し分ける。
  const dark = hasArt('hero-illust', 'dark');
  if (!hasArt('hero-illust')) return <IllustSvg />;
  return (
    <picture>
      {dark && <source media="(prefers-color-scheme: dark)" type="image/webp" srcSet={artSet('hero-illust', 'dark')} sizes={SIZES} />}
      <img
        className={`lp-illust lp-illust-img${dark ? ' has-dark' : ''}`}
        src={IMG(780)}
        srcSet={SET}
        sizes={SIZES}
        width="1560"
        height="1170"
        alt={ILLUST_LABEL}
        fetchpriority="high"
        decoding="async"
      />
    </picture>
  );
}
