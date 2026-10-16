// ✏️ LP の図（2026-10-16 オーナー「無駄な文字を減らし、シンプルでわかりやすいデザインで伝わりやすく・リッチに」）。
//
// 文の代わりに、線の絵で伝える。細い幾何の線（太さ 1.75・画面の大きさで変わらない）で、細部まで整える。色はトークンだけ（線 --text・強調 --accent・面 --accent-soft / --fill）。
// 絵の中に文字は入れない（スマホで縮むと読めない）。名前は絵の下の HTML の文字。
//
//   DialogueDiagram … これまで（本 → 自分の線が途中で消える）／Orime（本と自分を 1 つの輪でつなぐ）
//   StartTiles      … メモがまだなくても始められる 4 つの道（一言・取り込む・撮る・積読）

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' };

// 開いた本（左端 x・下端 y・幅 w）。幾何の線でそろえる（手描き風にしない＝細部まで整える）。
function Book({ x, y, w = 64 }) {
  const h = w * 0.6;
  const m = x + w / 2;
  return (
    <g {...S}>
      <path d={`M${m} ${y - h + 5} Q ${x + w * 0.22} ${y - h - 3}, ${x} ${y - h + 3} V ${y} Q ${x + w * 0.22} ${y - 6}, ${m} ${y + 2} Z`} />
      <path d={`M${m} ${y - h + 5} Q ${x + w * 0.78} ${y - h - 3}, ${x + w} ${y - h + 3} V ${y} Q ${x + w * 0.78} ${y - 6}, ${m} ${y + 2}`} />
    </g>
  );
}

// 人（頭と肩・中心 cx・肩の下端 y）
function Person({ cx, y }) {
  return (
    <g {...S}>
      <circle cx={cx} cy={y - 44} r="11" />
      <path d={`M${cx - 22} ${y} Q ${cx - 22} ${y - 24}, ${cx} ${y - 24} Q ${cx + 22} ${y - 24}, ${cx + 22} ${y}`} />
    </g>
  );
}

// これまで: 本 → 自分 の 1 本の線が、自分に届く前に消える（読んで終わり）。
// Orime: 本と自分を 1 つの閉じた輪でつなぐ（問いと答えが回り続ける）。輪の上の 2 つの点＝行き来する言葉。
export function DialogueDiagram() {
  return (
    <div className="lp-dia" role="img" aria-label="これまでの読書は、本から自分への線が途中で消える一方通行。Orime では、本と自分が 1 つの輪でつながり、問いと答えが行き来する。">
      <figure className="lp-dia-card">
        <svg viewBox="0 0 240 120" aria-hidden="true" className="lp-dia-svg is-before">
          <Book x={24} y={84} w={72} />
          {/* 本からの線は、自分に届く前に止まる（読んで終わり） */}
          <path d="M96 66 H 138" {...S} />
          <Person cx={196} y={92} />
        </svg>
        <figcaption><span className="lp-dia-tag">これまで</span>読んで、終わり</figcaption>
      </figure>
      <figure className="lp-dia-card is-after">
        <svg viewBox="0 0 240 120" aria-hidden="true" className="lp-dia-svg">
          <defs>
            <marker id="lp-dia-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1 L 7 5 L 1 9" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          <Book x={24} y={84} w={72} />
          <Person cx={196} y={92} />
          {/* 1 つの輪（上は本 → 自分、下は自分 → 本）。矢じりは線の向きに沿う */}
          <path d="M104 46 C 128 20, 164 20, 182 34" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" markerEnd="url(#lp-dia-arrow)" />
          <path d="M180 98 C 160 116, 124 116, 104 96" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" markerEnd="url(#lp-dia-arrow)" />
          <circle cx="143" cy="24" r="4" fill="var(--accent)" />
          <circle cx="142" cy="111" r="4" fill="var(--accent)" />
        </svg>
        <figcaption><span className="lp-dia-tag is-accent">Orime</span>会話が、続く</figcaption>
      </figure>
    </div>
  );
}

// 始め方の 4 つの小さな絵（同じ線の太さ・同じ大きさの枠）
const START_ICONS = {
  memo: (
    <g {...S}>
      <rect x="10" y="8" width="36" height="44" rx="4" />
      <path d="M18 22 H 38 M 18 30 H 34 M 18 38 H 30" opacity="0.55" />
      <path d="M44 40 L 56 28 L 60 32 L 48 44 L 43 45 Z" stroke="var(--accent)" />
    </g>
  ),
  import: (
    <g {...S}>
      <rect x="6" y="14" width="22" height="32" rx="3" />
      <rect x="38" y="14" width="22" height="32" rx="3" />
      <path d="M22 30 H 44" stroke="var(--accent)" />
      <path d="M39 25 L 45 30 L 39 35" stroke="var(--accent)" />
    </g>
  ),
  photo: (
    <g {...S}>
      <path d="M8 18 H 18 L 22 12 H 42 L 46 18 H 56 V 50 H 8 Z" />
      <circle cx="32" cy="33" r="9" stroke="var(--accent)" />
    </g>
  ),
  stack: (
    <g {...S}>
      <rect x="10" y="40" width="44" height="10" rx="2" />
      <rect x="14" y="28" width="38" height="10" rx="2" />
      <rect x="12" y="16" width="40" height="10" rx="2" stroke="var(--accent)" />
    </g>
  ),
};

export function StartTiles({ items }) {
  return (
    <ul className="lp-tiles">
      {items.map((t) => (
        <li key={t.icon} className="lp-tile">
          <svg viewBox="0 0 64 60" aria-hidden="true" className="lp-tile-svg">{START_ICONS[t.icon]}</svg>
          <span className="lp-tile-label">{t.label}</span>
        </li>
      ))}
    </ul>
  );
}

// 書いたメモの扱い（3 つ・線の絵＋短い言い切り）
const TRUST_ICONS = {
  learn: (
    <g {...S}>
      <path d="M32 8 L 52 16 V 30 C 52 42, 43 50, 32 54 C 21 50, 12 42, 12 30 V 16 Z" />
      <path d="M23 31 L 30 38 L 42 24" stroke="var(--accent)" />
    </g>
  ),
  send: (
    <g {...S}>
      <path d="M10 30 L 54 12 L 40 52 L 30 36 Z" />
      <path d="M30 36 L 54 12" stroke="var(--accent)" />
    </g>
  ),
  export: (
    <g {...S}>
      <path d="M14 38 V 50 H 50 V 38" />
      <path d="M32 10 V 38" stroke="var(--accent)" />
      <path d="M22 28 L 32 38 L 42 28" stroke="var(--accent)" />
    </g>
  ),
};

export function TrustRow({ items }) {
  return (
    <ul className="lp-trust-row">
      {items.map((t) => (
        <li key={t.icon}>
          <svg viewBox="0 0 64 60" aria-hidden="true" className="lp-tile-svg">{TRUST_ICONS[t.icon]}</svg>
          <span>{t.label}</span>
        </li>
      ))}
    </ul>
  );
}
