// 🏷 本の分野（2026-10-11 オーナー裁定・SPEC §2 / §4・旧「視点の地図」を作り直したもの）。
//
//   「タグとフォルダの定義を明確に。タグは視点の地図と連携して自動仕分け。本の特徴からその本がどのタグかを
//    自動的に仕分けしてほしい」「フォルダは完全に読者の自由に分けるためのもの」
//
// 言葉の決まり（CLAUDE.md の GLOSSARY）:
//   分野     … 本につく、決まった一覧（下の BOOK_FIELDS・18 個）から選ぶ名前。アプリが本の書名・紹介文・目次から
//              自動で付け、本人が直せる。1 冊に 3 つまで。保存先は今までの book_tags（tag_name＝分野の名前・新しい SQL なし）。
//   フォルダ … 本人が自由に作る分け方（book_collections）。アプリは自動で入れない・すすめない。
//   メモのタグ … メモに付ける自分の言葉（変わらない）。
//
// 一覧の形は 大分類 3 → 中分類 7 → 分野 18。もとは 2026-10-08 の視点の地図（発想の元の記事の図は書き手の著作物なので
// 項目名・構成は写していない）。2026-10-11 に「物語・エッセイ」を足した（小説・随筆が仕事の分野に入らないように）。
//
// 自動の仕分け（classifyBook）は端末の中だけ（AI なし・トークンなし・誰でも）。分からなければ付けない（[]）。
// 反ゲーミフィケーション: 点数・%・「埋めよう」・「あと N 冊」は作らない。

import { normalizeLinkText } from './memoLinks';

// 大分類 → 中分類 → 分野。
//   name : 画面に出す名前（book_tags の tag_name にそのまま入る＝あとから変えると付いている分野とずれる）
//   boost: 手がかりの言葉がそれだけで決め手になる分野（小説・エッセイなど本の種類を表す言葉）は点を倍に
//   words: 本の書名・紹介文・目次に出ていたら、その分野の手がかり（3 字以上は強く・2 字は弱く。英字だけの語は単語のときだけ）
export const BOOK_FIELD_GROUPS = [
  {
    id: 'self',
    name: '自分の軸',
    groups: [
      {
        id: 'path',
        name: '進む道',
        fields: [
          { name: '生き方・働き方', words: ['生き方', '働き方', 'キャリア', '転職', '人生', '定年', '副業', '天職', '将来', '40代', '50代', '100年時代', 'ライフ', 'life', '仕事観', '生きる', '自分らしく', '幸せ'] },
          { name: 'お金', words: ['お金', '投資', '貯金', '資産', '家計', '年収', '給料', '節約', '老後', '収入', '金持ち', 'マネー', '株式', 'インデックス', 'nisa', 'ファイナンス', '資本'] },
        ],
      },
      {
        id: 'body',
        name: '心と体',
        fields: [
          { name: '心の持ち方', words: ['不安', '自信', '感情', '怒り', '気持ち', '前向き', 'マインド', '劣等感', '勇気', '承認', '自己肯定', 'メンタル', 'ストレス', '悩み', '変化を恐れ', '心が', 'アドラー', '幸福'] },
          { name: '習慣', words: ['習慣', '毎日', '毎朝', '継続', 'ルーティン', 'ハビット', 'habit', '続ける', '早起き', '朝の', '小さな行動'] },
          { name: '休み方', words: ['睡眠', '休む', '休息', '休み', '疲れ', '運動', '健康', '食事', '散歩', '瞑想', '体調', '自律神経', 'マインドフルネス'] },
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
        fields: [
          { name: '問いを立てる', words: ['問い', 'イシュー', '本質', '仮説', '課題設定', '問題解決', 'ロジカル', '論理', 'フレームワーク', 'クリティカル', '考える力', '地頭'] },
          { name: '発想', words: ['アイデア', '発想', '企画', 'ひらめ', '創造', 'クリエイティブ', 'イノベーション', 'デザイン思考', 'アート', 'ゼロから'] },
          { name: '決め方', words: ['決める', '判断', '選択', '優先', 'やらない', '意思決定', '捨てる', '断る', 'エッセンシャル', '見極め', 'より少なく'] },
        ],
      },
      {
        id: 'people',
        name: '人と動く',
        fields: [
          { name: '伝え方', words: ['伝え方', '伝える', '話し方', '話す', '報告', '説明', 'プレゼン', '文章', '書く技術', '書き方', '結論から', '資料', '言葉', 'コミュニケーション', '雑談', '聞く力', 'アウトプット'] },
          { name: 'チームづくり', words: ['チーム', '組織', '会議', 'ミーティング', 'メンバー', '信頼', '1on1', '人間関係', '人を動かす', 'リーダー', 'リーダーシップ'] },
          { name: '人を育てる', words: ['部下', '後輩', '育て', 'フィードバック', '褒め', '叱', 'コーチ', '指導', 'マネージャー', 'マネジャー', 'マネジメント', '上司', '育成', '任せ'] },
        ],
      },
      {
        id: 'run',
        name: '進める',
        fields: [
          { name: '段取り', words: ['段取り', '予定', 'スケジュール', 'タスク', '締め切り', '期限', '先延ばし', '時間術', '仕事術', '生産性', '効率', 'やり抜く', '実行', '仕事が速い', '時間の使い方'] },
          { name: '数字で見る', words: ['数字', '数値', 'kpi', 'データ', '計測', '指標', '統計', '会計', '決算', '分析', 'ファクト', 'factfulness'] },
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
        fields: [
          { name: '経済', words: ['経済', '市場', '景気', '金利', '物価', '業界', 'ビジネスモデル', '競争', '経営', 'スタートアップ', '起業', 'マーケティング', '資本主義', 'ブランド', '企業'] },
          { name: 'テクノロジー', words: ['テクノロジー', 'ai', '人工知能', 'デジタル', '技術', 'ソフトウェア', 'インターネット', 'アルゴリズム', 'dx', 'プログラミング', '生成ai', 'ロボット'] },
        ],
      },
      {
        id: 'human',
        name: '人を知る',
        fields: [
          { name: '歴史に学ぶ', words: ['歴史', '戦国', '偉人', '明治', '江戸', '戦争', '人類', '全史', '文明', '古代', '帝国', '世界史', '日本史'] },
          { name: '人の心理', words: ['心理', 'バイアス', '思い込み', '動機', '行動経済', '影響力', '認知', '無意識', '本能', '脳科学', '心理学'] },
          { name: '物語・エッセイ', boost: 2, words: ['小説', '物語', 'エッセイ', '随筆', '短編', '長編', 'ミステリー', 'ファンタジー', '文学', '芥川賞', '直木賞', '本屋大賞', '青春', '恋愛', '童話', '寓話', '詩集', '日記'] },
        ],
      },
    ],
  },
];

// 分野の名前（上から順に）。
export const BOOK_FIELDS = BOOK_FIELD_GROUPS.flatMap((c) => c.groups.flatMap((g) => g.fields.map((f) => f.name)));
const FIELD_SET = new Set(BOOK_FIELDS);
const ALL_FIELDS = BOOK_FIELD_GROUPS.flatMap((c) => c.groups.flatMap((g) => g.fields));

// 1 冊に付けられる分野の数・自動で付ける数。
export const FIELD_MAX = 3;
export const AUTO_FIELD_MAX = 2;

export const isBookField = (name) => FIELD_SET.has(String(name || '').trim());

/** 本のタグ（book_tags）のうち分野だけ（一覧の順）。 */
export function fieldsOf(book) {
  const tags = new Set((Array.isArray(book?.tags) ? book.tags : []).map((t) => String(t || '').trim()));
  return BOOK_FIELDS.filter((f) => tags.has(f));
}

/** 本のタグのうち分野でないもの（前の版の自由なタグ・フォルダへ移す前のもの）。 */
export function nonFieldTags(book) {
  return (Array.isArray(book?.tags) ? book.tags : []).map((t) => String(t || '').trim()).filter((t) => t && !FIELD_SET.has(t));
}

/** 分野を入れ替えた本のタグ（分野でないタグは残す＝消さない）。fields は一覧の順にそろえ、FIELD_MAX まで。 */
export function withFields(tags, fields) {
  const keep = (Array.isArray(tags) ? tags : []).filter((t) => !FIELD_SET.has(String(t || '').trim()));
  const set = new Set((Array.isArray(fields) ? fields : []).map((f) => String(f || '').trim()));
  return [...BOOK_FIELDS.filter((f) => set.has(f)).slice(0, FIELD_MAX), ...keep];
}

// ── 前の版の自由なタグを分野に結びつける（移し替え・取り込み）────────────────
// よくある自分のタグの言い換え（名前に分野の言葉が出てこないもの）。
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
  '小説': ['物語・エッセイ'],
  '文学': ['物語・エッセイ'],
  'エッセイ': ['物語・エッセイ'],
};
const normTag = (tag) => normalizeLinkText(String(tag || '').trim().replace(/^[#＃]/u, '')).replace(/\s+/gu, '');
const ALIAS_BY_NORM = new Map(Object.entries(TAG_ALIASES).map(([k, v]) => [normTag(k), v]));
const linkCache = new Map();

/**
 * 自分のタグ 1 つが結びつく分野（無ければ []）。上から順に、最初に当たった段だけ:
 *   1. 分野と同じ名前（「習慣」「#お金」） 2. よくある言い換え（TAG_ALIASES）
 *   3. 名前が分野の手がかりの言葉と同じ（「投資」→お金） 4. 名前に手がかりの言葉（2 字以上・英字だけの語は除く）が入っている（「習慣化」→習慣）
 * 「@」で始まる印のタグは結びつけない。
 */
export function fieldsForTag(tag) {
  const n = normTag(tag);
  if (!n || n.startsWith('@')) return [];
  if (linkCache.has(n)) return linkCache.get(n);
  let out = ALL_FIELDS.filter((f) => normTag(f.name) === n).map((f) => f.name);
  if (!out.length && ALIAS_BY_NORM.has(n)) out = [...ALIAS_BY_NORM.get(n)];
  if (!out.length) out = ALL_FIELDS.filter((f) => f.words.some((w) => normTag(w) === n)).map((f) => f.name);
  if (!out.length) {
    out = ALL_FIELDS.filter((f) => f.words.some((w) => {
      const nw = normTag(w);
      return [...nw].length >= 2 && !/^[a-z0-9]+$/.test(nw) && n.includes(nw);
    })).map((f) => f.name);
  }
  linkCache.set(n, out);
  return out;
}

/**
 * 前の版の本のタグを分ける（移し替え・取り込みで使う）。
 *   fields : 結びついた分野（一覧の順・FIELD_MAX まで）
 *   folders: 分野に結びつかなかったタグ（名前のまま・フォルダへ移す）
 * 分野に結びついたタグの元の言葉は分野に置きかわる（オーナー裁定）。結びつかない言葉はフォルダに残る＝消さない。
 */
export function splitLegacyTags(tags) {
  const fields = new Set();
  const folders = [];
  const seen = new Set();
  for (const raw of Array.isArray(tags) ? tags : []) {
    const t = String(raw || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    if (FIELD_SET.has(t)) { fields.add(t); continue; }
    const linked = fieldsForTag(t);
    if (linked.length) linked.forEach((f) => fields.add(f));
    else folders.push(t);
  }
  return { fields: BOOK_FIELDS.filter((f) => fields.has(f)).slice(0, FIELD_MAX), folders };
}

// ── 自動の仕分け ────────────────────────────────────────────────
// 書名（と副題）は強く、紹介文・目次は弱く数える。同じ語が紹介文に何度も出れば少しずつ強く（3 回まで）。
// 点が CLASSIFY_MIN に届いた分野だけ、多い順に AUTO_FIELD_MAX まで。2 つ目は 1 つ目の半分以上のときだけ（迷うものは付けない）。
export const CLASSIFY_MIN = 2;
const WEIGHT = { title: 3.4, subtitle: 2, description: 1, toc: 0.8 };

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function countWord(norm, nw) {
  if (!nw || !norm) return 0;
  // 英字だけの短い語（ai・it・kpi）は単語として出ているときだけ数える（「wait」の it を数えない）
  if (/^[a-z0-9]+$/.test(nw)) {
    const m = norm.match(new RegExp(`(^|[^a-z0-9])${escapeRe(nw)}(?=[^a-z0-9]|$)`, 'g'));
    return m ? m.length : 0;
  }
  let n = 0;
  let i = norm.indexOf(nw);
  while (i >= 0 && n < 3) { n += 1; i = norm.indexOf(nw, i + nw.length); }
  return n;
}

/** 分野ごとの点（テスト・確かめ用）。 */
export function scoreBookFields({ title = '', subtitle = '', description = '', toc = [] } = {}) {
  const parts = {
    title: normalizeLinkText(title),
    subtitle: normalizeLinkText(subtitle),
    description: normalizeLinkText(description),
    toc: normalizeLinkText(Array.isArray(toc) ? toc.join('\n') : toc),
  };
  const scores = new Map();
  for (const f of ALL_FIELDS) {
    let s = 0;
    const words = [f.name, ...f.words];
    for (const w of words) {
      const nw = normalizeLinkText(w);
      const strength = [...nw].length >= 3 ? 1 : 0.6;
      for (const [k, text] of Object.entries(parts)) {
        const c = countWord(text, nw);
        if (!c) continue;
        // 書名・副題は 1 回だけ。紹介文・目次は 2 回目から 0.5 ずつ。
        const times = k === 'title' || k === 'subtitle' ? 1 : 1 + 0.5 * (c - 1);
        s += WEIGHT[k] * strength * times;
      }
    }
    s *= f.boost || 1;
    if (s > 0) scores.set(f.name, Math.round(s * 100) / 100);
  }
  return scores;
}

/**
 * 本の特徴（書名・副題・著者・紹介文・目次）から分野を決める。分からなければ []。
 * 著者は手がかりにしない（著者の名前に分野の言葉が入っていても、本の中身とは限らない）。
 */
export function classifyBook({ title = '', subtitle = '', description = '', toc = [] } = {}) {
  const scores = scoreBookFields({ title, subtitle, description, toc });
  const ranked = [...scores.entries()]
    .filter(([, s]) => s >= CLASSIFY_MIN)
    .sort((a, b) => b[1] - a[1] || BOOK_FIELDS.indexOf(a[0]) - BOOK_FIELDS.indexOf(b[0]));
  if (!ranked.length) return [];
  const top = ranked[0][1];
  return ranked.filter(([, s], i) => i === 0 || s >= top * 0.5).slice(0, AUTO_FIELD_MAX).map(([name]) => name);
}

// ── 記録の「分野」 ──────────────────────────────────────────────
// 本が 0〜1 冊の分野は「少ない分野」（下の 1 行で「この分野の本を探す」に 2 つまで名前を出す）。
export const THIN_BOOKS = 1;

/**
 * 分野ごとの本の数・メモの数・読書の時間（秒）。大分類ごとに、本のある分野だけ（一覧の順・本が 0 冊の分野は行にしない）。
 *   books: アプリの本（tags） / memoCountByBook: { [bookId]: N } / secondsByBook: { [bookId]: 秒 }
 * 戻り値: { groups: [{ id, name, fields: [{ name, books, memos, seconds }] }], thin: [分野の名前…], any }
 */
export function buildFieldRecord(books = [], { memoCountByBook = {}, secondsByBook = {} } = {}) {
  const stat = new Map(BOOK_FIELDS.map((f) => [f, { name: f, books: 0, memos: 0, seconds: 0 }]));
  let any = false;
  for (const b of Array.isArray(books) ? books : []) {
    const fs = fieldsOf(b);
    if (!fs.length) continue;
    any = true;
    for (const f of fs) {
      const s = stat.get(f);
      s.books += 1;
      s.memos += Number(memoCountByBook?.[b.id]) || 0;
      // 時間は分野の数で等しく分ける（読書の時間の「分野ごと」と同じ・足すと合計）
      s.seconds += (Number(secondsByBook?.[b.id]) || 0) / fs.length;
    }
  }
  const groups = BOOK_FIELD_GROUPS.map((c) => ({
    id: c.id,
    name: c.name,
    fields: c.groups.flatMap((g) => g.fields.map((f) => stat.get(f.name))).filter((s) => s.books > 0),
  })).filter((c) => c.fields.length);
  // 少ない分野: 本の少ない順（0 冊 → 1 冊）・同じなら一覧の順。2 つまで。
  const thin = BOOK_FIELDS
    .map((f, i) => ({ f, n: stat.get(f).books, i }))
    .filter((x) => x.n <= THIN_BOOKS)
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .slice(0, 2)
    .map((x) => x.f);
  return { groups, thin, any };
}

// 「この分野の本を探す」で AI 選書の最初の悩みに入れる言葉（送らない）。分野は 1 つでも数個（「・」でつなぐ）でも。
export function advisorDraftFor(fields) {
  const list = (Array.isArray(fields) ? fields : [fields]).map((t) => String(t || '').trim()).filter(Boolean);
  return `${list.join('・')}について、視点を増やしたい`;
}
