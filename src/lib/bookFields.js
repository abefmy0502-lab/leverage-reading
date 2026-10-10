// 🏷 本の分野（2026-10-11 オーナー裁定・SPEC §2 / §4・旧「視点の地図」を作り直したもの）。
//
//   「タグとフォルダの定義を明確に。タグは視点の地図と連携して自動仕分け。本の特徴からその本がどのタグかを
//    自動的に仕分けしてほしい」「フォルダは完全に読者の自由に分けるためのもの」
//   同日「仕事の腕という意味が分かりにくい。改めてこの分類わけをわかりやすく、基本的にどの本も分類できるように」
//    → 大分類 4（仕事・自分と暮らし・教養・楽しむ）→ 分野 19 に作り直した（中分類はやめた）。
//
// 言葉の決まり（CLAUDE.md の GLOSSARY）:
//   分野     … 本につく、決まった一覧（下の BOOK_FIELDS・19 個）から選ぶ名前。アプリが本の書名・紹介文・目次から
//              自動で付け、本人が直せる。1 冊に 3 つまで。保存先は今までの book_tags（tag_name＝分野の名前・新しい SQL なし）。
//   フォルダ … 本人が自由に作る分け方（book_collections）。アプリは自動で入れない・すすめない。
//   メモのタグ … メモに付ける自分の言葉（変わらない）。
//
// 一覧はこのアプリの言葉で作った（発想の元の記事の図は書き手の著作物なので、項目名・構成は写していない）。
// 書店の棚のように「どの本もどこかに入る」ことを目標にした（小説・エッセイ・料理・旅の本も）。
// 前の版（大分類 3・分野 18）の名前は OLD_FIELD_RENAMES で新しい名前に移す（hooks/useBookFieldsAuto.js）。
//
// 自動の仕分け（classifyBook）は端末の中だけ（AI なし・トークンなし・誰でも）。手がかりが無ければ付けない（[]）。
// 反ゲーミフィケーション: 点数・%・「埋めよう」・「あと N 冊」は作らない。

import { normalizeLinkText } from './memoLinks';

// 大分類 → 分野。
//   name : 画面に出す名前（book_tags の tag_name にそのまま入る＝あとから変えると付いている分野とずれる・変えるときは
//          OLD_FIELD_RENAMES に前の名前を足す）
//   boost: 手がかりの言葉がそれだけで決め手になる分野（小説・エッセイなど本の種類を表す言葉）は点を倍に
//   words: 本の書名・紹介文・目次に出ていたら、その分野の手がかり（3 字以上は強く・2 字以下は弱く。英字だけの語は単語のときだけ）
export const BOOK_FIELD_GROUPS = [
  {
    id: 'work',
    name: '仕事',
    fields: [
      { name: '考える力', words: ['思考', '考える力', '考え抜く', '考える技術', 'ロジカル', '論理', '問題解決', '仮説', '発想', 'アイデア', '意思決定', '戦略思考', 'フレームワーク', 'イシュー', '問い', '本質', 'クリティカル', '地頭', '思考法', '判断', '企画', '創造', 'ひらめき', 'デザイン思考', '見極め', 'エッセンシャル', 'より少なく', '優先順位', '頭のいい', '頭の良い', '知的生産', '抽象', '具体と抽象', 'アナロジー', '決める'] },
      { name: '伝える力', words: ['文章', '書く', '書き方', '話し方', '話す', '伝え方', '伝える', 'プレゼン', '説明', '会話', 'コミュニケーション', '雑談', '聞く力', '聞き方', '言語化', '文章術', 'ライティング', '報告', '資料', 'アウトプット', '表現', '交渉', '説得', '敬語', '語彙', '言い方', '質問力'] },
      { name: 'リーダー・チーム', words: ['リーダー', 'リーダーシップ', 'チーム', '組織', 'マネジメント', 'マネージャー', 'マネジャー', '部下', '上司', '1on1', '育成', '人を育てる', '人を動かす', 'コーチ', 'コーチング', '指導', 'フィードバック', '任せ', '管理職', 'メンバー', '心理的安全性', '統率'] },
      { name: '仕事の進め方', words: ['段取り', '時間術', '生産性', '仕事術', 'タスク', '効率', '会議', '数字', '会計', 'エクセル', 'excel', '締め切り', 'スケジュール', '先延ばし', '仕事が速い', '時間の使い方', '数値', '数値化', 'kpi', 'データ', '分析', '統計', '決算', '財務諸表', '仕事のやり方', 'ノート術', 'メモ術', '手帳', '仕事の基本', 'ミス', '業務', '改善', 'pdca'] },
      { name: '経営・マーケティング', words: ['経営', '経営者', '起業', '起業家', '戦略', '経営戦略', 'マーケティング', '営業', '販売', 'ブランド', 'ブランディング', '事業', '組織論', 'イノベーション', 'スタートアップ', 'ビジネスモデル', '競争', '顧客', '売上', '利益', 'ベンチャー', '広告', '企業', '社長', 'ceo', '創業', '独占', '商売', '集客'] },
      { name: 'キャリア・働き方', words: ['キャリア', '転職', '働き方', '副業', '天職', '就活', '就職', '仕事選び', '働く', '定年', '独立', 'フリーランス', '100年時代', '人生100年', 'life', 'shift', 'リスキリング', '学び直し', '会社員', '40代', '50代', '引退'] },
    ],
  },
  {
    id: 'life',
    name: '自分と暮らし',
    fields: [
      { name: '心の整え方', words: ['メンタル', 'ストレス', '不安', '自己肯定感', '自己肯定', 'マインドフルネス', '瞑想', '生き方', '幸せ', '幸福', '心の', '心が', '心を', '悩み', '怒り', '感情', '自信', '勇気', '前向き', '気持ち', '落ち込', '劣等感', '嫌われ', '気にしない', '承認欲求', '繊細', 'hsp', '孤独', '生きづらさ', 'マインド', 'アドラー', '心配', '傷つ', '許す', '自由に生きる', 'くよくよ', 'イライラ'] },
      { name: '習慣・自己成長', words: ['習慣', '自己啓発', '成長', '目標', '継続', '勉強法', '読書術', '自分を変える', '毎日', '毎朝', '早起き', 'ルーティン', 'ハビット', 'habit', '続ける', 'やり抜く', 'grit', '努力', '学び方', '勉強', '独学', '読書', '記憶術', '自己投資', 'モチベーション', '集中力', '成功法則', '夢をかなえる', '片づけ', '片付け', '掃除', '家事', '暮らし', '1%', '小さな行動', '自分を磨く'] },
      { name: '健康・からだ', words: ['健康', '睡眠', '眠り', '食事', '食べ方', '運動', '筋トレ', '筋肉', 'ダイエット', '医学', '医者', '医師', '病気', '休み方', '休む', '休息', '疲れ', '疲労', '体調', '自律神経', '腸内', '免疫', '老化', '長生き', '寿命', 'ストレッチ', '姿勢', '呼吸', 'ウォーキング', 'ランニング', '栄養', '認知症', '癌', '体の', 'からだ', '脳疲労', '健やか'] },
      { name: 'お金・投資', words: ['お金', '投資', '資産', '株式', '株価', '節約', '家計', '年金', 'nisa', 'ideco', '貯金', '貯蓄', '老後資金', '年収', '金持ち', 'マネー', 'インデックス', '投資信託', '不動産', '資産運用', '税金', '節税', '保険', '住宅ローン', '相続', 'fire', '稼ぐ', '給料'] },
      { name: '人間関係・家族', words: ['人間関係', '夫婦', '家族', '子育て', '育児', '恋愛', '友人', '友だち', '友達', '教育', '子ども', '子供', '親子', '結婚', '離婚', 'パートナー', '介護', '母親', '父親', '思春期', 'しつけ', '人づきあい', '人付き合い', '対人関係', '嫌いな人', '苦手な人', '好かれる', '人に好かれ' ] },
    ],
  },
  {
    id: 'culture',
    name: '教養',
    fields: [
      { name: '経済・社会', words: ['経済', '経済学', '社会', '政治', '国際', '地政学', '格差', '未来予測', 'ニュース', '資本主義', '景気', '金利', '物価', '日本経済', '世界経済', '貧困', '人口', '少子化', '高齢化', '民主主義', '環境問題', '気候', '国家', '外交', '安全保障', '社会学', 'メディア', '未来', 'グローバル', '市場', '業界', '非行', '犯罪', '福祉', '差別', '貧しさ'] },
      { name: '歴史', words: ['歴史', '戦国', '幕末', '古代', '世界史', '日本史', '偉人', '伝記', '明治', '江戸', '昭和', '文明', '人類', '帝国', '王朝', '中世', '近代', '全史', '信長', '家康', '秀吉', '龍馬', '武将', '天皇', '三国志', '戦争', '縄文', '考古', '革命'] },
      { name: '科学・テクノロジー', words: ['科学', '物理', '物理学', '生物', '生物学', '宇宙', '脳科学', '進化', 'ai', '人工知能', 'プログラミング', 'テクノロジー', '数学', '化学', '遺伝子', 'dna', '量子', '相対性理論', 'コンピュータ', 'コンピューター', 'インターネット', 'デジタル', 'アルゴリズム', 'ロボット', '生成ai', 'chatgpt', 'データサイエンス', '天文', '地球', '生命', '細胞', 'ウイルス', '技術', 'エンジニア', 'ソフトウェア', 'スマホ', '脳の', '脳は', '研究'] },
      { name: '哲学・思想', words: ['哲学', '思想', '宗教', '仏教', '倫理', '禅', '論語', 'ストア', 'ストア派', '哲学者', 'ニーチェ', 'ソクラテス', 'プラトン', 'カント', '孔子', '老子', '荘子', 'ブッダ', '聖書', 'キリスト教', '神道', '生きる意味', '死生観', '実存', '道徳', '正義', '武士道', '哲人', '古典'] },
      { name: '人の心理', words: ['心理学', '行動経済学', '認知', 'バイアス', '心理', '思い込み', '影響力', '無意識', '本能', '動機', '社会心理', '錯覚', '直感', '行動科学', 'ナッジ', '認知科学', 'アドラー心理学', '人はなぜ', 'なぜ人は', '人間の本性'] },
    ],
  },
  {
    id: 'enjoy',
    name: '楽しむ',
    fields: [
      { name: '小説・物語', boost: 2, words: ['小説', '長編', '長篇', '短編', '短篇', '中編', 'ミステリー', 'ミステリ', 'ファンタジー', 'sf', '文学', '物語', '恋愛小説', '時代小説', '歴史小説', '推理', '探偵', '刑事', '殺人', '犯人', '事件', '主人公', '登場人物', '芥川賞', '直木賞', '本屋大賞', '青春', '童話', '寓話', '絵本', '漫画', 'マンガ', 'まんが', 'コミック', '詩集', 'ライトノベル', 'ラノベ', '傑作', 'ホラー', 'サスペンス', '純文学', 'ノベル', '名作', 'シリーズ', '作家'] },
      { name: 'エッセイ・ノンフィクション', boost: 2, words: ['エッセイ', '随筆', 'ノンフィクション', 'ルポ', 'ルポルタージュ', '自伝', '日記', '紀行', '旅行記', '体験記', '半生', '回想', '実話', '綴った', '綴る', '手記', 'ドキュメント', 'コラム', '聞き書き', '密着', '軌跡'] },
      { name: '趣味・アート', words: ['料理', 'レシピ', '旅行', '旅の', '旅する', 'アート', '美術', '音楽', '写真', 'デザイン', '映画', 'スポーツ', 'ゲーム', '園芸', 'ガーデニング', '手芸', '将棋', '囲碁', '釣り', '登山', 'キャンプ', '絵画', '画家', '建築', '茶道', '華道', 'お菓子', '献立', '野球', 'サッカー', 'ゴルフ', '鉄道', 'ペット', 'インテリア', 'ファッション', 'おしゃれ', 'イラスト', '楽器', 'ピアノ', 'ギター', '落語', '歌舞伎', '美術館', '作り方', 'つくりおき', '作りおき', 'おかず', '趣味', 'ガイドブック', '観光'] },
    ],
  },
];

// 分野の名前（上から順に）。
export const BOOK_FIELDS = BOOK_FIELD_GROUPS.flatMap((c) => c.fields.map((f) => f.name));
const FIELD_SET = new Set(BOOK_FIELDS);
const ALL_FIELDS = BOOK_FIELD_GROUPS.flatMap((c) => c.fields);
const GROUP_OF = new Map(BOOK_FIELD_GROUPS.flatMap((c) => c.fields.map((f) => [f.name, c.id])));
/** 分野の大分類の id（'work' / 'life' / 'culture' / 'enjoy'）。 */
export const fieldGroupId = (name) => GROUP_OF.get(String(name || '').trim()) || null;

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
  'マネジメント': ['リーダー・チーム'],
  'リーダーシップ': ['リーダー・チーム'],
  'リーダー': ['リーダー・チーム'],
  '思考法': ['考える力'],
  '思考': ['考える力'],
  'ロジカルシンキング': ['考える力'],
  '問題解決': ['考える力'],
  'コミュニケーション': ['伝える力'],
  '話し方': ['伝える力'],
  '書き方': ['伝える力'],
  '仕事術': ['仕事の進め方'],
  '生産性': ['仕事の進め方'],
  '効率化': ['仕事の進め方'],
  '資産運用': ['お金・投資'],
  'マネー': ['お金・投資'],
  'メンタル': ['心の整え方'],
  'マインドセット': ['心の整え方'],
  '自己肯定感': ['心の整え方'],
  'ウェルビーイング': ['健康・からだ'],
  'アイデア発想': ['考える力'],
  'イノベーション': ['経営・マーケティング'],
  '経営': ['経営・マーケティング'],
  'ビジネス': ['経営・マーケティング'],
  '会計': ['仕事の進め方'],
  'データ分析': ['仕事の進め方'],
  'DX': ['科学・テクノロジー'],
  '歴史': ['歴史'],
  '行動経済学': ['人の心理'],
  '小説': ['小説・物語'],
  '文学': ['小説・物語'],
  'エッセイ': ['エッセイ・ノンフィクション'],
  '自己啓発': ['習慣・自己成長'],
  '読書術': ['習慣・自己成長'],
};

// 前の版（大分類 3・分野 18・2026-10-11 の朝まで）の分野の名前 → 新しい名前（決まった置きかえ・何度流しても同じ）。
// 「物語・エッセイ」だけは本の書名・紹介文から 小説・物語 か エッセイ・ノンフィクション を選ぶ（分からなければ 小説・物語）。
export const OLD_FIELD_RENAMES = {
  '生き方・働き方': 'キャリア・働き方',
  'お金': 'お金・投資',
  '心の持ち方': '心の整え方',
  '習慣': '習慣・自己成長',
  '休み方': '健康・からだ',
  '問いを立てる': '考える力',
  '発想': '考える力',
  '決め方': '考える力',
  '伝え方': '伝える力',
  'チームづくり': 'リーダー・チーム',
  '人を育てる': 'リーダー・チーム',
  '段取り': '仕事の進め方',
  '数字で見る': '仕事の進め方',
  '経済': '経済・社会',
  'テクノロジー': '科学・テクノロジー',
  '歴史に学ぶ': '歴史',
  '物語・エッセイ': '小説・物語',
};
const OLD_STORY = '物語・エッセイ';
export const isOldFieldName = (t) => Object.prototype.hasOwnProperty.call(OLD_FIELD_RENAMES, String(t || '').trim()) && !FIELD_SET.has(String(t || '').trim());

/** 前の版の「物語・エッセイ」を、本の特徴から 小説・物語 か エッセイ・ノンフィクション に。 */
export function storyOrEssay(features = {}) {
  const sc = scoreBookFields(features || {});
  const essay = sc.get('エッセイ・ノンフィクション') || 0;
  const novel = sc.get('小説・物語') || 0;
  return essay > novel ? 'エッセイ・ノンフィクション' : '小説・物語';
}

/**
 * 本のタグに前の版の分野の名前があれば、新しい名前に置きかえたタグを返す（無ければ null＝何もしない）。
 * 分野でないタグ（前の版の自由なタグ）はそのまま残す。分野は重ねず一覧の順に FIELD_MAX まで。
 * features: { title, subtitle, description, toc }（「物語・エッセイ」を分けるときだけ使う）
 */
export function renameOldFields(tags, features = null) {
  const list = (Array.isArray(tags) ? tags : []).map((t) => String(t || '').trim()).filter(Boolean);
  if (!list.some(isOldFieldName)) return null;
  const fields = [];
  const keep = [];
  for (const t of list) {
    if (FIELD_SET.has(t)) fields.push(t);
    else if (isOldFieldName(t)) fields.push(t === OLD_STORY ? storyOrEssay(features || {}) : OLD_FIELD_RENAMES[t]);
    else keep.push(t);
  }
  return withFields(keep, fields);
}
const normTag = (tag) => normalizeLinkText(String(tag || '').trim().replace(/^[#＃]/u, '')).replace(/\s+/gu, '');
const ALIAS_BY_NORM = new Map(Object.entries(TAG_ALIASES).map(([k, v]) => [normTag(k), v]));
const OLD_BY_NORM = new Map(Object.entries(OLD_FIELD_RENAMES).map(([k, v]) => [normTag(k), v]));
const linkCache = new Map();

/**
 * 自分のタグ 1 つが結びつく分野（無ければ []）。上から順に、最初に当たった段だけ:
 *   1. 分野と同じ名前（「歴史」「#人の心理」）・前の版の分野の名前（「お金」→お金・投資） 2. よくある言い換え（TAG_ALIASES）
 *   3. 名前が分野の手がかりの言葉と同じ（「投資」→お金・投資） 4. 名前に手がかりの言葉（2 字以上・英字だけの語は除く）が入っている（「習慣化」→習慣・自己成長）
 * 「@」で始まる印のタグは結びつけない。
 */
export function fieldsForTag(tag) {
  const n = normTag(tag);
  if (!n || n.startsWith('@')) return [];
  if (linkCache.has(n)) return linkCache.get(n);
  let out = ALL_FIELDS.filter((f) => normTag(f.name) === n).map((f) => f.name);
  if (!out.length && OLD_BY_NORM.has(n)) out = [OLD_BY_NORM.get(n)];
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
// どの分野も届かないときは、点が WEAK_MIN 以上のいちばん高い分野を 1 つ → 無ければ本の種類が分かる言葉から 1 つだけ
// （下の FALLBACKS）。手がかりが何も無ければ []。
export const CLASSIFY_MIN = 2;
export const WEAK_MIN = 1;
const WEIGHT = { title: 3.4, subtitle: 2, description: 1, toc: 0.8 };

// 数える前に外す言い回し（「マンガでわかる 行動経済学」は漫画の本ではなく行動経済学の本）。
const STRIP_PHRASES = [/(マンガ|まんが|漫画|図解|イラスト)(で|でわかる|でよくわかる|で学ぶ|で読む)/gu];
const strip = (text) => STRIP_PHRASES.reduce((t, re) => t.replace(re, ' '), text);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function countWord(norm, nw) {
  if (!nw || !norm) return 0;
  // 英字だけの短い語（ai・sf・kpi）は単語として出ているときだけ数える（「wait」の ai を数えない）
  if (/^[a-z0-9%]+$/.test(nw)) {
    const m = norm.match(new RegExp(`(^|[^a-z0-9])${escapeRe(nw)}(?=[^a-z0-9]|$)`, 'g'));
    return m ? m.length : 0;
  }
  let n = 0;
  let i = norm.indexOf(nw);
  while (i >= 0 && n < 3) { n += 1; i = norm.indexOf(nw, i + nw.length); }
  return n;
}

function featureParts({ title = '', subtitle = '', description = '', toc = [] } = {}) {
  return {
    title: strip(normalizeLinkText(title)),
    subtitle: strip(normalizeLinkText(subtitle)),
    description: strip(normalizeLinkText(description)),
    toc: strip(normalizeLinkText(Array.isArray(toc) ? toc.join('\n') : toc)),
  };
}

// 別の分野の長い言葉の一部として出た語は数えない（「行動経済学」の「経済」・「恋愛小説」の「恋愛」・「デザイン思考」の「デザイン」）。
const SHADOWS = (() => {
  const all = ALL_FIELDS.flatMap((f) => [f.name, ...f.words].map((w) => ({ f: f.name, w: normalizeLinkText(w) })));
  const m = new Map();
  for (const a of all) {
    const longer = all.filter((b) => b.f !== a.f && b.w.length > a.w.length && b.w.includes(a.w) && !/^[a-z0-9%]+$/.test(a.w)).map((b) => b.w);
    if (longer.length) m.set(`${a.f}|${a.w}`, [...new Set(longer)].sort((x, y) => y.length - x.length));
  }
  return m;
})();

/** 分野ごとの点（テスト・確かめ用）。 */
export function scoreBookFields(features = {}) {
  const parts = featureParts(features);
  const scores = new Map();
  for (const f of ALL_FIELDS) {
    let s = 0;
    const words = [f.name, ...f.words];
    for (const w of words) {
      const nw = normalizeLinkText(w);
      const strength = [...nw].length >= 3 ? 1 : 0.6;
      const shadow = SHADOWS.get(`${f.name}|${nw}`);
      for (const [k, raw] of Object.entries(parts)) {
        const text = shadow ? shadow.reduce((t, lw) => t.split(lw).join(' '), raw) : raw;
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

// どの分野も点が届かないときの手がかり（上から順に・最初に当たったものだけ・1 つだけ付ける）。
//   fiction: 紹介文・目次に物語の書き方（主人公・登場人物・「彼女は」…）→ 小説・物語
//            （strong が 1 つか、weak が 2 つ以上・書名だけでは決めない・点が WEAK_MIN 以上の分野より先に見る）
//   group  : 仕事・暮らしの本によく出る言葉 → その大分類の中で点のいちばん高い分野（どれも 0 なら fallback）
export const FALLBACKS = [
  { kind: 'fiction', field: '小説・物語', strong: ['主人公', '登場人物', '彼女は', '彼は', '少年は', '少女は', '青年は', '彼女の', '彼の', '高校生の', '大学生の', '少年の', '少女の'], weak: ['運命', '想いを', '秘密', '謎', '描く', '描いた', '描き出', '感動', '衝撃', '結末', 'ラスト', '出会', '恋', '涙', '魅せられ', '冒険', '少年', '少女'] },
  { kind: 'group', group: 'work', fallback: '仕事の進め方', words: ['ビジネス', '仕事', '会社', '職場', '社会人', 'ビジネスパーソン', '成果', '結果を出す', '成功', '一流', '働く'] },
  { kind: 'group', group: 'life', fallback: '心の整え方', words: ['人生', '自分', '生き方', '心', '毎日', '生きる', '日々', '私たち'] },
];

function countAny(text, words) {
  let n = 0;
  for (const w of words) if (countWord(text, normalizeLinkText(w))) n += 1;
  return n;
}

/**
 * 本の特徴（書名・副題・著者・紹介文・目次）から分野を決める。分からなければ []。
 * 著者は手がかりにしない（著者の名前に分野の言葉が入っていても、本の中身とは限らない）。
 */
export function classifyBook({ title = '', subtitle = '', description = '', toc = [] } = {}) {
  const features = { title, subtitle, description, toc };
  const scores = scoreBookFields(features);
  const ranked = [...scores.entries()]
    .filter(([, s]) => s >= CLASSIFY_MIN)
    .sort((a, b) => b[1] - a[1] || BOOK_FIELDS.indexOf(a[0]) - BOOK_FIELDS.indexOf(b[0]));
  if (ranked.length) {
    const top = ranked[0][1];
    return ranked.filter(([, s], i) => i === 0 || s >= top * 0.5).slice(0, AUTO_FIELD_MAX).map(([name]) => name);
  }
  const parts = featureParts(features);
  const body = `${parts.description}\n${parts.toc}`;
  const all = `${parts.title}\n${parts.subtitle}\n${body}`;
  // 紹介文が物語の書き方なら 小説・物語（ピアノ・料理などの言葉が 1 つ出ていても、物語の紹介文なら小説）
  const fiction = FALLBACKS[0];
  if (countAny(body, fiction.strong) >= 1 || countAny(body, fiction.weak) >= 2) return [fiction.field];
  // 届かなくても、はっきりした手がかりが 1 つあればその分野（紹介文に 3 字以上の言葉が 1 回など）
  const weakTop = [...scores.entries()].sort((a, b) => b[1] - a[1] || BOOK_FIELDS.indexOf(a[0]) - BOOK_FIELDS.indexOf(b[0]))[0];
  if (weakTop && weakTop[1] >= WEAK_MIN) return [weakTop[0]];
  for (const fb of FALLBACKS) {
    if (fb.kind === 'fiction') continue;
    if (!countAny(all, fb.words)) continue;
    const inGroup = BOOK_FIELD_GROUPS.find((c) => c.id === fb.group).fields.map((f) => f.name);
    const best = inGroup
      .map((name) => [name, scores.get(name) || 0])
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1] || inGroup.indexOf(a[0]) - inGroup.indexOf(b[0]))[0];
    return [best ? best[0] : fb.fallback];
  }
  return [];
}

// ── 記録の「分野」 ──────────────────────────────────────────────
// 本が 0〜1 冊の分野は「少ない分野」（下の行で「◯◯の本を探す」に 2 つまで名前を出す）。
export const THIN_BOOKS = 1;

/**
 * 少ない分野を 2 つまで選ぶ（2026-10-11 オーナー「読書は著者の視点を集めること・地図を埋めると視野が広がる」）。
 * 隣の分野をくり返さず視野を広げるように、なるべく別々の大分類から: 本の少ない大分類から順に、その中で本の少ない分野
 * （0 冊 → 1 冊・同じなら一覧の順）を 1 つずつ。別の大分類で 2 つにならなければ、残りの少ない分野で埋める。
 * stat: Map<分野, { books }>
 */
export function pickThinFields(stat, max = 2) {
  const booksOf = (f) => stat.get(f)?.books || 0;
  const order = (a, b) => booksOf(a) - booksOf(b) || BOOK_FIELDS.indexOf(a) - BOOK_FIELDS.indexOf(b);
  const groups = BOOK_FIELD_GROUPS
    .map((c, i) => ({ i, total: c.fields.reduce((n, f) => n + booksOf(f.name), 0), thin: c.fields.map((f) => f.name).filter((f) => booksOf(f) <= THIN_BOOKS).sort(order) }))
    .filter((g) => g.thin.length)
    .sort((a, b) => a.total - b.total || a.i - b.i);
  const out = [];
  for (const g of groups) { if (out.length >= max) break; out.push(g.thin[0]); }
  if (out.length < max) {
    const rest = BOOK_FIELDS.filter((f) => booksOf(f) <= THIN_BOOKS && !out.includes(f)).sort(order);
    out.push(...rest.slice(0, max - out.length));
  }
  return out;
}

/**
 * 分野ごとの本の数・メモの数・読書の時間（秒）。大分類（4 つ）ごとに、本のある分野だけ（一覧の順・本が 0 冊の分野は行にしない）。
 *   books: アプリの本（tags） / memoCountByBook: { [bookId]: N } / secondsByBook: { [bookId]: 秒 }
 *   minutesByField: { [分野]: 分 }＝読書の時間の「分野ごと」と同じ最大剰余で配った分（lib/readingStats.js の
 *     allottedFieldMinutes・これまで）。渡されたら行の時間はこの分を出す（同じ分野で 1 分ずれないように）。
 * 戻り値: { groups: [{ id, name, fields: [{ name, books, memos, seconds, minutes }] }], thin: [分野の名前…], any }
 */
export function buildFieldRecord(books = [], { memoCountByBook = {}, secondsByBook = {}, minutesByField = null } = {}) {
  const stat = new Map(BOOK_FIELDS.map((f) => [f, { name: f, books: 0, memos: 0, seconds: 0, minutes: 0 }]));
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
  for (const s of stat.values()) {
    s.minutes = minutesByField ? (Number(minutesByField[s.name]) || 0) : (s.seconds > 0 ? Math.max(1, Math.round(s.seconds / 60)) : 0);
  }
  const groups = BOOK_FIELD_GROUPS.map((c) => ({
    id: c.id,
    name: c.name,
    fields: c.fields.map((f) => stat.get(f.name)).filter((s) => s.books > 0),
  })).filter((c) => c.fields.length);
  const thin = pickThinFields(stat);
  return { groups, thin, any };
}

// 「この分野の本を探す」で AI 選書の最初の悩みに入れる言葉（送らない）。分野は 1 つでも数個（「・」でつなぐ）でも。
export function advisorDraftFor(fields) {
  const list = (Array.isArray(fields) ? fields : [fields]).map((t) => String(t || '').trim()).filter(Boolean);
  return `${list.join('・')}について、視点を増やしたい`;
}
