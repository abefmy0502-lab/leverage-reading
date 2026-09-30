import { describe, it, expect } from 'vitest';
import { parseAnswer, parseBookViews } from './MyBookBrain';

const perBook = [
  '【結論】',
  '焦りを分けて、動かせる一点に集中する。',
  '',
  '【本ごとの視点】',
  '◆『嫌われる勇気』｜岸見一郎・古賀史健',
  '視点：『嫌われる勇気』の視点では、評価は相手の課題です。',
  '根拠：p.40「他人の課題と自分の課題を分ける」',
  '',
  '◆『エッセンシャル思考』｜グレッグ・マキューン',
  '視点：やらないことを決める。',
  '続けて書いた二行目。',
  '根拠：「やらないことを決めることが、いちばん大事な仕事」',
  '',
  '【共通点と違い】',
  'どちらも自分で変えられることに集中する。',
  '',
  '【明日からできる 1 つの行動】',
  '明日の朝、10 分で商談を 1 つ選ぶ。',
  '',
  '（お試しモードの応答です）',
].join('\n');

describe('parseAnswer（本ごとに）', () => {
  it('結論・本ごとの視点・共通点と違い・一歩に分ける', () => {
    const p = parseAnswer(perBook);
    expect(p.conclusion).toBe('焦りを分けて、動かせる一点に集中する。');
    expect(p.books).toHaveLength(2);
    expect(p.books[0]).toMatchObject({ title: '嫌われる勇気', author: '岸見一郎・古賀史健', page: 40 });
    // 見出しの繰り返し「『嫌われる勇気』の視点では、」は外す
    expect(p.books[0].view).toBe('評価は相手の課題です。');
    expect(p.books[0].basis).toBe('p.40「他人の課題と自分の課題を分ける」');
    expect(p.compare).toBe('どちらも自分で変えられることに集中する。');
    expect(p.action).toBe('明日の朝、10 分で商談を 1 つ選ぶ。');
    expect(p.note).toContain('お試しモード');
    expect(p.booksRaw).toBe('');
  });
  it('ページの無い根拠は page=null、視点の続きの行は視点に足す', () => {
    const b = parseAnswer(perBook).books[1];
    expect(b.page).toBeNull();
    expect(b.view).toBe('やらないことを決める。\n続けて書いた二行目。');
    expect(b.basis).toContain('いちばん大事な仕事');
  });
  it('いつもの答え（【本ごとの視点】なし）は books=null のまま', () => {
    const p = parseAnswer('【結論】\nx\n\n【参照した本のメモ】\n- 『A』\n\n【明日からできる 1 つの行動】\ny');
    expect(p.books).toBeNull();
    expect(p.compare).toBe('');
    expect(p.refs).toContain('『A』');
  });
  it('◆ の形が崩れていたら、節をそのまま booksRaw で返す（捨てない）', () => {
    const p = parseAnswer('【結論】\nx\n\n【本ごとの視点】\n嫌われる勇気では評価は相手の課題。\n\n【共通点と違い】\nz');
    expect(p.books).toEqual([]);
    expect(p.booksRaw).toContain('評価は相手の課題');
    expect(p.compare).toBe('z');
  });
  it('書いている途中（閉じていない『・見出しだけ）でも落ちない', () => {
    const p = parseAnswer('【結論】\n焦りを分ける。\n\n【本ごとの視点】\n◆『嫌われる勇');
    expect(p.books).toHaveLength(1);
    expect(p.books[0].title).toBe('嫌われる勇');
    expect(p.books[0].view).toBe('');
  });
});

describe('parseBookViews', () => {
  it('『』の無い見出し・全角コロン・P. の大文字・太字の見出しも読む', () => {
    const { books } = parseBookViews('◆ 7つの習慣｜コヴィー\n**視点**：主体性で捉える。\n根拠：P.12「反応を選ぶ」');
    expect(books[0]).toMatchObject({ title: '7つの習慣', author: 'コヴィー', view: '主体性で捉える。', page: 12 });
  });
  it('最初の ◆ より前の文は lead に分ける', () => {
    const { books, lead } = parseBookViews('3 冊の視点です。\n◆『A』｜著者A\n視点：a');
    expect(lead).toBe('3 冊の視点です。');
    expect(books).toHaveLength(1);
  });
  it('空・壊れた入力でも空配列', () => {
    expect(parseBookViews('').books).toEqual([]);
    expect(parseBookViews(null).books).toEqual([]);
  });
});

describe('parseAnswer（本ごとに・あなたに聞きたいこと）', () => {
  it('【共通点と違い】のあとの問いと候補を読む', () => {
    const p = parseAnswer([
      '【結論】', 'x', '',
      '【本ごとの視点】', '◆『A』｜著者A', '視点：v', '根拠：p.3「q」', '',
      '【共通点と違い】', 'c', '',
      '【あなたに聞きたいこと】', '焦りを強く感じるのは、どんなときですか？', '・数字を見たとき', '・人と比べたとき',
    ].join('\n'));
    expect(p.books).toHaveLength(1);
    expect(p.compare).toBe('c');
    expect(p.question).toBe('焦りを強く感じるのは、どんなときですか？');
    expect(p.replies).toEqual(['数字を見たとき', '人と比べたとき']);
    expect(p.action).toBe('');
  });
});
