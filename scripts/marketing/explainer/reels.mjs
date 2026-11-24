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

import { DEFINITION } from '../clarity.mjs';

// orime とは何か（どの動画も同じ一言・2026-11-22 オーナー「初めて知る人でも分かるように」）
const DEFINE_SCENE = {
  sec: 4.8,
  say: `${DEFINITION}。`,
  items: [
    { type: 'text', text: 'orime は', y: 300, size: 80, at: 0.1 },
    { type: 'box', text: '読んだ本のメモから', y: 430, size: 96, at: 0.4 },
    { type: 'text', text: '答えてくれる読書アプリ', y: 580, size: 84, at: 0.8 },
    { type: 'art', name: 'personBook', x: 400, y: 760, w: 260, at: 1.2, dur: 1.4 },
  ],
};

export const REELS = [
  // ── 2026-11-22 オーナー「実際の画面を映さなくても、概念的に orime の効果を示せるものも」＝ビフォー → アフターの概念の動画（SNS 戦略 §3-2・§3-4）。
  {
    name: 'concept-consult',
    title: '読んだのに残らない → 読んだ本が相談相手に',
    caption: [
      'これまでは、読み終えた本を閉じたら終わりにしていた。',
      '困った日は、ネットの一般論で迷っていた。',
      '',
      'orime は、読んだ本のメモから答える読書アプリ。',
      '読みながら一行メモを残しておけば、困った日に、その本に相談できる。',
      '答えのもとは、自分が残したメモ。明日やることが 1 つ決まる。',
      '',
      '無料プラン（ずっと無料）で試せます。プロフィールのリンクから。',
    ].join('\n'),
    hashtags: ['#読書', '#読書メモ', '#読書術', '#ビジネス書', '#orime'],
    scenes: [
      // 冒頭は困っていること（2026-11-22 オーナー）: 1 行と、大きな 1 枚のイラスト
      {
        sec: 4.8,
        items: [
          { type: 'box', text: '困ったときに', y: 290, size: 96, at: 0.1 },
          { type: 'text', text: '読んだ本が、出てこない。', y: 440, size: 76, at: 0.5 },
          { type: 'art', name: 'problemForget', x: 200, y: 600, w: 680, at: 0.8, dur: 1.8 },
        ],
      },
      {
        sec: 4.6,
        items: [
          { type: 'text', text: 'これまでは', y: 300, size: 72, at: 0.1 },
          { type: 'box', text: '閉じたら終わり', y: 420, size: 104, at: 0.4 },
          { type: 'art', name: 'bookOpen', x: 60, y: 760, w: 360, at: 0.9, dur: 1.0 },
          { type: 'art', name: 'arrow', x: 435, y: 830, w: 150, at: 1.8, dur: 0.5 },
          { type: 'art', name: 'shelf', x: 610, y: 700, w: 320, at: 2.2, dur: 1.2 },
          { type: 'sub', text: '読み終えた日が、\nゴールになっていた。', y: 1220, at: 3.0 },
        ],
      },
      DEFINE_SCENE,
      {
        sec: 5.6,
        items: [
          { type: 'text', text: '使い方', y: 300, size: 72, at: 0.1 },
          { type: 'box', text: '① 読みながら一行メモ', y: 420, size: 88, at: 0.4 },
          { type: 'art', name: 'pageHighlight', x: 90, y: 600, w: 280, at: 0.9, dur: 1.0 },
          { type: 'box', text: '② 困った日に本に相談', y: 980, size: 88, at: 2.2 },
          { type: 'art', name: 'talk', x: 500, y: 620, w: 380, at: 2.6, dur: 1.2 },
        ],
      },
      {
        sec: 5.4,
        items: [
          { type: 'text', text: 'これからは', y: 300, size: 72, at: 0.1 },
          { type: 'box', text: '自分のメモに聞く', y: 420, size: 104, at: 0.4 },
          { type: 'art', name: 'memoStack', x: 60, y: 760, w: 320, at: 1.0, dur: 1.2 },
          { type: 'art', name: 'arrow', x: 395, y: 900, w: 110, at: 2.0, dur: 0.5 },
          { type: 'art', name: 'checklist', x: 540, y: 760, w: 340, at: 2.4, dur: 1.2 },
          { type: 'sub', text: '線を引いた一行から、\n明日やることが 1 つ決まる。', y: 1220, at: 3.2 },
        ],
      },
      {
        sec: 3.6,
        items: [
          { type: 'box', text: '無料プランで', y: 520, size: 104, at: 0.1 },
          { type: 'text', text: '今日から試せます。', y: 680, size: 88, at: 0.5 },
        ],
      },
      { sec: 3.4, items: [{ type: 'end' }] },
    ],
  },
  {
    name: 'concept-goal',
    title: '何から読めばいいか分からない → 1 年後から逆算した読む順番',
    caption: [
      '成長したい。でも、何から読めばいいか分からない。',
      '本選びが、行き当たりばったりになっていた。',
      '',
      '読書メモのアプリ orime では、1 年後の目標を書いて「達成するには？」に答えると、',
      '必要なこと・区切りごとの道のり・読む本の順番ができる。',
      'これからは、今月読む 1 冊が決まっている。',
      '',
      '無料プラン（ずっと無料）で試せます。プロフィールのリンクから。',
    ].join('\n'),
    hashtags: ['#読書', '#目標設定', '#自己成長', '#ビジネス書', '#orime'],
    scenes: [
      {
        sec: 4.8,
        items: [
          { type: 'text', text: '成長したい。でも', y: 290, size: 72, at: 0.1 },
          { type: 'box', text: '何から読む？', y: 400, size: 104, at: 0.4 },
          { type: 'art', name: 'problemWhichBook', x: 200, y: 600, w: 680, at: 0.8, dur: 1.8 },
        ],
      },
      DEFINE_SCENE,
      {
        sec: 5.2,
        items: [
          { type: 'text', text: '目標から、読む本も決められる', y: 300, size: 64, at: 0.1 },
          { type: 'box', text: '① 1 年後の目標を書く', y: 430, size: 84, at: 0.6 },
          { type: 'box', text: '② AI の質問に答える', y: 600, size: 84, at: 1.6 },
        ],
      },
      {
        sec: 5.4,
        items: [
          { type: 'text', text: 'すると', y: 300, size: 72, at: 0.1 },
          { type: 'box', text: '道のりと読む本の順番', y: 420, size: 92, at: 0.4 },
          { type: 'art', name: 'road', x: 90, y: 680, w: 760, at: 0.9, dur: 2.0 },
          { type: 'sub', text: '道のりに合わせて、\n読む本が並ぶ。', y: 1230, at: 3.0 },
        ],
      },
      {
        sec: 4.6,
        items: [
          { type: 'text', text: 'これからは', y: 300, size: 72, at: 0.1 },
          { type: 'box', text: '今月読む 1 冊が', y: 420, size: 104, at: 0.4 },
          { type: 'text', text: '決まっている。', y: 580, size: 92, at: 0.8 },
          { type: 'art', name: 'personBook', x: 380, y: 720, w: 300, at: 1.2, dur: 1.4 },
        ],
      },
      {
        sec: 3.6,
        items: [
          { type: 'box', text: '無料プランで', y: 520, size: 104, at: 0.1 },
          { type: 'text', text: '今日から試せます。', y: 680, size: 88, at: 0.5 },
        ],
      },
      { sec: 3.4, items: [{ type: 'end' }] },
    ],
  },
  {
    name: 'concept-focus',
    title: 'スマホで 1 日が終わる → 1 日 15 分、本だけの時間',
    caption: [
      '読まなきゃ、と思いながら、スマホで 1 日が終わっていた。',
      '',
      '読書メモのアプリ orime の「読む」は、時間を決めて、表紙と残り時間だけの画面で読む機能。',
      'これからは、まず 15 分だけ。1 日 15 分で、1 か月に 7 時間半。',
      '',
      '無料プラン（ずっと無料）で試せます。プロフィールのリンクから。',
    ].join('\n'),
    hashtags: ['#読書', '#読書習慣', '#積読', '#朝活', '#orime'],
    scenes: [
      {
        sec: 4.6,
        items: [
          { type: 'text', text: '読まなきゃ、と思いながら', y: 290, size: 68, at: 0.1 },
          { type: 'box', text: 'スマホで 1 日終了', y: 400, size: 96, at: 0.4 },
          { type: 'art', name: 'problemPhone', x: 200, y: 600, w: 680, at: 0.8, dur: 1.8 },
        ],
      },
      DEFINE_SCENE,
      {
        sec: 5.4,
        items: [
          { type: 'text', text: '本を読む時間も、つくれる', y: 300, size: 64, at: 0.1 },
          { type: 'box', text: '「読む」', y: 420, size: 104, at: 0.4 },
          { type: 'art', name: 'clock', x: 90, y: 700, w: 330, at: 0.9, dur: 1.2 },
          { type: 'art', name: 'bookOpen', x: 500, y: 780, w: 380, at: 1.8, dur: 1.0 },
          { type: 'sub', text: '時間を決めて、\n表紙と残り時間だけの画面で読む。', y: 1230, at: 2.8 },
        ],
      },
      {
        sec: 5.0,
        items: [
          { type: 'text', text: 'これからは', y: 300, size: 72, at: 0.1 },
          { type: 'box', text: 'まず 15 分だけ', y: 420, size: 104, at: 0.4 },
          { type: 'box', text: '1 か月で 7 時間半', y: 640, size: 96, at: 1.4 },
          { type: 'art', name: 'shelf', x: 360, y: 820, w: 340, at: 1.8, dur: 1.2 },
        ],
      },
      {
        sec: 3.6,
        items: [
          { type: 'box', text: '無料プランで', y: 520, size: 104, at: 0.1 },
          { type: 'text', text: '今日から試せます。', y: 680, size: 88, at: 0.5 },
        ],
      },
      { sec: 3.4, items: [{ type: 'end' }] },
    ],
  },
  {
    name: 'read-change-3',
    title: '読んでも変わらない人の特徴 3選',
    caption: [
      '本を読んでも、何も変わらない。',
      'それは、読み方より「読んだあと」の問題かもしれません。',
      '',
      '読書を、受け身から会話へ。',
      '読んだ本の一文をメモすると、困ったときにそのメモから答えが返ってきます。',
    ].join('\n'),
    hashtags: ['#読書', '#読書記録', '#読書好きな人と繋がりたい', '#読書術', '#本のある暮らし', '#orime'],
    scenes: [
      {
        sec: 3.2,
        items: [
          { type: 'box', text: '本を読んでも', y: 330, size: 104, at: 0.1 },
          { type: 'text', text: '何も変わらない人の', y: 490, size: 92, at: 0.5 },
          { type: 'box', text: '特徴 3選', y: 620, size: 104, at: 0.9 },
          { type: 'art', name: 'personBook', x: 350, y: 820, w: 370, at: 0.6, dur: 1.6 },
        ],
      },
      {
        sec: 5.6,
        items: [
          { type: 'tabs', label: '変わらない人の特徴 3選', active: 1 },
          { type: 'box', text: '読んで終わり', y: 400, size: 112, at: 0.15 },
          { type: 'text', text: 'になっている。', y: 560, size: 84, at: 0.6 },
          { type: 'art', name: 'bookOpen', x: 64, y: 850, w: 346, at: 1.0, dur: 1.0 },
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

export const END_LINE = '読んだ本と、会話できる。'; // 2026-11-22 訴求の軸（lp-axis）に合わせた
export const END_STORE = 'App Store で「orime」';

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
