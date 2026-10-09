// 🗺 視点の地図（lib/viewpointMap.js・lib/viewpointMapSetting.js・components/ViewpointMap.jsx）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('./supabase', () => ({ supabase: { auth: { updateUser: vi.fn(async () => ({ error: null })) } }, isSupabaseConfigured: true }));

import {
  VIEWPOINT_MAP, VIEWPOINT_TAGS, countMemosByTag, buildViewpointMap, shadeLevel, isFewMemos, advisorDraftFor,
  scoreViewpointTags, mergeTagSuggestions, viewpointRecordPart, isViewpointTag,
  viewpointTagsForTag, memoInViewpoint, linkedTagsFor, TAG_ALIASES,
} from './viewpointMap';
import { resolveViewpointOn, readViewpointOn, setViewpointOn, __resetViewpointSetting } from './viewpointMapSetting';
import { ViewpointMapCard, ViewpointMapSheet } from '../components/ViewpointMap';
import { supabase } from './supabase';

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
    { tags: ['読書術'] }, // どの分野にも結びつかないタグは数えない
    { tags: null },
    {},
  ];
  it('地図のタグごとに、そのタグの付いたメモの数', () => {
    const c = countMemosByTag(rows);
    expect(c.get('決め方')).toBe(3);
    expect(c.get('習慣')).toBe(1);
    expect(c.get('お金')).toBe(0);
    expect(c.has('読書術')).toBe(false);
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

describe('自分のタグを地図の分野に結びつける（2026-10-09）', () => {
  const tags = (list) => list.map((x) => x.tag);
  it('オーナーの例: マネジメント・習慣化・投資・リーダーシップ・思考法', () => {
    expect(viewpointTagsForTag('マネジメント')).toEqual(['人を育てる', 'チームづくり']);
    expect(viewpointTagsForTag('習慣化')).toEqual(['習慣']);
    expect(viewpointTagsForTag('投資')).toEqual(['お金']);
    expect(viewpointTagsForTag('リーダーシップ')).toEqual(['チームづくり']);
    expect(viewpointTagsForTag('思考法')).toEqual(['問いを立てる']);
  });
  it('地図のタグと同じ名前はそのまま（# と空白と全角・半角は気にしない）', () => {
    expect(viewpointTagsForTag('習慣')).toEqual(['習慣']);
    expect(viewpointTagsForTag('#お金')).toEqual(['お金']);
    expect(viewpointTagsForTag(' ＃決め方 ')).toEqual(['決め方']);
  });
  it('手がかりの言葉と同じ名前・手がかりの言葉が入った名前', () => {
    expect(viewpointTagsForTag('キャリア')).toEqual(['生き方・働き方']);
    expect(viewpointTagsForTag('時間')).toEqual(['段取り']);
    expect(viewpointTagsForTag('時間術')).toEqual(['段取り']);
    expect(viewpointTagsForTag('心理学')).toEqual(['人の心理']);
    expect(viewpointTagsForTag('KPI')).toEqual(['数字で見る']);
  });
  it('よくある自分のタグ（お試しモードのタグ）', () => {
    expect(viewpointTagsForTag('コミュニケーション')).toEqual(['伝え方']);
    expect(viewpointTagsForTag('仕事術')).toEqual(['段取り']);
  });
  it('結びつかないタグ・印のタグ・空は []', () => {
    expect(viewpointTagsForTag('読書術')).toEqual([]);
    expect(viewpointTagsForTag('@ai')).toEqual([]);
    expect(viewpointTagsForTag('')).toEqual([]);
    // 英字だけの短い手がかり（it・ai）は名前の中に入っていても結びつけない
    expect(viewpointTagsForTag('security')).toEqual([]);
  });
  it('言い換えの行き先は、どれも地図のタグ', () => {
    for (const [k, v] of Object.entries(TAG_ALIASES)) for (const t of v) expect(VIEWPOINT_TAGS, `${k}→${t}`).toContain(t);
  });
  it('件数に入る・1 件のメモは同じ分野に 1 回だけ', () => {
    const rows = [
      { tags: ['マネジメント'] },
      { tags: ['マネジメント', '人を育てる'] },
      { tags: ['習慣化', '習慣'] },
      { tags: ['コミュニケーション'] },
    ];
    const c = countMemosByTag(rows);
    expect(c.get('人を育てる')).toBe(2);
    expect(c.get('チームづくり')).toBe(2);
    expect(c.get('習慣')).toBe(1);
    expect(c.get('伝え方')).toBe(1);
  });
  it('マスを押したときの絞り込みは件数と同じ（件数と一覧が合う）', () => {
    const rows = [
      { tags: ['マネジメント'] }, { tags: ['リーダーシップ'] }, { tags: ['チームづくり'] }, { tags: ['読書術'] }, { tags: [] },
    ];
    const counts = countMemosByTag(rows);
    for (const tag of VIEWPOINT_TAGS) {
      expect(rows.filter((m) => memoInViewpoint(tag, m.tags)).length, tag).toBe(counts.get(tag));
    }
    expect(linkedTagsFor('チームづくり', rows)).toEqual(['マネジメント', 'リーダーシップ', 'チームづくり']);
  });
  it('付いている自分のタグが結びつく分野は、合いそうなタグにすすめない', () => {
    const text = '部下への指導とフィードバック、チームの会議の進め方。';
    expect(tags(scoreViewpointTags(text, ['マネジメント']))).not.toContain('人を育てる');
    expect(tags(scoreViewpointTags(text, ['マネジメント']))).not.toContain('チームづくり');
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
    expect(await setViewpointOn(user, true)).toBe('saved');
    expect(readViewpointOn(user)).toBe(true);
    await setViewpointOn(user, false);
    expect(readViewpointOn(user)).toBe(false);
  });
});

describe('保存の失敗', () => {
  it('アカウントに書けなければ local（この端末では選んだとおり）', async () => {
    __resetViewpointSetting();
    supabase.auth.updateUser.mockImplementationOnce(async () => ({ error: { message: 'offline' } }));
    const user = { id: 'u3', user_metadata: {} };
    expect(await setViewpointOn(user, true)).toBe('local');
    expect(readViewpointOn(user)).toBe(true);
    expect(await setViewpointOn(null, true)).toBe(false);
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
    expect(html).toContain('メモ 2 件');
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
  it('地図のタグが 1 つも無い人には「この分野の本を探す」を並べず、付け方の 1 行だけ', () => {
    const empty = renderToStaticMarkup(createElement(ViewpointMapCard, { map: buildViewpointMap([]), onOpenTag: () => {}, onFindBooks: () => {} })).replace(/<wbr\/>/g, '');
    expect(empty).not.toContain('この分野の本を探す');
    expect(empty).toContain('ここに数が出ます');
  });
  it('説明と選ぶシート: 使っていない人は「視点の地図を使う」、使っている人は「使うのをやめる」', () => {
    const off = renderToStaticMarkup(createElement(ViewpointMapSheet, { on: false, onChoose: () => {}, onClose: () => {} }));
    const on = renderToStaticMarkup(createElement(ViewpointMapSheet, { on: true, onChoose: () => {}, onClose: () => {} }));
    expect(off).toContain('視点の地図を使う');
    expect(on).toContain('使うのをやめる');
  });
});
