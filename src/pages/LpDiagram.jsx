// ✏️ LP の図（2026-10-16 オーナー「無駄な文字を減らし、シンプルでわかりやすいデザインで伝わりやすく・リッチに」）。
//
// 文の代わりに、線の絵で伝える。絵の線は Instagram の動くイラスト（scripts/marketing/explainer/art.mjs）と同じ手描きの線＝
// ブランドの見た目を LP と SNS でそろえる。色はトークンだけ（線 --text・強調 --accent・面 --accent-soft / --fill）。
// 絵の中に文字は入れない（スマホで縮むと読めない）。名前は絵の下の HTML の文字。
//
//   DialogueDiagram … これまで（本 → 自分・読んで終わり）／Orime（本 ⇄ 自分・会話が続く）
//   StartTiles      … メモがまだなくても始められる 4 つの道（一言・取り込む・撮る・積読）

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

// 開いた本（中心 cx・下端 y）
function Book({ x, y, w = 64 }) {
  const h = w * 0.62;
  const m = x + w / 2;
  return (
    <g {...S}>
      <path d={`M${m} ${y - h + 6} C ${m - w * 0.18} ${y - h - 2}, ${x + 8} ${y - h - 2}, ${x} ${y - h + 4} L ${x} ${y} C ${x + 8} ${y - 6}, ${m - w * 0.18} ${y - 6}, ${m} ${y + 2} Z`} />
      <path d={`M${m} ${y - h + 6} C ${m + w * 0.18} ${y - h - 2}, ${x + w - 8} ${y - h - 2}, ${x + w} ${y - h + 4} L ${x + w} ${y} C ${x + w - 8} ${y - 6}, ${m + w * 0.18} ${y - 6}, ${m} ${y + 2}`} />
      <path d={`M${x + 9} ${y - h + 16} L ${m - 8} ${y - h + 18} M ${x + 9} ${y - h + 26} L ${m - 8} ${y - h + 28}`} opacity="0.55" />
      <path d={`M${m + 8} ${y - h + 18} L ${x + w - 9} ${y - h + 16} M ${m + 8} ${y - h + 28} L ${x + w - 9} ${y - h + 26}`} opacity="0.55" />
    </g>
  );
}

// 人（頭と肩・中心 cx・肩の下端 y）
function Person({ cx, y, s = 1 }) {
  return (
    <g {...S}>
      <circle cx={cx} cy={y - 50 * s} r={13 * s} />
      <path d={`M${cx - 26 * s} ${y} C ${cx - 26 * s} ${y - 26 * s}, ${cx + 26 * s} ${y - 26 * s}, ${cx + 26 * s} ${y}`} />
    </g>
  );
}

function Bubble({ x, y, w = 34, h = 24, mark = '…', tone = 'plain' }) {
  return (
    <g>
      <path
        d={`M${x + 6} ${y} H ${x + w - 6} Q ${x + w} ${y}, ${x + w} ${y + 6} V ${y + h - 6} Q ${x + w} ${y + h}, ${x + w - 6} ${y + h} H ${x + 14} L ${x + 6} ${y + h + 7} L ${x + 8} ${y + h} H ${x + 6} Q ${x} ${y + h}, ${x} ${y + h - 6} V ${y + 6} Q ${x} ${y}, ${x + 6} ${y} Z`}
        fill={tone === 'accent' ? 'var(--accent-soft)' : 'var(--surface)'}
        stroke={tone === 'accent' ? 'var(--accent)' : 'currentColor'}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill={tone === 'accent' ? 'var(--accent)' : 'currentColor'}>{mark}</text>
    </g>
  );
}

export function DialogueDiagram() {
  return (
    <div className="lp-dia" role="img" aria-label="これまでの読書は、本から自分への一方通行で、読み終えたら終わり。Orime では、本と自分のあいだで問いと答えが行き来する。">
      <figure className="lp-dia-card">
        <svg viewBox="0 0 240 150" aria-hidden="true" className="lp-dia-svg is-before">
          <Book x={22} y={112} w={70} />
          {/* 本 → 自分（一方通行・先は点線で消えていく） */}
          <path d="M104 86 H 150" {...S} />
          <path d="M142 78 L 152 86 L 142 94" {...S} />
          <Person cx={190} y={118} s={0.95} />
          <path d="M190 128 V 140" {...S} strokeDasharray="2 6" opacity="0.5" />
        </svg>
        <figcaption><span className="lp-dia-tag">これまで</span>読んで、終わり</figcaption>
      </figure>
      <figure className="lp-dia-card is-after">
        <svg viewBox="0 0 240 150" aria-hidden="true" className="lp-dia-svg">
          <Book x={22} y={112} w={70} />
          <Person cx={190} y={118} s={0.95} />
          {/* 本 ⇄ 自分（上は自分から本へ、下は本から自分へ・行き来が続く） */}
          <path d="M160 56 C 140 34, 108 34, 88 52" {...S} stroke="var(--accent)" />
          <path d="M96 44 L 87 53 L 99 56" {...S} stroke="var(--accent)" />
          <path d="M96 122 C 116 138, 146 138, 162 122" {...S} />
          <path d="M152 118 L 163 121 L 158 132" {...S} />
          <Bubble x={108} y={6} mark="？" tone="accent" />
          <Bubble x={140} y={92} w={30} h={20} mark="…" />
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
