import { describe, it, expect } from 'vitest';
import {
  normalizeSearch, normalizeWithMap, splitQuery, stemOf, compileTerms, matchTerm,
  buildLibraryIndex, buildSnippet, searchLibrary, consultQuestionFor, SNIPPET_CHARS,
} from './librarySearch';

const text = (segments) => segments.map((s) => s.text).join('');
const marked = (segments) => segments.filter((s) => s.match).map((s) => s.text);

describe('正規化', () => {
  it('全角・半角・大文字小文字・カタカナ/ひらがなをそろえる', () => {
    expect(normalizeSearch('ＫＰＩ')).toBe('kpi');
    expect(normalizeSearch('１on１')).toBe('1on1');
    expect(normalizeSearch('バッファ')).toBe('ばっふぁ');
    expect(normalizeSearch('ﾊﾞｯﾌｧ')).toBe('ばっふぁ');
    expect(normalizeSearch('ぱーと')).toBe(normalizeSearch('パート'));
  });
  it('元の文字列の位置を覚えている（半角の濁点をまとめても）', () => {
    const { norm, start, end } = normalizeWithMap('aﾊﾞb');
    expect(norm).toBe('aはb'.replace('は', 'ば'));
    expect(start).toEqual([0, 1, 3]);
    expect(end).toEqual([1, 3, 4]);
  });
});

describe('言葉の区切り', () => {
  it('空白・、。などで区切り、重ねない', () => {
    expect(splitQuery('断る 持ち帰る')).toEqual(['断る', '持ち帰る']);
    expect(splitQuery('断る、持ち帰る。断る')).toEqual(['断る', '持ち帰る']);
    expect(splitQuery('「予定」（バッファ）')).toEqual(['予定', 'ばっふぁ']);
    expect(splitQuery('　 ')).toEqual([]);
  });
  it('長音・ハイフンでは区切らない', () => {
    expect(splitQuery('マネージャー')).toEqual(['まねーじゃー']);
    expect(splitQuery('1on1-meeting')).toEqual(['1on1-meeting']);
  });
  it('ひらがな 1 文字は、ほかに言葉があれば外す', () => {
    expect(splitQuery('断る の')).toEqual(['断る']);
    expect(splitQuery('の')).toEqual(['の']);
  });
});

describe('1 つの言葉の探し方', () => {
  it('語尾のひらがなを外した形', () => {
    expect(stemOf('持ち帰った')).toBe('持ち帰');
    expect(stemOf('断った')).toBe(null); // 1 文字の漢字は広すぎるので使わない
    expect(stemOf('やらない')).toBe(null);
    expect(stemOf('会議')).toBe(null);
    expect(stemOf(normalizeSearch('チーム'))).toBe(null); // カタカナの語は外さない（「チーズ」に当てない）
  });
  it('そのまま → 語尾を外した形 → 2 文字の切れ端 の順に探す', () => {
    const [ct] = compileTerms(['持ち帰った']);
    expect(matchTerm('一度持ち帰ると', ct)).toEqual({ kind: 'stem', weight: 0.7 });
    const [p] = compileTerms([normalizeSearch('予定を詰め込まない')]);
    const m = matchTerm(normalizeSearch('予定を詰めすぎない。バッファを入れる'), p);
    expect(m.kind).toBe('partial');
    expect(matchTerm(normalizeSearch('会議の前に資料を読む'), p)).toBe(null);
  });
});

const BOOKS = [
  { id: 'b1', title: 'イシューからはじめよ', author: '安宅和人', tags: ['思考法'] },
  { id: 'b2', title: 'エッセンシャル思考', author: 'グレッグ・マキューン', tags: ['仕事術'], leverageMemo: '全部はやらない。' },
  { id: 'b3', title: '1兆ドルコーチ', author: 'エリック・シュミット', tags: ['マネジメント'], investPurpose: '1on1 でメンバーの力を引き出したい' },
  { id: 'b4', title: '断る力', author: '勝間和代', tags: [] },
];
const MEMOS = [
  { id: 'm1', book_id: 'b2', page_number: 64, text: '頼まれごとに即答しない。「確認して返事します」と一度持ち帰ると、断る余地が生まれる。' },
  { id: 'm2', book_id: 'b2', page_number: 150, text: '予定を詰めすぎない。予備の時間（バッファ）を最初からカレンダーに入れておく。' },
  { id: 'm3', book_id: 'b3', page_number: 61, text: '1on1 は仕事の話の前に、相手の近況や家族の話から始める。' },
  { id: 'm4', book_id: null, text: '会議で意見が割れたときは何を決める会議かを確認する。' },
  { id: 'm5', book_id: 'b1', page_number: null, text: '部長への報告で、結論より経緯を先に話してしまう。', tags: ['報告'] },
];
const index = buildLibraryIndex(BOOKS, MEMOS);
const ids = (r) => r.results.map((x) => x.book.id);

describe('本を探す', () => {
  it('書名・著者で見つかった本を先に、メモで見つかった本をあとに', () => {
    const r = searchLibrary(index, '断る');
    expect(ids(r)).toEqual(['b4', 'b2']);
    expect(r.results[0].meta).toBe(true);
    expect(r.results[0].hit).toBe(null); // 書名で見つかった本に一節は出さない
    expect(r.results[1].meta).toBe(false);
    expect(r.results[1].hit.memoId).toBe('m1');
    expect(r.results[1].hit.page).toBe(64);
    expect(marked(r.results[1].hit.segments)).toEqual(['断る']);
  });

  it('カタカナ・ひらがなの違いを気にしない', () => {
    const r = searchLibrary(index, 'ばっふぁ');
    expect(ids(r)).toEqual(['b2']);
    expect(r.results[0].hit.memoId).toBe('m2');
    expect(marked(r.results[0].hit.segments)).toEqual(['バッファ']);
  });

  it('言葉が多く当たる本から並べる', () => {
    const r = searchLibrary(index, '近況 1on1');
    expect(ids(r)[0]).toBe('b3');
    expect(r.results[0].matched).toBe(2);
  });

  it('本に結びつかない学びは本の検索には出さない', () => {
    expect(ids(searchLibrary(index, '意見が割れた'))).toEqual([]);
  });

  it('この本のまとめ・読書準備・メモのタグでも見つかる', () => {
    const a = searchLibrary(index, '全部はやらない');
    expect(ids(a)).toEqual(['b2']);
    expect(a.results[0].hit).toMatchObject({ kind: 'summary', label: 'この本のまとめ' });
    const b = searchLibrary(index, 'メンバーの力');
    expect(b.results[0].hit).toMatchObject({ kind: 'prep', label: '得たいこと' });
    expect(ids(searchLibrary(index, '報告'))).toEqual(['b1']);
  });

  it('カタカナの語は、語尾を外して別の書名に当てない', () => {
    const idx = buildLibraryIndex([{ id: 'c', title: 'チーズはどこへ消えた？' }, { id: 't', title: 'X' }], [{ id: '1', book_id: 't', text: 'チームの勝利が最優先' }]);
    expect(ids(searchLibrary(idx, 'チーム'))).toEqual(['t']);
  });

  it('本のタグは書名・著者と同じ扱い', () => {
    const r = searchLibrary(index, 'マネジメント');
    expect(ids(r)).toEqual(['b3']);
    expect(r.results[0].meta).toBe(true);
  });

  it('うろ覚え（語尾の違い・言い回しの違い）でも見つかる', () => {
    expect(ids(searchLibrary(index, '持ち帰った'))).toEqual(['b2']);
    const r = searchLibrary(index, '予定を詰め込まない');
    expect(ids(r)).toEqual(['b2']);
    expect(r.results[0].hit.memoId).toBe('m2');
    expect(marked(r.results[0].hit.segments).length).toBeGreaterThan(0);
  });

  it('何も入れなければ何も返さない・見つからなければ空', () => {
    expect(searchLibrary(index, '  ').results).toEqual([]);
    expect(searchLibrary(index, 'zzzz').results).toEqual([]);
  });

  it('同点は渡した並びのまま', () => {
    const idx = buildLibraryIndex(
      [{ id: 'x', title: 'A' }, { id: 'y', title: 'B' }],
      [{ id: '1', book_id: 'y', text: '習慣をつくる' }, { id: '2', book_id: 'x', text: '習慣をつくる' }],
    );
    expect(ids(searchLibrary(idx, '習慣'))).toEqual(['x', 'y']);
  });
});

describe('一節', () => {
  it('文の頭が 12 字以内なら文の頭から、約 40 字', () => {
    const seg = buildSnippet('前の文。予備の時間（バッファ）を最初から入れておく。', compileTerms([normalizeSearch('バッファ')]));
    expect(text(seg)).toBe('…予備の時間（バッファ）を最初から入れておく。');
    expect(marked(seg)).toEqual(['バッファ']);
  });
  it('文の頭が遠ければ言葉の 8 字前から（2 行で切れても言葉が見える）', () => {
    const [ct] = compileTerms(['断る']);
    const seg = buildSnippet(MEMOS[0].text, [ct]);
    const t = text(seg);
    expect(t).toBe('…一度持ち帰ると、断る余地が生まれる。');
    // 言葉は一節の前から 20 字以内（2 行＝約 36 字の中）
    expect(t.indexOf('断る')).toBeLessThanOrEqual(20);
    expect([...t.replace(/…/g, '')].length).toBeLessThanOrEqual(SNIPPET_CHARS);
  });
  it('長い文は言葉の少し前から始め、前後を「…」で切る', () => {
    const long = `${'あ'.repeat(60)}目当ての言葉${'い'.repeat(60)}`;
    const seg = buildSnippet(long, compileTerms([normalizeSearch('目当て')]));
    expect(seg[0].text.startsWith('…')).toBe(true);
    expect(text(seg).endsWith('…')).toBe(true);
    expect(marked(seg)).toEqual(['目当て']);
  });
  it('改行はつめて 1 行に', () => {
    const seg = buildSnippet('一行目\n\n二行目に大事なこと', compileTerms(['大事']));
    expect(text(seg)).not.toMatch(/\n/);
  });
  it('全角で書いた言葉も、元の文字のまま印を付ける', () => {
    const seg = buildSnippet('週に３件、先方に電話する', compileTerms([normalizeSearch('3件')]));
    expect(marked(seg)).toEqual(['３件']);
  });
});

describe('相談で探す', () => {
  it('言葉を入れた問い（送らない下書き）', () => {
    expect(consultQuestionFor(' 断る ')).toBe('『断る』みたいなことを書いた本はどれ？');
    expect(consultQuestionFor('あ'.repeat(50))).toBe(`『${'あ'.repeat(40)}…』みたいなことを書いた本はどれ？`);
  });
});

describe('メモのタグだけで見つかったとき', () => {
  it('一節の上にそのタグを出す（本文に言葉が無くても理由が分かる）', () => {
    const idx = buildLibraryIndex(
      [{ id: 'e', title: 'エッセンシャル思考' }],
      [{ id: 'm', book_id: 'e', page_number: 18, text: '「全部やる」はできない。', tags: ['仕事術'] }],
    );
    const r = searchLibrary(idx, '仕事術');
    expect(r.results.map((x) => x.book.id)).toEqual(['e']);
    expect(r.results[0].hit).toMatchObject({ kind: 'memo', memoId: 'm', page: 18, tag: '仕事術' });
    expect(text(r.results[0].hit.segments)).toBe('「全部やる」はできない。');
  });
  it('本文で見つかった文があれば、そちらを先に（タグは出さない）', () => {
    const idx = buildLibraryIndex(
      [{ id: 'e', title: 'X' }],
      [
        { id: 'a', book_id: 'e', text: '別のこと', tags: ['仕事術'] },
        { id: 'b', book_id: 'e', text: '仕事術の基本を学ぶ' },
      ],
    );
    const hit = searchLibrary(idx, '仕事術').results[0].hit;
    expect(hit.memoId).toBe('b');
    expect(hit.tag).toBe(null);
  });
});
