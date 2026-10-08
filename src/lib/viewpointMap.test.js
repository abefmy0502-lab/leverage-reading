// 🗺 視点の地図（lib/viewpointMap.js・lib/viewpointMapSetting.js・components/ViewpointMap.jsx）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('./supabase', () => ({ supabase: { auth: { updateUser: vi.fn(async () => ({ error: null })) } }, isSupabaseConfigured: true }));

import {
  VIEWPOINT_MAP, VIEWPOINT_TAGS, countMemosByTag, buildViewpointMap, shadeLevel, isFewMemos, advisorDraftFor,
  scoreViewpointTags, mergeTagSuggestions, viewpointRecordPart, isViewpointTag,
} from './viewpointMap';
import { resolveViewpointOn, readViewpointOn, setViewpointOn, __resetViewpointSetting } from './viewpointMapSetting';
import { ViewpointMapCard, ViewpointMapSheet } from '../components/ViewpointMap';

describe('ひな形の形', () => {
  it('大分類 3 → 中分類 → タグ。タグは 12〜18 個・重ならない・短い', () => {
    expect(VIEWPOINT_MAP).toHaveLength(3);
    for (const c of VIEWPOINT_MAP) {
      expect(c.groups.length).toBeGreaterThanOrEqual(2);
      for (const g of c.groups) expect(g.tags.length).toBeGreaterThanOrEqual(2);
    }
    expect(VIEWPOINT_TAGS.length).toBeGreaterThanOrEqual(12);
    expect(VIEWPOINT_TAGS.length).toBeLessThanOrEqual(18);
    expect(new Set(VIEWPOINT_TAGS).size).toBe(VIEWPOINT_TAGS.length);
    for (const t of VIEWPOINT_TAGS) {
      expect([...t].length, t).toBeLessThanOrEqual(8);
      expect(t.startsWith('@')).toBe(false);
    }
  });

  it('発想の元の図の項目名を写していない（大分類・中分類の名前）', () => {
    const names = VIEWPOINT_MAP.flatMap((c) => [c.name, ...c.groups.map((g) => g.name)]);
    for (const ng of ['マインドセット', 'スキルセット', 'ナレッジセット', '将来を描く', '日々健康的に成長する', '構想し伝える', '実行し切る', '常識を磨く', '専門知識を磨く']) {
      expect(names).not.toContain(ng);
    }
    for (const ng of ['インプット', 'アウトプット', 'プロセス', 'マインドフルネス', 'スキルアップ', 'リーダーシップ', '専門知識', '時事', '体調管理']) {
      expect(VIEWPOINT_TAGS).not.toContain(ng);
    }
  });

  it('手がかりの言葉がどのタグにもある', () => {
    for (const c of VIEWPOINT_MAP) for (const g of c.groups) for (const t of g.tags) expect(t.words.length, t.name).toBeGreaterThan(2);
  });
});

describe('件数の数え方', () => {
  const rows = [
    { tags: ['習慣', '決め方'] },
    { tags: ['決め方', '決め方'] }, // 同じメモに 2 つでも 1
    { tags: [' 決め方 '] },
    { tags: ['仕事術'] }, // 地図にないタグは数えない
    { tags: null },
    {},
  ];
  it('地図のタグごとに、そのタグの付いたメモの数', () => {
    const c = countMemosByTag(rows);
    expect(c.get('決め方')).toBe(3);
    expect(c.get('習慣')).toBe(1);
    expect(c.get('お金')).toBe(0);
    expect(c.has('仕事術')).toBe(false);
    expect(c.size).toBe(VIEWPOINT_TAGS.length);
  });
  it('地図の形に件数を付ける（大分類 → 中分類 → タグの順のまま）', () => {
    const m = buildViewpointMap(rows);
    expect(m.map((c) => c.name)).toEqual(VIEWPOINT_MAP.map((c) => c.name));
    const flat = m.flatMap((c) => c.groups.flatMap((g) => g.tags));
    expect(flat.map((t) => t.name)).toEqual(VIEWPOINT_TAGS);
    expect(flat.find((t) => t.name === '決め方').count).toBe(3);
  });
  it('濃さは 4 段だけ・少ないのは 0〜1 件', () => {
    expect([0, 1, 2, 4, 5, 99].map(shadeLevel)).toEqual([0, 1, 2, 2, 3, 3]);
    expect([0, 1, 2].map(isFewMemos)).toEqual([true, true, false]);
  });
  it('AI 選書の最初の悩みに入れる言葉', () => {
    expect(advisorDraftFor('お金')).toBe('お金について、視点を増やしたい');
  });
});

describe('合いそうなタグ（地図のタグから）', () => {
  const tags = (list) => list.map((x) => x.tag);
  it('文に出ている手がかりの言葉で決める', () => {
    expect(tags(scoreViewpointTags('部下へのフィードバックは1対1で、よかった点から伝える。'))).toContain('人を育てる');
    expect(tags(scoreViewpointTags('予定を詰めすぎない。予備の時間をカレンダーに入れておく。'))).toContain('段取り');
    expect(scoreViewpointTags('予定を詰めすぎない。予備の時間をカレンダーに入れておく。').every((x) => x.why === 'map')).toBe(true);
  });
  it('2 字の言葉 1 つだけではすすめない・短すぎる文には出さない', () => {
    expect(tags(scoreViewpointTags('同じ時間に起きると、気分がいいと感じた日だった。'))).not.toContain('段取り');
    expect(scoreViewpointTags('お金')).toEqual([]);
  });
  it('英字の短い言葉は単語のときだけ（wait の it はテクノロジーにしない）', () => {
    expect(tags(scoreViewpointTags('I will wait for it. 待つことも大事だと思った。'))).not.toContain('テクノロジー');
  });
  it('もう付いているタグはすすめない・2 個まで', () => {
    const r = scoreViewpointTags('部下への指導とフィードバック、チームの会議の進め方。', ['人を育てる']);
    expect(tags(r)).not.toContain('人を育てる');
    expect(r.length).toBeLessThanOrEqual(2);
  });
  it('自分のタグが先・地図のタグにも 1 枠・重ねない・3 個まで', () => {
    const own = [{ tag: 'マネジメント' }, { tag: 'コミュニケーション' }, { tag: '仕事術' }];
    const map = [{ tag: '人を育てる', why: 'map' }, { tag: 'チームづくり', why: 'map' }];
    expect(tags(mergeTagSuggestions(own, map, 3))).toEqual(['マネジメント', 'コミュニケーション', '人を育てる']);
    expect(tags(mergeTagSuggestions([{ tag: '習慣' }], [{ tag: '習慣' }, { tag: '休み方' }], 3))).toEqual(['習慣', '休み方']);
    expect(tags(mergeTagSuggestions([], map, 3))).toEqual(['人を育てる', 'チームづくり']);
    expect(mergeTagSuggestions(own, [], 3)).toEqual(own);
  });
  it('地図のタグかどうか', () => {
    expect(isViewpointTag('お金')).toBe(true);
    expect(isViewpointTag('仕事術')).toBe(false);
  });
});

describe('使うかどうか（設定）', () => {
  beforeEach(() => { __resetViewpointSetting(); try { window.localStorage.clear(); } catch { /* ignore */ } });

  it('既定は使わない', () => {
    expect(resolveViewpointOn({})).toBe(false);
    expect(readViewpointOn({ id: 'u1', user_metadata: {} })).toBe(false);
    expect(readViewpointOn(null)).toBe(false);
  });
  it('アカウントの記録（キーがあればやめたことも）＞ 端末', () => {
    expect(resolveViewpointOn({ metadata: { viewpoint_map: { on: true } }, local: { on: false } })).toBe(true);
    expect(resolveViewpointOn({ metadata: { viewpoint_map: { on: false } }, local: { on: true } })).toBe(false);
    expect(resolveViewpointOn({ metadata: {}, local: { on: true } })).toBe(true);
    expect(resolveViewpointOn({ override: { on: false }, metadata: { viewpoint_map: { on: true } } })).toBe(false);
  });
  it('選ぶとすぐ効き、やめられる', async () => {
    const user = { id: 'u2', user_metadata: {} };
    await setViewpointOn(user, true);
    expect(readViewpointOn(user)).toBe(true);
    await setViewpointOn(user, false);
    expect(readViewpointOn(user)).toBe(false);
  });
});

describe('記録の地図', () => {
  it('地図を使っていない人には地図を出さない（最後の 1 行だけ）', () => {
    expect(viewpointRecordPart({ on: false })).toBe('invite');
    expect(viewpointRecordPart({ on: false, failed: true })).toBe('invite');
    expect(viewpointRecordPart({ on: true })).toBe('map');
    expect(viewpointRecordPart({ on: true, failed: true })).toBeNull();
  });

  const html = renderToStaticMarkup(createElement(ViewpointMapCard, {
    map: buildViewpointMap([{ tags: ['決め方'] }, { tags: ['決め方'] }, { tags: ['お金'] }]),
    onOpenTag: () => {}, onFindBooks: () => {},
  })).replace(/<wbr\/>/g, '');

  it('件数は数字だけ（点数・%・「あと N 件」・埋めよう は出さない）', () => {
    expect(html).toContain('視点の地図');
    expect(html).toContain('2 件');
    const text = html.replace(/<[^>]+>/g, ' ');
    for (const ng of ['%', 'あと', '埋め', '達成', 'ランキング', '位']) expect(text.includes(ng), ng).toBe(false);
  });
  it('0〜1 件のタグにだけ「この分野の本を探す」・0 件は押して一覧へ行かない', () => {
    const finds = (html.match(/この分野の本を探す/g) || []).length;
    expect(finds).toBe(VIEWPOINT_TAGS.length - 1); // 2 件の「決め方」だけ出さない
    expect(html).toContain('aria-label="決め方のメモ 2 件を見る"');
    expect(html).toContain('aria-label="お金のメモ 1 件を見る"');
    expect(html).not.toContain('経済のメモ 0 件を見る');
  });
  it('説明と選ぶシート: 使っていない人は「視点の地図を使う」、使っている人は「使うのをやめる」', () => {
    const off = renderToStaticMarkup(createElement(ViewpointMapSheet, { on: false, onChoose: () => {}, onClose: () => {} }));
    const on = renderToStaticMarkup(createElement(ViewpointMapSheet, { on: true, onChoose: () => {}, onClose: () => {} }));
    expect(off).toContain('視点の地図を使う');
    expect(on).toContain('使うのをやめる');
  });
});
