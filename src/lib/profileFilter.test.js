import { describe, it, expect } from 'vitest';
import { profileTextIssue, profileIssues, profileIssueMessage } from './profileFilter';

describe('公開のプロフィールの言葉（2026-11-21）', () => {
  it('ふつうの言葉は通す', () => {
    for (const t of ['ふみ', 'メーカーで企画の仕事。チームづくりの本をよく読みます', '迷ったとき、立ち返る場所をくれた本', '2026 年は 50 冊']) expect(profileTextIssue(t)).toBe(null);
  });
  it('強い言葉は空白や全角でも当てる', () => {
    expect(profileTextIssue('死 ね')).toBe('word');
    expect(profileTextIssue('ＳＥＸ')).toBe('word');
  });
  it('連絡先は弾く', () => {
    for (const t of ['fumi@example.com', 'https://x.com/fumi', '090-1234-5678', 'インスタ: fumi_books', '@fumi_books']) expect(profileTextIssue(t)).toBe('contact');
  });
  it('書名は連絡先のうちメールと URL だけ', () => {
    expect(profileTextIssue('Amazon.com 成功の秘密', 'book')).toBe(null);
    expect(profileTextIssue('死ぬ瞬間', 'book')).toBe(null);
    expect(profileTextIssue('https://spam.example', 'book')).toBe('contact');
  });
  it('どの欄かを文にする', () => {
    expect(profileIssueMessage(profileIssues({ bio: 'mail: a@b.jp' }))).toContain('自己紹介');
    expect(profileIssueMessage([])).toBe('');
  });
});
