import { describe, it, expect } from 'vitest';
import { checkCopy, checkShape, checkNote, channelOf, recentReleaseLines, buildPrompt } from './weekly-drafts.mjs';
import { SCENARIOS } from './scenarios.mjs';

describe('weekly-drafts', () => {
  it('使わない言い方を見つける（決まりを説明している行は除く）', () => {
    const hits = checkCopy('著者と話せるアプリ\n必ず読書が変わる\n「著者と話せる」とは言わない');
    expect(hits.map((h) => h.line)).toEqual([1, 2]);
    expect(checkCopy('読んだ本と、会話しよう。本の語り口で答えます。')).toEqual([]);
  });

  it('その週の「新しくなったこと」だけを拾う', () => {
    const releases = [
      { id: '2026-10-11', date: '2026-10-11', items: [{ where: '相談', what: 'A', after: 'a。', intent: 'x。' }] },
      { id: '2026-09-01', date: '2026-09-01', items: [{ where: 'ホーム', what: 'B', after: 'b。', intent: 'y。' }] },
    ];
    const lines = recentReleaseLines(releases, '2026-10-12', 7);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('相談：A');
  });

  it('台本はどれも名前・題・柱があり、名前は重ならない', () => {
    const names = SCENARIOS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of SCENARIOS) {
      expect(s.name).toMatch(/^[a-z0-9-]+$/);
      expect(s.title).toBeTruthy();
      expect(s.pillar).toBeTruthy();
      expect(checkCopy(`${s.title}\n${s.steps.map((x) => x.say || '').join('\n')}`)).toEqual([]);
    }
  });

  it('プロンプトに守ることと今週の動画が入る', () => {
    const p = buildPrompt({ today: '2026-10-11', releaseLines: [], scenarios: SCENARIOS, plan: '', guard: '', playbook: '', xSample: '', videoSample: '' });
    expect(p.system).toContain('「著者と話せる」');
    expect(p.user).toContain('consult-book');
  });
});

describe('checkShape（投稿の形・2026-11-10）', () => {
  const kit = (posts) => posts.map(([h, body]) => `### ${h}\n\`\`\`\n${body}\n\`\`\``).join('\n\n');
  it('1 行目が製品名・機能の知らせから始まる投稿に注意を出す（読む人の話から始まれば通す）', () => {
    const hits = checkShape(kit([
      ['X01 月', 'Orime の答えの材料は、自分の一行だけ。\n\n読んだ本と話す。'],
      ['X02 火', '記録に「分野」を入れました。\n\n仕事の本ばかりでした。'],
      ['X03 水', '「読書メモなんて残してない」が普通だと思う。だから入口を 4 つ作りました。\n\nその日から相談できます。'],
      ['X04 木', '記録の「分野」を見たら、仕事の本が 8 割でした。\n\n歴史は 0 冊。'],
    ]));
    expect(hits.filter((h) => /製品名から|機能の知らせ/.test(h.why)).map((h) => h.word.slice(0, 6))).toEqual(['Orime ', '記録に「分野']);
  });
  it('X は重み 280 まで（日本語 141 字で超える）・Threads は問いで終わるものが半分未満だと注意', () => {
    const long = 'あ'.repeat(141);
    const hits = checkShape(kit([['X01', long], ['T01', 'こんにちは。'], ['T02', 'こんにちは。'], ['T03', 'こんにちは。'], ['T04', 'どう思いますか？']]));
    expect(hits.some((h) => /重み 282/.test(h.word))).toBe(true);
    expect(hits.some((h) => /Threads 1\/4/.test(h.word))).toBe(true);
  });
  it('AI っぽい文の定型に注意を出す', () => {
    const hits = checkShape(kit([['X01', '読書メモを残すことが重要です。\n\nいかがでしたか。']]));
    expect(hits.some((h) => /重要です/.test(h.word))).toBe(true);
    expect(checkShape(kit([['X01', '2 年前の一行に助けられた。\n\np.40 のメモでした。リンクは返信に。']]))).toEqual([]);
  });
  it('同じ締めの決まり文句が 3 回で注意・2 回なら出さない', () => {
    const two = kit([['X01', 'きょうの本。\n\n読んで終わりにしない。リンクは返信に。'], ['X02', 'きのうの本。\n\n読んで終わりにしない。リンクは返信に。']]);
    expect(checkShape(two)).toEqual([]);
    const three = kit([['X01', 'きょう。\n\n読んで終わりにしない。'], ['X02', 'きのう。\n\n読んで終わりにしない。'], ['X03', 'おととい。\n\n読んで終わりにしない。']]);
    expect(checkShape(three).some((h) => h.word === '読んで終わりにしない')).toBe(true);
  });
});

describe('場ごとの決まり（2026-11-23・sns-playbooks）', () => {
  const kit = (posts) => posts.map(([h, body]) => `### ${h}\n\`\`\`\n${body}\n\`\`\``).join('\n\n');
  it('見出しから場を決める', () => {
    expect(channelOf('X3 火 7:30｜入口 C')).toBe('x');
    expect(channelOf('スレッド 2/5｜相談')).toBe('x');
    expect(channelOf('T1 月｜入口 C')).toBe('threads');
    expect(channelOf('リール 1「本棚の写真」')).toBe('instagram');
    expect(channelOf('カルーセル「使い方の保存版」')).toBe('instagram');
    expect(channelOf('TikTok 1')).toBe('tiktok');
    expect(channelOf('直してほしい所')).toBe('');
  });
  it('X: 本文のリンク・ハッシュタグ 2 個・入手への道なし・反応を頼む言葉を指す（返信の投稿はリンクを通す）', () => {
    const hits = checkShape(kit([
      ['X1 月', '線を引いた本が、会議で出てこない。\n\n読んだ本に聞いた。 #読書 #読書記録\nhttps://example.com\nいいねしてね'],
      ['X2 月 返信 1', 'https://apps.apple.com/jp/app/x?ct=x_consult'],
    ]));
    const words = hits.map((h) => h.word);
    expect(words).toEqual(expect.arrayContaining(['リンク', 'ハッシュタグ 2', '入手への道', 'いいねして']));
    expect(hits.filter((h) => h.word === 'リンク')).toHaveLength(1);
  });
  it('X: 入手への道があり、1 行目が短ければ通す・承認前は入手への道を求めない', () => {
    expect(checkShape(kit([['X1 月', '線を引いた本が、出てこない。\n\n読んだ本に聞いたら、明日やることが 1 つ決まった。\n\n無料プラン（ずっと無料）で試せます。リンクは返信に。']]))).toEqual([]);
    expect(checkShape(kit([['X 承認前 1｜審査', '審査を待っている。\n\n通ったら、ここで知らせます。']]))).toEqual([]);
  });
  it('伏せ字が残る投稿・絵文字 2 つを指す', () => {
    const hits = checkShape(kit([['T1 月', '「◯◯」という一行に助けられた。🙂📚\n\nあなたは？']]));
    expect(hits.map((h) => h.word)).toEqual(expect.arrayContaining(['◯◯', '絵文字 2']));
  });
  it('Threads: 500 字を超える・トピックが 2 つで指す／Instagram: ハッシュタグ 6 個で指す', () => {
    const t = checkShape(kit([['T1 月', `${'あ'.repeat(501)}\n#読書 #本`]]));
    expect(t.map((h) => h.word)).toEqual(expect.arrayContaining([expect.stringMatching(/^50\d 字$/), 'タグ 2']));
    const ig = checkShape(kit([['カルーセル 保存版', '読む前に決める 3 つ。\n#a #b #c #d #e #f']]));
    expect(ig.map((h) => h.word)).toContain('ハッシュタグ 6');
    expect(checkShape(kit([['カルーセル 保存版', '読む前に決める 3 つ。\n#a #b #c']]))).toEqual([]);
  });
  it('TikTok: 検索の言葉（Orime）が無いと指す', () => {
    expect(checkShape(kit([['TikTok 1', '本棚を撮ったら、20 冊が入った。']])).map((h) => h.word)).toContain('検索の言葉');
    expect(checkShape(kit([['TikTok 1', '本棚を撮ったら、20 冊が入った。\nApp Store で「Orime」と検索']]))).toEqual([]);
  });
  it('数えた本数を場ごとに返す', () => {
    const r = checkShape(kit([['X1 月', 'a。\nリンクは返信に。'], ['T1 月', 'b？'], ['リール 1（15 秒）', 'c']]));
    expect(r.channels).toEqual({ x: 1, threads: 1, instagram: 1 });
  });
});

describe('checkNote（note の下書き）', () => {
  const body = (n) => 'あ'.repeat(n);
  const good = `# 読んだ本と会話できる、を作った理由\n\n見出し画像：手元の本とメモ\n\n## 困っていたこと\n${body(800)}\n## どう動くか\n${body(800)}\n## できないこと\n${body(800)}\n\nhttps://apps.apple.com/jp/app/orime?ct=note_consult`;
  it('決まりを満たす下書きは通す', () => {
    expect(checkNote(good)).toEqual([]);
  });
  it('題が長い・できないことが無い・ct が無いと指す', () => {
    const bad = `# ${'い'.repeat(30)}\n\n## a\n${body(900)}\n## b\n${body(900)}\n## c\n${body(900)}`;
    const words = checkNote(bad).map((h) => h.word);
    expect(words).toEqual(expect.arrayContaining(['題 30 字', 'できないこと', 'ct=note_', '見出し画像']));
  });
});
