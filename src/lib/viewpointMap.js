// 🗺 視点の地図（2026-10-08 オーナー承認・SPEC §4）。
//
// 本を 1 冊読むたびに、著者のものの見方が 1 つ手に入る。メモに「分野のタグ」を付けておくと、
// どの分野の視点がたまっているかを 1 枚の地図で見られる（振り返り › 記録の「視点の地図」）。
// 使うかどうかは本人が選ぶ（lib/viewpointMapSetting.js）。使うと「合いそうなタグ」がこの地図のタグからもすすめる。
//
// 発想の元は、オーナーが読んだ記事の「ビジネスの基礎体力の木」（大分類 3 → 中分類 → 末端をメモのタグに）。
// その図は書き手の著作物なので、項目名・構成は写していない。考え方（3 つの大分類 → 中分類 → タグ）だけを借り、
// ビジネス書を読む会社員向けに Orime の言葉と分け方で作り直した（下の VIEWPOINT_MAP）。
//
// 反ゲーミフィケーション（CLAUDE.md）: 点数・達成率・連続日数・バッジ・「埋めよう」・「あと N 件」は作らない。
// 地図はタグごとのメモの件数を、そのまま淡く見せるだけ。
//
// ここにあるのは純粋関数だけ（画面は components/ViewpointMap.jsx・設定は lib/viewpointMapSetting.js）。

import { normalizeLinkText } from './memoLinks';

// 大分類 3 → 中分類 → タグ（17 個）。
//   name: 画面に出す名前（タグの名前はそのままメモのタグになる＝あとから変えると、付けたタグと地図がずれる）
//   words: 「合いそうなタグ」で、メモの文にこの言葉があればすすめる手がかり（3 字以上は強く・2 字は弱く）
export const VIEWPOINT_MAP = [
  {
    id: 'self',
    name: '自分の軸',
    groups: [
      {
        id: 'path',
        name: '進む道',
        tags: [
          { name: '生き方・働き方', words: ['生き方', '働き方', 'キャリア', '転職', '人生', '定年', '副業', '天職', '将来', '40代', '50代', 'ライフ'] },
          { name: 'お金', words: ['お金', '投資', '貯金', '資産', '家計', '年収', '給料', '節約', '老後', '収入'] },
        ],
      },
      {
        id: 'body',
        name: '心と体',
        tags: [
          { name: '心の持ち方', words: ['不安', '自信', '感情', '怒り', '気持ち', '前向き', 'マインド', '評価を気に', '劣等感', '勇気', '承認を求め', '承認', '自分の課題', '他人の課題', 'いま、ここ', '心が'] },
          { name: '習慣', words: ['習慣', '毎日', '毎朝', '毎晩', '続ける', '継続', 'ルーティン', '朝の'] },
          { name: '休み方', words: ['睡眠', '寝る前', '寝る', '休む', '休息', '休み', '疲れ', '運動', '健康', '食事', '散歩', '瞑想', '体調'] },
        ],
      },
    ],
  },
  {
    id: 'work',
    name: '仕事の腕',
    groups: [
      {
        id: 'think',
        name: '考える',
        tags: [
          { name: '問いを立てる', words: ['問い', 'イシュー', '本質', '仮説', 'そもそも', '課題設定', '何を決める'] },
          { name: '発想', words: ['アイデア', '発想', '企画', 'ひらめ', '創造', '新しい案', '思いつ'] },
          { name: '決め方', words: ['決める', '判断', '選択', '優先', 'やらない', '意思決定', '捨てる', '断る', '迷ったら'] },
        ],
      },
      {
        id: 'people',
        name: '人と動く',
        tags: [
          { name: '伝え方', words: ['伝え', '話す', '報告', '説明', 'プレゼン', '文章', '結論から', '相談する', '資料'] },
          { name: 'チームづくり', words: ['チーム', '組織', '会議', 'ミーティング', 'メンバー', '信頼', '1on1', '関係'] },
          { name: '人を育てる', words: ['部下', '後輩', '育て', 'フィードバック', '褒め', '叱', 'コーチ', '指導', 'マネージャー', '質問で', '指摘'] },
        ],
      },
      {
        id: 'run',
        name: '進める',
        tags: [
          { name: '段取り', words: ['段取り', '予定', 'スケジュール', 'タスク', '締め切り', '期限', 'バッファ', '先延ばし', 'カレンダー', '時間'] },
          { name: '数字で見る', words: ['数字', '数値', 'kpi', 'データ', '計測', '測る', '行動量', '数で', '指標', '件数', '割合'] },
        ],
      },
    ],
  },
  {
    id: 'world',
    name: '世の中の見方',
    groups: [
      {
        id: 'now',
        name: 'いまを知る',
        tags: [
          { name: '経済', words: ['経済', '市場', '景気', '金利', '物価', '業界', 'ビジネスモデル', '競争'] },
          { name: 'テクノロジー', words: ['テクノロジー', 'ai', 'デジタル', '技術', 'ソフトウェア', 'インターネット', 'アルゴリズム', 'it'] },
        ],
      },
      {
        id: 'human',
        name: '人を知る',
        tags: [
          { name: '歴史に学ぶ', words: ['歴史', '戦国', '時代', '偉人', '明治', '江戸', '戦争', '昔の'] },
          { name: '人の心理', words: ['心理', '人は', '人間', 'バイアス', '思い込み', '動機', '行動経済', '重要だと感じ'] },
        ],
      },
    ],
  },
];

// 地図のタグの名前（上から順に）。
export const VIEWPOINT_TAGS = VIEWPOINT_MAP.flatMap((c) => c.groups.flatMap((g) => g.tags.map((t) => t.name)));
const TAG_SET = new Set(VIEWPOINT_TAGS);

export const isViewpointTag = (tag) => TAG_SET.has(String(tag || '').trim());

// ── 自分のタグを地図の分野に結びつける（2026-10-09 オーナー「使い込んだ人ほど地図が空っぽに見える」）──
// 今までのタグ（#マネジメント・#習慣化 など）の名前が分野の手がかりに当たれば、その分野のメモとして数える。
// 地図のタグそのものの名前は変えない（付けたタグと地図がずれないように）。決め方は上から順に、最初に当たった段だけ:
//   1. 地図のタグと同じ名前（「習慣」「#お金」）
//   2. よくある自分のタグの言い換え（TAG_ALIASES・名前に分野の言葉が出てこないもの）
//   3. 名前が分野の手がかりの言葉と同じ（「投資」→お金・「キャリア」→生き方・働き方・「時間」→段取り）
//   4. 名前に手がかりの言葉（2 字以上・英字だけの言葉は除く）が入っている（「習慣化」→習慣・「心理学」→人の心理・「時間術」→段取り）
// どれにも当たらないタグ（「読書術」など）は数えない。
export const TAG_ALIASES = {
  'マネジメント': ['人を育てる', 'チームづくり'],
  'リーダーシップ': ['チームづくり'],
  'リーダー': ['チームづくり'],
  '思考法': ['問いを立てる'],
  '思考': ['問いを立てる'],
  'ロジカルシンキング': ['問いを立てる'],
  '問題解決': ['問いを立てる'],
  'コミュニケーション': ['伝え方'],
  '話し方': ['伝え方'],
  '書き方': ['伝え方'],
  '仕事術': ['段取り'],
  '生産性': ['段取り'],
  '効率化': ['段取り'],
  '資産運用': ['お金'],
  'マネー': ['お金'],
  'メンタル': ['心の持ち方'],
  'マインドセット': ['心の持ち方'],
  '自己肯定感': ['心の持ち方'],
  'ウェルビーイング': ['休み方'],
  'アイデア発想': ['発想'],
  'イノベーション': ['発想'],
  '経営': ['経済'],
  'ビジネス': ['経済'],
  '会計': ['数字で見る'],
  'データ分析': ['数字で見る'],
  'DX': ['テクノロジー'],
  '歴史': ['歴史に学ぶ'],
  '行動経済学': ['人の心理'],
};
const normTag = (tag) => normalizeLinkText(String(tag || '').trim().replace(/^[#＃]/u, '')).replace(/\s+/gu, '');
const ALIAS_BY_NORM = new Map(Object.entries(TAG_ALIASES).map(([k, v]) => [normTag(k), v]));
const ALL_TAGS = VIEWPOINT_MAP.flatMap((c) => c.groups.flatMap((g) => g.tags));
const linkCache = new Map();

/** 自分のタグ 1 つが結びつく地図のタグ（無ければ []）。「@」で始まる印のタグは結びつけない。 */
export function viewpointTagsForTag(tag) {
  const n = normTag(tag);
  if (!n || n.startsWith('@')) return [];
  if (linkCache.has(n)) return linkCache.get(n);
  let out = ALL_TAGS.filter((t) => normTag(t.name) === n).map((t) => t.name);
  if (!out.length && ALIAS_BY_NORM.has(n)) out = [...ALIAS_BY_NORM.get(n)];
  if (!out.length) out = ALL_TAGS.filter((t) => t.words.some((w) => normTag(w) === n)).map((t) => t.name);
  if (!out.length) {
    out = ALL_TAGS.filter((t) => t.words.some((w) => {
      const nw = normTag(w);
      return [...nw].length >= 2 && !/^[a-z0-9]+$/.test(nw) && n.includes(nw);
    })).map((t) => t.name);
  }
  linkCache.set(n, out);
  return out;
}

/** メモのタグ（配列）が、地図のタグ mapTag の分野に入るか（地図のマスを押したときの絞り込み＝件数と同じ決め方）。 */
export function memoInViewpoint(mapTag, tags) {
  const target = String(mapTag || '').trim();
  return (Array.isArray(tags) ? tags : []).some((t) => viewpointTagsForTag(t).includes(target));
}

/** その分野に結びついた自分のタグ（rows に出てくるものだけ・多い順）。 */
export function linkedTagsFor(mapTag, rows = []) {
  const target = String(mapTag || '').trim();
  const count = new Map();
  for (const m of Array.isArray(rows) ? rows : []) {
    for (const t of new Set((Array.isArray(m?.tags) ? m.tags : []).map((x) => String(x || '').trim()))) {
      if (t && viewpointTagsForTag(t).includes(target)) count.set(t, (count.get(t) || 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

// メモが少ない（「この分野の本を探す」を出す）＝ 0〜1 件。
export const FEW_MEMOS = 1;
export const isFewMemos = (count) => (Number(count) || 0) <= FEW_MEMOS;

// 分野（地図のタグ）ごとのメモの件数。rows: [{ tags: [] }]。自分のタグが結びつく分野も数える（viewpointTagsForTag）。
// 1 件のメモが同じ分野に何個のタグで当たっても 1。
export function countMemosByTag(rows = []) {
  const counts = new Map(VIEWPOINT_TAGS.map((t) => [t, 0]));
  for (const m of Array.isArray(rows) ? rows : []) {
    const fields = new Set();
    for (const t of (Array.isArray(m?.tags) ? m.tags : [])) for (const f of viewpointTagsForTag(t)) fields.add(f);
    for (const f of fields) if (counts.has(f)) counts.set(f, counts.get(f) + 1);
  }
  return counts;
}

// 地図の形（大分類 → 中分類 → タグ）に件数を付けたもの。画面はこれをそのまま描く。
export function buildViewpointMap(rows = []) {
  const counts = countMemosByTag(rows);
  return VIEWPOINT_MAP.map((c) => ({
    id: c.id,
    name: c.name,
    groups: c.groups.map((g) => ({
      id: g.id,
      name: g.name,
      tags: g.tags.map((t) => ({ name: t.name, count: counts.get(t.name) || 0 })),
    })),
  }));
}

// 振り返り › 記録に何を出すか: 使っている人は地図（メモを読めなかったときは 0 件と偽装しないので出さない）、
// 使っていない人は最後の控えめな 1 行だけ（地図は出さない）。
export function viewpointRecordPart({ on = false, failed = false } = {}) {
  if (!on) return 'invite';
  return failed ? null : 'map';
}

// 色の濃さの段（0〜3）。控えめに 4 段だけ（点数や順位にはしない）。
export function shadeLevel(count) {
  const n = Number(count) || 0;
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n <= 4) return 2;
  return 3;
}

// 「メモの少ない分野の本を探す」で AI 選書の最初の悩みに入れる言葉（送らない）。分野は 1 つでも数個（「・」でつなぐ）でも。
export function advisorDraftFor(tags) {
  const list = (Array.isArray(tags) ? tags : [tags]).map((t) => String(t || '').trim()).filter(Boolean);
  return `${list.join('・')}について、視点を増やしたい`;
}

// メモの少ない分野（0〜1 件）を、少ない順・地図の順に max 個（「メモの少ない分野の本を探す」に入れる・2026-10-09）。
export function fewViewpointTags(map = [], max = 3) {
  const flat = [];
  (Array.isArray(map) ? map : []).forEach((c) => c.groups.forEach((g) => g.tags.forEach((t) => flat.push(t))));
  return flat
    .map((t, i) => ({ ...t, i }))
    .filter((t) => isFewMemos(t.count))
    .sort((a, b) => a.count - b.count || a.i - b.i)
    .slice(0, max)
    .map((t) => t.name);
}

// ── 合いそうなタグ（地図のタグから） ─────────────────────────────
// メモの文に、そのタグの手がかりの言葉がどれだけ出ているか。タグの名前そのもの・3 字以上の言葉は 1、2 字の言葉は 0.5。
// 1 以上のタグだけすすめる（2 字の言葉 1 つだけでは寄せない＝違うタグをすすめると信頼を失う・lib/tagSuggest.js と同じ考え）。
export const VIEWPOINT_MIN = 1;
export const VIEWPOINT_SUGGEST_MAX = 2;

export function scoreViewpointTags(text, current = []) {
  const norm = normalizeLinkText(text);
  if ([...norm.replace(/\s+/gu, '')].length < 8) return [];
  // もう付いているタグと、付いている自分のタグが結びつく分野（#マネジメント→人を育てる）はすすめない（もう数えている）。
  const skip = new Set((current || []).flatMap((t) => [String(t || '').trim(), ...viewpointTagsForTag(t)]));
  const out = [];
  for (const c of VIEWPOINT_MAP) {
    for (const g of c.groups) {
      for (const t of g.tags) {
        if (skip.has(t.name)) continue;
        let score = norm.includes(normalizeLinkText(t.name)) ? 1 : 0;
        for (const w of t.words) {
          const nw = normalizeLinkText(w);
          if (!nw || !norm.includes(nw)) continue;
          // 英字だけの短い言葉（ai・it・kpi）は単語として出ているときだけ（「wait」の it を数えない）
          if (/^[a-z0-9]+$/.test(nw) && !new RegExp(`(^|[^a-z0-9])${nw}([^a-z0-9]|$)`).test(norm)) continue;
          score += [...nw].length >= 3 ? 1 : 0.5;
        }
        if (score >= VIEWPOINT_MIN) out.push({ tag: t.name, score: Math.round(score * 100) / 100, why: 'map' });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score || VIEWPOINT_TAGS.indexOf(a.tag) - VIEWPOINT_TAGS.indexOf(b.tag)).slice(0, VIEWPOINT_SUGGEST_MAX);
}

// 自分のタグのすすめ（own）と地図のタグのすすめ（map）を合わせる。自分のタグが先・地図のタグにも 1 枠は空ける。
export function mergeTagSuggestions(own = [], map = [], max = 3) {
  const out = [];
  const seen = new Set();
  const push = (x) => { if (x && !seen.has(x.tag) && out.length < max) { seen.add(x.tag); out.push(x); } };
  const mapFirst = map.find((x) => !own.some((o) => o.tag === x.tag));
  own.slice(0, mapFirst ? max - 1 : max).forEach(push);
  if (mapFirst) push(mapFirst);
  own.forEach(push);
  map.forEach(push);
  return out;
}
