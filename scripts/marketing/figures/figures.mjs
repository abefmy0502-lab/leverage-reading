// 🖼 X・note・Threads に添える「図」の中身（2026-11-15 オーナー「文字だけだと伝わりにくい・図やイラストを」）。
//
// 図は AI に描かせず、決まった型（HTML）に文字を流し込んで撮る＝日本語が崩れない・毎回同じ見た目・必ず orime のロゴ。
// イラスト（人や物の絵）が要るときだけ、運営の道具 ops_image（gpt-image-1）で「文字なし」の絵を作り、図の `art` に URL を入れる。
// 言葉は CLAUDE.md の GLOSSARY と company/brand-guardrails.md（figures.test.js が使わない言葉を確かめる）。
//
// 1 枚 = { name, size, type, ... }
//   size: 'x'（1600×900・X と Threads）／ 'note'（1280×670・note の見出し画像）／ 'square'（1080×1080・Instagram）／ 'xheader'（1500×500・X のヘッダー）
//   type:
//     'compare' { title?, before: { label, text, sub? }, after: { label, text, sub? } }   これまで → これから
//     'flow'    { title, steps: [{ head, text }]（2〜4） }                                 順番のある流れ（番号は順番があるときだけ）
//     'quote'   { text, sub? }                                                            大きな一文（明朝）
//     'brand'   { text, sub? }                                                            ロゴ（印と文字の縦組み）＋一文（ヘッダー向け）
//     'points'  { title, points: [string]（2〜4） }                                       言いたいことを並べる（番号なし）
//   art?: 画像の URL か public/ からのパス（右か下に置く・無くてもよい）
//   footer?: 右下のロゴの横の 1 行（既定「読んだ本と、会話しよう。」）

export const FIGURES = [
  {
    name: 'launch-compare',
    size: 'x',
    type: 'compare',
    title: '読書を、受け身から会話へ。',
    before: { label: 'これまで', text: '読んで、閉じて、終わり', sub: '良い本だったのに、思い出せない' },
    after: { label: 'これから', text: '読んだ本と、会話する', sub: '困ったときに、自分のメモから答えが返る' },
  },
  {
    name: 'launch-flow',
    size: 'x',
    type: 'flow',
    title: 'orime でできること',
    steps: [
      { head: '一言残す', text: '心に響いた一行を、メモに' },
      { head: '相談する', text: '困ったら、自分のメモから答えが返る' },
      { head: '一つ決める', text: '明日やることを、行動リストへ' },
    ],
  },
  {
    name: 'note06-header',
    size: 'note',
    type: 'quote',
    text: 'orime を作った理由',
    sub: '読書を、受け身から会話へ。',
  },
  {
    name: 'x-header',
    size: 'xheader',
    type: 'quote',
    text: '読んだ本と、会話しよう。',
    sub: '読書を、受け身から会話へ。',
    footer: '',
  },
  {
    name: 'note-profile-header',
    size: 'note',
    type: 'quote',
    text: '読書を、受け身から会話へ。',
    sub: '読書アプリ「orime」を作っている人の記録',
  },
  {
    name: 'note04-header',
    size: 'note',
    type: 'quote',
    text: '読書が、受け身から会話に変わった話',
    sub: '読んで閉じて終わりだった読書を、変えたこと',
  },
  {
    name: 'x-header-brand',
    size: 'xheader',
    type: 'brand',
    text: '読んだ本と、会話しよう。',
    sub: '読書メモから、AI が本の語り口で答える読書アプリ',
  },
  {
    name: 'note-header-brand',
    size: 'noteprofile',
    type: 'brand',
    text: '読書を、受け身から会話へ。',
    sub: '読書アプリ「orime」を作っている人の記録',
  },
  {
    name: 'free-plan-points',
    size: 'x',
    type: 'points',
    title: '無料プラン（ずっと無料）で使えること',
    points: ['本・メモ・記録・集中モード・写真で共有', 'AI の答え 毎月 約 3 回（はじめの 2 か月は 約 13 回）', 'メモがゼロでも、今日から始められる'],
  },
];

export const SIZES = {
  x: { width: 1600, height: 900 },
  note: { width: 1280, height: 670 },
  square: { width: 1080, height: 1080 },
  noteprofile: { width: 2560, height: 1340 }, // note のクリエイターページの上（取り込みは 1280×670 の形・表示は真ん中の横長の帯だけ＝中身は高さ 3 割に収める）
  xheader: { width: 1500, height: 500 }, // X のヘッダー（左下はアイコンが重なるので、文字は右寄せ）
};

// 使わない言葉（brand-guardrails・x-posts §0）
export const BANNED = ['忘れない', '必ず', 'No.1', '先着', '通常価格', '今だけ', '残りわずか', 'AI 要約', '著者と話せる', '成果が出る', '行動が変わる', '習慣になる', '無料トライアル', 'お試し'];

export function textsOf(fig) {
  const out = [fig.title, fig.text, fig.sub, fig.footer];
  if (fig.before) out.push(fig.before.label, fig.before.text, fig.before.sub);
  if (fig.after) out.push(fig.after.label, fig.after.text, fig.after.sub);
  for (const s of fig.steps || []) out.push(s.head, s.text);
  for (const p of fig.points || []) out.push(p);
  return out.filter(Boolean);
}

export function checkFigure(fig) {
  const errs = [];
  if (!fig.name || !/^[a-z0-9-]+$/.test(fig.name)) errs.push('name は英小文字・数字・- だけ');
  if (!SIZES[fig.size]) errs.push(`size が違う: ${fig.size}`);
  if (!['compare', 'flow', 'quote', 'points', 'brand'].includes(fig.type)) errs.push(`type が違う: ${fig.type}`);
  if (fig.type === 'flow' && !(fig.steps?.length >= 2 && fig.steps.length <= 4)) errs.push('flow の steps は 2〜4');
  if (fig.type === 'points' && !(fig.points?.length >= 2 && fig.points.length <= 4)) errs.push('points は 2〜4');
  for (const t of textsOf(fig)) {
    for (const w of BANNED) if (t.includes(w)) errs.push(`使わない言葉「${w}」: ${t}`);
    if (t.length > 40) errs.push(`長すぎる（40 字まで）: ${t}`);
  }
  return errs;
}
