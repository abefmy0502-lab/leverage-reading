// 🧹 公開のプロフィールに出す言葉の絞り込み（2026-11-21・App 審査 1.2「好ましくない投稿を絞る仕組み」）。
//   アプリ（保存の前に知らせる）とサーバー（公開のページを描く前に外す）が同じ決まりを使う。
//   弾くもの: 性的・差別・暴力の強い言葉、連絡先（メール・電話番号・URL・SNS の ID）。
//   言葉は全角・半角・大文字小文字・空白をならしてから探す（「死 ね」「Ｓ Ｅ Ｘ」も当てる）。
//   書名・著者は本のことなので緩く（連絡先だけ）、本人の文（ニックネーム・自己紹介・1 行）は全部を見る。

const NG_WORDS = [
  // 暴力・脅し
  '死ね', '殺す', 'ころす', '殺してやる', '氏ね', '自殺しろ',
  // 差別・侮辱
  'きちがい', 'キチガイ', '気違い', 'ガイジ', 'がいじ', '池沼', '支那', 'シナ人', '土人', '部落民', 'かたわ', 'カタワ', 'めくら', 'メクラ', 'つんぼ', 'ツンボ', 'ホモ野郎', 'レズ野郎',
  'ゴミ人間',
  // 性的
  'セックス', 'せっくす', 'sex', 'エッチしよ', 'ちんこ', 'チンコ', 'ちんぽ', 'チンポ', 'まんこ', 'マンコ', 'おまんこ', 'フェラ', 'パイパン', 'ヤリマン', 'やりまん', 'ヤリチン', '援交', '援助交際', 'パパ活', 'ママ活', 'セフレ', 'av女優', 'porn', 'ポルノ', '風俗嬢', 'デリヘル', 'オナニー', 'おなにー', '射精', '中出し',
  // 薬物・違法
  '大麻売', '覚醒剤', 'シャブ',
];

// 全角英数→半角・カタカナはそのまま・小文字・空白と記号のすき間を外す。
export function foldText(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・.,_\-‐－~〜*＊/|]+/g, '');
}

const FOLDED_NG = NG_WORDS.map(foldText);

// 連絡先（見知らぬ人と直接つながる道を作らない）。
const CONTACT_RES = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // メール
  /(https?:\/\/|www\.)\S+/i, // URL
  /\b[a-z0-9-]+\.(com|net|jp|io|me|co|org|xyz|app|link|ly)\b/i, // ドメインだけ
  /(\d[\s-]?){10,11}/, // 電話番号（10〜11 桁）
  /(line|ライン|insta|インスタ|twitter|ツイッター|tiktok|ティックトック|discord|kakao|カカオ)\s*(id|ＩＤ|ｉｄ)?\s*[:：]?\s*[@＠]?[a-z0-9._-]{3,}/i, // SNS の ID
  /[@＠][a-z0-9_.]{3,}/i, // @ のアカウント名
];

/** 言葉で見つかった理由（'word' | 'contact'）か null。 kind: 'own'＝本人の文 / 'book'＝書名・著者。 */
export function profileTextIssue(text, kind = 'own') {
  const raw = String(text || '').normalize('NFKC');
  if (!raw.trim()) return null;
  // 書名・著者は「Amazon.com」のような書名もあるので、メールと http の URL だけ見る。
  const contacts = kind === 'book' ? CONTACT_RES.slice(0, 2) : CONTACT_RES;
  if (contacts.some((re) => re.test(raw))) return 'contact';
  if (kind === 'book') return null;
  const f = foldText(raw);
  if (FOLDED_NG.some((w) => w && f.includes(w))) return 'word';
  return null;
}

/** プロフィールの中で、公開に向かない欄（{ field, reason }）の一覧。 */
export function profileIssues(p = {}) {
  const out = [];
  for (const [field, kind] of [['nickname', 'own'], ['bio', 'own'], ['favLine', 'own'], ['favTitle', 'book'], ['favAuthor', 'book']]) {
    const reason = profileTextIssue(p[field], kind);
    if (reason) out.push({ field, reason });
  }
  return out;
}

export const PROFILE_FIELD_NAMES = { nickname: 'ニックネーム', bio: '自己紹介', favLine: 'おすすめの 1 行', favTitle: '好きな本の書名', favAuthor: '好きな本の著者' };

/** 画面に出す 1 文（無ければ ''）。 */
export function profileIssueMessage(issues) {
  if (!issues?.length) return '';
  const names = [...new Set(issues.map((i) => PROFILE_FIELD_NAMES[i.field] || i.field))].join('・');
  return issues.some((i) => i.reason === 'contact')
    ? `${names}に、メールアドレス・電話番号・URL などの連絡先は書けません。`
    : `${names}に、公開に向かない言葉が入っています。書き直してください。`;
}
