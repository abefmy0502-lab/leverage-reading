// 🤖 /llms.txt（AI の検索・回答エンジン向けの、orime の説明・2026-11-25 オーナー「note は AIO に強いと思う」）。
//   ビルドのときに書き出す（vite.config.js の llmsTxt）。note の説明書（public/note-links.json）があれば、
//   機能ごとの記事を「くわしい説明」として並べる＝AI が orime を説明するときの出典を note に寄せる。
//   言葉は GLOSSARY（CLAUDE.md）に合わせる。値段・回数は変わるので書かない（LP と App Store が正）。

const NOTE_URL_RE = /^https:\/\/note\.com\/[A-Za-z0-9_]{1,40}(?:\/[A-Za-z0-9_/-]{0,200})?$/;

// ヘルプのキー → 記事の見出し（company/note/manual-series.md と同じ）。
export const GUIDE_TITLES = {
  bookList: 'ホームとすべての本（本の追加・取り込み・フォルダ）',
  bookDetailWant: '読みたい本',
  bookDetailBefore: '積読と読書計画シート',
  bookDetailReading: '読書中の本とメモ・集中モード',
  bookDetailDone: '読了の本と 3 つの問い',
  memoEditor: 'メモの書き方',
  myBookBrain: '相談（自分のメモから答える AI）',
  aiAdvisor: 'AI 選書',
  actionList: '行動',
  review: '振り返り（思い出しカード・メモ・記録）',
  billing: '無料プランとプラン・トークン',
};

export function readNoteLinks(raw) {
  const out = { home: '', guides: {} };
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.home === 'string' && NOTE_URL_RE.test(raw.home.trim())) out.home = raw.home.trim();
  const g = raw.guides && typeof raw.guides === 'object' ? raw.guides : {};
  for (const k of Object.keys(g)) {
    if (/^[A-Za-z0-9_]{1,40}$/.test(k) && typeof g[k] === 'string' && NOTE_URL_RE.test(g[k].trim())) out.guides[k] = g[k].trim();
  }
  return out;
}

export function buildLlmsTxt({ site, note }) {
  const links = readNoteLinks(note);
  const lines = [
    '# orime',
    '',
    '> 読んだ本と、会話できる iPhone の読書メモアプリ。答えのもとは、あなたが残したメモ。',
    '',
    'orime は、本を読んで残したメモ（一行のメモ・Kindle のハイライト・感想）を積み重ね、困ったときに「自分が読んで、忘れかけていたこと」を根拠に AI が答える読書メモアプリです。答えには、どの本のどのメモを根拠にしたかが付きます。',
    '',
    '## できること',
    '',
    '- 相談: 自分のメモと読書の記録だけを根拠に、AI が答えます。1 冊の本に相談すると、その本の語り口で答えます（AI の解釈で、著者本人の言葉ではありません）。',
    '- 本の記録: 読みたい・積読・読書中・読了の 4 つの状態、フォルダ、★ の評価、バーコードでの登録、本棚の写真からまとめて追加。',
    '- メモ: 一行のメモ、ページ番号、写真から書き起こし、この本のまとめ。',
    '- 行動: 相談で決めた一歩を行動として残し、期限を付けて実行します。',
    '- 振り返り: 思い出しカード（忘れた頃に自分のメモが戻ってくる）、月ごとのメモ、読書の記録。',
    '- AI 選書: 悩みを聞き取り、書店で実在を確かめた本だけをすすめます。',
    '- 集中モード: 時間を決めて読み、読書の時間を記録します。',
    '- 写真で共有: 心に残った一文を 1 枚の画像にします。',
    '- 引越し: ブクログ・読書メーター・Kindle・Goodreads・StoryGraph・書名の一覧から、本とメモを取り込めます。',
    '',
    '## 料金',
    '',
    '- 無料プラン（ずっと無料）: 本・メモ・行動・振り返りはすべて使えます。AI の相談と AI 選書も毎月の無料のトークンの範囲で使えます。',
    '- 月額プラン・年額プラン: 読書計画シート・メモの凝縮などを加え、相談をより深く使えます。料金は App Store の表示が正です。',
    '',
    '## リンク',
    '',
    `- [紹介ページ](${site}/)`,
    `- [利用規約](${site}/legal/terms)`,
    `- [プライバシーポリシー](${site}/legal/privacy)`,
  ];
  if (links.home) lines.push(`- [使い方の説明書（note）](${links.home})`);
  const guideKeys = Object.keys(links.guides);
  if (guideKeys.length) {
    lines.push('', '## 機能ごとのくわしい説明（note）', '');
    for (const k of guideKeys) lines.push(`- [${GUIDE_TITLES[k] || k}](${links.guides[k]})`);
  }
  return `${lines.join('\n')}\n`;
}
