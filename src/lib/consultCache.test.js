// 💴 キャッシュの効く相談（2026-10-01・docs/ai-routing.md §7）: お試しモードのデータで本物の相談の中身を作り、
// 指示文＋メモ一覧（芯）が相談ごとに同じ文字であること・メモの選び方を確かめる。AI は呼ばない（streamClaude は偽物）。
import { describe, it, expect, vi, beforeAll } from 'vitest';

globalThis.window = globalThis.window || {
  location: { search: '', origin: 'http://localhost' },
  localStorage: { setItem() {}, getItem() { return null; }, removeItem() {}, clear() {} },
  fetch: async () => ({ ok: false }),
};
vi.mock('./supabase', async () => {
  const { createDemoClient } = await import('../demo/demoClient');
  return { supabase: createDemoClient(), isSupabaseConfigured: true, isDemo: true, demoScenario: null };
});
const sent = [];
vi.mock('./streamClaude', () => ({
  streamClaude: async (p) => { sent.push(p); p.onDone?.('', { stopReason: 'end_turn' }); return ''; },
}));

let ai;
let USER;
beforeAll(async () => {
  ai = await import('./ai');
  ({ DEMO_USER_ID: USER } = await import('../demo/seed'));
});

const consult = async (args) => {
  sent.length = 0;
  await ai.streamMyBookBrain({ userId: USER, ...args });
  return sent[0];
};
const cachedPrefix = (p) => {
  const blocks = p.messages[0].content;
  const last = blocks.map((b) => !!b.cache_control).lastIndexOf(true);
  return JSON.stringify({ system: p.system, blocks: blocks.slice(0, last + 1) });
};

describe('相談の頭（指示文＋メモ一覧）は、相談ごとに同じ文字（キャッシュが効く）', () => {
  it('違う質問・深掘りの続きでも、印の付いたところまでが 1 文字も変わらない', async () => {
    const a = await consult({ question: '部下に仕事を任せるのが苦手で、つい自分でやってしまう' });
    const b = await consult({ question: '会議が長くて困る' });
    const c = await consult({
      question: '1on1 で話すことがない',
      thread: [{ question: '部下に仕事を任せるのが苦手', answer: '【結論】\n任せる前に終わりの形を決める。\n\n【あなたに聞きたいこと】\nどんな仕事ですか？' }],
    });
    expect(cachedPrefix(a)).toBe(cachedPrefix(b));
    expect(cachedPrefix(a)).toBe(cachedPrefix(c));
    // 印は 指示文（system）とメモ一覧の 2 つだけ（上限 4）。メモ一覧はいちばん前のブロック。
    expect(a.cacheSystem).toBe(true);
    expect(a.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(a.messages[0].content.filter((x) => x.cache_control)).toHaveLength(1);
    expect(a.messages[0].content[0].text).toContain('===== MEMOS_START =====');
    // 質問・歩み・今日の何か は印より後ろ
    expect(cachedPrefix(a)).not.toContain('部下に仕事を任せるのが苦手で、つい');
    expect(cachedPrefix(a)).not.toContain('GROWTH_START');
  });

  it('質問に近いメモは、メモ一覧の後ろ（キャッシュしないところ）に目印で渡す', async () => {
    const p = await consult({ question: '部下に仕事を任せるのが苦手' });
    const tail = p.messages[0].content.slice(1).map((x) => x.text).join('');
    expect(tail).toContain('===== RELATED_MEMOS_START =====');
    expect(tail).toMatch(/- 『[^』]+』[^\n]*「[^」]+」/);
    expect(tail).toContain('===== QUESTION_START =====');
  });
});

describe('📕 積読から答える（まだ読んでいない本の塊）', () => {
  const unreadBooks = [
    { id: 'u1', status: 'before', title: 'エッセンシャル思考', author: 'グレッグ・マキューン' },
    { id: 'u2', status: 'done', title: '読了の本', author: '誰か' },
  ];
  it('すべての本に相談するときは芯の後ろ・質問の前に別の塊で渡し、芯は変えない', async () => {
    const a = await consult({ question: '積読から、今の悩みに合う本は？', unreadBooks });
    const b = await consult({ question: '積読から、今の悩みに合う本は？' });
    expect(cachedPrefix(a)).toBe(cachedPrefix(b));
    const blocks = a.messages[0].content.map((x) => x.text);
    const ui = blocks.findIndex((t) => t.includes('===== UNREAD_BOOKS_START ====='));
    const qi = blocks.findIndex((t) => t.includes('===== QUESTION_START ====='));
    expect(ui).toBeGreaterThan(0);
    expect(ui).toBeLessThan(qi);
    expect(blocks[ui]).toContain('◆『エッセンシャル思考』');
    expect(blocks[ui]).not.toContain('読了の本');
    expect(a.system).toContain('その本の中身を読んだかのように語らない');
  });
  it('本に絞って相談するときは渡さない', async () => {
    const p = await consult({ question: '積読から、今の悩みに合う本は？', unreadBooks, bookIds: ['b1'] });
    expect(p ? JSON.stringify(p.messages) : '').not.toContain('UNREAD_BOOKS_START');
  });
});

// 本棚のメモをまねて作る
const mk = (i, { book = `b${i % 12}`, text, days = i, page = i } = {}) => ({
  id: `m${String(i).padStart(4, '0')}`,
  book_id: book,
  source_type: 'card',
  text: text || `メモ${i}の本文。${'考えたことを書いた。'.repeat(8)}`,
  page_number: page,
  tags: [],
  created_at: new Date(Date.UTC(2026, 8, 30) - days * 86400000).toISOString(),
  book: { id: book, title: `本${book}`, author: '著者', rating: (i % 5) + 1 },
});
const charsOf = (list) => list.reduce((n, m) => n + Math.min(m.text.length, 2000) + 120, 0);
const NOW = Date.UTC(2026, 9, 1, 3, 0, 0);

describe('selectConsultMemos（メモの選び方）', () => {
  it('小さな本棚（全部で 9,000 字以内）は今までどおり全部を渡す', () => {
    const pool = Array.from({ length: 20 }, (_, i) => mk(i));
    expect(charsOf(pool)).toBeLessThan(9000);
    const r = ai.selectConsultMemos('考えたこと', pool, { now: NOW });
    expect(r.fitsAll).toBe(true);
    expect(r.core).toHaveLength(pool.length);
    expect(r.extra).toHaveLength(0);
  });

  it('大きな本棚は芯を約 5,000 字に絞り、質問に近いメモ（芯に無いもの）を後ろに足す', () => {
    const pool = Array.from({ length: 300 }, (_, i) => mk(i));
    // メモの多い本の、古いメモの中に、質問にぴったりのメモ（重要度順では芯に入らない）
    pool.push(mk(900, { book: 'b1', days: 800, text: '部下への権限移譲は、任せる範囲と期限を先に決めること。' }));
    const r = ai.selectConsultMemos('部下への権限移譲がうまくいかない', pool, { now: NOW });
    expect(r.fitsAll).toBe(false);
    expect(charsOf(r.core)).toBeLessThanOrEqual(ai.CONSULT_CORE_CHARS);
    expect(charsOf(r.extra)).toBeLessThanOrEqual(ai.CONSULT_EXTRA_CHARS);
    expect(r.extra.map((m) => m.id)).toContain('m0900');
    expect(r.core.map((m) => m.id)).not.toContain('m0900');
    // 合計は今まで（約 9,000 字）と同じくらい
    expect(charsOf(r.core) + charsOf(r.extra)).toBeLessThanOrEqual(ai.CONSULT_CORE_CHARS + ai.CONSULT_EXTRA_CHARS);
  });

  it('芯は質問に左右されず、渡す順番（DB の返す順）や同じ日の時刻にも左右されない', () => {
    const pool = Array.from({ length: 300 }, (_, i) => mk(i));
    const a = ai.selectConsultMemos('会議', pool, { now: NOW });
    const b = ai.selectConsultMemos('部下', [...pool].reverse(), { now: NOW + 5 * 3600000 });
    expect(b.core.map((m) => m.id)).toEqual(a.core.map((m) => m.id));
  });

  it('芯にある質問に近いメモは、目印（書名・ページ・冒頭）として後ろに並ぶ', () => {
    const pool = Array.from({ length: 10 }, (_, i) => mk(i));
    pool[3].text = '会議は 30 分で切り上げる。議題を先に配る。';
    const r = ai.selectConsultMemos('会議が長い', pool, { now: NOW });
    expect(r.relatedInCore.map((m) => m.id)).toContain('m0003');
    expect(ai.formatMemoPointer(pool[3])).toBe('- 『本b3』 p.3「会議は 30 分で切り上げる。議題を先に配る。」');
    expect(ai.formatMemoPointer({ ...pool[3], text: 'あ'.repeat(30) })).toBe(`- 『本b3』 p.3「${'あ'.repeat(24)}…」`);
  });
});

describe('buildGrowthBlock: この会話のやりとりは「過去の相談」に重ねない', () => {
  it('skipQuestions の問いを外す', async () => {
    const base = await ai.buildGrowthBlock(USER);
    const m = base.match(/「([^」]+)」 → そのときの結論/);
    if (!m) return; // お試しのデータに過去の相談が無ければ確かめようがない
    const skipped = await ai.buildGrowthBlock(USER, { skipQuestions: [m[1]] });
    expect(skipped).not.toContain(`「${m[1]}」 → そのときの結論`);
    expect(skipped.length).toBeLessThan(base.length);
  });
});

// 📏 相談 1 回の中身の内訳（ブロックごとのトークンの概算と原価）。AI_COST_REPORT=1 のときだけ表を出す。
//   AI_COST_REPORT=1 npx vitest run src/lib/consultCache.test.js --silent=false
//   トークンは概算（日本語 1 字 ≈ 1・半角 ≈ 0.3）。本当の数は本番の [ai-cache] のログ（api/claude.js）で見る。
describe('相談 1 回の内訳（お試しモードのデータ）', () => {
  it('ブロックごとのトークンと、最初・続きの原価', async () => {
    const { costFromUsage } = await import('../../api/_aiCost.js');
    const tok = (s) => { let n = 0; for (const ch of String(s)) n += ch.charCodeAt(0) < 128 ? 0.3 : 1; return Math.round(n); };
    const first = await consult({ question: '部下に仕事を任せるのが苦手で、つい自分でやってしまう' });
    const follow = await consult({ question: '資料づくり', thread: [{ question: '部下に仕事を任せるのが苦手', answer: '【結論】\n終わりの形を決める。\n\n【あなたに聞きたいこと】\nどんな仕事？' }] });
    const parts = (p) => [['system', tok(p.system), 'sys'], ...p.messages[0].content.map((b) => [b.text.match(/=====\s([A-Z_]+)_START/)?.[1] || 'other', tok(b.text), b.cache_control ? 'core' : 'tail'])];
    const yenOf = (p, { sys, core }, out = 550) => {
      const u = { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }, output_tokens: out };
      for (const [, t, kind] of parts(p)) {
        const st = kind === 'sys' ? sys : kind === 'core' ? core : 'in';
        if (st === 'r') u.cache_read_input_tokens += t;
        else if (st === 'w5') { u.cache_creation_input_tokens += t; u.cache_creation.ephemeral_5m_input_tokens += t; }
        else if (st === 'w1h') { u.cache_creation_input_tokens += t; u.cache_creation.ephemeral_1h_input_tokens += t; }
        else u.input_tokens += t;
      }
      return costFromUsage('claude-haiku-4-5', u) / 1000;
    };
    const firstWarm = yenOf(first, { sys: 'r', core: 'w5' });
    const followWarm = yenOf(follow, { sys: 'r', core: 'r' });
    expect(followWarm).toBeLessThan(firstWarm);
    if (!process.env.AI_COST_REPORT) return;
    console.log('最初の相談:', parts(first).map(([n, t, k]) => `${n}${k === 'tail' ? '' : `(${k})`} ${t}`).join(' / '));
    console.log('続きの相談:', parts(follow).map(([n, t, k]) => `${n}${k === 'tail' ? '' : `(${k})`} ${t}`).join(' / '));
    console.log(`原価: 最初 ¥${firstWarm.toFixed(2)}（指示文が冷えていれば ¥${yenOf(first, { sys: 'w1h', core: 'w5' }).toFixed(2)}）・続き ¥${followWarm.toFixed(2)}`);
  });
});
