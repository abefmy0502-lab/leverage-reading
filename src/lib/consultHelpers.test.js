import { describe, it, expect } from 'vitest';
import { buildConsultExamples, standaloneAction, stripRelativeDayLead, questionGist, needsSubject, WORRY_EXAMPLES, actionGist, recentReflectedAction, memoSearchQuery, answerStepToAction } from './consultHelpers';

describe('答えの一歩を行動の形に（answerStepToAction・2026-09-29）', () => {
  it('す で終わる動詞は「〜す」', () => {
    expect(answerStepToAction('気づいたことを1行残してください')).toBe('気づいたことを1行残す');
    expect(answerStepToAction('上司に話してください。')).toBe('上司に話す');
    expect(answerStepToAction('紙に書き出してください')).toBe('紙に書き出す');
    expect(answerStepToAction('資料を探してください')).toBe('資料を探す');
    expect(answerStepToAction('メモを渡してください')).toBe('メモを渡す');
    expect(answerStepToAction('結論から話しましょう')).toBe('結論から話す');
    expect(answerStepToAction('残してください')).toBe('残す');
    expect(answerStepToAction('確認してください')).toBe('確認する');
    expect(answerStepToAction('共有してください')).toBe('共有する');
    expect(answerStepToAction('メモしてください')).toBe('メモする');
    expect(answerStepToAction('書き出してください')).toBe('書き出す');
    expect(answerStepToAction('話してください')).toBe('話す');
    expect(answerStepToAction('資料を全部渡してください')).toBe('資料を全部渡す');
    expect(answerStepToAction('部下と直接話してください')).toBe('部下と直接話す');
    expect(answerStepToAction('部下と対話してください')).toBe('部下と対話する');
    expect(answerStepToAction('同僚を後押ししてください')).toBe('同僚を後押しする');
  });
  it('漢字・カタカナ 2 文字以上のあとは「〜する」', () => {
    expect(answerStepToAction('予定を確認してください')).toBe('予定を確認する');
    expect(answerStepToAction('チームで共有してください！')).toBe('チームで共有する');
    expect(answerStepToAction('気づきをメモしてください')).toBe('気づきをメモする');
    expect(answerStepToAction('週に1回ふりかえりを確認しましょう')).toBe('週に1回ふりかえりを確認する');
  });
  it('「を」「に」のあとは「する」・「〜てみてください」は「〜てみる」', () => {
    expect(answerStepToAction('確認をしてください')).toBe('確認をする');
    expect(answerStepToAction('時間を大切にしてください')).toBe('時間を大切にする');
    expect(answerStepToAction('1つだけ試してみてください')).toBe('1つだけ試してみる');
    expect(answerStepToAction('5分だけ読んでみてください')).toBe('5分だけ読んでみる');
    expect(answerStepToAction('朝に10分歩く')).toBe('朝に10分歩く');
  });
});

describe('やってみた行動の次（相談例の 1 つ目・2026-09-29）', () => {
  const now = Date.parse('2026-09-29T12:00:00+09:00');
  const day = 86400000;
  const acts = [
    { text: '部下への報告：週に1回、結論から話す場をつくる', done: true, completedAt: new Date(now - 2 * day).toISOString(), reflection: '話が早く終わった' },
    { text: '古い行動', done: true, completedAt: new Date(now - 10 * day).toISOString(), reflection: '前のふりかえり' },
    { text: 'ふりかえりの無い行動', done: true, completedAt: new Date(now - day).toISOString(), reflection: '' },
    { text: 'まだの行動', done: false, reflection: 'x' },
  ];
  it('この 7 日でふりかえりを書いて完了した行動を 1 つ目に', () => {
    const ex = buildConsultExamples({ books: [], actions: acts, now, lastConsult: { question: '部下が報告をくれない' }, count: 3 });
    expect(ex[0]).toEqual({ text: 'やってみた「週に1回、結論から話す場をつくる」、次はどうする？', kind: 'acted' });
    expect(ex[1].kind).toBe('continue');
  });
  it('7 日より前・ふりかえりが無い・まだの行動は使わない', () => {
    expect(recentReflectedAction(acts.slice(1), now)).toBeNull();
    const ex = buildConsultExamples({ books: [], actions: acts.slice(1), now, count: 2 });
    expect(ex.some((e) => e.kind === 'acted')).toBe(false);
  });
  it('行動の短い形: 相談の要約の頭を外し、長ければ切ってかっこを閉じる', () => {
    expect(actionGist('上司への報告：毎朝「結論・理由・次の一歩」を三行で送る')).toMatch(/^毎朝「結論・理由・次の一歩」/);
    expect(actionGist('会議の前に目的を1行で書いて、参加する全員に前日までに共有する。')).toMatch(/…$/);
    expect(actionGist('短い行動。')).toBe('短い行動');
  });
});

describe('memoSearchQuery（トークンを使い切ったときのメモ検索の言葉）', () => {
  it('漢字・カタカナ・英数字のまとまりを 3 つまで', () => {
    expect(memoSearchQuery('上司への報告がうまくいかない')).toBe('上司 報告');
    expect(memoSearchQuery('チームのメンバーが1on1で本音を話してくれません')).toBe('チーム メンバー 1on1');
  });
  it('相談例の続きはかっこの中から・言葉が無ければ最初の 1 文', () => {
    expect(memoSearchQuery('前に相談した「部下が報告をくれない」、その後どう進める？')).toBe('部下 報告');
    expect(memoSearchQuery('どうしたらいいかわからない。')).toBe('どうしたらいいかわからない');
    expect(memoSearchQuery('')).toBe('');
  });
});

const books = [
  { id: 'a', title: '1兆ドルコーチ', status: 'reading', updatedAt: '2026-09-20' },
  { id: 'b', title: 'LIFE SHIFT', status: 'before', currentChallenge: 'いまの会社で定年まで働くイメージが持てない', updatedAt: '2026-09-01' },
  { id: 'c', title: 'イシューからはじめよ', status: 'done', updatedAt: '2026-08-01' },
];

describe('buildConsultExamples', () => {
  it('前の相談の続き → 課題 → 本 の順', () => {
    const ex = buildConsultExamples({ books, memoBookIds: new Set(['a', 'c']), lastConsult: { question: '部下に任せた仕事がいつも遅れる' } });
    expect(ex.map((e) => e.kind)).toEqual(['continue', 'challenge', 'book']);
    expect(ex[0].text).toBe('前に相談した「部下に任せた仕事がいつも遅れる」、その後どう進める？');
    expect(ex[1].text).toBe('いまの会社で定年まで働くイメージが持てない。どう考えればいい？');
    expect(ex[2].text).toBe('『1兆ドルコーチ』の学びで、明日から使えるものは？');
  });
  it('前の相談が無ければ課題から。足りない分はよくある困りごと', () => {
    const ex = buildConsultExamples({ books: [], count: 2 });
    expect(ex.map((e) => e.text)).toEqual(WORRY_EXAMPLES.slice(0, 2));
  });
  it('メモの無い本は例に出さない', () => {
    const ex = buildConsultExamples({ books, memoBookIds: new Set(['c']), count: 3 });
    expect(ex.map((e) => e.text)).toContain('『イシューからはじめよ』の学びで、明日から使えるものは？');
    expect(ex.map((e) => e.text).join()).not.toContain('1兆ドルコーチ');
  });
  it('タグの型（「〜」で迷ったとき…）は出さない', () => {
    const ex = buildConsultExamples({ books: [{ id: 'x', title: 'X', status: 'done', tags: ['読書術'] }] });
    expect(ex.map((e) => e.text).join()).not.toContain('迷ったとき');
  });
  it('メモが 10 件未満なら、本棚のよく読まれている本の困りごとを 2 番目に', () => {
    const shelf = [...books, { id: 'd', title: '嫌われる勇気', status: 'done', updatedAt: '2026-09-25' }];
    const ex = buildConsultExamples({ books: shelf, memoBookIds: new Set(['a', 'd']), lastConsult: { question: '部下に任せた仕事がいつも遅れる' }, memoCount: 3 });
    expect(ex.map((e) => e.kind)).toEqual(['continue', 'worry', 'challenge']);
    expect(ex[1].text).toBe('人の目が気になって、言いたいことが言えません');
    const many = buildConsultExamples({ books: shelf, memoBookIds: new Set(['a', 'd']), memoCount: 10 });
    expect(many.map((e) => e.text)).not.toContain('人の目が気になって、言いたいことが言えません');
  });
  it('長い相談は短くまとめる', () => {
    const ex = buildConsultExamples({ lastConsult: { question: '新しいプロジェクトのメンバーがなかなか自分から動いてくれず、毎回こちらから声をかけています。' } });
    expect(ex[0].text).toBe('前に相談した「新しいプロジェクトのメンバーがなか…」、その後どう進める？');
  });
});

describe('standaloneAction', () => {
  it('単独で分かる一歩はそのまま', () => {
    expect(standaloneAction('始業前の 10 分で、1on1 の最初の 5 分を近況の話にする', '部下が報告をくれない')).toBe('始業前の 10 分で、1on1 の最初の 5 分を近況の話にする');
  });
  it('頭の「明日の朝、」「今日は」は外す（期限はアプリが付ける）', () => {
    expect(standaloneAction('明日の朝、1on1 の最初の 5 分を近況の話にする', '部下が報告をくれない')).toBe('1on1 の最初の 5 分を近況の話にする');
    expect(standaloneAction('明日、部下に進み具合を 1 つだけ聞く', 'x')).toBe('部下に進み具合を 1 つだけ聞く');
    expect(standaloneAction('明日の午前中に、企画の要点を 3 行で書く', 'x')).toBe('企画の要点を 3 行で書く');
    expect(standaloneAction('今日は帰る前に、机の上の書類を 1 つ片づける', 'x')).toBe('帰る前に、机の上の書類を 1 つ片づける');
    expect(standaloneAction('今日の会議で、最初に結論を話す', 'x')).toBe('会議で、最初に結論を話す');
  });
  it('外すと意味が崩れるときは外さない', () => {
    expect(stripRelativeDayLead('明日までに資料を見直す')).toBe('明日までに資料を見直す');
    expect(stripRelativeDayLead('明日の朝の会議で結論から話す')).toBe('朝の会議で結論から話す');
    expect(stripRelativeDayLead('今日から毎朝 5 分、日記を書く')).toBe('今日から毎朝 5 分、日記を書く');
    expect(stripRelativeDayLead('明日やる')).toBe('明日やる');
    expect(stripRelativeDayLead('明日香さんに相談する')).toBe('明日香さんに相談する');
  });
  it('「それ」で始まる一歩には相談の要約を付ける', () => {
    expect(standaloneAction('それを紙に 1 行で書き出す', '部下が報告をくれなくて困っています')).toBe('部下が報告をくれなくて困っています：それを紙に 1 行で書き出す');
  });
  it('中に「この件」があるときも付ける', () => {
    expect(needsSubject('明日の朝、この件について 10 分考える')).toBe(true);
  });
  it('上限の長さを超えない', () => {
    expect(standaloneAction('その件を'.repeat(200), '会議で話がまとまりません', 500).length).toBeLessThanOrEqual(500);
  });
  it('相談が無ければ付けない', () => {
    expect(standaloneAction('それを書き出す', '')).toBe('それを書き出す');
  });
});

describe('questionGist', () => {
  it('最初の 1 文だけ・句読点を外す', () => {
    expect(questionGist('会議が長い。どうすれば？')).toBe('会議が長い');
  });
  it('「前に相談した「X」、その後どう進める？」なら X を取り出す', () => {
    expect(questionGist('前に相談した「部下が報告をくれない」、その後どう進める？')).toBe('部下が報告をくれない');
  });
  it('続きの続きも、いちばん中の相談を取り出す', () => {
    expect(questionGist('前に相談した「前に相談した「会議が長い」、その後どう進める？」、その後どう進める？')).toBe('会議が長い');
  });
  it('かっこの中の「。」「？」では文を切らない', () => {
    expect(questionGist('上司に「なぜ？」と聞かれて困った。どうする？', 30)).toBe('上司に「なぜ？」と聞かれて困った');
  });
  it('かっこの中では切らない（かっこの手前で切る）', () => {
    const g = questionGist('先週の会議で「このプロジェクトは誰の責任なのか」と言われた', 20);
    expect(g).toBe('先週の会議で…');
  });
  it('かっこで始まる長い文は中で切り、閉じかっこを補う', () => {
    const g = questionGist('「任せたのに結局自分でやり直してしまう問題」をどうにかしたい', 12);
    expect(g).toBe('「任せたのに結局自分…」');
  });
  it('どの要約もかっこの数がそろう', () => {
    ['「あいうえお', '前に相談した「「長い長い長い長い長い長い長い長い長い長い」」、その後', '『本の名前がとても長いときの相談ですがどうでしょう』'].forEach((q) => {
      const g = questionGist(q, 10);
      expect(g.split('「').length).toBe(g.split('」').length);
      expect(g.split('『').length).toBe(g.split('』').length);
    });
  });
});

describe('続きの相談の例と行動', () => {
  it('前の相談が「続き」の例でも、例は入れ子にしない', () => {
    const ex = buildConsultExamples({ lastConsult: { question: '前に相談した「部下が報告をくれない」、その後どう進める？' }, count: 1 });
    expect(ex[0].text).toBe('前に相談した「部下が報告をくれない」、その後どう進める？');
  });
  it('続きの相談から行動に入れるときは、元の相談の要約を付ける', () => {
    expect(standaloneAction('その件を 1on1 で聞く', '前に相談した「部下が報告をくれない」、その後どう進める？'))
      .toBe('部下が報告をくれない：その件を 1on1 で聞く');
  });
});

import { BOOK_WORRIES, worryForBook, quickstartWorries } from './consultHelpers';
describe('初日クイックスタートの困りごと', () => {
  it('よく読まれている 12 冊すべてに困りごとがある', () => {
    expect(Object.keys(BOOK_WORRIES)).toHaveLength(12);
    Object.values(BOOK_WORRIES).forEach((w) => expect(w.length).toBeGreaterThan(8));
  });
  it('書名の一致・副題つき・全角半角の違いでも引ける', () => {
    expect(worryForBook({ title: '嫌われる勇気' })).toBe(BOOK_WORRIES['嫌われる勇気']);
    expect(worryForBook({ title: '完訳 7つの習慣' })).toBe('');
    expect(worryForBook({ title: '７つの習慣 人格主義の回復' })).toBe(BOOK_WORRIES['7つの習慣']);
    expect(worryForBook({ title: 'factfulness' })).toBe(BOOK_WORRIES.FACTFULNESS);
  });
  it('えらんだ本の困りごとを先に、次にえらんだ本の学びの問い、足りない分はよくある困りごと', () => {
    expect(quickstartWorries([{ title: '伝え方が9割' }, { title: '知らない本' }], 2))
      .toEqual([BOOK_WORRIES['伝え方が9割'], '『知らない本』の学びで、明日から使えるものは？']);
    expect(quickstartWorries([{ title: '伝え方が9割' }], 3))
      .toEqual([BOOK_WORRIES['伝え方が9割'], '『伝え方が9割』の学びで、明日から使えるものは？', WORRY_EXAMPLES[0]]);
    expect(quickstartWorries([], 2)).toEqual([WORRY_EXAMPLES[0], WORRY_EXAMPLES[1]]);
    expect(quickstartWorries([{ title: '1兆ドルコーチ' }, { title: '数値化の鬼' }, { title: '人を動かす' }], 2))
      .toEqual([BOOK_WORRIES['1兆ドルコーチ'], BOOK_WORRIES['数値化の鬼']]);
  });
  it('同じ文は重ねない', () => {
    expect(quickstartWorries([{ title: 'エッセンシャル思考' }], 3)).toEqual([BOOK_WORRIES['エッセンシャル思考'], '『エッセンシャル思考』の学びで、明日から使えるものは？', WORRY_EXAMPLES[0]]);
    expect(quickstartWorries([{ title: 'エッセンシャル思考' }, { title: 'エッセンシャル思考' }], 4)).toHaveLength(4);
  });
});

import { hasSummaryMemo, countSummaryMemos } from './consultHelpers';
describe('メモの数え方（カード式＋まとめ）', () => {
  const bs = [
    { id: 'a', title: 'A', status: 'done', leverageMemo: '感想' },
    { id: 'b', title: 'B', status: 'done', leverageMemo: '  ' },
    { id: 'c', title: 'C', status: 'done', leverage_memo: 'まとめ' },
  ];
  it('まとめの入っている本を 1 冊 1 件で数える（空白だけは数えない）', () => {
    expect(hasSummaryMemo(bs[1])).toBe(false);
    expect(countSummaryMemos(bs)).toBe(2);
    expect(countSummaryMemos(bs, ['a', 'b'])).toBe(1);
  });
  it('まとめだけの本も相談例の「メモのある本」に入る', () => {
    const ex = buildConsultExamples({ books: bs, memoBookIds: new Set(), count: 1 });
    expect(ex[0].text).toBe('『A』の学びで、明日から使えるものは？');
  });
});

import { fmtTokens, consultsLeft } from './consultHelpers';
describe('トークンの見せ方', () => {
  it('3 桁ごとに区切る', () => {
    expect(fmtTokens(1000)).toBe('1,000');
    expect(fmtTokens(20)).toBe('20');
  });
  it('相談できるおよその回数（最後の 1 回を含む）', () => {
    expect(consultsLeft(20, 10)).toBe(2);
    expect(consultsLeft(5, 10)).toBe(1);
    expect(consultsLeft(0, 10)).toBe(0);
  });
});

import { shortTitle } from './consultHelpers';
describe('shortTitle（相談例に出す短い書名）', () => {
  it('短い書名はそのまま', () => {
    expect(shortTitle('嫌われる勇気')).toBe('嫌われる勇気');
    expect(shortTitle('LIFE SHIFT')).toBe('LIFE SHIFT');
  });
  it('読書メーターの副題つきの書名は最初の区切りまで', () => {
    expect(shortTitle('嫌われる勇気―自己啓発の源流「アドラー」の教え')).toBe('嫌われる勇気');
    expect(shortTitle('イシューからはじめよ ― 知的生産の「シンプルな本質」')).toBe('イシューからはじめよ');
    expect(shortTitle('エッセンシャル思考：最少の時間で成果を最大にする')).toBe('エッセンシャル思考');
    expect(shortTitle('FACTFULNESS(ファクトフルネス) 10の思い込みを乗り越え、データを基に世界を正しく見る習慣')).toBe('FACTFULNESS(ファクトフルネス)');
  });
  it('英単語どうしの空白や「完訳」などの頭では切らない', () => {
    expect(shortTitle('LIFE SHIFT 100年時代の人生戦略')).toBe('LIFE SHIFT');
    expect(shortTitle('完訳 7つの習慣 人格主義の回復')).toBe('完訳 7つの習慣');
  });
  it('区切りが無ければそのまま', () => {
    expect(shortTitle('人生がときめく片づけの魔法ときめきの本')).toBe('人生がときめく片づけの魔法ときめきの本');
  });
  it('相談例の書名に使う', () => {
    const ex = buildConsultExamples({ books: [{ id: 'k', title: '嫌われる勇気―自己啓発の源流「アドラー」の教え', status: 'done' }], memoBookIds: new Set(['k']), count: 1 });
    expect(ex[0].text).toBe('『嫌われる勇気』の学びで、明日から使えるものは？');
  });
});
