// 🏷 本の分野（lib/bookFields.js・2026-10-11）。
import { describe, it, expect } from 'vitest';
import {
  BOOK_FIELD_GROUPS, BOOK_FIELDS, FIELD_MAX, isBookField, fieldsOf, nonFieldTags, withFields, fieldGroupId,
  fieldsForTag, splitLegacyTags, classifyBook, buildFieldRecord, advisorDraftFor, renameOldFields, isOldFieldName, pickThinFields,
  classifyBookDetailed, genreCandidates, scoreBookFields, GENRE_RULES, BUSINESS_FIELDS, OTHER_FIELD, OLD_FIELD_RENAMES,
} from './bookFields';
import { FIELD_CORPUS } from './bookFields.corpus';

describe('一覧の形', () => {
  it('ビジネスの 12＋受け皿「教養・その他」・大分類 4・重ならない・短い（2026-11-17）', () => {
    expect(BOOK_FIELD_GROUPS.map((c) => c.name)).toEqual(['ビジネス', '考え方', '自分を伸ばす', 'ほかの本']);
    expect(BOOK_FIELDS).toHaveLength(13);
    expect(new Set(BOOK_FIELDS).size).toBe(13);
    expect(BUSINESS_FIELDS).toHaveLength(12);
    expect(BUSINESS_FIELDS).not.toContain(OTHER_FIELD);
    expect(BOOK_FIELDS.at(-1)).toBe('教養・その他');
    for (const f of BOOK_FIELDS) expect([...f].length, f).toBeLessThanOrEqual(15);
    expect(fieldGroupId('お金・会計・ファイナンス')).toBe('self');
    expect(fieldGroupId('教養・その他')).toBe('other');
    expect(fieldGroupId('営業・交渉')).toBe('biz');
  });
  it('同じ手がかりの言葉が 2 つの分野にない', () => {
    const owner = new Map();
    for (const c of BOOK_FIELD_GROUPS) {
      for (const f of c.fields) {
        for (const w of [f.name, ...f.words]) {
          const k = w.normalize('NFKC').toLowerCase();
          if (owner.has(k) && owner.get(k) !== f.name) throw new Error(`「${w}」が ${owner.get(k)} と ${f.name} の両方にある`);
          owner.set(k, f.name);
        }
      }
    }
    expect(owner.get('進化')).toBe('教養・その他');
  });
  it('どの分野にも手がかりの言葉がある', () => {
    for (const c of BOOK_FIELD_GROUPS) for (const f of c.fields) expect(f.words.length, f.name).toBeGreaterThan(10);
  });
  it('前の一覧の名前は使わない', () => {
    const names = [...BOOK_FIELD_GROUPS.map((c) => c.name), ...BOOK_FIELDS].join(' ');
    for (const old of ['仕事の腕', '自分の軸', '世の中の見方', '楽しむ', '自分と暮らし', '文芸・趣味', '仕事の進め方', '段取り・効率', '小説・物語', '自分と生活', '文芸・エンタメ']) expect(names).not.toContain(old);
  });
  it('大分類の名前と分野の名前で語が重ならない', () => {
    for (const g of BOOK_FIELD_GROUPS) {
      for (const word of g.name.split('・')) {
        for (const f of BOOK_FIELDS) expect(f.includes(word), `${g.name} と ${f}`).toBe(false);
      }
    }
  });
});

describe('classifyBook（本の特徴から分野）', () => {
  // 付いた分野は期待のどれか（FIELD_CORPUS・前の 20 の分野の期待を、その候補へ置きかえた・2026-11-17）
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
  it('同じ言葉で 2 つの分野に点が入らない・言葉の行き先', () => {
    expect([...scoreBookFields({ title: 'アドラー心理学入門' }).keys()]).toEqual(['心理学・行動経済学']);
    expect(classifyBook({ title: '生き方' })).toEqual(['教養・その他']);
    expect(classifyBook({ title: '会計の地図', description: '決算書と財務諸表の読み方。' })).toEqual(['お金・会計・ファイナンス']);
    expect(classifyBook({ title: '統計学が最強の学問である' })).toEqual(['数字・データ分析']);
    expect(classifyBook({ title: '人生がときめく片づけの魔法' })).toEqual(['教養・その他']);
  });
  it('『半径5メートルの野望 完全版』は物語の本にしない（「小説家」「文庫完全版」「最高傑作」は手がかりにしない）', () => {
    for (const b of FIELD_CORPUS.filter((x) => x.title === '半径5メートルの野望 完全版')) {
      const got = classifyBook(b);
      expect(BUSINESS_FIELDS).toContain(got[0]);
    }
    expect(classifyBook({ title: 'ある小説家の一日', description: '' })).toEqual([]);
  });
  it('4 つの大分類すべてに本が入る', () => {
    const groups = new Set(FIELD_CORPUS.flatMap((b) => classifyBook(b)).map(fieldGroupId));
    expect([...groups].sort()).toEqual(['biz', 'mind', 'other', 'self']);
  });
  for (const b of FIELD_CORPUS.filter((x) => ['ノルウェイの森', '容疑者Xの献身', '海辺のカフカ', '深夜特急', 'マンガでわかる 行動経済学', '山本ゆりの 平日5分で作りおき'].includes(x.title))) {
    it(`『${b.title}』→ ${b.expect.join('・')}`, () => {
      const got = classifyBook(b);
      expect(got.length).toBeGreaterThan(0);
      for (const g of got) expect(b.expect, `${b.title}: ${got}`).toContain(g);
    });
  }
  it('書名だけでも分かるものは付く', () => {
    expect(classifyBook({ title: 'イシューからはじめよ' })).toEqual(['思考法・問題解決']);
    expect(classifyBook({ title: '数値化の鬼' })).toEqual(['数字・データ分析']);
    expect(classifyBook({ title: '嫌われる勇気' })).toEqual(['心理学・行動経済学']);
    expect(classifyBook({ title: '金持ち父さん 貧乏父さん' })).toEqual(['お金・会計・ファイナンス']);
    expect(classifyBook({ title: 'アトミック・ハビット' })).toEqual(['生産性・伝える力']);
    expect(classifyBook({ title: '1兆ドルコーチ' })).toEqual(['リーダーシップ・人材育成']);
  });
  it('手がかりが無ければ付けない（受け皿にも入れない＝紹介文が届いたらもう一度）', () => {
    expect(classifyBook({ title: 'チーズはどこへ消えた？' })).toEqual([]);
    expect(classifyBook({ title: 'ノルウェイの森' })).toEqual([]);
    expect(classifyBook({ title: '' })).toEqual([]);
    expect(classifyBook({ title: 'Just do it, wait' })).toEqual([]);
  });
  it('どの分野にも届かないときの手がかり: 物語の紹介文は教養・その他・仕事の言葉だけでは付けない', () => {
    expect(classifyBook({ title: '星の夜', description: '主人公の少女は、ある日ふしぎな手紙を受け取る。' })).toEqual(['教養・その他']);
    expect(classifyBook({ title: '一流の流儀', description: '結果を出すビジネスパーソンの共通点。' })).toEqual([]);
  });
});

describe('楽天ブックスのジャンルで決める', () => {
  it('ジャンルの上の段（001xxx）で候補を決める・本の形のジャンル（文庫・新書）は手がかりにしない', () => {
    expect(genreCandidates(['001004008001']).fields).toEqual(['教養・その他']);
    expect(genreCandidates(['001019001'])).toBeNull();
    expect(genreCandidates(['001020', '001006009']).fallback).toBe(null); // ビジネスの棚は広すぎて決めきれない
    expect(genreCandidates([])).toBeNull();
    for (const g of GENRE_RULES) for (const f of [...g.fields, g.fallback].filter(Boolean)) expect(BOOK_FIELDS, `${g.id} ${f}`).toContain(f);
  });
  it('候補の中から言葉で選ぶ・決めきれなければジャンルの分野', () => {
    expect(classifyBookDetailed({ title: '星を編む', description: '家族と過ごした島の日々。', genreIds: ['001004008'] })).toEqual({ fields: ['教養・その他'], by: 'genre' });
    expect(classifyBookDetailed({ title: '話し方の教科書', genreIds: ['001006'] }).fields).toEqual(['生産性・伝える力']);
    // ビジネスの棚だけで決めきれない本は付けない（サーバーの AI の答えを待つ）
    expect(classifyBookDetailed({ title: '1分で話せ', genreIds: ['001006'] })).toEqual({ fields: [], by: 'none' });
    expect(classifyBookDetailed({ title: '考え方', subtitle: '人生・仕事の結果が変わる', genreIds: ['001006008'] })).toEqual({ fields: [], by: 'none' });
    expect(classifyBook({ title: '一流の流儀', description: 'ビジネスで成功する人の共通点。' })).toEqual([]);
    // 言葉が無くてもジャンルで決まる（漫画・料理）
    expect(classifyBookDetailed({ title: 'ONE PIECE 107', genreIds: ['001001001'] })).toEqual({ fields: ['教養・その他'], by: 'genre' });
    expect(classifyBookDetailed({ title: '何か', genreIds: ['001010'] }).fields).toEqual(['教養・その他']);
    expect(classifyBookDetailed({ title: '伝え方が9割' }).by).toBe('keywords');
    expect(classifyBookDetailed({ title: 'ノルウェイの森' })).toEqual({ fields: [], by: 'none' });
  });
});

describe('前の版の分野の名前を移す（2026-11-17 の 13 分野へ）', () => {
  it('1 つに決まる名前は決まった置きかえ・重ねない・分野でないタグは残す', () => {
    expect(renameOldFields(['問いを立てる', '発想', '決め方'])).toEqual(['思考法・問題解決']);
    expect(renameOldFields(['人を育てる', 'チームづくり', '会社の課題図書'])).toEqual(['リーダーシップ・人材育成', '会社の課題図書']);
    expect(renameOldFields(['心の持ち方', '人の心理'])).toEqual(['心理学・行動経済学']);
    expect(renameOldFields(['仕事の進め方', '読書術'])).toEqual(['生産性・伝える力', '読書術']);
    expect(renameOldFields(['小説・物語', 'エッセイ・ノンフィクション', '歴史', '趣味・アート'])).toEqual(['教養・その他']);
    expect(renameOldFields(['お金・投資', '習慣・自己成長'])).toEqual(['お金・会計・ファイナンス', '生産性・伝える力']);
  });
  it('候補が複数の名前は、書名・紹介文の点で選ぶ（分からなければ先頭）', () => {
    expect(renameOldFields(['経営・マーケティング'], { title: '売れるもマーケ 当たるもマーケ', description: 'ブランドは市場の一番乗りを目指せ。' })).toEqual(['マーケティング・ブランド']);
    expect(renameOldFields(['経営・マーケティング'], { title: 'ゼロ・トゥ・ワン', description: 'スタートアップは独占を目指せ。起業家が新しいものを創造する方法。' })).toEqual(['起業・新規事業・テクノロジー']);
    expect(renameOldFields(['経営・マーケティング'])).toEqual(['経営・組織']);
    expect(renameOldFields(['健康・からだ'], { title: 'スタンフォード式 最高の睡眠', description: '睡眠の質を上げると集中力が変わる。' })).toEqual(['生産性・伝える力']);
    expect(renameOldFields(['健康・からだ'], { title: '医者が教える食事術' })).toEqual(['教養・その他']);
    expect(renameOldFields(['物語・エッセイ'])).toEqual(['教養・その他']);
  });
  it('前の名前が無ければ何もしない・2 回流しても同じ', () => {
    expect(renameOldFields(['思考法・問題解決', '読書術'])).toBeNull();
    expect(renameOldFields(['キャリア・働き方'])).toBeNull(); // 新しい一覧にもある名前
    expect(renameOldFields([])).toBeNull();
    const once = renameOldFields(['お金', '読書術']);
    expect(renameOldFields(once)).toBeNull();
    expect(isOldFieldName('キャリア・働き方')).toBe(false);
    expect(isOldFieldName('考える力')).toBe(true);
    expect(isOldFieldName('お金')).toBe(true);
    for (const v of Object.values(OLD_FIELD_RENAMES)) expect(BOOK_FIELDS).toContain(v);
  });
  it('前の版の分野の名前のタグも分野に（移し替え・取り込み）', () => {
    expect(splitLegacyTags(['お金', '問いを立てる'])).toEqual({ fields: ['思考法・問題解決', 'お金・会計・ファイナンス'], folders: [] });
    expect(fieldsForTag('物語・エッセイ')).toEqual(['教養・その他']);
  });
});

describe('前の版のタグを分ける', () => {
  it('分野に結びつくタグは分野に・結びつかないタグはフォルダへ（消さない）', () => {
    expect(splitLegacyTags(['思考法', '仕事術'])).toEqual({ fields: ['思考法・問題解決', '生産性・伝える力'], folders: [] });
    expect(splitLegacyTags(['マネジメント', 'コミュニケーション'])).toEqual({ fields: ['リーダーシップ・人材育成', '生産性・伝える力'], folders: [] });
    expect(splitLegacyTags(['会社の本', '習慣'])).toEqual({ fields: ['生産性・伝える力'], folders: ['会社の本'] });
    expect(splitLegacyTags(['心理学'])).toEqual({ fields: ['心理学・行動経済学'], folders: [] });
    expect(splitLegacyTags(['料理'])).toEqual({ fields: ['教養・その他'], folders: [] });
    expect(splitLegacyTags(['キャリア'])).toEqual({ fields: ['キャリア・働き方'], folders: [] });
    expect(splitLegacyTags(['会社の課題図書', '@仕事', ' '])).toEqual({ fields: [], folders: ['会社の課題図書', '@仕事'] });
  });
  it('分野は 3 つまで', () => {
    expect(splitLegacyTags(['マネジメント', 'コミュニケーション', '思考法', 'お金', '料理']).fields).toHaveLength(FIELD_MAX);
  });
  it('fieldsForTag: 言い換え・含む言葉', () => {
    expect(fieldsForTag('#習慣化')).toEqual(['生産性・伝える力']);
    expect(fieldsForTag('時間術')).toEqual(['生産性・伝える力']);
    expect(fieldsForTag('小説')).toEqual(['教養・その他']);
    expect(fieldsForTag('会社の課題図書')).toEqual([]);
    expect(fieldsForTag('AI')).toEqual(['起業・新規事業・テクノロジー']);
  });
});

describe('本の分野の読み書き', () => {
  it('fieldsOf は一覧の順・分野だけ', () => {
    expect(fieldsOf({ tags: ['生産性・伝える力', '読書術', '思考法・問題解決'] })).toEqual(['思考法・問題解決', '生産性・伝える力']);
    expect(nonFieldTags({ tags: ['生産性・伝える力', '読書術'] })).toEqual(['読書術']);
    expect(isBookField('お金・会計・ファイナンス')).toBe(true);
    expect(isBookField('お金・投資')).toBe(false);
    expect(isBookField('マネジメント')).toBe(false);
  });
  it('withFields は分野でないタグを残す・3 つまで', () => {
    expect(withFields(['読書術', '生産性・伝える力'], ['お金・会計・ファイナンス', '思考法・問題解決'])).toEqual(['思考法・問題解決', 'お金・会計・ファイナンス', '読書術']);
    expect(withFields([], ['経営・組織', '経営戦略', '営業・交渉', '思考法・問題解決'])).toHaveLength(3);
  });
});

describe('記録の「分野」', () => {
  const books = [
    { id: 'a', tags: ['思考法・問題解決'] },
    { id: 'b', tags: ['思考法・問題解決', '生産性・伝える力'] },
    { id: 'c', tags: ['生産性・伝える力'] },
    { id: 'd', tags: ['お金・会計・ファイナンス'] },
    { id: 'e', tags: [] },
  ];
  it('本のある分野だけ行に・大分類ごと・メモと時間を数える（時間は分野の数で分ける）', () => {
    const r = buildFieldRecord(books, { memoCountByBook: { a: 3, b: 2 }, secondsByBook: { b: 600 } });
    expect(r.any).toBe(true);
    const flat = r.groups.flatMap((g) => g.fields);
    expect(flat.map((f) => [f.name, f.books, f.memos, f.seconds])).toEqual([['思考法・問題解決', 2, 5, 300], ['お金・会計・ファイナンス', 1, 0, 0], ['生産性・伝える力', 2, 2, 300]]);
    const r2 = buildFieldRecord(books, { secondsByBook: { b: 600 }, minutesByField: { '思考法・問題解決': 6, '生産性・伝える力': 4 } });
    expect(r2.groups.flatMap((g) => g.fields).map((f) => f.minutes)).toEqual([6, 0, 4]);
  });
  it('大分類 4 つはいつも全部・本がまだ無い分野は empty に（一覧の順）・合わせて 13 分野', () => {
    const r = buildFieldRecord(books);
    expect(r.groups.map((g) => g.name)).toEqual(['ビジネス', '考え方', '自分を伸ばす', 'ほかの本']);
    // 大分類の本の数は重ねない（b は思考法と生産性の 2 つ＝考え方 2 冊・自分を伸ばす 3 冊）
    expect(r.groups.map((g) => g.books)).toEqual([0, 2, 3, 0]);
    expect(r.groups.map((g) => g.size)).toEqual([6, 3, 3, 1]);
    const biz = r.groups.find((g) => g.id === 'biz');
    expect(biz.fields).toEqual([]);
    expect(biz.empty).toEqual(BOOK_FIELD_GROUPS.find((g) => g.id === 'biz').fields.map((f) => f.name));
    const all = r.groups.flatMap((g) => [...g.fields.map((f) => f.name), ...g.empty]);
    expect([...all].sort()).toEqual([...BOOK_FIELDS].sort());
    expect(all.length).toBe(13);
    expect(r.thin).toBeUndefined();
  });
  it('少ない分野は、なるべく別々の大分類から（本の少ない大分類から順に）', () => {
    const stat = (list) => {
      const m = new Map(BOOK_FIELDS.map((f) => [f, { books: 0 }]));
      for (const b of list) for (const f of b.tags) if (m.has(f)) m.get(f).books += 1;
      return m;
    };
    const thin = pickThinFields(stat(books));
    expect(thin).toEqual(['経営・組織', '教養・その他']);
    expect(new Set(thin.map(fieldGroupId)).size).toBe(2);
  });
  it('別の大分類で 2 つにならなければ、残りの少ない分野で埋める', () => {
    const stat = new Map(BOOK_FIELDS.map((f) => [f, { books: fieldGroupId(f) === 'biz' ? 0 : 5 }]));
    expect(pickThinFields(stat)).toEqual(['経営・組織', 'リーダーシップ・人材育成']);
  });
  it('評価の平均は、★の付いた本が 2 冊以上の分野だけ（未評価は数えない・小数 1 桁）', () => {
    const rated = [
      { id: 'a', tags: ['思考法・問題解決'], rating: 5 },
      { id: 'b', tags: ['思考法・問題解決', '生産性・伝える力'], rating: 4 },
      { id: 'c', tags: ['思考法・問題解決'], rating: 4 },
      { id: 'd', tags: ['思考法・問題解決'], rating: 0 },
      { id: 'e', tags: ['生産性・伝える力'], rating: 0 },
      { id: 'f', tags: ['お金・会計・ファイナンス'], rating: 3 },
    ];
    const byName = Object.fromEntries(buildFieldRecord(rated).groups.flatMap((g) => g.fields).map((f) => [f.name, f]));
    expect(byName['思考法・問題解決'].avgRating).toBe(4.3);
    expect(byName['思考法・問題解決'].rated).toBe(3);
    expect(byName['生産性・伝える力'].avgRating).toBeNull();
    expect(byName['お金・会計・ファイナンス'].avgRating).toBeNull();
  });
  it('分野の付いた本が無ければ any=false', () => {
    expect(buildFieldRecord([{ id: 'x', tags: ['読書術'] }]).any).toBe(false);
  });
  it('AI 選書の下書き', () => {
    expect(advisorDraftFor('お金・会計・ファイナンス')).toBe('お金・会計・ファイナンスについて、視点を増やしたい');
    // 受け皿は「いま読みたい本」
    expect(advisorDraftFor('教養・その他')).toBe('仕事の本のほかに、いま読みたい本を探したい');
  });
});
