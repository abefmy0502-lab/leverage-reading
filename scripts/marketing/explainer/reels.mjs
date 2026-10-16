// 🎬 動くイラストの動画（explainer）の台本。
//
// 参考（2026-10-16 オーナーの見本）: 白い地に太字の箱・上に「〇〇 3選」と 1 2 3 の番号・線の絵が描かれていく縦の動画。
// アプリの画面は映さない（新しい読書のあり方を伝える回）。画面を映さないので「画面は見本です。…」の注記は要らない。
// 言葉は CLAUDE.md の GLOSSARY と company/brand-guardrails.md（`npm run mkt:explainer -- --check` と reels.test.js が確かめる）。
//
// 1 本 = { name, title（ファイル用）, caption（説明欄の下書き）, hashtags, scenes }
// scene = { sec（長さ）, items }。items は出る順に:
//   { type: 'tabs', label, active }               上の帯（「〇〇 3選」と 1 2 3・active の番号が塗られる）
//   { type: 'box', text, y, x?, size?, at }       濃い箱に白い太字（左から開く）
//   { type: 'text', text, y, x?, size?, at }      太字の文（下から出る）
//   { type: 'art', name, x, y, w, at, dur? }      線の絵（art.mjs）が描かれていく
//   { type: 'sub', text, y, at }                  栗色の小さめの一行
//   { type: 'end' }                               終わりのカード（ロゴ・「読んだ本と、会話しよう。」・App Store）
// 座標は 1080×1920。Instagram の画面の上（〜240）・下（1400〜）・右端（940〜）は字や印が重なるので、大事なものを置かない。

export const REELS = [
  {
    name: 'read-change-3',
    title: '読んでも変わらない人の特徴 3選',
    caption: [
      '本を読んでも、何も変わらない。',
      'それは、読み方より「読んだあと」の問題かもしれません。',
      '',
      '読書を、受け身から会話へ。',
      '読んだ本に一言ずつ残すと、困ったときにそのメモから答えが返ってきます。',
    ].join('\n'),
    hashtags: ['#読書', '#読書記録', '#読書好きな人と繋がりたい', '#読書術', '#本のある暮らし', '#Orime'],
    scenes: [
      {
        sec: 3.2,
        items: [
          { type: 'box', text: '本を読んでも', y: 330, size: 104, at: 0.1 },
          { type: 'text', text: '何も変わらない人の', y: 490, size: 92, at: 0.5 },
          { type: 'box', text: '特徴 3選', y: 620, size: 104, at: 0.9 },
          { type: 'art', name: 'personBook', x: 330, y: 820, w: 400, at: 0.6, dur: 1.6 },
        ],
      },
      {
        sec: 5.6,
        items: [
          { type: 'tabs', label: '変わらない人の特徴 3選', active: 1 },
          { type: 'box', text: '読んで終わり', y: 400, size: 112, at: 0.15 },
          { type: 'text', text: 'になっている。', y: 560, size: 84, at: 0.6 },
          { type: 'art', name: 'bookOpen', x: 50, y: 850, w: 360, at: 1.0, dur: 1.0 },
          { type: 'art', name: 'arrow', x: 425, y: 920, w: 160, at: 1.9, dur: 0.6 },
          { type: 'art', name: 'shelf', x: 600, y: 800, w: 340, at: 2.4, dur: 1.2 },
          { type: 'sub', text: '読み終えた日が、\nゴールになっている。', y: 1230, at: 3.4 },
        ],
      },
      {
        sec: 5.6,
        items: [
          { type: 'tabs', label: '変わらない人の特徴 3選', active: 2 },
          { type: 'box', text: '線を引くだけ', y: 400, size: 112, at: 0.15 },
          { type: 'text', text: 'で、自分の言葉がない。', y: 560, size: 84, at: 0.6 },
          { type: 'art', name: 'pageHighlight', x: 90, y: 760, w: 330, at: 1.0, dur: 1.2 },
          { type: 'art', name: 'memoEmpty', x: 580, y: 800, w: 300, at: 2.0, dur: 1.0 },
          { type: 'sub', text: '引いた線は、\nあとで読み返さない。', y: 1230, at: 3.2 },
        ],
      },
      {
        sec: 5.6,
        items: [
          { type: 'tabs', label: '変わらない人の特徴 3選', active: 3 },
          { type: 'box', text: '困ったときに', y: 400, size: 112, at: 0.15 },
          { type: 'text', text: '読んだ本を思い出せない。', y: 560, size: 84, at: 0.6 },
          { type: 'art', name: 'personThink', x: 110, y: 740, w: 250, at: 1.0, dur: 1.4 },
          { type: 'art', name: 'booksFaded', x: 450, y: 900, w: 440, at: 2.0, dur: 1.2 },
          { type: 'sub', text: 'せっかく読んだのに、\n手元に残っていない。', y: 1250, at: 3.2 },
        ],
      },
      {
        sec: 6.4,
        items: [
          { type: 'text', text: '読書を、', y: 360, size: 96, at: 0.1 },
          { type: 'box', text: '受け身から会話へ。', y: 490, size: 96, at: 0.5 },
          { type: 'art', name: 'memoStack', x: 60, y: 780, w: 320, at: 1.2, dur: 1.2 },
          { type: 'art', name: 'arrow', x: 395, y: 920, w: 110, at: 2.2, dur: 0.5 },
          { type: 'art', name: 'talk', x: 515, y: 800, w: 420, at: 2.6, dur: 1.2 },
          { type: 'sub', text: '一言ずつのメモが、\n自分だけの相談相手になる。', y: 1230, at: 3.6 },
        ],
      },
      { sec: 3.4, items: [{ type: 'end' }] },
    ],
  },
];

export const END_LINE = '読んだ本と、会話しよう。';
export const END_STORE = 'App Store で「Orime」';

// 台本の中の、画面に出るすべての文（確かめる用）
export function reelTexts(reel) {
  const out = [reel.title, reel.caption, ...reel.hashtags];
  for (const s of reel.scenes) for (const it of s.items) {
    if (it.text) out.push(it.text);
    if (it.label) out.push(it.label);
  }
  return out;
}

export const reelDuration = (reel) => reel.scenes.reduce((n, s) => n + s.sec, 0);
