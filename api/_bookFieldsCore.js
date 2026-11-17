// 🏷 本の分野（api/_bookFieldsCore.js・端末は src/lib/bookFields.js から、サーバーは api/_bookFields.js から使う＝同じ一覧と仕分け）。
// （2026-10-11 オーナー裁定・SPEC §2 / §4・旧「視点の地図」を作り直したもの）。
//
//   「タグとフォルダの定義を明確に。タグは視点の地図と連携して自動仕分け。本の特徴からその本がどのタグかを
//    自動的に仕分けしてほしい」「フォルダは完全に読者の自由に分けるためのもの」
//   同日「仕事の腕という意味が分かりにくい。改めてこの分類わけをわかりやすく、基本的にどの本も分類できるように」
//    → 大分類 4（仕事・自分と生活・教養・文芸・エンタメ）→ 分野 20 に作り直した（中分類はやめた）。
//   同日の 4 回目（ui-critic）: 大分類と分野の語が重ならないように「自分と暮らし」→「自分と生活」・「文芸・趣味」→「文芸・エンタメ」・
//    分野「仕事の進め方」→「段取り・効率」（前の名前は OLD_FIELD_RENAMES で移す）。
//   同日「商品説明の情報からタグの分類をすればいいのでは？」→ 楽天ブックスのジャンル（書店の棚）で大分類と候補の分野を決め、
//    書名・紹介文・目次の言葉でその中から選ぶ（GENRE_RULES）。ジャンルが分からない本は言葉だけで決める。
//
// 言葉の決まり（CLAUDE.md の GLOSSARY）:
//   分野     … 本につく、決まった一覧（下の BOOK_FIELDS・ビジネスの 13＋小説・教養）から選ぶ名前。アプリが本の書名・紹介文・目次から
//              自動で付け、本人が直せる。1 冊に 3 つまで。保存先は今までの book_tags（tag_name＝分野の名前・新しい SQL なし）。
//   フォルダ … 本人が自由に作る分け方（book_collections）。アプリは自動で入れない・すすめない。
//   メモのタグ … メモに付ける自分の言葉（変わらない）。
//
// 一覧はこのアプリの言葉で作った（発想の元の記事の図は書き手の著作物なので、項目名・構成は写していない）。
// 書店の棚のように「どの本もどこかに入る」ことを目標にした（小説・エッセイ・料理・旅の本も）。
// 前の版（大分類 3・分野 18／大分類 4・分野 19）の名前は OLD_FIELD_RENAMES で新しい名前に移す（hooks/useBookFieldsAuto.js）。
//
// 2026-11-17 オーナー「ビジネス書に一点突破」（「ビジネスパーソンに絞る必要はない。大学生とかも必要とする」）:
//   分野 20 → ビジネスの 13（大分類 3: ビジネス・ものの見方・自分を伸ばす）＋受け皿「小説・教養」（大分類「そのほか」）。
//   同日の夕方: 名前を 2 語までに縮め、生産性・伝える力を 習慣・自己管理 と 伝える力・人間関係 に分けた（朝の名前も移す）。
//   前の 20 の名前の本は、書名・紹介文の点で新しい名前に移す（OLD_FIELD_CHOICES）。
//
// 自動の仕分け（classifyBook）は端末の中だけ（AI なし・トークンなし・誰でも）。手がかりが無ければ付けない（[]）。
// 反ゲーミフィケーション: 点数・%・「埋めよう」・「あと N 冊」は作らない。

// 文字をそろえる（全角半角・大文字小文字）。src/lib/memoLinks.js の normalizeLinkText と同じ（サーバーでも使うので写した）。
const normalizeLinkText = (text) => String(text ?? '').normalize('NFKC').toLowerCase();

// 大分類 → 分野。
//   name : 画面に出す名前（book_tags の tag_name にそのまま入る＝あとから変えると付いている分野とずれる・変えるときは
//          OLD_FIELD_RENAMES に前の名前を足す）
//   boost: 手がかりの言葉がそれだけで決め手になる分野（小説・エッセイなど本の種類を表す言葉）は点を倍に
//   words: 本の書名・紹介文・目次に出ていたら、その分野の手がかり（3 字以上は強く・2 字以下は弱く。英字だけの語は単語のときだけ）
export const BOOK_FIELD_GROUPS = [
  {
    id: 'biz',
    name: 'ビジネス',
    fields: [
      { name: '経営・組織', words: ['経営', '経営者', '経営学', '経営原則', '経営理念', '組織', '組織論', '組織運営', '組織づくり', '組織文化', '企業', '社長', 'ceo', '意思決定', 'kpi', 'okr', 'ガバナンス', 'ドラッカー', '成果をあげる'] },
      { name: 'リーダーシップ・人材育成', words: ['リーダー', 'リーダーシップ', 'チーム', 'マネジメント', 'マネージャー', 'マネジャー', '部下', '上司', '1on1', '育成', '人材育成', '人を育てる', '人を動かす', 'コーチ', 'コーチング', '指導', 'フィードバック', '任せ', '管理職', 'メンバー', '心理的安全性', '統率', '巻き込'] },
      { name: '経営戦略', words: ['戦略', '競争戦略', '競争', '競争優位', '差別化', '事業戦略', 'ポジショニング', '市場分析', 'ビジネスモデル', '戦略論', 'ブルーオーシャン', '独占', '勝ち筋', '業界'] },
      { name: 'マーケティング・ブランド', words: ['マーケティング', 'マーケ', 'ブランド', 'ブランディング', '広告', '顧客', '顧客理解', '商品開発', '集客', '販売', '売れる', 'コピーライティング', 'sns', '消費者', 'ファン', '市場創造', '価格'] },
      { name: '営業・交渉', words: ['営業', 'セールス', '法人営業', '提案', 'クロージング', '交渉', '説得', '商談', '顧客心理', 'トップセールス', '営業マン'] },
      { name: '起業・テクノロジー', words: ['起業', '起業家', '創業', 'スタートアップ', 'ベンチャー', '新規事業', 'イノベーション', '事業', 'テクノロジー', 'ai', '人工知能', '生成ai', 'chatgpt', 'dx', 'デジタル', 'プログラミング', 'インターネット', 'アルゴリズム', 'ロボット', 'エンジニア', 'ソフトウェア', '技術', 'ゼロから'] },
    ],
  },
  {
    id: 'mind',
    name: 'ものの見方',
    fields: [
      { name: '思考法・問題解決', words: ['思考', '考える力', '考え抜く', '考える技術', 'ロジカル', 'ロジカルシンキング', '論理', '問題解決', '仮説', '仮説思考', '発想', 'アイデア', 'フレームワーク', 'イシュー', '問い', 'クリティカル', '地頭', '思考法', '創造', 'ひらめき', 'デザイン思考', '抽象', '具体と抽象', 'アナロジー', '構造化', '知的生産', '頭のいい', '頭の良い', '見極め', 'エッセンシャル', '優先順位'] },
      { name: '数字・データ分析', words: ['数字', '数値', '数値化', '統計', '統計学', 'データ', 'データ分析', 'データサイエンス', '分析', '推論', 'ファクト', 'factfulness', 'ファクトフルネス', 'エクセル', 'excel', '確率', '計算', '仮説検証', '因果', '定量'] },
      { name: '心理学・行動経済学', words: ['心理学', '行動経済学', '認知', 'バイアス', '心理', '思い込み', '影響力', '無意識', '本能', '動機', '社会心理', '錯覚', '直感', '行動科学', 'ナッジ', '認知科学', 'アドラー', '人はなぜ', 'なぜ人は', '人間の本性', '人間理解', '感情', '幸福'] },
    ],
  },
  {
    id: 'self',
    name: '自分を伸ばす',
    fields: [
      { name: 'お金・会計', words: ['お金', '投資', '資産', '株式', '株価', '節約', '家計', '年金', 'nisa', 'ideco', '貯金', '貯蓄', '年収', '金持ち', 'マネー', 'インデックス', '投資信託', '不動産', '資産運用', '税金', '節税', '保険', '会計', '決算', '財務', '財務諸表', '簿記', '管理会計', 'ファイナンス', '経済', '経済学', '資本', '資本主義', '金利', '景気', '稼ぐ', '給料', 'fire', '日本経済', '世界経済'] },
      { name: 'キャリア・働き方', words: ['キャリア', '転職', '働き方', '副業', '天職', '就活', '就職', '仕事選び', '働く', '定年', '独立', 'フリーランス', '人生100年', '100年時代', 'リスキリング', '学び直し', '会社員', '40代', '50代', '引退', '新社会人', '社会人', '若手', '20代', '30代', '好きなことを仕事', 'life', 'shift', '好きなことをして', '居場所'] },
      { name: '習慣・自己管理', words: ['段取り', '時間術', '生産性', '仕事術', 'タスク', '効率', '会議', '締め切り', 'スケジュール', '先延ばし', '仕事が速い', '時間の使い方', 'ノート術', 'メモ術', '手帳', '仕事の基本', '習慣', '継続', '集中', '集中力', '早起き', 'ルーティン', 'ハビット', 'habit', '勉強法', '読書術', 'リーディング', '独学', '記憶術', '自己管理', '自己規律', '自己投資', '自己啓発', '目標', 'やり抜く', 'grit', 'モチベーション', '睡眠', '健康', '成長', '夢を叶え', '成功するため', 'メンタル', 'ストレス', '自己肯定感', '不安', 'マインドフルネス', '悩み', '勇気', '嫌われ', '自分らしく'] },
      { name: '伝える力・人間関係', words: ['文章', '書く', '書き方', '話し方', '伝え方', '伝える', 'プレゼン', '説明', '会話', 'コミュニケーション', '雑談', '聞く力', '聞き方', '言語化', '文章術', 'ライティング', '資料', 'アウトプット', '敬語', '語彙', '質問力', '人間関係', '対人関係', '人づきあい', '人付き合い', '好かれる', '信頼関係', '傾聴'] },
    ],
  },
  {
    id: 'other',
    name: 'そのほか',
    // ビジネスの分野に当たらない本の受け皿（2026-11-17 オーナー「受け皿をおこう」）。小説・エッセイ・歴史・哲学・科学・
    // 暮らし・子育て・趣味など。言葉が当たったときだけ付ける（手がかりが何も無い本には付けない＝サーバーの答えを待つ）。
    fields: [
      { name: '小説・教養', words: ['小説', '長編', '長篇', '短編', '短篇', 'ミステリー', 'ミステリ', 'ファンタジー', 'sf', '文学', '物語', '時代小説', '推理', '探偵', '刑事', '殺人', '主人公', '登場人物', '芥川賞', '直木賞', '本屋大賞', '青春', '童話', '絵本', '漫画', 'マンガ', 'コミック', '詩集', 'ライトノベル', 'ホラー', 'サスペンス', '純文学', 'エッセイ', '随筆', 'ノンフィクション', 'ルポ', '自伝', '日記', '紀行', '旅行記', '歴史', '戦国', '幕末', '古代', '世界史', '日本史', '偉人', '伝記', '江戸', '文明', '人類', '三国志', '哲学', '思想', '宗教', '仏教', '倫理', '禅', '論語', 'ストア派', '聖書', 'ブッダ', '生き方', '人生論', '死生観', '科学', '物理', '生物', '宇宙', '脳科学', '進化', '数学', '化学', '遺伝子', '量子', '天文', '生命', '素粒子', '料理', 'レシピ', '片づけ', '片付け', '掃除', '家事', '収納', '暮らし', '献立', '作りおき', 'おかず', '子育て', '育児', '恋愛', '夫婦', '家族', '親子', '子ども', '介護', '旅行', 'アート', '美術', '音楽', '写真', '映画', 'スポーツ', 'ゲーム', '趣味', 'ダイエット', '食事', '筋トレ', '医学', '医師', '病気', '社会', '政治', '国際', '地政学', '少子化', '教養', '寓話', '奇蹟', '奇跡', '写真集', '建築', 'ピアノ', '楽譜', 'キャンプ', 'テント', '観光', '腸内', '細菌', '精神科医', 'どう生きるか', 'の物語', '神様'] },
    ],
  },
];

// 受け皿の分野（ビジネスの分野に当たらない本）。
export const OTHER_FIELD = '小説・教養';
// ビジネスの分野（受け皿を除く 13）。
export const BUSINESS_FIELDS = BOOK_FIELD_GROUPS.filter((g) => g.id !== 'other').flatMap((g) => g.fields.map((f) => f.name));

// 分野の名前（上から順に）。
export const BOOK_FIELDS = BOOK_FIELD_GROUPS.flatMap((c) => c.fields.map((f) => f.name));
const FIELD_SET = new Set(BOOK_FIELDS);
const ALL_FIELDS = BOOK_FIELD_GROUPS.flatMap((c) => c.fields);
const GROUP_OF = new Map(BOOK_FIELD_GROUPS.flatMap((c) => c.fields.map((f) => [f.name, c.id])));
/** 分野の大分類の id（'biz' / 'mind' / 'self' / 'other'）。 */
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
  'マネジメント': ['リーダーシップ・人材育成'],
  'リーダーシップ': ['リーダーシップ・人材育成'],
  'リーダー': ['リーダーシップ・人材育成'],
  '思考法': ['思考法・問題解決'],
  '思考': ['思考法・問題解決'],
  'ロジカルシンキング': ['思考法・問題解決'],
  '問題解決': ['思考法・問題解決'],
  'アイデア発想': ['思考法・問題解決'],
  'コミュニケーション': ['伝える力・人間関係'],
  '話し方': ['伝える力・人間関係'],
  '書き方': ['伝える力・人間関係'],
  '仕事術': ['習慣・自己管理'],
  '生産性': ['習慣・自己管理'],
  '効率化': ['習慣・自己管理'],
  '自己啓発': ['習慣・自己管理'],
  '読書術': ['習慣・自己管理'],
  '資産運用': ['お金・会計'],
  'マネー': ['お金・会計'],
  '会計': ['お金・会計'],
  'メンタル': ['習慣・自己管理'],
  'マインドセット': ['習慣・自己管理'],
  '自己肯定感': ['習慣・自己管理'],
  '行動経済学': ['心理学・行動経済学'],
  'イノベーション': ['起業・テクノロジー'],
  'DX': ['起業・テクノロジー'],
  '経営': ['経営・組織'],
  'ビジネス': ['経営・組織'],
  'マーケ': ['マーケティング・ブランド'],
  'データ分析': ['数字・データ分析'],
  'ウェルビーイング': ['小説・教養'],
  '歴史': ['小説・教養'],
  '料理': ['小説・教養'],
  '片づけ': ['小説・教養'],
  '小説': ['小説・教養'],
  '文学': ['小説・教養'],
  'エッセイ': ['小説・教養'],
};

// 前の版の分野の名前 → 新しい名前（決まった置きかえ・何度流しても同じ）。
//   2026-11-17（オーナー「ビジネス書に一点突破」・分野 20 → ビジネスの 13＋受け皿「小説・教養」）:
//   1 つの名前に決まらないもの（経営・マーケティング・健康・からだ など）は、本の書名・紹介文の点で候補から選ぶ
//   （OLD_FIELD_CHOICES・点が無ければ先頭）。それより前の版（大分類 3・分野 18 など）の名前は、いったん 20 の名前に
//   直してから同じく新しい名前に。
const OLD_V1_RENAMES = {
  '生き方・働き方': 'キャリア・働き方', 'お金': 'お金・投資', '心の持ち方': '心の整え方', '習慣': '習慣・自己成長',
  '休み方': '健康・からだ', '問いを立てる': '考える力', '発想': '考える力', '決め方': '考える力', '伝え方': '伝える力',
  'チームづくり': 'リーダー・チーム', '人を育てる': 'リーダー・チーム', '段取り': '段取り・効率', '数字で見る': '段取り・効率',
  '経済': '経済・社会', 'テクノロジー': '科学・テクノロジー', '歴史に学ぶ': '歴史', '物語・エッセイ': '小説・物語',
  '人の心理': '心理学', '仕事の進め方': '段取り・効率',
};
// 20 の名前（2026-10-11〜11-16）→ 候補（先頭が決めきれないとき）。
export const OLD_FIELD_CHOICES = {
  '考える力': ['思考法・問題解決', '数字・データ分析'],
  '伝える力': ['伝える力・人間関係', '営業・交渉'],
  'リーダー・チーム': ['リーダーシップ・人材育成', '経営・組織'],
  '段取り・効率': ['習慣・自己管理', '数字・データ分析'],
  '経営・マーケティング': ['経営・組織', '経営戦略', 'マーケティング・ブランド', '営業・交渉', '起業・テクノロジー', 'お金・会計'],
  'キャリア・働き方': ['キャリア・働き方'],
  '心の整え方': ['習慣・自己管理', '心理学・行動経済学'],
  '習慣・自己成長': ['習慣・自己管理'],
  '健康・からだ': ['小説・教養', '習慣・自己管理'],
  'お金・投資': ['お金・会計'],
  '暮らし・家事': ['小説・教養'],
  '人間関係・家族': ['小説・教養', '伝える力・人間関係'],
  '経済・社会': ['小説・教養', 'お金・会計'],
  '歴史': ['小説・教養'],
  '科学・テクノロジー': ['小説・教養', '起業・テクノロジー', '数字・データ分析'],
  '哲学・思想': ['小説・教養'],
  '心理学': ['心理学・行動経済学'],
  '小説・物語': ['小説・教養'],
  'エッセイ・ノンフィクション': ['小説・教養'],
  '趣味・アート': ['小説・教養'],
  // 2026-11-17 の朝の一覧（同日の夕方に名前を縮め・分け直した）
  '起業・新規事業・テクノロジー': ['起業・テクノロジー'],
  'お金・会計・ファイナンス': ['お金・会計'],
  '教養・その他': ['小説・教養'],
  '生産性・伝える力': ['習慣・自己管理', '伝える力・人間関係'],
};
// 前の名前 → 決めきれないときの新しい名前（一覧・テスト用）。今の一覧にある名前（キャリア・働き方）は含めない。
export const OLD_FIELD_RENAMES = Object.fromEntries([
  ...Object.entries(OLD_FIELD_CHOICES).map(([k, v]) => [k, v[0]]),
  ...Object.entries(OLD_V1_RENAMES).map(([k, v]) => [k, OLD_FIELD_CHOICES[v][0]]),
].filter(([k]) => !FIELD_SET.has(k)));
export const isOldFieldName = (t) => Object.prototype.hasOwnProperty.call(OLD_FIELD_RENAMES, String(t || '').trim()) && !FIELD_SET.has(String(t || '').trim());

/** 前の名前 1 つを、本の特徴（書名・紹介文・目次）の点で新しい名前に（候補の中・点が無ければ先頭）。前の名前でなければ null。 */
export function newNameForOld(oldName, features = {}) {
  const t = String(oldName || '').trim();
  const mid = OLD_FIELD_CHOICES[t] ? t : OLD_V1_RENAMES[t];
  const choices = mid ? OLD_FIELD_CHOICES[mid] : null;
  if (!choices) return null;
  if (choices.length === 1) return choices[0];
  const sc = scoreBookFields(features || {});
  return choices.map((c, i) => [c, sc.get(c) || 0, i]).sort((x, y) => y[1] - x[1] || x[2] - y[2])[0][0];
}

/**
 * 本のタグに前の版の分野の名前があれば、新しい名前に置きかえたタグを返す（無ければ null＝何もしない）。
 * 分野でないタグ（前の版の自由なタグ）はそのまま残す。分野は重ねず一覧の順に FIELD_MAX まで。
 * features: { title, subtitle, description, toc }（1 つの名前に決まらない前の分野を、候補から選ぶときに使う）
 */
export function renameOldFields(tags, features = null) {
  const list = (Array.isArray(tags) ? tags : []).map((t) => String(t || '').trim()).filter(Boolean);
  if (!list.some(isOldFieldName)) return null;
  const fields = [];
  const keep = [];
  for (const t of list) {
    if (FIELD_SET.has(t)) fields.push(t);
    else if (isOldFieldName(t)) fields.push(newNameForOld(t, features || {}));
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
 *   1. 分野と同じ名前（「歴史」「#心理学」）・前の版の分野の名前（「お金」→お金・投資） 2. よくある言い換え（TAG_ALIASES）
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
// 本の形・書き手の肩書きを表す言葉も外す（「文庫完全版」「小説家」「最高傑作」は小説の手がかりではない・2026-10-11
// オーナー報告『半径5メートルの野望 完全版』が小説・物語になった）。
const STRIP_PHRASES = [
  /(マンガ|まんが|漫画|図解|イラスト)(で|でわかる|でよくわかる|で学ぶ|で読む)/gu,
  /(小説家|作家|漫画家|脚本家|エッセイスト)/gu,
  /(文庫完全版|完全版|新装版|文庫版|文庫化|増補改訂版|改訂版|新版|愛蔵版|最高傑作|傑作選)/gu,
];
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
//   fiction: 紹介文・目次に物語の書き方（主人公・登場人物・「彼女は」…）→ 小説・教養（物語の本）
//            （strong が 1 つか、weak が 2 つ以上・書名だけでは決めない・点が WEAK_MIN 以上の分野より先に見る）
//   group  : 仕事の本によく出る言葉 → ビジネスの分野の中で点のいちばん高い分野（どれも 0 なら付けない）
//            （「ビジネス」「仕事」だけで分野を決めない＝自信のない見立ては付けない・2026-10-11 ui-critic）
export const FALLBACKS = [
  { kind: 'fiction', field: '小説・教養', strong: ['主人公', '登場人物', '彼女は', '彼は', '少年は', '少女は', '青年は', '彼女の', '彼の', '高校生の', '大学生の', '少年の', '少女の'], weak: ['運命', '想いを', '秘密', '謎', '描く', '描いた', '描き出', '感動', '衝撃', '結末', 'ラスト', '出会', '恋', '涙', '魅せられ', '冒険', '少年', '少女'] },
  { kind: 'group', fields: BUSINESS_FIELDS, fallback: null, words: ['ビジネス', '仕事', '職場', 'ビジネスパーソン', '成果', '結果を出す', '成功', '一流'] },
]

// 自己啓発・実用書の書き方（「人生指南」「なりたい自分」「夢を叶え」・目次の「はじめに」「第1章」）。2 つ以上あれば
// 物語の本ではない＝物語の手がかりを見ず、ジャンルが「小説・エッセイ」でもビジネスの分野からも選ぶ。
export const SELF_HELP_CUES = ['人生指南', 'なりたい自分', '夢を叶え', '夢をかなえ', '人生を変える', '生き方', '自分らしく', '好きなことをして', '自分の居場所', '自分を変え', '成功する', '仕事術', '働き方', 'はじめに', 'おわりに', '第1章', '第一章', '法則', 'ヒント', 'コツ', '方法'];
const SELF_HELP_FIELDS = ['思考法・問題解決', '心理学・行動経済学', 'お金・会計', 'キャリア・働き方', '習慣・自己管理', '伝える力・人間関係', '小説・教養'];

function countAny(text, words) {
  let n = 0;
  for (const w of words) if (countWord(text, normalizeLinkText(w))) n += 1;
  return n;
}

// ── 楽天ブックスのジャンル（書店の棚）→ 大分類と候補の分野（2026-10-11・オーナー「商品説明の情報からタグの分類をすればいいのでは？」）
// 楽天のジャンル ID は本（001）の下に 3 桁ずつ。ここでは確かな上の段（001xxx）だけを結びつける（下の段の番号は確かめられて
// いないので使わない・言葉で候補の中から選ぶ）。文庫・新書・セット本など本の形のジャンルは手がかりにしない。
//   fields  : このジャンルの本が入りうる分野（言葉でこの中から選ぶ）
//   fallback: 言葉で決めきれないときの分野（null＝棚が広すぎて決めきれない＝付けない。サーバーの AI の答えを待つ）
const O = '小説・教養';
export const GENRE_RULES = [
  { id: '001001', name: '漫画（コミック）', fields: [O], fallback: O },
  { id: '001002', name: '語学・学習参考書', fields: ['伝える力・人間関係', '習慣・自己管理', O], fallback: O },
  { id: '001003', name: '絵本・児童書・図鑑', fields: [O], fallback: O },
  { id: '001004', name: '小説・エッセイ', fields: [O], fallback: O },
  { id: '001005', name: 'パソコン・システム開発', fields: ['起業・テクノロジー', '数字・データ分析', '習慣・自己管理'], fallback: '起業・テクノロジー' },
  { id: '001006', name: 'ビジネス・経済・就職', fields: [...BUSINESS_FIELDS, O], fallback: null },
  { id: '001007', name: '旅行・留学・アウトドア', fields: [O], fallback: O },
  { id: '001008', name: '人文・思想・社会', fields: ['心理学・行動経済学', '思考法・問題解決', 'お金・会計', O], fallback: O },
  { id: '001009', name: 'ホビー・スポーツ・美術', fields: [O], fallback: O },
  { id: '001010', name: '美容・暮らし・健康・料理', fields: ['お金・会計', '習慣・自己管理', '心理学・行動経済学', O], fallback: O },
  { id: '001011', name: 'エンタメ・ゲーム', fields: [O], fallback: O },
  { id: '001012', name: '科学・技術', fields: ['起業・テクノロジー', '数字・データ分析', O], fallback: O },
  { id: '001013', name: '写真集・タレント', fields: [O], fallback: O },
  { id: '001016', name: '資格・検定', fields: ['お金・会計', '数字・データ分析', 'キャリア・働き方', '習慣・自己管理', '伝える力・人間関係', 'マーケティング・ブランド'], fallback: 'キャリア・働き方' },
  { id: '001017', name: 'ライトノベル', fields: [O], fallback: O },
  { id: '001018', name: '楽譜', fields: [O], fallback: O },
  { id: '001021', name: 'ボーイズラブ', fields: [O], fallback: O },
  { id: '001028', name: '医学・薬学・看護学・歯科学', fields: ['心理学・行動経済学', '習慣・自己管理', O], fallback: O },
  { id: '001029', name: 'ティーンズラブ', fields: [O], fallback: O },
];
const GENRE_BY_ID = new Map(GENRE_RULES.map((g) => [g.id, g]));

/** ジャンル ID（複数）から候補の分野と、決めきれないときの分野。手がかりにならなければ null。 */
export function genreCandidates(genreIds) {
  const rules = [];
  for (const raw of Array.isArray(genreIds) ? genreIds : []) {
    const top = String(raw || '').slice(0, 6);
    const r = GENRE_BY_ID.get(top);
    if (r && !rules.includes(r)) rules.push(r);
  }
  if (!rules.length) return null;
  const set = new Set(rules.flatMap((r) => r.fields));
  return { fields: BOOK_FIELDS.filter((f) => set.has(f)), fallback: rules[0].fallback, genres: rules.map((r) => r.id) };
}

const pickRanked = (entries) => {
  const ranked = entries
    .filter(([, sc]) => sc >= CLASSIFY_MIN)
    .sort((a, b) => b[1] - a[1] || BOOK_FIELDS.indexOf(a[0]) - BOOK_FIELDS.indexOf(b[0]));
  if (!ranked.length) return [];
  const top = ranked[0][1];
  return ranked.filter(([, sc], i) => i === 0 || sc >= top * 0.5).slice(0, AUTO_FIELD_MAX).map(([name]) => name);
};

/**
 * 本の特徴から分野を決め、何で決めたかも返す（確かめ・計測用）。
 *   features: { title, subtitle, description, toc, genreIds }
 *   by: 'genre'（楽天ブックスのジャンルで大分類と候補を決めた）/ 'keywords'（言葉の点）/ 'fallback'（弱い手がかり）/ 'none'
 * ジャンルがあれば: 候補の分野の中で言葉の点が届いたものを多い順に 2 つまで → 届かなければ候補の中で点のある分野を 1 つ
 *   → それも無ければ物語の紹介文（候補に小説・物語があるとき）→ ジャンルの決めきれないときの分野。
 * ジャンルが無ければ今までどおり言葉だけで（届いた分野 → 物語の紹介文 → 弱い手がかり → 仕事／自分の本の言葉）。
 */
export function classifyBookDetailed({ title = '', subtitle = '', description = '', toc = [], genreIds = [] } = {}) {
  const features = { title, subtitle, description, toc };
  const scores = scoreBookFields(features);
  const parts = featureParts(features);
  const body = `${parts.description}\n${parts.toc}`;
  const all = `${parts.title}\n${parts.subtitle}\n${body}`;
  const fiction = FALLBACKS[0];
  const looksLikeStory = () => countAny(body, fiction.strong) >= 1 || countAny(body, fiction.weak) >= 2;

  // 自己啓発・実用書の書き方なら、小説・物語の点を消し、物語の手がかりも見ない
  const selfHelp = countAny(all, SELF_HELP_CUES) >= 2;
  if (selfHelp) scores.delete(fiction.field);
  const storyNow = () => !selfHelp && looksLikeStory();

  let genre = genreCandidates(genreIds);
  if (genre && selfHelp && genre.fields.every((f) => f === OTHER_FIELD)) {
    // 「小説・エッセイ」の棚の自己啓発のエッセイ: ビジネスの分野からも選ぶ（決めきれなければ小説・教養）
    genre = { ...genre, fields: SELF_HELP_FIELDS, fallback: OTHER_FIELD };
  }
  if (genre) {
    const inGenre = [...scores.entries()].filter(([f]) => genre.fields.includes(f));
    const strong = pickRanked(inGenre);
    if (strong.length) return { fields: strong, by: 'genre' };
    const best = inGenre.sort((a, b) => b[1] - a[1] || BOOK_FIELDS.indexOf(a[0]) - BOOK_FIELDS.indexOf(b[0]))[0];
    // 棚が広い（決めきれないときの分野が無い＝ビジネス）なら、弱い手がかり 1 つでは決めない
    if (best && (genre.fallback || best[1] >= WEAK_MIN)) return { fields: [best[0]], by: 'genre' };
    if (genre.fields.includes(fiction.field) && storyNow()) return { fields: [fiction.field], by: 'genre' };
    if (!genre.fallback) return { fields: [], by: 'none' };
    return { fields: [genre.fallback], by: 'genre' };
  }

  const ranked = pickRanked([...scores.entries()]);
  if (ranked.length) return { fields: ranked, by: 'keywords' };
  // 紹介文が物語の書き方なら 小説・物語（ピアノ・料理などの言葉が 1 つ出ていても、物語の紹介文なら小説）
  if (storyNow()) return { fields: [fiction.field], by: 'fallback' };
  // 届かなくても、はっきりした手がかりが 1 つあればその分野（紹介文に 3 字以上の言葉が 1 回など）
  const weakTop = [...scores.entries()].sort((a, b) => b[1] - a[1] || BOOK_FIELDS.indexOf(a[0]) - BOOK_FIELDS.indexOf(b[0]))[0];
  if (weakTop && weakTop[1] >= WEAK_MIN) return { fields: [weakTop[0]], by: 'fallback' };
  for (const fb of FALLBACKS) {
    if (fb.kind === 'fiction') continue;
    if (!countAny(all, fb.words)) continue;
    const inGroup = fb.fields;
    const best = inGroup
      .map((name) => [name, scores.get(name) || 0])
      .filter(([, sc]) => sc > 0)
      .sort((a, b) => b[1] - a[1] || inGroup.indexOf(a[0]) - inGroup.indexOf(b[0]))[0];
    if (!best && !fb.fallback) continue; // 自信のない見立ては付けない
    return { fields: [best ? best[0] : fb.fallback], by: 'fallback' };
  }
  return { fields: [], by: 'none' };
}

/**
 * 本の特徴（書名・副題・紹介文・目次・楽天ブックスのジャンル）から分野を決める。分からなければ []。
 * 著者は手がかりにしない（著者の名前に分野の言葉が入っていても、本の中身とは限らない）。
 */
export function classifyBook(features = {}) {
  return classifyBookDetailed(features).fields;
}

// ── 記録の「分野」 ──────────────────────────────────────────────
// 本が 0〜1 冊の分野は「少ない分野」。記録の「分野」は 2026-10-11 から全体（本がまだ無い分野も）を出すので、
// pickThinFields は記録では使わない（ほかで少ない分野を選ぶときのために残す）。
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
 * 分野ごとの本の数・メモの数・読書の時間（秒）。大分類（4 つ）はいつも全部（本が 0 冊の大分類も）。
 * fields＝本のある分野（一覧の順・行にする）・empty＝本がまだ無い分野の名前（一覧の順・まとめて 1 行に）
 * （2026-10-11 オーナー「全体何があるのか？どのように分野が分かれているのか？をわかるように」）。
 *   books: アプリの本（tags） / memoCountByBook: { [bookId]: N } / secondsByBook: { [bookId]: 秒 }
 *   minutesByField: { [分野]: 分 }＝読書の時間の「分野ごと」と同じ最大剰余で配った分（lib/readingStats.js の
 *     allottedFieldMinutes・これまで）。渡されたら行の時間はこの分を出す（同じ分野で 1 分ずれないように）。
 * 戻り値: { groups: [{ id, name, size（分野の数）, books（本の数・重ねない）, fields: [{ name, books, memos, seconds, minutes }], empty: [分野の名前…] }], any }
 */
export function buildFieldRecord(books = [], { memoCountByBook = {}, secondsByBook = {}, minutesByField = null } = {}) {
  const stat = new Map(BOOK_FIELDS.map((f) => [f, { name: f, books: 0, memos: 0, seconds: 0, minutes: 0, rated: 0, ratingSum: 0, avgRating: null }]));
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
      // 評価（★1〜5）が付いた本だけ数える（0＝未評価は入れない）
      const r = Number(b.rating) || 0;
      if (r >= 1 && r <= 5) { s.rated += 1; s.ratingSum += r; }
    }
  }
  for (const s of stat.values()) {
    s.minutes = minutesByField ? (Number(minutesByField[s.name]) || 0) : (s.seconds > 0 ? Math.max(1, Math.round(s.seconds / 60)) : 0);
    // 評価の平均は、評価の付いた本が 2 冊以上のときだけ（1 冊の★を「平均」と見せない・小数 1 桁・2026-10-11）
    s.avgRating = s.rated >= 2 ? Math.round((s.ratingSum / s.rated) * 10) / 10 : null;
  }
  // 大分類ごとの本の数（その大分類の分野を 1 つでも持つ本・二重に数えない・2026-11-17 ui-critic）
  const groupBooks = new Map(BOOK_FIELD_GROUPS.map((c) => [c.id, new Set()]));
  for (const b of Array.isArray(books) ? books : []) {
    for (const f of fieldsOf(b)) groupBooks.get(GROUP_OF.get(f))?.add(b.id ?? b);
  }
  const groups = BOOK_FIELD_GROUPS.map((c) => ({
    id: c.id,
    name: c.name,
    size: c.fields.length,
    books: groupBooks.get(c.id).size,
    fields: c.fields.map((f) => stat.get(f.name)).filter((s) => s.books > 0),
    empty: c.fields.map((f) => f.name).filter((f) => !(stat.get(f).books > 0)),
  }));
  return { groups, any };
}

// 「この分野の本を探す」で AI 選書の最初の悩みに入れる言葉（送らない）。分野は 1 つでも数個（「・」でつなぐ）でも。
// 受け皿の「小説・教養」は「視点を増やす」より「読みたい本」なので言い方を変える（2026-10-11 ui-critic・2026-11-17）。
export function advisorDraftFor(fields) {
  const list = (Array.isArray(fields) ? fields : [fields]).map((t) => String(t || '').trim()).filter(Boolean);
  if (list.length && list.every((f) => f === OTHER_FIELD)) return '仕事の本のほかに、いま読みたい本を探したい';
  return `${list.join('・')}について、視点を増やしたい`;
}
