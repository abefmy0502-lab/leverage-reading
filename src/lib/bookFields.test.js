// 🏷 本の分野（lib/bookFields.js・2026-10-11）。
import { describe, it, expect } from 'vitest';
import {
  BOOK_FIELD_GROUPS, BOOK_FIELDS, FIELD_MAX, isBookField, fieldsOf, nonFieldTags, withFields, fieldGroupId,
  fieldsForTag, splitLegacyTags, classifyBook, buildFieldRecord, advisorDraftFor, renameOldFields, isOldFieldName, pickThinFields,
} from './bookFields';
import { FIELD_CORPUS } from './bookFields.corpus';

describe('一覧の形', () => {
  it('大分類 4 → 分野 19・重ならない・短い', () => {
    expect(BOOK_FIELD_GROUPS.map((c) => c.name)).toEqual(['仕事', '自分と暮らし', '教養', '楽しむ']);
    expect(BOOK_FIELDS).toHaveLength(19);
    expect(new Set(BOOK_FIELDS).size).toBe(19);
    for (const f of BOOK_FIELDS) expect([...f].length, f).toBeLessThanOrEqual(13);
    expect(BOOK_FIELDS).toContain('小説・物語');
    expect(BOOK_FIELDS).toContain('エッセイ・ノンフィクション');
    expect(fieldGroupId('お金・投資')).toBe('life');
    expect(fieldGroupId('趣味・アート')).toBe('enjoy');
  });
  it('どの分野にも手がかりの言葉がある', () => {
    for (const c of BOOK_FIELD_GROUPS) for (const f of c.fields) expect(f.words.length, f.name).toBeGreaterThan(10);
  });
  it('前の一覧の名前（分かりにくい大分類）は使わない', () => {
    const names = [...BOOK_FIELD_GROUPS.map((c) => c.name), ...BOOK_FIELDS].join(' ');
    for (const old of ['仕事の腕', '自分の軸', '世の中の見方']) expect(names).not.toContain(old);
  });
});

describe('classifyBook（本の特徴から分野）', () => {
  // どの本もどこかに入る・付いた分野は期待のどれか（FIELD_CORPUS・76 冊）
  it(`${FIELD_CORPUS.length} 冊のうち 9 割以上に付き、8.5 割以上が期待どおり`, () => {
    let assigned = 0;
    let sensible = 0;
    const misses = [];
    for (const b of FIELD_CORPUS) {
      const got = classifyBook(b);
      expect(got.length, b.title).toBeLessThanOrEqual(2);
      if (got.length) assigned += 1;
      if (got.length && got.every((g) => b.expect.includes(g))) sensible += 1;
      else misses.push(`${b.title}: ${got.join('・') || '（なし）'}`);
    }
    expect(FIELD_CORPUS.length).toBeGreaterThanOrEqual(30);
    expect(assigned / FIELD_CORPUS.length).toBeGreaterThanOrEqual(0.9);
    expect(sensible / FIELD_CORPUS.length, misses.join('\n')).toBeGreaterThanOrEqual(0.85);
  });
  it('4 つの大分類すべてに本が入る', () => {
    const groups = new Set(FIELD_CORPUS.flatMap((b) => classifyBook(b)).map(fieldGroupId));
    expect([...groups].sort()).toEqual(['culture', 'enjoy', 'life', 'work']);
  });
  for (const b of FIELD_CORPUS.filter((x) => ['ノルウェイの森', '容疑者Xの献身', '海辺のカフカ', '深夜特急', 'マンガでわかる 行動経済学', '山本ゆりの 平日5分で作りおき'].includes(x.title))) {
    it(`『${b.title}』→ ${b.expect.join('・')}`, () => {
      const got = classifyBook(b);
      expect(got.length).toBeGreaterThan(0);
      for (const g of got) expect(b.expect, `${b.title}: ${got}`).toContain(g);
    });
  }
  it('書名だけでも分かるものは付く', () => {
    expect(classifyBook({ title: 'イシューからはじめよ' })).toEqual(['考える力']);
    expect(classifyBook({ title: '数値化の鬼' })).toEqual(['仕事の進め方']);
    expect(classifyBook({ title: '嫌われる勇気' })).toEqual(['心の整え方']);
    expect(classifyBook({ title: '金持ち父さん 貧乏父さん' })).toEqual(['お金・投資']);
    expect(classifyBook({ title: 'アトミック・ハビット' })).toEqual(['習慣・自己成長']);
    expect(classifyBook({ title: '1兆ドルコーチ' })).toEqual(['リーダー・チーム']);
    expect(classifyBook({ title: 'スタンフォード式 最高の睡眠' })).toEqual(['健康・からだ']);
  });
  it('手がかりが無ければ付けない（紹介文が届いたらもう一度）', () => {
    expect(classifyBook({ title: 'チーズはどこへ消えた？' })).toEqual([]);
    expect(classifyBook({ title: 'ノルウェイの森' })).toEqual([]);
    expect(classifyBook({ title: '' })).toEqual([]);
    expect(classifyBook({ title: 'Just do it, wait' })).toEqual([]);
  });
  it('どの分野にも届かないときの手がかり: 物語の紹介文・仕事の本・自分の本', () => {
    expect(classifyBook({ title: '星の夜', description: '主人公の少女は、ある日ふしぎな手紙を受け取る。' })).toEqual(['小説・物語']);
    expect(classifyBook({ title: '一流の流儀', description: '結果を出すビジネスパーソンの共通点。' })).toEqual(['仕事の進め方']);
    expect(classifyBook({ title: '自分の中に毒を持て', description: '人生は、いつも危険なほうを選べ。' })).toEqual(['心の整え方']);
  });
});

describe('前の版の分野の名前を移す', () => {
  it('決まった置きかえ・重ねない・分野でないタグは残す', () => {
    expect(renameOldFields(['問いを立てる', '発想', '決め方'])).toEqual(['考える力']);
    expect(renameOldFields(['人を育てる', 'チームづくり', '会社の課題図書'])).toEqual(['リーダー・チーム', '会社の課題図書']);
    expect(renameOldFields(['お金', '生き方・働き方', '休み方'])).toEqual(['キャリア・働き方', '健康・からだ', 'お金・投資']);
    expect(renameOldFields(['心の持ち方', '人の心理'])).toEqual(['心の整え方', '人の心理']);
    expect(renameOldFields(['段取り', '数字で見る', '経済', 'テクノロジー', '歴史に学ぶ'])).toEqual(['仕事の進め方', '経済・社会', '歴史']);
    expect(renameOldFields(['習慣', '伝え方'])).toEqual(['伝える力', '習慣・自己成長']);
  });
  it('「物語・エッセイ」は書名・紹介文で分ける（分からなければ小説・物語）', () => {
    expect(renameOldFields(['物語・エッセイ'], { title: '半径5メートルの野望', description: '日々を綴ったエッセイ。' })).toEqual(['エッセイ・ノンフィクション']);
    expect(renameOldFields(['物語・エッセイ'], { title: 'コンビニ人間', description: '芥川賞受賞の小説。' })).toEqual(['小説・物語']);
    expect(renameOldFields(['物語・エッセイ'], { title: '何か' })).toEqual(['小説・物語']);
    expect(renameOldFields(['物語・エッセイ'])).toEqual(['小説・物語']);
  });
  it('前の名前が無ければ何もしない・2 回流しても同じ', () => {
    expect(renameOldFields(['考える力', '読書術'])).toBeNull();
    expect(renameOldFields([])).toBeNull();
    const once = renameOldFields(['お金', '読書術']);
    expect(renameOldFields(once)).toBeNull();
    // 人の心理・歴史は新しい一覧にもある名前なので置きかえない
    expect(isOldFieldName('人の心理')).toBe(false);
    expect(isOldFieldName('お金')).toBe(true);
  });
  it('前の版の分野の名前のタグも分野に（移し替え・取り込み）', () => {
    expect(splitLegacyTags(['お金', '問いを立てる'])).toEqual({ fields: ['考える力', 'お金・投資'], folders: [] });
    expect(fieldsForTag('物語・エッセイ')).toEqual(['小説・物語']);
  });
});

describe('前の版のタグを分ける', () => {
  it('分野に結びつくタグは分野に・結びつかないタグはフォルダへ（消さない）', () => {
    expect(splitLegacyTags(['思考法', '仕事術'])).toEqual({ fields: ['考える力', '仕事の進め方'], folders: [] });
    expect(splitLegacyTags(['マネジメント', 'コミュニケーション'])).toEqual({ fields: ['伝える力', 'リーダー・チーム'], folders: [] });
    expect(splitLegacyTags(['会社の本', '習慣'])).toEqual({ fields: ['習慣・自己成長'], folders: ['会社の本'] });
    expect(splitLegacyTags(['心理学'])).toEqual({ fields: ['人の心理'], folders: [] });
    expect(splitLegacyTags(['キャリア'])).toEqual({ fields: ['キャリア・働き方'], folders: [] });
    expect(splitLegacyTags(['会社の課題図書', '@仕事', ' '])).toEqual({ fields: [], folders: ['会社の課題図書', '@仕事'] });
  });
  it('分野は 3 つまで', () => {
    expect(splitLegacyTags(['マネジメント', 'コミュニケーション', '習慣', 'お金', '料理']).fields).toHaveLength(FIELD_MAX);
  });
  it('fieldsForTag: 言い換え・含む言葉', () => {
    expect(fieldsForTag('#習慣化')).toEqual(['習慣・自己成長']);
    expect(fieldsForTag('時間術')).toEqual(['仕事の進め方']);
    expect(fieldsForTag('小説')).toEqual(['小説・物語']);
    expect(fieldsForTag('読書術')).toEqual(['習慣・自己成長']);
    expect(fieldsForTag('会社の課題図書')).toEqual([]);
    expect(fieldsForTag('AI')).toEqual(['科学・テクノロジー']);
  });
});

describe('本の分野の読み書き', () => {
  it('fieldsOf は一覧の順・分野だけ', () => {
    expect(fieldsOf({ tags: ['仕事の進め方', '読書術', '考える力'] })).toEqual(['考える力', '仕事の進め方']);
    expect(nonFieldTags({ tags: ['仕事の進め方', '読書術'] })).toEqual(['読書術']);
    expect(isBookField('お金・投資')).toBe(true);
    expect(isBookField('お金')).toBe(false);
    expect(isBookField('マネジメント')).toBe(false);
  });
  it('withFields は分野でないタグを残す・3 つまで', () => {
    expect(withFields(['読書術', '習慣・自己成長'], ['お金・投資', '考える力'])).toEqual(['考える力', 'お金・投資', '読書術']);
    expect(withFields([], ['経済・社会', 'お金・投資', '習慣・自己成長', '考える力'])).toHaveLength(3);
  });
});

describe('記録の「分野」', () => {
  const books = [
    { id: 'a', tags: ['考える力'] },
    { id: 'b', tags: ['考える力', '仕事の進め方'] },
    { id: 'c', tags: ['仕事の進め方'] },
    { id: 'd', tags: ['お金・投資'] },
    { id: 'e', tags: [] },
  ];
  it('本のある分野だけ行に・大分類ごと・メモと時間を数える（時間は分野の数で分ける）', () => {
    const r = buildFieldRecord(books, { memoCountByBook: { a: 3, b: 2 }, secondsByBook: { b: 600 } });
    expect(r.any).toBe(true);
    const flat = r.groups.flatMap((g) => g.fields);
    expect(flat.map((f) => [f.name, f.books, f.memos, f.seconds])).toEqual([['考える力', 2, 5, 300], ['仕事の進め方', 2, 2, 300], ['お金・投資', 1, 0, 0]]);
    // 読書の時間の「分野ごと」と同じ分を渡したら、その分を出す
    const r2 = buildFieldRecord(books, { secondsByBook: { b: 600 }, minutesByField: { 考える力: 6, 仕事の進め方: 4 } });
    expect(r2.groups.flatMap((g) => g.fields).map((f) => f.minutes)).toEqual([6, 4, 0]);
    expect(r.groups.map((g) => g.name)).toEqual(['仕事', '自分と暮らし']);
  });
  it('少ない分野は、なるべく別々の大分類から（本の少ない大分類から順に）', () => {
    const r = buildFieldRecord(books);
    // 教養・楽しむは 0 冊 → それぞれの最初の分野
    expect(r.thin).toEqual(['経済・社会', '小説・物語']);
    expect(new Set(r.thin.map(fieldGroupId)).size).toBe(2);
    // 教養に本が多ければ、楽しむと自分と暮らしから
    const many = [...books, ...['経済・社会', '歴史', '科学・テクノロジー', '哲学・思想', '人の心理'].map((f, i) => ({ id: `k${i}`, tags: [f] }))];
    const r3 = buildFieldRecord(many);
    expect(r3.thin).toEqual(['小説・物語', '心の整え方']);
  });
  it('別の大分類で 2 つにならなければ、残りの少ない分野で埋める', () => {
    const stat = new Map(BOOK_FIELDS.map((f) => [f, { books: fieldGroupId(f) === 'work' ? 0 : 5 }]));
    expect(pickThinFields(stat)).toEqual(['考える力', '伝える力']);
  });
  it('分野の付いた本が無ければ any=false', () => {
    expect(buildFieldRecord([{ id: 'x', tags: ['読書術'] }]).any).toBe(false);
  });
  it('AI 選書の下書き', () => {
    expect(advisorDraftFor('お金・投資')).toBe('お金・投資について、視点を増やしたい');
  });
});
