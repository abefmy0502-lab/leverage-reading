import { describe, it, expect } from 'vitest';
import { RELEASES, CURRENT_RELEASE_ID, WHERE_NAMES } from './releaseNotes';
import {
  decideWhatsNew, releasesNewerThan, sanitizeReleases, compareReleaseId, releaseHeading,
} from './whatsNew';

// 「新しくなったこと」は利用者が読む文（CLAUDE.md ルール 5）。どの項目にも
// どこの・何が・これまで・これから・影響・意図 がそろい、GLOSSARY の使わない言い方・技術用語が入らないこと。
const FIELDS = ['where', 'what', 'before', 'after', 'impact', 'intent'];

// GLOSSARY の「使わない表記」（CLAUDE.md の用語の正典）。
const NG_WORDS = [
  'タイトル', 'ステータス', 'マイ読書脳', 'アクション', 'タスク', 'お試し', '無料トライアル', 'トライアル',
  '想起', 'セットアップシート', '読書戦略書', '読書前', 'アドバイザー', 'ノート', 'チャット', 'クレジット',
  'コイン', '3行に凝縮', '要約', '無料版', 'フリー', '早期割引', 'ローンチ価格', '先着', '通常価格', '定価',
  'リマインド', 'ランダム表示', 'テーマレポート',
];

// 技術用語・ファイル名。英字は製品名などの決まった語だけ。
const ALLOWED_LATIN = new Set(['Orime', 'AI', 'App', 'Store', 'Apple', 'ID']);

const allItems = () => RELEASES.flatMap((r) => r.items.map((it, i) => ({ ...it, _where: `${r.id}[${i}]` })));

describe('RELEASES（新しくなったこと）', () => {
  it('版は新しい順・id は日付の形・重ならない', () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    expect(CURRENT_RELEASE_ID).toBe(RELEASES[0].id);
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RELEASES) {
      expect(r.id, r.id).toMatch(/^\d{4}-\d{2}-\d{2}[a-z]?$/);
      expect(r.date, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.id.startsWith(r.date), `${r.id} の date`).toBe(true);
    }
    for (let i = 1; i < ids.length; i += 1) expect(compareReleaseId(ids[i - 1], ids[i])).toBe(1);
  });

  it('1 つの版は 3〜8 項目', () => {
    for (const r of RELEASES) {
      expect(r.items.length, `${r.id} は 3 項目以上`).toBeGreaterThanOrEqual(3);
      expect(r.items.length, `${r.id} は 8 項目まで`).toBeLessThanOrEqual(8);
    }
  });

  it('どの項目にも 6 つの欄（どこの・何が・これまで・これから・影響・意図）がそろい、空でない', () => {
    for (const it of allItems()) {
      for (const f of FIELDS) {
        expect(typeof it[f], `${it._where}.${f}`).toBe('string');
        expect(it[f].trim().length, `${it._where}.${f} が空`).toBeGreaterThan(0);
      }
    }
  });

  it('どこの は画面の名前（WHERE_NAMES）・何が は題（30 字まで・「。」なし）', () => {
    for (const it of allItems()) {
      expect(WHERE_NAMES, `${it._where}.where「${it.where}」`).toContain(it.where);
      expect([...it.what].length, `${it._where}.what「${it.what}」は 30 字まで`).toBeLessThanOrEqual(30);
      expect(it.what.endsWith('。'), `${it._where}.what は「。」で終えない`).toBe(false);
    }
  });

  it('これまで・これから・影響・意図 は文（「。」で終える）・意図は 1 文・長すぎない', () => {
    for (const it of allItems()) {
      for (const f of ['before', 'after', 'impact', 'intent']) {
        expect(it[f].endsWith('。'), `${it._where}.${f} は「。」で終える`).toBe(true);
        expect([...it[f]].length, `${it._where}.${f} は 120 字まで`).toBeLessThanOrEqual(120);
      }
      expect((it.intent.match(/。/g) || []).length, `${it._where}.intent は 1 文`).toBe(1);
      expect(it.before, `${it._where} これまでとこれからが同じ`).not.toBe(it.after);
    }
  });

  it('GLOSSARY の使わない言い方が入っていない', () => {
    const text = JSON.stringify(RELEASES);
    for (const ng of NG_WORDS) expect(text.includes(ng), `「${ng}」は使わない`).toBe(false);
  });

  it('技術用語・ファイル名・英語の識別子・絵文字が入っていない', () => {
    for (const it of allItems()) {
      for (const f of FIELDS) {
        const s = it[f];
        expect(/\.(js|jsx|json|sql|css|md)\b/.test(s), `${it._where}.${f} にファイル名`).toBe(false);
        expect(/[`<>{}]/.test(s), `${it._where}.${f} に記号`).toBe(false);
        for (const w of s.match(/[A-Za-z][A-Za-z0-9_-]*/g) || []) {
          expect(ALLOWED_LATIN.has(w), `${it._where}.${f} の「${w}」`).toBe(true);
        }
        expect(/\p{Extended_Pictographic}/u.test(s), `${it._where}.${f} に絵文字`).toBe(false);
      }
    }
  });
});

describe('decideWhatsNew（更新したあとに 1 回だけ）', () => {
  const R = [
    { id: '2026-10-05', date: '2026-10-05', items: [{}] },
    { id: '2026-10-04', date: '2026-10-04', items: [{}] },
    { id: '2026-10-01', date: '2026-10-01', items: [{}] },
  ];

  it('新規の人には出さず、いまの版を見たことにする', () => {
    expect(decideWhatsNew({ seenId: null, isNewUser: true, releases: R })).toEqual({ show: [], markSeen: '2026-10-05' });
  });

  it('見た版を覚えていない今までの利用者には、いちばん新しい版だけ', () => {
    const d = decideWhatsNew({ seenId: null, isNewUser: false, releases: R });
    expect(d.show.map((r) => r.id)).toEqual(['2026-10-05']);
    expect(d.markSeen).toBeNull();
  });

  it('前の版を見た人には、それより新しい版を新しい順に全部', () => {
    expect(decideWhatsNew({ seenId: '2026-10-03', isNewUser: false, releases: R }).show.map((r) => r.id)).toEqual(['2026-10-05', '2026-10-04']);
    expect(decideWhatsNew({ seenId: '2026-09-01', isNewUser: false, releases: R }).show).toHaveLength(3);
  });

  it('いまの版を見た人・端末に覚えられない人には出さない', () => {
    expect(decideWhatsNew({ seenId: '2026-10-05', isNewUser: false, releases: R }).show).toEqual([]);
    expect(decideWhatsNew({ seenId: undefined, isNewUser: false, releases: R })).toEqual({ show: [], markSeen: null });
  });

  it('同じ日の 2 つ目の版（…b）も新しいと数える', () => {
    expect(releasesNewerThan([{ id: '2026-10-05b' }, { id: '2026-10-05' }], '2026-10-05').map((r) => r.id)).toEqual(['2026-10-05b']);
  });

  it('見出しは「10月5日の更新」', () => {
    expect(releaseHeading({ id: '2026-10-05', date: '2026-10-05' })).toBe('10月5日の更新');
  });
});

describe('sanitizeReleases（サーバーの release-notes.json）', () => {
  it('アプリに入っている版の中身をそのまま通す', () => {
    const out = sanitizeReleases(JSON.parse(JSON.stringify({ version: 1, releases: RELEASES })));
    expect(out.map((r) => r.id)).toEqual(RELEASES.map((r) => r.id));
    expect(out[0].items[0]).toEqual(Object.fromEntries(FIELDS.map((f) => [f, RELEASES[0].items[0][f]])));
  });

  it('形の崩れたもの・欄の欠けた項目・文字でない値は捨てる', () => {
    const good = { where: '相談', what: 'a', before: 'b。', after: 'c。', impact: 'd。', intent: 'e。' };
    const out = sanitizeReleases({
      releases: [
        { id: 'bad', items: [good] },
        { id: '2026-10-06', items: [good, { ...good, intent: '' }, { ...good, what: 3 }, null] },
        { id: '2026-10-07', items: [] },
      ],
    });
    expect(out.map((r) => r.id)).toEqual(['2026-10-06']);
    expect(out[0].items).toHaveLength(1);
    expect(sanitizeReleases(null)).toEqual([]);
    expect(sanitizeReleases({ releases: 'x' })).toEqual([]);
  });

  it('長すぎる文は切る', () => {
    const long = 'あ'.repeat(1000);
    const out = sanitizeReleases({ releases: [{ id: '2026-10-06', items: [{ where: long, what: long, before: long, after: long, impact: long, intent: long }] }] });
    expect(out[0].items[0].what.length).toBe(400);
  });
});
