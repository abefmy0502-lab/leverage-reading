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

// 本と自分の輪だけ（2026-11-11・LpWhy の図 1）。これまで／Orime の 2 枚はやめ、会話できる感じを 1 枚で。
export function DialogueLoop() {
  return (
    <figure className="lp-dia-card is-after lp-why-loop">
      <svg viewBox="0 0 240 120" aria-hidden="true" className="lp-dia-svg">
        <defs>
          <marker id="lp-why-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1 L 7 5 L 1 9" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        <Book x={24} y={84} w={72} />
        <Person cx={196} y={92} />
        <path d="M104 46 C 128 20, 164 20, 182 34" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" markerEnd="url(#lp-why-arrow)" />
        <path d="M180 98 C 160 116, 124 116, 104 96" fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" markerEnd="url(#lp-why-arrow)" />
        <circle cx="143" cy="24" r="4" fill="var(--accent)" />
        <circle cx="142" cy="111" r="4" fill="var(--accent)" />
      </svg>
      <figcaption><span className="lp-dia-tag is-accent">本と自分</span>残した一行が答えになり、答えが次の一行になる</figcaption>
    </figure>
  );
}

// 📚 3 つの聞き方（2026-11-11 オーナー「著者と会話するのは難しいが、Orime なら…複数の著者の考えを比べて、混ぜて相談できる」）。
//   1 冊に聞く（本 1 冊 ⇄ 自分）／何冊かを比べる（本 2 冊から自分へ 2 本の線）／本棚ぜんぶに聞く（並んだ本の列から自分へ 1 本の太い流れ）。
//   「著者と話せる」とは書かない（法務）＝絵も人ではなく本。
const ARROW = (id) => (
  <defs>
    <marker id={id} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1 1 L 7 5 L 1 9" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </marker>
  </defs>
);
const A = { fill: 'none', stroke: 'var(--accent)', strokeWidth: 1.75, strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke' };
export function AskModes({ items }) {
  const svgs = [
    (
      <svg viewBox="0 0 240 120" aria-hidden="true" className="lp-dia-svg" key="one">
        {ARROW('lp-ask-a1')}
        <Book x={28} y={86} w={68} />
        <Person cx={192} y={92} />
        <path d="M104 50 C 128 26, 160 26, 178 38" {...A} markerEnd="url(#lp-ask-a1)" />
        <path d="M176 96 C 156 112, 124 112, 104 94" {...A} markerEnd="url(#lp-ask-a1)" />
      </svg>
    ),
    (
      <svg viewBox="0 0 240 120" aria-hidden="true" className="lp-dia-svg" key="some">
        {ARROW('lp-ask-a2')}
        <Book x={14} y={56} w={54} />
        <Book x={14} y={112} w={54} />
        <Person cx={192} y={92} />
        <path d="M76 38 C 120 30, 150 44, 176 58" {...A} markerEnd="url(#lp-ask-a2)" />
        <path d="M76 100 C 120 108, 150 92, 176 72" {...A} markerEnd="url(#lp-ask-a2)" />
        {/* 比べる印: 2 本の線が合わさる所 */}
        <circle cx="150" cy="65" r="4" fill="var(--accent)" />
      </svg>
    ),
    (
      <svg viewBox="0 0 240 120" aria-hidden="true" className="lp-dia-svg" key="all">
        {ARROW('lp-ask-a3')}
        {/* 本棚: 立てた本の列 */}
        <g fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
          <path d="M14 100 H 100" />
          <rect x="18" y="52" width="12" height="48" rx="1.5" />
          <rect x="34" y="40" width="14" height="60" rx="1.5" />
          <rect x="52" y="48" width="11" height="52" rx="1.5" />
          <rect x="67" y="36" width="13" height="64" rx="1.5" />
          <rect x="84" y="46" width="12" height="54" rx="1.5" />
        </g>
        <Person cx={192} y={92} />
        <path d="M104 60 C 130 46, 154 52, 176 64" {...A} strokeWidth="2.5" markerEnd="url(#lp-ask-a3)" />
      </svg>
    ),
  ];
  return (
    <ol className="lp-ask">
      {items.map((it, i) => (
        <li key={it.title} className="lp-dia-card lp-ask-card">
          {svgs[i]}
          <p className="lp-ask-title">{it.title}</p>
          <p className="lp-ask-body">{it.body}</p>
        </li>
      ))}
    </ol>
  );
}

// 🧩 ほかにできること の 6 つの絵（2026-11-12 オーナー「わかりにくすぎる・実際の画面を使わずに抽象化」）。同じ 64×64 の枠・同じ線・強調は --accent 1 か所
const FEATURE_ICONS = {
  // 読書計画シート: 紙の上に 3 本の行、1 本だけ栗色（重点的に読む箇所）
  plan: (<g {...S}><rect x="14" y="8" width="36" height="48" rx="4" /><path d="M22 20 H 42" /><path d="M22 30 H 42" stroke="var(--accent)" strokeWidth="2.5" /><path d="M22 40 H 36" /></g>),
  // AI 選書: 並んだ本 3 冊、1 冊だけ栗色で少し前に
  advisor: (<g {...S}><rect x="10" y="20" width="12" height="36" rx="1.5" /><rect x="26" y="12" width="12" height="44" rx="1.5" stroke="var(--accent)" /><rect x="42" y="20" width="12" height="36" rx="1.5" /></g>),
  // 行動: チェックつきの丸と 2 本の行
  action: (<g {...S}><circle cx="18" cy="24" r="7" stroke="var(--accent)" /><path d="M15 24 L 17.5 26.5 L 21.5 21.5" stroke="var(--accent)" /><path d="M32 24 H 54" /><circle cx="18" cy="42" r="7" /><path d="M32 42 H 50" /></g>),
  // 集中モード: 輪と針
  focus: (<g {...S}><circle cx="32" cy="34" r="20" /><path d="M32 34 V 18" stroke="var(--accent)" /><path d="M32 34 L 42 40" /><path d="M26 8 H 38" /></g>),
  // 一文を画像で: 写真の枠と引用の線
  share: (<g {...S}><rect x="10" y="12" width="44" height="40" rx="4" /><path d="M10 44 L 24 32 L 34 40 L 42 34 L 54 44" /><path d="M20 20 H 40" stroke="var(--accent)" /></g>),
  // 記録の基本: 本棚
  library: (<g {...S}><path d="M8 56 H 56" /><rect x="12" y="24" width="10" height="32" rx="1.5" /><rect x="26" y="16" width="12" height="40" rx="1.5" /><rect x="42" y="28" width="10" height="28" rx="1.5" stroke="var(--accent)" /></g>),
};
// 有料プランの 2 つのイメージの絵（2026-11-12 オーナー「イメージイラストみたいのをつけたい」）。240×140・同じ線・強調は --accent
const FEATURE_ART = {
  // 読書計画シート: 開いた本の右に 1 枚の紙。紙の中の行のうち 2 本が栗色（重点的に読む箇所）、下の 2 本は薄い（流し読み）。本と紙を矢印でつなぐ
  plan: (
    <g {...S}>
      <Book x={16} y={104} w={84} />
      <path d="M108 70 H 132" stroke="var(--accent)" />
      <path d="M126 64 L 132 70 L 126 76" stroke="var(--accent)" />
      <rect x="144" y="28" width="80" height="96" rx="6" />
      <path d="M158 46 H 210" stroke="var(--accent)" strokeWidth="2.5" />
      <path d="M158 60 H 202" stroke="var(--accent)" strokeWidth="2.5" />
      <path d="M158 78 H 206" opacity="0.5" />
      <path d="M158 92 H 196" opacity="0.5" />
      <path d="M158 106 H 184" opacity="0.5" />
    </g>
  ),
  // AI 選書: 本棚の列から 3 冊が選ばれて、人の前に並ぶ（1 冊目だけ栗色＝読む順番の最初）
  advisor: (
    <g {...S}>
      <path d="M16 112 H 108" />
      <rect x="20" y="64" width="12" height="48" rx="1.5" opacity="0.5" />
      <rect x="36" y="52" width="14" height="60" rx="1.5" opacity="0.5" />
      <rect x="54" y="60" width="11" height="52" rx="1.5" opacity="0.5" />
      <rect x="69" y="48" width="13" height="64" rx="1.5" opacity="0.5" />
      <rect x="86" y="58" width="12" height="54" rx="1.5" opacity="0.5" />
      <path d="M116 84 C 130 84, 134 72, 146 72" stroke="var(--accent)" />
      <path d="M140 66 L 146 72 L 140 78" stroke="var(--accent)" />
      <rect x="156" y="40" width="16" height="48" rx="2" stroke="var(--accent)" strokeWidth="2.25" />
      <rect x="178" y="48" width="16" height="40" rx="2" />
      <rect x="200" y="56" width="16" height="32" rx="2" />
      <text x="164" y="104" fontSize="10" textAnchor="middle" fill="var(--accent)" stroke="none" fontWeight="600">1</text>
      <text x="186" y="104" fontSize="10" textAnchor="middle" fill="currentColor" stroke="none" opacity="0.6">2</text>
      <text x="208" y="104" fontSize="10" textAnchor="middle" fill="currentColor" stroke="none" opacity="0.6">3</text>
    </g>
  ),
};
export function FeatureTiles({ items }) {
  const big = items.filter((it) => FEATURE_ART[it.key]);
  const small = items.filter((it) => !FEATURE_ART[it.key]);
  return (
    <>
      <ul className="lp-feat-big">
        {big.map((it) => (
          <li key={it.key} className="lp-feat-big-item">
            <svg className="lp-feat-art" viewBox="0 0 240 140" aria-hidden="true">{FEATURE_ART[it.key]}</svg>
            <h3 className="lp-feat-title">{it.title}{it.plan && <span className="lp-more-plan">有料プラン</span>}</h3>
            <p className="lp-feat-body">{it.body}</p>
          </li>
        ))}
      </ul>
      <FeatureList items={small} />
    </>
  );
}
function FeatureList({ items }) {
  return (
    <ul className="lp-feat">
      {items.map((it) => (
        <li key={it.key} className="lp-feat-item">
          <svg className="lp-feat-svg" viewBox="0 0 64 64" aria-hidden="true">{FEATURE_ICONS[it.key]}</svg>
          <div className="lp-feat-text">
            <h3 className="lp-feat-title">{it.title}{it.plan && <span className="lp-more-plan">有料プラン</span>}</h3>
            <p className="lp-feat-body">{it.body}</p>
          </div>
        </li>
      ))}
    </ul>
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
