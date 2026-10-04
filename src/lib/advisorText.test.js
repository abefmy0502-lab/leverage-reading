import { describe, it, expect } from 'vitest';
import { concernOf, interviewPairsOf, displayUserText, advisorSetupFields, advisorSetupPayload } from './advisorText';

const raw = '【相談内容】\n仕事が回らない\n\n【ヒアリングの回答】\nQ. つまずきは？\nA. 時間が足りない\nQ. 理想は？\nA. 定時で帰る\n\n以上でヒアリングは十分です。これ以上質問せず、推薦してください。';

describe('advisorText', () => {
  it('テンプレートから相談だけを取り出す', () => {
    expect(concernOf(raw)).toBe('仕事が回らない');
    expect(concernOf('ふつうの相談')).toBe('ふつうの相談');
  });
  it('ヒアリングの Q/A を取り出す', () => {
    expect(interviewPairsOf(raw)).toEqual([{ q: 'つまずきは？', a: '時間が足りない' }, { q: '理想は？', a: '定時で帰る' }]);
    expect(interviewPairsOf('ふつう')).toEqual([]);
  });
  it('表示用に指示文を落とす', () => {
    expect(displayUserText(raw)).toBe('仕事が回らない\n・時間が足りない\n・定時で帰る');
    expect(displayUserText(raw)).not.toMatch(/推薦してください/);
  });
});

describe('advisorSetupFields', () => {
  it('理想の答え→得たいこと、相談＋1 問目→課題（全部はつなげない）', () => {
    const r = advisorSetupFields('仕事が回らない', [
      { q: 'いま一番つまずいているのは？', a: '時間が足りない' },
      { q: '理想に近い状態は？', a: '定時で帰れる' },
      { q: '任せられる人はいますか？', a: 'いない' },
    ]);
    expect(r).toEqual({ challenge: '仕事が回らない／時間が足りない', purpose: '定時で帰れる' });
  });
  it('理想の問いが 3 問目でも言葉で見つける', () => {
    const r = advisorSetupFields('営業', [
      { q: 'どの段階で失注？', a: '提案' },
      { q: '商材は？', a: '法人向け' },
      { q: 'どうなれたら理想？', a: '受注率 3 割' },
    ]);
    expect(r.purpose).toBe('受注率 3 割');
    expect(r.challenge).toBe('営業／提案');
  });
  it('理想の言葉が無ければ 2 問目を得たいことに', () => {
    expect(advisorSetupFields('x', [{ q: 'A', a: '1' }, { q: 'B', a: '2' }]).purpose).toBe('2');
  });
  it('ヒアリングが無ければ課題は相談だけ・得たいことは空', () => {
    expect(advisorSetupFields('お金の不安', [])).toEqual({ challenge: 'お金の不安', purpose: '' });
    expect(advisorSetupFields('', null)).toEqual({ challenge: '', purpose: '' });
  });
});

describe('advisorSetupPayload（読みたいに追加で本へ渡す読書準備・会話中と過去の AI 選書で同じ）', () => {
  it('得たいこと＝理想の答え・課題＝相談＋1 問目・仮説は空・選書理由＝なぜ＋核心', () => {
    const p = advisorSetupPayload(concernOf(raw), interviewPairsOf(raw), { why: '時間の使い方を見直せる', core: '重要なことから先に' });
    expect(p).toEqual({
      sourceQuery: '定時で帰る',
      investPurpose: '定時で帰る',
      currentChallenge: '仕事が回らない／時間が足りない',
      hypothesis: '',
      bookReason: '時間の使い方を見直せる\nこの本の核心: 重要なことから先に',
    });
  });
  it('核心が無ければ選書理由はなぜだけ・長い文は 400 字まで', () => {
    expect(advisorSetupPayload('x', [], { why: 'a'.repeat(500) }).bookReason).toHaveLength(400);
    expect(advisorSetupPayload('x', [], { why: 'なぜ' }).bookReason).toBe('なぜ');
    expect(advisorSetupPayload('x', [], null).bookReason).toBe('');
  });
});
