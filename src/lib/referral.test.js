import { describe, it, expect } from 'vitest';
import { referralMessage, shareReferral, inviteMessage, advisorShareMessage, consultShareMessage } from './referral';

describe('友だちに紹介する（2026-10-22）', () => {
  it('コードが無ければ文は空・あればコードと使い方とサイトの URL', () => {
    expect(referralMessage('')).toBe('');
    const m = referralMessage('ORIME2027', 'https://orime.vercel.app');
    expect(m).toContain('コード ORIME2027');
    expect(m).toContain('「コードを使う」');
    expect(m.endsWith('https://orime.vercel.app')).toBe(true);
    expect(m).not.toMatch(/無料/);
  });
  it('共有シートが無ければ false', async () => {
    expect(await shareReferral('')).toBe(false);
    expect(await shareReferral('x')).toBe(false);
  });
});

describe('orime を友だちに教える（2026-11-26）', () => {
  it('何ができるかと URL・コードの話はしない', () => {
    const m = inviteMessage('https://apps.apple.com/jp/app/orime/id1');
    expect(m).toContain('orime');
    expect(m).toContain('相談相手');
    expect(m.endsWith('https://apps.apple.com/jp/app/orime/id1')).toBe(true);
    expect(m).not.toMatch(/コード/);
    expect(m).not.toMatch(/Orime|ORIME/);
  });
});

describe('AI 選書の本を教える（2026-11-26）', () => {
  it('書名・著者・核心の 1 文と URL だけ（悩みは入れない・長い核心は切る）', () => {
    const m = advisorShareMessage({ title: '考え方', author: '稲盛和夫', core: 'あ'.repeat(100), concern: '上司とうまくいかない' }, 'https://x.example');
    expect(m.startsWith('『考え方』（稲盛和夫）')).toBe(true);
    expect(m).toContain(`${'あ'.repeat(79)}…`);
    expect(m).not.toContain('上司');
    expect(m).toContain('orime の AI 選書');
    expect(m.endsWith('https://x.example')).toBe(true);
    expect(advisorShareMessage({ title: '' }, 'u')).toBe('');
    expect(advisorShareMessage({ title: 'A' }, 'u')).toBe('『A』\norime の AI 選書で、いまの悩みに合う 1 冊として見つけました。\nu');
  });
});

describe('相談の答えを渡す（2026-11-26）', () => {
  it('結論と一歩と URL だけ・強調の印は外す・結論が無ければ空', () => {
    const m = consultShareMessage({ conclusion: '**まず聞く**ことから。', action: '明日の 1on1 で最初に質問する' }, 'https://x.example');
    expect(m).toBe('まず聞くことから。\n\n明日からの一歩：明日の 1on1 で最初に質問する\n\norime の AI が、自分の読書メモをもとに答えたものです。\nhttps://x.example');
    expect(consultShareMessage({ conclusion: '' }, 'u')).toBe('');
    expect(consultShareMessage({ conclusion: 'x', voice: true }, 'u')).toContain('著者本人の言葉ではありません。');
    expect(consultShareMessage({ conclusion: 'あ'.repeat(500) }, 'u')).toContain(`${'あ'.repeat(399)}…`);
  });
});
