import { describe, it, expect } from 'vitest';
import { composerChrome, answerEndScrollTop, composerHeight } from './composerView.js';

describe('composerChrome（入力欄に書いている間の上の行）', () => {
  it('カーソルを置いただけ（空のまま）でも、深掘りのチップと相談相手の行を出さない', () => {
    expect(composerChrome({ focused: true, text: '' })).toEqual({ chips: false, scopeBar: false });
  });
  it('書いている間は出さない', () => {
    expect(composerChrome({ focused: true, text: 'もっと' })).toEqual({ chips: false, scopeBar: false });
  });
  it('外れて空なら戻す', () => {
    expect(composerChrome({ focused: false, text: '' })).toEqual({ chips: true, scopeBar: true });
  });
  it('外れても文字が残っていればチップは出さない（相談相手の行は戻す）', () => {
    expect(composerChrome({ focused: false, text: '下書き' })).toEqual({ chips: false, scopeBar: true });
  });
  it('空白だけは書いていないのと同じ', () => {
    expect(composerChrome({ focused: false, text: '  \n' }).chips).toBe(true);
  });
});

describe('answerEndScrollTop（最新の答えの終わりを見せる）', () => {
  it('答えの終わりが欄の下に隠れていれば、そこまで送る', () => {
    expect(answerEndScrollTop({ scrollTop: 100, clientHeight: 200, endOffset: 500, pad: 16 })).toBe(316);
  });
  it('もう見えていれば動かさない', () => {
    expect(answerEndScrollTop({ scrollTop: 400, clientHeight: 200, endOffset: 500, pad: 16 })).toBeNull();
  });
  it('上へは戻さない', () => {
    expect(answerEndScrollTop({ scrollTop: 900, clientHeight: 200, endOffset: 500 })).toBeNull();
  });
  it('測れないときは何もしない', () => {
    expect(answerEndScrollTop({ scrollTop: 0, clientHeight: 0, endOffset: 500 })).toBeNull();
    expect(answerEndScrollTop({ scrollTop: NaN, clientHeight: 200, endOffset: 500 })).toBeNull();
  });
});

describe('composerHeight（書いた量に合わせて伸びる入力欄）', () => {
  it('空は 1 行', () => {
    expect(composerHeight({ scrollHeight: 30, max: 146 })).toBe(44);
  });
  it('書くほど伸びる', () => {
    expect(composerHeight({ scrollHeight: 96, max: 146 })).toBe(96);
  });
  it('上限を超えたら上限で止まり、中を送る', () => {
    expect(composerHeight({ scrollHeight: 400, max: 146 })).toBe(146);
  });
});
