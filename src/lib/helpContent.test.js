import { describe, it, expect } from 'vitest';
import { HELP_CONTENT, HELP_FAQ, HELP_SCREEN_ORDER, getHelp } from './helpContent';

// ヘルプは「10 秒で分かる」長さに保つ（2026-09-30 オーナー要望「ヘルプの説明が長すぎてわかりにくい」）。
// 字数は太字の ** を除いて数える（空白は数える）。手順は 17pt・行は 15pt で、幅 460 の中の 1 行に収まる字数
// （手順 14 字・行 18 字・2026-09-30 ui-critic: 16px の外側の余白で幅が狭まり、25/40 字では折り返していた）。
const visible = (s) => [...String(s).replace(/\*\*/g, '')].length;
const boldCount = (s) => (String(s).match(/\*\*/g) || []).length / 2;
// 行の頭の「 は約物の空きで 1 文字目が右へ下がって見える（2026-09-30 ui-critic）。行・手順・要約を「で始めない。
const startsWithBracket = (s) => /^[「『（]/.test(String(s).replace(/\*\*/g, ''));

// App.jsx の getCurrentHelpKey が返すキー（画面から開けるもの）。
const APP_KEYS = [
  'bookList', 'bookDetailWant', 'bookDetailBefore', 'bookDetailReading', 'bookDetailDone',
  'memoEditor', 'actionList', 'review', 'myBookBrain', 'themeReport', 'aiAdvisor',
];

function checkTopic(t, where) {
  expect(typeof t.title, `${where} title`).toBe('string');
  expect(visible(t.title), `${where} title「${t.title}」は 15 字まで`).toBeLessThanOrEqual(15);
  expect(Array.isArray(t.lines), `${where} lines`).toBe(true);
  expect(t.lines.length, `${where}「${t.title}」は 1〜3 行`).toBeGreaterThanOrEqual(1);
  expect(t.lines.length, `${where}「${t.title}」は 1〜3 行`).toBeLessThanOrEqual(3);
  for (const line of t.lines) {
    expect(visible(line), `${where}「${line}」は 18 字まで`).toBeLessThanOrEqual(18);
    expect(startsWithBracket(line), `${where}「${line}」は「で始めない`).toBe(false);
    expect(boldCount(line) % 1, `${where}「${line}」の ** が閉じていない`).toBe(0);
    expect(boldCount(line), `${where}「${line}」の太字は 1 か所まで`).toBeLessThanOrEqual(1);
  }
}

describe('HELP_CONTENT', () => {
  it('画面から開くキーがすべてある', () => {
    for (const k of APP_KEYS) expect(getHelp(k), k).not.toBeNull();
    expect(getHelp('nope')).toBeNull();
  });

  for (const [key, e] of Object.entries(HELP_CONTENT)) {
    it(`${key}: 1 文の要約・3 つの手順・字数の決まり`, () => {
      expect(typeof e.title).toBe('string');
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(typeof e.summary).toBe('string');
      expect(visible(e.summary), `summary「${e.summary}」`).toBeLessThanOrEqual(50);
      // 1 文だけ（句点は最後の 1 つ）
      expect((e.summary.match(/。/g) || []).length, `summary は 1 文`).toBeLessThanOrEqual(1);

      expect(Array.isArray(e.quickSteps)).toBe(true);
      expect(e.quickSteps).toHaveLength(3);
      expect(startsWithBracket(e.summary), `summary は「で始めない`).toBe(false);
      for (const s of e.quickSteps) {
        expect(visible(s), `quickStep「${s}」は 14 字まで`).toBeLessThanOrEqual(14);
        expect(startsWithBracket(s), `quickStep「${s}」は「で始めない`).toBe(false);
        expect(boldCount(s) % 1).toBe(0);
      }

      expect(Array.isArray(e.topics)).toBe(true);
      expect(e.topics.length).toBeGreaterThan(0);
      e.topics.forEach((t, i) => checkTopic(t, `${key}.topics[${i}]`));

      // 旧い形（sections / steps / description）は残さない（HelpModal は新しい形だけを描く）
      expect(e.sections).toBeUndefined();
      expect(e.steps).toBeUndefined();
      expect(e.description).toBeUndefined();
    });
  }

  it('相談の項目は 8 つまで・最初は「相談を育てる」（積み重ね＝相談の質を先に伝える）', () => {
    const topics = HELP_CONTENT.myBookBrain.topics;
    expect(topics.length).toBeLessThanOrEqual(8);
    expect(topics[0].title).toBe('相談を育てる');
  });

  it('使わない言い方（GLOSSARY）が出てこない', () => {
    const all = JSON.stringify([HELP_CONTENT, HELP_FAQ]);
    for (const ng of ['マイ読書脳', '読書前', 'レバレッジメモ', 'テーマレポート', '想起', 'アクション', 'タスク', 'クレジット', '無料トライアル', 'お試し', 'セットアップシート']) {
      expect(all.includes(ng), `「${ng}」は使わない`).toBe(false);
    }
  });
});

describe('HELP_FAQ と HELP_SCREEN_ORDER', () => {
  it('よくある質問も同じ字数の決まり', () => {
    expect(HELP_FAQ.length).toBeGreaterThan(0);
    HELP_FAQ.forEach((t, i) => checkTopic(t, `HELP_FAQ[${i}]`));
  });

  it('ほかの画面の一覧は、あるキーだけ', () => {
    for (const k of HELP_SCREEN_ORDER) expect(HELP_CONTENT[k], k).toBeTruthy();
    expect(HELP_SCREEN_ORDER).toContain('billing');
  });
});
