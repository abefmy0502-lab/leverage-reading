// 🏷 本の分野（lib/bookFields.js・2026-10-11）。
import { describe, it, expect } from 'vitest';
import {
  BOOK_FIELD_GROUPS, BOOK_FIELDS, FIELD_MAX, isBookField, fieldsOf, nonFieldTags, withFields, fieldGroupId,
  fieldsForTag, splitLegacyTags, classifyBook, buildFieldRecord, advisorDraftFor, renameOldFields, isOldFieldName, pickThinFields,
  classifyBookDetailed, genreCandidates, scoreBookFields, GENRE_RULES,
} from './bookFields';
import { FIELD_CORPUS } from './bookFields.corpus';

describe('一覧の形', () => {
  it('大分類 4 → 分野 20・重ならない・短い', () => {
    expect(BOOK_FIELD_GROUPS.map((c) => c.name)).toEqual(['仕事', '自分と生活', '教養', '文芸・エンタメ']);
    expect(BOOK_FIELDS).toHaveLength(20);
    expect(new Set(BOOK_FIELDS).size).toBe(20);
    expect(BOOK_FIELDS).toContain('暮らし・家事');
    expect(BOOK_FIELDS).toContain('心理学');
    expect(BOOK_FIELDS).not.toContain('人の心理');
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
    for (const old of ['仕事の腕', '自分の軸', '世の中の見方', '楽しむ', '自分と暮らし', '文芸・趣味', '仕事の進め方']) expect(names).not.toContain(old);
  });
  it('大分類の名前と分野の名前で語が重ならない（「仕事」と「仕事の進め方」・「暮らし」と「暮らし・家事」・「趣味」と「趣味・アート」）', () => {
    for (const g of BOOK_FIELD_GROUPS) {
      for (const word of g.name.split('・')) {
        for (const f of BOOK_FIELDS) expect(f.includes(word), `${g.name} と ${f}`).toBe(false);
      }
    }
  });
});

describe('classifyBook（本の特徴から分野）', () => {
  // どの本もどこかに入る・付いた分野は期待のどれか（FIELD_CORPUS・103 冊・うち 25 冊は楽天ブックスのジャンルつき）
  it(`${FIELD_CORPUS.length} 冊のうち 9 割以上に付き、8.5 割以上が期待どおり`, () => {
    let assigned = 0;
    let sensible = 0;
    const misses = [];
    for (const b of FIELD_CORPUS) {
      const got = classifyBook(b);
      expect(got.length, b.title).toBeLessThanOrEqual(2);
      if (got.length) assigned += 1;
      if (!got.length && b.allowEmpty) sensible += 1; // 決めきれない本は付けないのが正しい
      else if (got.length && got.every((g) => b.expect.includes(g)) && !(b.notFirst || []).includes(got[0])) sensible += 1;
      else misses.push(`${b.title}: ${got.join('・') || '（なし）'}`);
    }
    expect(FIELD_CORPUS.length).toBeGreaterThanOrEqual(30);
    expect(assigned / FIELD_CORPUS.length).toBeGreaterThanOrEqual(0.9);
    expect(sensible / FIELD_CORPUS.length, misses.join('\n')).toBeGreaterThanOrEqual(0.85);
  });
  it('同じ言葉で 2 つの分野に点が入らない（アドラーは心理学だけ・生き方は哲学・思想だけ）', () => {
    const sc = scoreBookFields({ title: 'アドラー心理学入門' });
    expect(sc.has('心の整え方')).toBe(false);
    expect(scoreBookFields({ title: '生き方' }).has('心の整え方')).toBe(false);
    expect(classifyBook({ title: '生き方' })).toEqual(['哲学・思想']);
    // 会計・決算は経営・マーケティング、統計は考える力
    expect(classifyBook({ title: '会計の地図', description: '決算書と財務諸表の読み方。' })).toEqual(['経営・マーケティング']);
    expect(classifyBook({ title: '統計学が最強の学問である' })).toEqual(['考える力']);
    // 料理・片づけは暮らし・家事
    expect(classifyBook({ title: '人生がときめく片づけの魔法' })).toEqual(['暮らし・家事']);
  });
  it('『半径5メートルの野望 完全版』は小説・物語にしない（「小説家」「文庫完全版」「最高傑作」は手がかりにしない）', () => {
    for (const b of FIELD_CORPUS.filter((x) => x.title === '半径5メートルの野望 完全版')) {
      const got = classifyBook(b);
      expect(got).not.toContain('小説・物語');
      expect(['キャリア・働き方', '心の整え方', '習慣・自己成長']).toContain(got[0]);
    }
    expect(classifyBook({ title: 'ある小説家の一日', description: '' })).not.toContain('小説・物語');
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
    expect(classifyBook({ title: '数値化の鬼' })).toEqual(['段取り・効率']);
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
    // 仕事の本によく出る言葉だけでは付けない（自信のない見立ては付けない）
    expect(classifyBook({ title: '一流の流儀', description: '結果を出すビジネスパーソンの共通点。' })).toEqual([]);
    expect(classifyBook({ title: '自分の中に毒を持て', description: '人生は、いつも危険なほうを選べ。' })).toEqual(['心の整え方']);
  });
});

describe('楽天ブックスのジャンルで決める（2026-10-11 の 2 回目）', () => {
  it('ジャンルの上の段（001xxx）で候補を決める・本の形のジャンル（文庫・新書）は手がかりにしない', () => {
    expect(genreCandidates(['001004008001']).fields).toEqual(['小説・物語', 'エッセイ・ノンフィクション']);
    expect(genreCandidates(['001019001'])).toBeNull();
    expect(genreCandidates(['001020', '001006009']).fallback).toBe(null); // ビジネスの棚は広すぎて決めきれない
    expect(genreCandidates([])).toBeNull();
    for (const g of GENRE_RULES) for (const f of [...g.fields, g.fallback].filter(Boolean)) expect(BOOK_FIELDS, `${g.id} ${f}`).toContain(f);
  });
  it('候補の中から言葉で選ぶ・決めきれなければジャンルの分野', () => {
    // 小説のジャンル: 「家族」という言葉があっても人間関係・家族にしない
    expect(classifyBookDetailed({ title: '星を編む', description: '家族と過ごした島の日々。', genreIds: ['001004008'] })).toEqual({ fields: ['小説・物語'], by: 'genre' });
    expect(classifyBookDetailed({ title: '旅のエッセイ', genreIds: ['001004003'] }).fields).toEqual(['エッセイ・ノンフィクション']);
    // ビジネスのジャンル: 言葉で仕事の分野へ
    expect(classifyBookDetailed({ title: '話し方の教科書', genreIds: ['001006'] }).fields).toEqual(['伝える力']);
    // ビジネスの棚だけで決めきれない本は付けない（段取り・効率に逃げない・サーバーの AI の答えを待つ）
    expect(classifyBookDetailed({ title: '1分で話せ', genreIds: ['001006'] })).toEqual({ fields: [], by: 'none' });
    expect(classifyBookDetailed({ title: '考え方', subtitle: '人生・仕事の結果が変わる', genreIds: ['001006008'] })).toEqual({ fields: [], by: 'none' });
    expect(classifyBook({ title: '一流の流儀', description: 'ビジネスで成功する人の共通点。' })).toEqual([]);
    // 言葉が無くてもジャンルで決まる（漫画・料理）
    expect(classifyBookDetailed({ title: 'ONE PIECE 107', genreIds: ['001001001'] })).toEqual({ fields: ['小説・物語'], by: 'genre' });
    expect(classifyBookDetailed({ title: '何か', genreIds: ['001010'] }).fields).toEqual(['暮らし・家事']);
    // ジャンルが無ければ言葉だけ
    expect(classifyBookDetailed({ title: '伝え方が9割' }).by).toBe('keywords');
    expect(classifyBookDetailed({ title: 'ノルウェイの森' })).toEqual({ fields: [], by: 'none' });
  });
});

describe('前の版の分野の名前を移す', () => {
  it('決まった置きかえ・重ねない・分野でないタグは残す', () => {
    expect(renameOldFields(['問いを立てる', '発想', '決め方'])).toEqual(['考える力']);
    expect(renameOldFields(['人を育てる', 'チームづくり', '会社の課題図書'])).toEqual(['リーダー・チーム', '会社の課題図書']);
    expect(renameOldFields(['お金', '生き方・働き方', '休み方'])).toEqual(['キャリア・働き方', '健康・からだ', 'お金・投資']);
    expect(renameOldFields(['心の持ち方', '人の心理'])).toEqual(['心の整え方', '心理学']);
    // 同日の 19 分野の名前（人の心理）も
    expect(renameOldFields(['人の心理', '読書術'])).toEqual(['心理学', '読書術']);
    expect(renameOldFields(['段取り', '数字で見る', '経済', 'テクノロジー', '歴史に学ぶ'])).toEqual(['段取り・効率', '経済・社会', '歴史']);
    expect(renameOldFields(['習慣', '伝え方'])).toEqual(['伝える力', '習慣・自己成長']);
    // 同日の 4 回目: 仕事の進め方 → 段取り・効率
    expect(renameOldFields(['仕事の進め方', '読書術'])).toEqual(['段取り・効率', '読書術']);
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
    // 歴史は新しい一覧にもある名前なので置きかえない・人の心理は心理学に
    expect(isOldFieldName('歴史')).toBe(false);
    expect(isOldFieldName('人の心理')).toBe(true);
    expect(isOldFieldName('お金')).toBe(true);
  });
  it('前の版の分野の名前のタグも分野に（移し替え・取り込み）', () => {
    expect(splitLegacyTags(['お金', '問いを立てる'])).toEqual({ fields: ['考える力', 'お金・投資'], folders: [] });
    expect(fieldsForTag('物語・エッセイ')).toEqual(['小説・物語']);
  });
});

describe('前の版のタグを分ける', () => {
  it('分野に結びつくタグは分野に・結びつかないタグはフォルダへ（消さない）', () => {
    expect(splitLegacyTags(['思考法', '仕事術'])).toEqual({ fields: ['考える力', '段取り・効率'], folders: [] });
    expect(splitLegacyTags(['マネジメント', 'コミュニケーション'])).toEqual({ fields: ['伝える力', 'リーダー・チーム'], folders: [] });
    expect(splitLegacyTags(['会社の本', '習慣'])).toEqual({ fields: ['習慣・自己成長'], folders: ['会社の本'] });
    expect(splitLegacyTags(['心理学'])).toEqual({ fields: ['心理学'], folders: [] });
    expect(splitLegacyTags(['料理'])).toEqual({ fields: ['暮らし・家事'], folders: [] });
    expect(splitLegacyTags(['キャリア'])).toEqual({ fields: ['キャリア・働き方'], folders: [] });
    expect(splitLegacyTags(['会社の課題図書', '@仕事', ' '])).toEqual({ fields: [], folders: ['会社の課題図書', '@仕事'] });
  });
  it('分野は 3 つまで', () => {
    expect(splitLegacyTags(['マネジメント', 'コミュニケーション', '習慣', 'お金', '料理']).fields).toHaveLength(FIELD_MAX);
  });
  it('fieldsForTag: 言い換え・含む言葉', () => {
    expect(fieldsForTag('#習慣化')).toEqual(['習慣・自己成長']);
    expect(fieldsForTag('時間術')).toEqual(['段取り・効率']);
    expect(fieldsForTag('小説')).toEqual(['小説・物語']);
    expect(fieldsForTag('読書術')).toEqual(['習慣・自己成長']);
    expect(fieldsForTag('会社の課題図書')).toEqual([]);
    expect(fieldsForTag('AI')).toEqual(['科学・テクノロジー']);
  });
});

describe('本の分野の読み書き', () => {
  it('fieldsOf は一覧の順・分野だけ', () => {
    expect(fieldsOf({ tags: ['段取り・効率', '読書術', '考える力'] })).toEqual(['考える力', '段取り・効率']);
    expect(nonFieldTags({ tags: ['段取り・効率', '読書術'] })).toEqual(['読書術']);
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
    { id: 'b', tags: ['考える力', '段取り・効率'] },
    { id: 'c', tags: ['段取り・効率'] },
    { id: 'd', tags: ['お金・投資'] },
    { id: 'e', tags: [] },
  ];
  it('本のある分野だけ行に・大分類ごと・メモと時間を数える（時間は分野の数で分ける）', () => {
    const r = buildFieldRecord(books, { memoCountByBook: { a: 3, b: 2 }, secondsByBook: { b: 600 } });
    expect(r.any).toBe(true);
    const flat = r.groups.flatMap((g) => g.fields);
    expect(flat.map((f) => [f.name, f.books, f.memos, f.seconds])).toEqual([['考える力', 2, 5, 300], ['段取り・効率', 2, 2, 300], ['お金・投資', 1, 0, 0]]);
    // 読書の時間の「分野ごと」と同じ分を渡したら、その分を出す
    const r2 = buildFieldRecord(books, { secondsByBook: { b: 600 }, minutesByField: { 考える力: 6, '段取り・効率': 4 } });
    expect(r2.groups.flatMap((g) => g.fields).map((f) => f.minutes)).toEqual([6, 4, 0]);
    expect(r.groups.map((g) => g.name)).toEqual(['仕事', '自分と生活']);
  });
  it('少ない分野は、なるべく別々の大分類から（本の少ない大分類から順に）', () => {
    const r = buildFieldRecord(books);
    // 教養・楽しむは 0 冊 → それぞれの最初の分野
    expect(r.thin).toEqual(['経済・社会', '小説・物語']);
    expect(new Set(r.thin.map(fieldGroupId)).size).toBe(2);
    // 教養に本が多ければ、文芸・エンタメと自分と生活から
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
    // 文芸・エンタメの分野は「いま読みたい本」
    expect(advisorDraftFor('小説・物語')).toBe('小説・物語で、いま読みたい本を探したい');
    expect(advisorDraftFor(['趣味・アート'])).toBe('趣味・アートで、いま読みたい本を探したい');
  });
});
