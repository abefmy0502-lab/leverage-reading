// 🎬 縦動画の台本（record-demo.mjs が順に操作して録画する）。
//
// 1 本 = { name, title, url, steps }。
//   name  … 出力のフォルダ名（英数字と -）
//   title … 最初の 2 秒に大きく出す題（\n で改行）
//   url   … お試しモードのシナリオ（例 '/'・'/?demo=fewmemos'）
//   theme … 'light'（既定）か 'dark'
//   steps … 上から順に。1 つの段に複数書いたときは say → goto → waitFor → tap → fill → type → upload → scroll → eval → hold の順
//           （押してから待つときは段を分ける）。
//
// 段に書けること（セレクタはアプリの中＝iframe の中で探す・scripts/ui-shots.mjs と同じ書き方）:
//   say: '字幕'            … 次の say まで画面の上に出す（null で消す）。.srt にも入る
//   tap: 'セレクタ'         … 押す（押した場所に丸い印が出る）
//   type: ['セレクタ', '文'] … 1 字ずつ打つ（人が打つ速さ）
//   fill: ['セレクタ', '文'] … 一度に入れる
//   waitFor: 'セレクタ'     … 出るまで待つ（timeout: ミリ秒・既定 20000）
//   scrollTo: 'セレクタ'    … その要素までなめらかに送る（block: 'start'|'center'|'end'・既定 center）
//   scrollBy: 数            … いちばん内側のスクロールの箱を数 px 送る（マイナスで上へ）
//   upload: ['セレクタ', 'ファイル'] … ファイルの入力に写真を入れる
//   fastForward: '30:00'    … アプリの時計を進める（集中モードのタイマーを一瞬で終わらせる・Playwright の clock）
//   goto: '/?focus=done'    … アプリを別のお試しのシナリオで開き直す（裏で読み込んでから差し替える。読み込みの間は前の画面のまま）
//   eval: '式'              … アプリの中で JS を実行（最後の手段）
//   hold: ミリ秒            … そのまま見せる（既定は操作のあと 700）
//   optional: true          … 見つからなくても止めない
//
// 台本の外側に書けること:
//   redact: { '実在の名前': '置きかえ' } … 画面の文字を録画の間だけ置きかえる（実在の著者名を映さない・下の consult-book）
//   pillar: '本と対話' など               … 5 つの柱のどれか（mkt:drafts が説明欄の下書きに使う）
// お試しモードの「（お試しモードの応答です…）」の注記は、録画の間は自動で隠す（record-demo.mjs）。
//
// 台本を足すとき: ここに 1 本足すか、同じ形の JSON（配列）を作って
//   npm run mkt:record -- --file my-scenarios.json  で読み込む。
// 字幕の言葉は CLAUDE.md の用語の正典（相談・行動・メモ・積読 など）に合わせる。言い過ぎない（brand-guardrails.md）。

const nav = (name) => `nav button[aria-label="${name}"]`;
const ASK = 'textarea[aria-label="相談したいこと"]';
const SEND = 'button[aria-label="送信"]';
const CHIPS = '[aria-label="続けて聞く"] button';
const DECIDE = '[aria-label="続けて聞く"] button:has-text("ここで答えと行動を")';
const ANSWER_DONE = '[aria-label="相談への答え"]:not([aria-busy]) button:has-text("行動に追加")';
const EVIDENCE = 'summary:has-text("根拠を見る") >> nth=-1'; // いちばん新しい答えの根拠

export const SCENARIOS = [
  {
    name: 'consult-answer',
    pillar: '本と対話',
    title: 'その答え、\n前に読んだ本に\n書いてありました。',
    url: '/',
    steps: [
      { say: 'はじめて部下ができて、困ったとき', hold: 600 },
      { tap: nav('相談') },
      { type: [ASK, '部下の報告がいつも遅くて、困っています'] },
      { say: '自分の読書メモに相談する', tap: SEND },
      { waitFor: CHIPS, timeout: 30000, hold: 1600 },
      { say: '状況を 1 つ聞き返してから' },
      { tap: DECIDE },
      { say: '答えと、明日やることまで', waitFor: ANSWER_DONE, timeout: 40000, hold: 1200 },
      { scrollTo: EVIDENCE, block: 'center', hold: 800 },
      { say: '根拠は、自分が読んだ本とページ', tap: EVIDENCE, hold: 600 },
      { scrollBy: 260, hold: 2600 },
      { say: '明日の一歩は、行動リストへ', scrollTo: 'button:has-text("行動に追加")', block: 'center', hold: 600 },
      { tap: 'button:has-text("行動に追加")', hold: 2200 },
    ],
  },
  {
    name: 'memo-to-consult',
    pillar: '本と対話',
    title: '読みながら残した一行が、\nあとで相談の根拠になる',
    url: '/',
    steps: [
      { say: '読みながら、一行だけ残す', hold: 600 },
      { tap: '.lvg-page button:has-text("メモを書く") >> nth=0' },
      { type: ['textarea[aria-label="メモ本文"]', 'よいマネージャーは答えを渡さず、質問で考えてもらう。'] },
      { tap: '[role=dialog] button:text-is("保存")', hold: 1400 },
      { tap: '[role=status] button[aria-label="閉じる"]', optional: true, timeout: 2000, hold: 300 }, // 保存の知らせが入力欄に重なるので閉じる
      { say: '数週間後、仕事で迷ったら' },
      { tap: nav('相談') },
      { type: [ASK, '部下が自分で考えて動くようにしたい'] },
      { say: 'さっきの一行から答える', tap: SEND },
      { waitFor: CHIPS, timeout: 30000, hold: 1200 },
      { tap: DECIDE },
      { waitFor: ANSWER_DONE, timeout: 40000, hold: 800 },
      { scrollTo: EVIDENCE, block: 'center' },
      { say: '書いた本とメモが、根拠に並ぶ', tap: EVIDENCE, hold: 600 },
      { scrollBy: 260, hold: 3000 },
    ],
  },
  {
    // 1 冊に相談 → 本の語り口の答え（名前の行に「本の語り口で・AI」）→ 根拠の本とページ。
    // 実在の著者名は映さない（redact）。「著者と話せる」とは字幕でも言わない（marketing-master-plan §0）。
    name: 'consult-book',
    pillar: '本と対話',
    title: '読んだ本と、\n対話しよう。',
    url: '/',
    redact: { 'エリック・シュミット': '『1兆ドルコーチ』' },
    steps: [
      { say: '前に読んだ 1 冊を開いて', hold: 500 },
      { tap: 'button:has-text("すべての本")' },
      { tap: '.lvg-page button:has-text("1兆ドルコーチ")', hold: 900 },
      { scrollTo: 'button:has-text("この本に相談する")', block: 'center', hold: 400 },
      { say: '「この本に相談する」', tap: 'button:has-text("この本に相談する")', hold: 600 },
      { type: [ASK, '1on1 で、部下が本音を話してくれません'] },
      { say: '自分のメモをもとに、本の語り口で', tap: SEND },
      { waitFor: CHIPS, timeout: 30000, hold: 2400 },
      { say: '聞き返しに答えて、行動まで決める', tap: DECIDE },
      { waitFor: ANSWER_DONE, timeout: 40000, hold: 1400 },
      { scrollTo: EVIDENCE, block: 'center' },
      { say: '根拠は、自分が残したメモとページ', tap: EVIDENCE, hold: 600 },
      { scrollBy: 240, hold: 3000 },
    ],
  },
  {
    // 時間を決めて読む → 読みながら一行 → 時間になったら「今日 N 分 読みました」。
    // 30 分はアプリの時計を進めて作る（fastForward・本物の 30 分は待てない）。
    name: 'focus-mode',
    pillar: '習慣',
    title: '時間を決めて、\n集中して読む',
    url: '/',
    steps: [
      { say: 'いま読んでいる本の「読む」', hold: 500 },
      { tap: '.lvg-page button:has-text("読む") >> nth=1', hold: 700 }, // 『数値化の鬼』（後半の &focus=done と同じ本）
      { say: '30 分だけ、と決めて', tap: '[role=dialog] button[role=radio][aria-label="30 分"]', hold: 600 },
      { tap: '[role=dialog] button[data-focus-start]', hold: 1800 },
      { say: '画面には、本と時間だけ', hold: 1600 },
      { say: '気になった一行は、その場でメモ', tap: 'button[aria-label="メモ"]', hold: 400 },
      { type: ['textarea[aria-label="メモ本文"]', '数字にすると、言い訳がなくなる'] },
      { tap: '[role=dialog] button:text-is("保存")', hold: 1400 },
      { say: '30 分後', fastForward: '30:00', waitFor: 'button:text-is("おわる")', hold: 1800 },
      { tap: 'button:text-is("おわる")', hold: 600 },
      { say: '読んだ時間は、記録に残る', hold: 2800 },
    ],
  },
  {
    // 記録の「読書の時間」と「分野」→ まだ本がない分野から AI 選書へ（送らない）。
    name: 'record-fields',
    pillar: '客観視',
    title: '自分の読書を、\n客観的に見る',
    url: '/',
    steps: [
      { tap: nav('振り返り') },
      { tap: 'button[role=tab]:has-text("記録")', hold: 0 },
      { waitFor: '[data-reading-time]', timeout: 30000, hold: 300 },
      { say: 'どんな本に、どれくらい時間を使ったか', scrollTo: '[data-reading-time]', block: 'start', hold: 2400 },
      { say: '分野ごとに見ると、手薄なところも分かる', scrollTo: '[data-book-fields-record]', block: 'start', hold: 2000 },
      { scrollTo: '[data-empty-fields] >> nth=0', block: 'center', hold: 1400 },
      { say: 'まだ本がない分野から、次の 1 冊を探す', tap: '[data-empty-fields] button >> nth=0', hold: 300 },
      { waitFor: ':text("次に読む本を探す")', timeout: 30000, hold: 3000 },
    ],
  },
  {
    name: 'share-magazine',
    pillar: '発信',
    title: '心に残った一文を、\n雑誌の 1 ページに',
    url: '/',
    steps: [
      { say: '読み終えた本から', hold: 400 },
      { tap: 'button:has-text("すべての本")' },
      { tap: '.lvg-page button:has-text("イシューからはじめよ")', hold: 900 },
      { tap: 'button[aria-label="その他の操作"]' },
      { say: '「写真で共有」を押して', tap: '[role=menu] [role=menuitem]:has-text("写真で共有")', hold: 900 },
      { upload: ['[role=dialog] input[type=file]', 'scripts/fixtures/share-photo.jpg'], optional: true },
      { tap: '[role=dialog] button:has-text("写真から選ぶ")', optional: true, hold: 300 },
      { upload: ['[role=dialog] input[type=file]', 'scripts/fixtures/share-photo.jpg'], optional: true, hold: 1500 },
      { say: '自分の言葉が、1 枚の画像に', tap: '[role=dialog] [role=radiogroup][aria-label="見せ方"] [role=radio]:has-text("雑誌")', hold: 2400 },
      { say: '形は投稿とストーリーから', tap: '[role=dialog] [role=radio][aria-label="ストーリー（9:16）"]', optional: true, hold: 2600 },
    ],
  },
];
