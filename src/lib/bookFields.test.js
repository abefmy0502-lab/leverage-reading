// 🏷 本の分野（lib/bookFields.js・2026-10-11）。
import { describe, it, expect } from 'vitest';
import {
  BOOK_FIELD_GROUPS, BOOK_FIELDS, FIELD_MAX, isBookField, fieldsOf, nonFieldTags, withFields,
  fieldsForTag, splitLegacyTags, classifyBook, buildFieldRecord, advisorDraftFor,
} from './bookFields';

describe('一覧の形', () => {
  it('大分類 3 → 中分類 7 → 分野 18・重ならない・短い', () => {
    expect(BOOK_FIELD_GROUPS).toHaveLength(3);
    expect(BOOK_FIELD_GROUPS.flatMap((c) => c.groups)).toHaveLength(7);
    expect(BOOK_FIELDS).toHaveLength(18);
    expect(new Set(BOOK_FIELDS).size).toBe(18);
    for (const f of BOOK_FIELDS) expect([...f].length, f).toBeLessThanOrEqual(8);
    expect(BOOK_FIELDS).toContain('物語・エッセイ');
  });
  it('どの分野にも手がかりの言葉がある', () => {
    for (const c of BOOK_FIELD_GROUPS) for (const g of c.groups) for (const f of g.fields) expect(f.words.length, f.name).toBeGreaterThan(5);
  });
});

// 本の特徴（書名・紹介文・目次）は、出版社の紹介文をもとに短く言い直したもの。
const BOOKS = [
  { title: 'イシューからはじめよ', subtitle: '知的生産の「シンプルな本質」', description: '生産性の高い人は、解く前に「本当に答えを出すべき問い」を見極めている。イシューを見極め、仮説を立てて検証する知的生産の方法。', expect: ['問いを立てる'] },
  { title: '数値化の鬼', subtitle: '「仕事ができる人」に共通する、たった1つの思考法', description: '仕事ができる人は、行動や結果を数字で考える。数値化によって、自分の不足を知り、成長につなげる方法。', expect: ['数字で見る'] },
  { title: '嫌われる勇気', subtitle: '自己啓発の源流「アドラー」の教え', description: 'アドラー心理学を、哲人と青年の対話で説く。人の悩みはすべて対人関係の悩みである。他人の評価を気にせず、自由に生きるための勇気。', expect: ['心の持ち方', '人の心理'] },
  { title: 'チーズはどこへ消えた？', description: '迷路に住む2匹のネズミと2人の小人の物語。ある日チーズが消えた。変化を恐れず、どう生きるかを描いた寓話。', expect: ['物語・エッセイ'] },
  { title: 'サピエンス全史', subtitle: '文明の構造と人類の幸福', description: 'なぜホモ・サピエンスだけが文明を築けたのか。認知革命、農業革命、科学革命。人類の歴史を通して私たちのいまを問い直す。', expect: ['歴史に学ぶ'] },
  { title: '金持ち父さん 貧乏父さん', subtitle: 'アメリカの金持ちが教えてくれるお金の哲学', description: 'お金のために働くのではなく、お金に働かせる。資産と負債の違い、投資の考え方。', expect: ['お金'] },
  { title: 'ジェームズ・クリアー式 複利で伸びる1つの習慣', description: '小さな習慣が人生を変える。悪い習慣をやめ、良い習慣を続けるための 4 つの法則。毎日1%の改善。', expect: ['習慣'] },
  { title: '1兆ドルコーチ', subtitle: 'シリコンバレーのレジェンド ビル・キャンベルの成功の教え', description: 'ジョブズやペイジを指導した伝説のコーチ。チームを信頼で結び、メンバーの力を引き出すマネジメントの教え。', expect: ['チームづくり', '人を育てる'] },
  { title: '半径5メートルの野望', description: '著者が自分の身の回りから人生を変えてきた日々を綴ったエッセイ。', expect: ['物語・エッセイ'] },
  { title: 'コンビニ人間', description: '36歳未婚、コンビニのアルバイト歴18年。芥川賞受賞の小説。', expect: ['物語・エッセイ'] },
  { title: '伝え方が9割', description: '同じ内容でも、伝え方しだいで相手の答えは変わる。言葉をつくる技術。', expect: ['伝え方'] },
  { title: 'スタンフォード式 最高の睡眠', description: '睡眠の質を上げると、日中の集中力と健康が変わる。最初の 90 分の眠り方。', expect: ['休み方'] },
  { title: 'エッセンシャル思考', subtitle: '最少の時間で成果を最大にする', description: 'より少なく、しかしより良く。本当に重要なことを見極め、それ以外は断る。', expect: ['決め方'] },
  { title: 'LIFE SHIFT', subtitle: '100年時代の人生戦略', description: '長寿化で、教育・仕事・引退の 3 段階の人生は終わる。働き方とキャリアの考え方。', expect: ['生き方・働き方'] },
  { title: 'FACTFULNESS', subtitle: '10の思い込みを乗り越え、データを基に世界を正しく見る習慣', description: '人は世界を実際よりも悪く思い込んでいる。データとファクトで世界を見る。', expect: ['数字で見る', '人の心理'] },
  { title: '影響力の武器', subtitle: 'なぜ、人は動かされるのか', description: '返報性、一貫性、社会的証明。人が承諾してしまう心理の 6 つの原理。', expect: ['人の心理'] },
  { title: 'ゼロ・トゥ・ワン', subtitle: '君はゼロから何を生み出せるか', description: 'スタートアップは、競争ではなく独占を目指せ。起業家が新しいものを創造する方法。', expect: ['経済', '発想'] },
];

describe('classifyBook（本の特徴から分野）', () => {
  for (const b of BOOKS) {
    it(`『${b.title}』→ ${b.expect.join('・')}`, () => {
      const got = classifyBook(b);
      expect(got.length).toBeGreaterThan(0);
      expect(got.length).toBeLessThanOrEqual(2);
      // 1 つ目は期待のどれか、期待にない分野は付けない
      expect(b.expect).toContain(got[0]);
      for (const g of got) expect(b.expect, `${b.title}: ${got}`).toContain(g);
    });
  }
  it('書名だけでも分かるものは付く', () => {
    expect(classifyBook({ title: 'イシューからはじめよ' })).toEqual(['問いを立てる']);
    expect(classifyBook({ title: '数値化の鬼' })).toEqual(['数字で見る']);
    expect(classifyBook({ title: '嫌われる勇気' })).toEqual(['心の持ち方']);
    expect(classifyBook({ title: '金持ち父さん 貧乏父さん' })).toEqual(['お金']);
    expect(classifyBook({ title: 'アトミック・ハビット' })).toEqual(['習慣']);
    expect(classifyBook({ title: '1兆ドルコーチ' })).toEqual(['人を育てる']);
  });
  it('分からなければ付けない', () => {
    expect(classifyBook({ title: 'チーズはどこへ消えた？' })).toEqual([]);
    expect(classifyBook({ title: 'ノルウェイの森' })).toEqual([]);
    expect(classifyBook({ title: '' })).toEqual([]);
    expect(classifyBook({ title: 'Just do it, wait' })).toEqual([]);
  });
  it('紹介文に弱い言葉が 1 つ出ただけでは付けない', () => {
    expect(classifyBook({ title: '旅の本', description: '毎日の小さな発見。' })).toEqual([]);
  });
});

describe('前の版のタグを分ける', () => {
  it('分野に結びつくタグは分野に・結びつかないタグはフォルダへ（消さない）', () => {
    expect(splitLegacyTags(['思考法', '仕事術'])).toEqual({ fields: ['問いを立てる', '段取り'], folders: [] });
    expect(splitLegacyTags(['マネジメント', 'コミュニケーション'])).toEqual({ fields: ['伝え方', 'チームづくり', '人を育てる'], folders: [] });
    expect(splitLegacyTags(['読書術', '習慣'])).toEqual({ fields: ['習慣'], folders: ['読書術'] });
    expect(splitLegacyTags(['心理学'])).toEqual({ fields: ['人の心理'], folders: [] });
    expect(splitLegacyTags(['キャリア'])).toEqual({ fields: ['生き方・働き方'], folders: [] });
    expect(splitLegacyTags(['会社の課題図書', '@仕事', ' '])).toEqual({ fields: [], folders: ['会社の課題図書', '@仕事'] });
  });
  it('分野は 3 つまで', () => {
    expect(splitLegacyTags(['マネジメント', 'コミュニケーション', '習慣', 'お金']).fields).toHaveLength(FIELD_MAX);
  });
  it('fieldsForTag: 言い換え・含む言葉', () => {
    expect(fieldsForTag('#習慣化')).toEqual(['習慣']);
    expect(fieldsForTag('時間術')).toEqual(['段取り']);
    expect(fieldsForTag('小説')).toEqual(['物語・エッセイ']);
    expect(fieldsForTag('読書術')).toEqual([]);
    expect(fieldsForTag('AI')).toEqual(['テクノロジー']);
  });
});

describe('本の分野の読み書き', () => {
  it('fieldsOf は一覧の順・分野だけ', () => {
    expect(fieldsOf({ tags: ['段取り', '読書術', '問いを立てる'] })).toEqual(['問いを立てる', '段取り']);
    expect(nonFieldTags({ tags: ['段取り', '読書術'] })).toEqual(['読書術']);
    expect(isBookField('お金')).toBe(true);
    expect(isBookField('マネジメント')).toBe(false);
  });
  it('withFields は分野でないタグを残す・3 つまで', () => {
    expect(withFields(['読書術', '習慣'], ['お金', '発想'])).toEqual(['お金', '発想', '読書術']);
    expect(withFields([], ['経済', 'お金', '習慣', '発想'])).toHaveLength(3);
  });
});

describe('記録の「分野」', () => {
  const books = [
    { id: 'a', tags: ['問いを立てる'] },
    { id: 'b', tags: ['問いを立てる', '段取り'] },
    { id: 'c', tags: ['段取り'] },
    { id: 'd', tags: ['お金'] },
    { id: 'e', tags: [] },
  ];
  it('本のある分野だけ行に・メモと時間を数える（時間は分野の数で分ける）', () => {
    const r = buildFieldRecord(books, { memoCountByBook: { a: 3, b: 2 }, secondsByBook: { b: 600 } });
    expect(r.any).toBe(true);
    const flat = r.groups.flatMap((g) => g.fields);
    expect(flat.map((f) => [f.name, f.books, f.memos, f.seconds])).toEqual([['お金', 1, 0, 0], ['問いを立てる', 2, 5, 300], ['段取り', 2, 2, 300]]);
    // 読書の時間の「分野ごと」と同じ分を渡したら、その分を出す
    const r2 = buildFieldRecord(books, { secondsByBook: { b: 600 }, minutesByField: { 問いを立てる: 6, 段取り: 4 } });
    expect(r2.groups.flatMap((g) => g.fields).map((f) => f.minutes)).toEqual([0, 6, 4]);
    expect(r.groups.map((g) => g.name)).toEqual(['自分の軸', '仕事の腕']);
    // 少ない分野: 本の無い分野から一覧の順に 2 つ
    expect(r.thin).toEqual(['生き方・働き方', '心の持ち方']);
  });
  it('分野の付いた本が無ければ any=false', () => {
    expect(buildFieldRecord([{ id: 'x', tags: ['読書術'] }]).any).toBe(false);
  });
  it('AI 選書の下書き', () => {
    expect(advisorDraftFor('お金')).toBe('お金について、視点を増やしたい');
  });
});
