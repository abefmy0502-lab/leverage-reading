import { describe, it, expect } from 'vitest';
import {
  normalizeForMatch, quoteInMemo, extractQuotes, verifyRefLine, verifyAnswerQuotes,
  decodeQuoteRefs, stripQuotes, QUOTE_PREFIX, stripPageRefs, groundRefs,
} from './evidenceCheck';

const sources = [
  { title: 'イシューからはじめよ', page: 25, text: '答えを出す前に「本当に答えるべき問い（イシュー）」かを確かめる。', personal: false },
  { title: 'イシューからはじめよ', page: 88, text: '分析の前にストーリーラインと絵コンテを作る。', personal: false },
  { title: '嫌われる勇気', page: null, text: '人の評価が気になったら「これは誰の課題？」と自分に聞く', personal: false },
  { title: '', page: null, text: '先輩との会話で「相手の関心軸を聞く」が刺さった', personal: true, created_at: '2026-01-05T09:00:00Z' },
];

describe('normalizeForMatch', () => {
  it('空白・句読点・かっこ・全角半角の違いを無視する', () => {
    expect(normalizeForMatch('分析の前に、ストーリーライン（絵コンテ）を作る。')).toBe(normalizeForMatch('分析の前に ストーリーライン 絵コンテを作る'));
    expect(normalizeForMatch('ＡＢＣ　１２３')).toBe('abc123');
  });
});

describe('quoteInMemo', () => {
  it('句読点や空白が違っても、メモの中にあれば一致', () => {
    expect(quoteInMemo('分析の前に ストーリーラインと絵コンテを作る', sources[1].text)).toBe(true);
  });
  it('「…」で省いた引用は、前後がメモにあれば一致', () => {
    expect(quoteInMemo('答えを出す前に…かを確かめる', sources[0].text)).toBe(true);
  });
  it('ほぼ同じ文字の並び（一字違い）は一致', () => {
    expect(quoteInMemo('分析の前にストーリーラインと絵コンテをつくる', sources[1].text)).toBe(true);
  });
  it('作った引用は一致しない', () => {
    expect(quoteInMemo('データを集めてから考えるのが一番大事', sources[1].text)).toBe(false);
  });
  it('短すぎる引用は部分一致だけ', () => {
    expect(quoteInMemo('問い', sources[0].text)).toBe(true);
    expect(quoteInMemo('問題', sources[0].text)).toBe(false);
  });
});

describe('extractQuotes', () => {
  it('入れ子の「」を 1 つの引用として取り出す', () => {
    const q = extractQuotes('『嫌われる勇気』のメモ：「人の評価が気になったら「これは誰の課題？」と自分に聞く」');
    expect(q).toHaveLength(1);
    expect(q[0].text).toBe('人の評価が気になったら「これは誰の課題？」と自分に聞く');
  });
  it('閉じていない「は行末まで', () => {
    expect(extractQuotes('p.25「答えを出す前に').map((q) => q.text)).toEqual(['答えを出す前に']);
  });
});

describe('verifyRefLine', () => {
  it('一致した引用は、実際のメモの文を返す', () => {
    const v = verifyRefLine('- 『イシューからはじめよ』(p.25) より: 「答えを出す前に、本当に答えるべき問いかを確かめる」', sources);
    expect(v.status).toBe('ok');
    expect(v.memo).toBe(sources[0].text);
    expect(v.page).toBe(25);
  });
  it('一致しない引用は見せない', () => {
    const v = verifyRefLine('- 『イシューからはじめよ』(p.25) より: 「仮説は 3 つまでに絞る」', sources);
    expect(v.status).toBe('ng');
    expect(v.memo).toBe('');
  });
  it('別の本のメモにある引用は、その本の根拠として認めない', () => {
    const v = verifyRefLine('- 『イシューからはじめよ』より: 「これは誰の課題？」', sources);
    expect(v.status).toBe('ng');
  });
  it('入れ子の「」を含む引用も一致', () => {
    const v = verifyRefLine('- 『嫌われる勇気』 のメモ：「人の評価が気になったら「これは誰の課題？」と自分に聞く」', sources);
    expect(v.status).toBe('ok');
  });
  it('引用の無い要約でも、ページが 1 件に決まればそのメモ', () => {
    const v = verifyRefLine('- 『イシューからはじめよ』(p.88) より: 先に全体の筋を決めてから調べる', sources);
    expect(v.status).toBe('ok');
    expect(v.memo).toBe(sources[1].text);
  });
  it('引用の無い要約で、メモが決まらなければ AI の文のまま', () => {
    const v = verifyRefLine('- 『イシューからはじめよ』より: 考える順番を大事にする', sources);
    expect(v.status).toBe('none');
    expect(v.line).toContain('考える順番');
  });
  it('学びは学びの中から探す', () => {
    const v = verifyRefLine('- 自分の学び (2026-01-05) より: 「相手の関心軸を聞く」', sources);
    expect(v.status).toBe('ok');
    // 見出し「自分の学び（1月5日）」のための印と記録日
    expect(v).toMatchObject({ personal: true, date: '2026-01-05' });
    expect(verifyRefLine('- 『嫌われる勇気』より: 「これは誰の課題？」', sources).personal).toBe(false);
  });
});

describe('verifyAnswerQuotes / decodeQuoteRefs', () => {
  const body = [
    '【結論】', '問いを先に決めましょう。', '',
    '【参照した本のメモ】',
    '- 『イシューからはじめよ』(p.25) より: 「答えを出す前に、本当に答えるべき問いかを確かめる」',
    '- 『嫌われる勇気』より: 「他人の期待を満たすために生きてはいけない」',
    '（原則 2〜3 冊以上の異なる本から）', '',
    '【あなたの状況に合わせた解釈】', '「問い」を先に。', '',
    '【明日からできる 1 つの行動】', '明日の朝、会議の問いを 1 行で書く。',
  ].join('\n');
  it('参照の行ごとに確かめ、refs に残せる形で返す', () => {
    const out = verifyAnswerQuotes(body, sources);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.startsWith(QUOTE_PREFIX))).toBe(true);
    const d = decodeQuoteRefs(['📚 著者『本』p.1', ...out, `${QUOTE_PREFIX}{壊れた`]);
    expect(d.map((x) => x.s)).toEqual(['ok', 'ng']);
    expect(d[0].x).toBe(sources[0].text);
    expect(d[1].x).toBe('');
  });
  it('本ごとの答えの「根拠：」も確かめる', () => {
    const pb = [
      '【結論】', '一点に絞る。', '',
      '【本ごとの視点】',
      '◆『イシューからはじめよ』｜安宅和人', '視点：問いを確かめる。', '根拠：p.88「分析の前にストーリーラインと絵コンテを作る」', '',
      '◆『嫌われる勇気』｜岸見一郎', '視点：課題を分ける。', '根拠：「嫌われることを恐れるな」',
    ].join('\n');
    const d = decodeQuoteRefs(verifyAnswerQuotes(pb, sources));
    expect(d).toEqual([
      expect.objectContaining({ k: 'b', t: 'イシューからはじめよ', s: 'ok', p: 88 }),
      expect.objectContaining({ k: 'b', t: '嫌われる勇気', s: 'ng' }),
    ]);
  });
  it('渡したメモが無ければ何も返さない', () => {
    expect(verifyAnswerQuotes(body, [])).toEqual([]);
  });
});

describe('stripQuotes', () => {
  it('引用だけを外し、ページは残す', () => {
    expect(stripQuotes('p.25「作った引用」')).toBe('p.25');
  });
});

describe('一致したメモの id・本・記録日（本を探す問いの答えの行）', () => {
  it('カード式のメモに一致したら i / b / c を残す', async () => {
    const { verifyAnswerQuotes, decodeQuoteRefs } = await import('./evidenceCheck');
    const sources = [{ title: 'エッセンシャル思考', page: 64, text: '頼まれごとに即答しない。一度持ち帰ると、断る余地が生まれる。', card: true, id: 'm-64', book_id: 'b-e', created_at: '2026-05-27T10:00:00Z' }];
    const body = '【結論】\n『エッセンシャル思考』に書いていました。\n\n【参照した本のメモ】\n- 『エッセンシャル思考』p.64 のメモ：「断る余地が生まれる」';
    const [c] = decodeQuoteRefs(verifyAnswerQuotes(body, sources));
    expect(c).toMatchObject({ k: 'r', s: 'ok', i: 'm-64', b: 'b-e', c: '2026-05-27', p: 64 });
  });
});

// 2026-10-04（オーナー「似たような事象が起きないか」）: 渡したメモに無い本・ページを、根拠として見せない。
describe('渡したメモに無い本・ページ', () => {
  it('渡したメモに無い本の参照は x（画面に出さない）', () => {
    const v = verifyRefLine('- 『7つの習慣』(p.88) より: 主体性を発揮する', sources);
    expect(v.status).toBe('x');
    expect(v.line).toBe('');
    expect(verifyRefLine('- 『7つの習慣』より: 「答えを出す前に」', sources).status).toBe('x');
  });
  it('学びが渡っていないのに「自分の学び」を挙げたら x', () => {
    const books = sources.filter((s) => !s.personal);
    expect(verifyRefLine('- 自分の学び より: 相手の関心軸を聞く', books).status).toBe('x');
  });
  it('一致した引用のページは、メモのページ（AI が書いたページではなく）', () => {
    const v = verifyRefLine('- 『イシューからはじめよ』(p.300) より: 「分析の前にストーリーラインと絵コンテを作る」', sources);
    expect(v).toMatchObject({ status: 'ok', page: 88 });
    // ページの無いメモに一致したら、ページは出さない
    expect(verifyRefLine('- 『嫌われる勇気』p.12 より: 「これは誰の課題？」', sources)).toMatchObject({ status: 'ok', page: null });
  });
  it('AI の文のまま見せる行は、その本のメモに無いページを外す', () => {
    const v = verifyRefLine('- 『イシューからはじめよ』(p.300) より: 考える順番を大事にする', sources);
    expect(v.status).toBe('none');
    expect(v.page).toBeNull();
    expect(v.line).not.toMatch(/p\.300/);
    expect(v.line).toContain('考える順番');
  });
  it('本ごとの根拠: 一致したメモとページが違えば w（画面はページを外す）・p はメモのページ', () => {
    const pb = [
      '【結論】', '一点に絞る。', '',
      '【本ごとの視点】',
      '◆『イシューからはじめよ』｜安宅和人', '視点：問いを確かめる。', '根拠：p.300「分析の前にストーリーラインと絵コンテを作る」',
    ].join('\n');
    const [c] = decodeQuoteRefs(verifyAnswerQuotes(pb, sources));
    expect(c).toMatchObject({ k: 'b', s: 'ok', p: 88, w: 1 });
  });
  it('stripPageRefs', () => {
    expect(stripPageRefs('『A』(p.25) より: 文')).toBe('『A』 より: 文');
    expect(stripPageRefs('p.25「引用」')).toBe('「引用」');
  });
});

describe('groundRefs（REFS を渡したメモと突き合わせる）', () => {
  it('渡したメモに無い本の行は消し、メモに無いページは外す', () => {
    const out = groundRefs([
      '📚 安宅和人『イシューからはじめよ』p.25',
      '📚 安宅和人『イシューからはじめよ』p.300',
      '📚 スティーブン・R・コヴィー『7つの習慣』p.88',
      '📖 岸見一郎『嫌われる勇気』まとめメモ',
    ], sources);
    expect(out).toEqual([
      '📚 安宅和人『イシューからはじめよ』p.25',
      '📚 安宅和人『イシューからはじめよ』',
      '📖 岸見一郎『嫌われる勇気』まとめメモ',
    ]);
  });
  it('1 行に 2 冊は、渡したメモにある本だけ 1 冊 1 行に', () => {
    expect(groundRefs(['📚 『7つの習慣』または『嫌われる勇気』p.3'], sources)).toEqual(['📚 『嫌われる勇気』']);
  });
  it('学び: 学びが渡っていなければ消す・その日の学びが無ければ日付を外す', () => {
    expect(groundRefs(['💡 自分の学び (2026-01-05 / 仕事)'], sources)).toEqual(['💡 自分の学び (2026-01-05 / 仕事)']);
    expect(groundRefs(['💡 自分の学び (2025-12-31 / 仕事)'], sources)).toEqual(['💡 自分の学び (/ 仕事)']);
    expect(groundRefs(['💡 自分の学び (2026-01-05)'], sources.filter((s) => !s.personal))).toEqual([]);
  });
  it('渡したメモが無ければそのまま', () => {
    expect(groundRefs(['📚 『7つの習慣』'], [])).toEqual(['📚 『7つの習慣』']);
  });
});
