import { describe, it, expect, vi } from 'vitest';
import { relatedBookEntries, dropRelatedBooks, verifyPlanRelatedBooks, parseRelatedBookLine, hasMalformedRelatedBooks } from './planRelatedBooks';

const SHEET = [
  '## 🎯 読み方の戦略',
  '- 目的に合わせて読む',
  '',
  '## 📚 関連書籍',
  '### 1. 『イシューからはじめよ』- 安宅和人',
  '問いを先に決める本。',
  '### 2. 『BtoB営業を成功させるSPIN営業術』- ニール・ラッカム',
  'それらしい説明。',
  '',
  '## 💡 期待される変化',
  '- 会議が短くなる',
].join('\n');

describe('relatedBookEntries', () => {
  it('関連書籍の節の本だけを拾う', () => {
    const e = relatedBookEntries(SHEET);
    expect(e.map((x) => [x.title, x.author])).toEqual([
      ['イシューからはじめよ', '安宅和人'],
      ['BtoB営業を成功させるSPIN営業術', 'ニール・ラッカム'],
    ]);
  });
  it('関連書籍が無いシートは空', () => {
    expect(relatedBookEntries('## 🎯 読み方の戦略\n- a')).toEqual([]);
  });
});

describe('verifyPlanRelatedBooks', () => {
  it('見つからない本（exists:false）だけ消して番号を振り直す・ほかの節は変えない', async () => {
    const verify = vi.fn(async ({ title }) => ({ exists: title.startsWith('BtoB') ? false : true }));
    const r = await verifyPlanRelatedBooks(SHEET, verify);
    expect(r.removed).toEqual(['BtoB営業を成功させるSPIN営業術']);
    expect(r.sheet).not.toContain('SPIN');
    expect(r.sheet).not.toContain('それらしい説明');
    expect(r.sheet).toContain('### 1. 『イシューからはじめよ』- 安宅和人');
    expect(r.sheet).toContain('## 💡 期待される変化\n- 会議が短くなる');
    expect(r.sheet).toContain('## 🎯 読み方の戦略\n- 目的に合わせて読む');
  });
  it('1 冊目を消したら 2 冊目が 1. になる', async () => {
    const r = await verifyPlanRelatedBooks(SHEET, async ({ title }) => ({ exists: title.startsWith('イシュー') ? false : true }));
    expect(r.sheet).toContain('### 1. 『BtoB営業を成功させるSPIN営業術』');
  });
  it('確かめられなかった本（exists:null・通信の失敗）は残す', async () => {
    const r = await verifyPlanRelatedBooks(SHEET, async () => ({ exists: null }));
    expect(r.sheet).toBe(SHEET);
    expect(r.removed).toEqual([]);
    const thrown = await verifyPlanRelatedBooks(SHEET, async () => { throw new Error('net'); });
    expect(thrown.sheet).toBe(SHEET);
  });
  it('全部見つからなければ、関連書籍の見出しごと消す', async () => {
    const r = await verifyPlanRelatedBooks(SHEET, async () => ({ exists: false }));
    expect(r.sheet).not.toContain('関連書籍');
    expect(r.sheet).toBe('## 🎯 読み方の戦略\n- 目的に合わせて読む\n\n## 💡 期待される変化\n- 会議が短くなる');
  });
  it('関連書籍が無ければ確かめない', async () => {
    const verify = vi.fn();
    const r = await verifyPlanRelatedBooks('## 🎯 a\n- b', verify);
    expect(verify).not.toHaveBeenCalled();
    expect(r.sheet).toBe('## 🎯 a\n- b');
  });
  it('dropRelatedBooks: 何も消さなければそのまま', () => {
    expect(dropRelatedBooks(SHEET, [])).toBe(SHEET);
  });
});

// 2026-10-04 オーナー報告: 「### 2. 『SMALL ACTIONS, BIG RESULTS』関連 または『やめる習慣』 - 古川武士」のように
// 1 行に 2 冊を混ぜた行が、確かめられずに残り、画面にも 2 冊が 1 枚のカードで出ていた。
describe('崩れた関連書籍の行（2 冊を混ぜた行）', () => {
  const MIXED = [
    '## 📚 関連書籍',
    '### 1. 『夢をかなえるゾウ』- 水野敬也',
    '小さな目標の立て方を物語で学べる。',
    '### 2. 『SMALL ACTIONS, BIG RESULTS』関連 または『やめる習慣』 - 古川武士',
    '何を続け、何をやめるかを判断する視点が得られる。',
  ].join('\n');

  it('parseRelatedBookLine: きれいな行と崩れた行を見分ける', () => {
    expect(parseRelatedBookLine('1. 『夢をかなえるゾウ』- 水野敬也')).toEqual({ title: '夢をかなえるゾウ', author: '水野敬也', malformed: false, candidates: ['夢をかなえるゾウ'] });
    expect(parseRelatedBookLine('『夢をかなえるゾウ』')).toMatchObject({ title: '夢をかなえるゾウ', author: '', malformed: false });
    const bad = parseRelatedBookLine('2. 『SMALL ACTIONS, BIG RESULTS』関連 または『やめる習慣』 - 古川武士');
    expect(bad).toMatchObject({ malformed: true, author: '古川武士', candidates: ['SMALL ACTIONS, BIG RESULTS', 'やめる習慣'] });
    expect(parseRelatedBookLine('1. 『嫌われる勇気』（続編も） - 岸見一郎')).toMatchObject({ malformed: true, candidates: ['嫌われる勇気'] });
    // 『』の無い番号つきの行は、確かめるまで本のカードにしない崩れた行（2026-10-04・下の describe）
    expect(parseRelatedBookLine('1. タイトルだけ')).toMatchObject({ malformed: true, plain: true, candidates: ['タイトルだけ'] });
    expect(parseRelatedBookLine('タイトルだけ')).toBeNull();
  });

  it('見つかった 1 冊だけの行に書き直す（ほかの本・説明はそのまま）', async () => {
    const verify = vi.fn(async ({ title }) => ({ exists: title === 'やめる習慣' || title === '夢をかなえるゾウ' }));
    const { sheet, removed, fixed } = await verifyPlanRelatedBooks(MIXED, verify);
    expect(sheet).toContain('### 2. 『やめる習慣』 - 古川武士');
    expect(sheet).not.toContain('SMALL ACTIONS');
    expect(sheet).toContain('何を続け、何をやめるか');
    expect(fixed).toEqual(['やめる習慣']);
    expect(removed).toEqual([]);
    expect(hasMalformedRelatedBooks(sheet)).toBe(false);
  });

  it('どれも見つからなければ（どの書名も「無い」と分かれば）その本ごと消す', async () => {
    const verify = vi.fn(async ({ title }) => ({ exists: title === '夢をかなえるゾウ' }));
    const { sheet, removed } = await verifyPlanRelatedBooks(MIXED, verify);
    expect(sheet).not.toContain('やめる習慣');
    expect(sheet).not.toContain('何を続け');
    expect(sheet).toContain('### 1. 『夢をかなえるゾウ』');
    expect(removed).toHaveLength(1);
  });

  // 2026-10-04: オフラインで保存済みのシートを開いただけで本が消えないように。画面には出さないまま残し、次に開いたときにまた確かめる。
  it('確かめられなかった書名があれば、崩れた行は消さずに残す（画面には出さない）', async () => {
    const verify = vi.fn(async ({ title }) => (title === '夢をかなえるゾウ' ? { exists: true } : { exists: null }));
    const { sheet, removed } = await verifyPlanRelatedBooks(MIXED, verify);
    expect(sheet).toBe(MIXED);
    expect(removed).toEqual([]);
    expect(hasMalformedRelatedBooks(sheet)).toBe(true);
  });

  it('hasMalformedRelatedBooks', () => {
    expect(hasMalformedRelatedBooks(MIXED)).toBe(true);
    expect(hasMalformedRelatedBooks('## 📚 関連書籍\n### 1. 『夢をかなえるゾウ』- 水野敬也')).toBe(false);
  });
});

// 2026-10-04: 『』の無い行（「### 1. 7つの習慣 - スティーブン・R・コヴィー」）は、以前は確かめずに本のカードにしていた
// （MarkdownSections の RELATED_BOOK_RE_PLAIN）。1 冊の書名に見える行だけを崩れた行として確かめ、『』の行に直すか消す。
describe('『』の無い関連書籍の行', () => {
  const PLAIN = [
    '## 📚 関連書籍',
    '### 1. 7つの習慣 - スティーブン・R・コヴィー',
    '主体性の考え方を補える。',
    '### 2. 1日1行の読書術 - 架空太郎',
    'それらしい説明。',
    '### 3. 7つの習慣 または やめる習慣 - 古川武士',
    '続け方の視点。',
    '### 4. この本を読み終えたら、次は実践の本で手を動かしましょう。',
    '本ではない見出しの説明。',
    '### 読む順番',
    '番号の無い見出し。',
  ].join('\n');

  it('parseRelatedBookLine: 番号つきで 1 冊の書名に見える行だけを崩れた行（plain）として読む', () => {
    expect(parseRelatedBookLine('1. 7つの習慣 - スティーブン・R・コヴィー')).toMatchObject({ title: '7つの習慣', author: 'スティーブン・R・コヴィー', malformed: true, plain: true, candidates: ['7つの習慣'] });
    expect(parseRelatedBookLine('3. 7つの習慣 または やめる習慣 - 古川武士')).toMatchObject({ malformed: true, candidates: ['7つの習慣 または やめる習慣', '7つの習慣', 'やめる習慣'] });
    expect(parseRelatedBookLine('1. やめる習慣 関連 — 古川武士')).toMatchObject({ malformed: true, candidates: ['やめる習慣'], author: '古川武士' });
    // 文・長い見出し・番号の無い見出しは本として扱わない（ふつうの小見出しのまま）
    expect(parseRelatedBookLine('4. この本を読み終えたら、次は実践の本で手を動かしましょう。')).toBeNull();
    expect(parseRelatedBookLine('読む順番')).toBeNull();
  });

  it('見つかった本は『』の行に直し、無い本は消す・本ではない見出しはそのまま', async () => {
    // 著者も照合する（本番の verifyBookExists と同じ）: 『7つの習慣』はコヴィー、『やめる習慣』は古川武士。
    const verify = vi.fn(async ({ title, author }) => ({
      exists: (title === '7つの習慣' && /コヴィー/.test(author)) || (title === 'やめる習慣' && author === '古川武士'),
    }));
    const { sheet, fixed, removed } = await verifyPlanRelatedBooks(PLAIN, verify);
    expect(sheet).toContain('### 1. 『7つの習慣』 - スティーブン・R・コヴィー');
    expect(sheet).toContain('主体性の考え方を補える。');
    expect(sheet).not.toContain('架空太郎');
    expect(sheet).not.toContain('それらしい説明');
    expect(sheet).toContain('### 2. 『やめる習慣』 - 古川武士');
    expect(sheet).toContain('### 4. この本を読み終えたら');
    expect(sheet).toContain('### 読む順番');
    expect(fixed).toEqual(['7つの習慣', 'やめる習慣']);
    expect(removed).toEqual(['1日1行の読書術']);
    expect(hasMalformedRelatedBooks(sheet)).toBe(false);
  });

  it('hasMalformedRelatedBooks: 『』の無い本の行があれば直す対象', () => {
    expect(hasMalformedRelatedBooks('## 📚 関連書籍\n### 1. 7つの習慣 - コヴィー')).toBe(true);
    expect(hasMalformedRelatedBooks('## 📚 関連書籍\n### 読む順番\n説明')).toBe(false);
  });
});
