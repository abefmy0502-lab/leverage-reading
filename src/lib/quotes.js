/**
 * 名言ライブラリ — 自己完結モジュール。
 *
 * 設計の鉄則(TDZ エラー回避):
 *   - 他のファイル(helpContent / ai / app etc)を import しない。
 *   - 純粋なデータ + 純粋関数だけを export する。
 *   - getRandomQuote / getRandomFromCategory は **モジュールトップレベルで実行禁止**。
 *     呼び出し側で必ず関数内 (useState の初期化関数 / useEffect / イベントハンドラ)
 *     から実行する。
 *
 * ライブラリ拡張時はこのファイルだけを編集すれば十分。
 */

// ===== 1. 読書 =====
const READING = [
  { text: "良書を読むことは、過去の最も優れた人々と対話することだ", author: "デカルト" },
  { text: "読書とは他人の頭で考えることである", author: "ショーペンハウアー" },
  { text: "本は最も静かで頼りになる友人", author: "チャールズ・W・エリオット" },
  { text: "本を読まない人は、読めない人と何も変わらない", author: "マーク・トウェイン" },
  { text: "読書は心の食物である", author: "ニーチェ" },
  { text: "本は人を作り、人は本を作る", author: "司馬遼太郎" },
  { text: "今日の読者は明日のリーダー", author: "マーガレット・フラー" },
  { text: "本は世界への扉である", author: "C.S.ルイス" },
  { text: "読書は精神の散歩である", author: "ヴィクトル・ユーゴー" },
  { text: "私を作ったのは、私が読んだ全ての本", author: "オプラ・ウィンフリー" },
  { text: "本を読まない者は、人生を一度しか生きない", author: "ジョージ・R・R・マーティン" },
  { text: "読書は、孤独の最大の薬である", author: "アンナ・クィンドレン" },
  { text: "本は持ち運べる魔法", author: "スティーヴン・キング" },
];

// ===== 2. 自己投資 =====
const SELF_INVESTMENT = [
  { text: "自分自身への投資が、最も賢明な投資である", author: "ウォーレン・バフェット" },
  { text: "知識への投資は、最高のリターンをもたらす", author: "ベンジャミン・フランクリン" },
  { text: "教育は最強の武器である", author: "ネルソン・マンデラ" },
  { text: "学ばない者は、未来を奪われる", author: "ベンジャミン・バーバー" },
  { text: "知識は唯一、誰にも奪われない財産", author: "B.B.キング" },
  { text: "明日のために、今日学べ", author: "マハトマ・ガンディー" },
  { text: "学べば学ぶほど、自分の無知に気づく", author: "アリストテレス" },
  { text: "学ぶことは未来を耕すこと", author: "ホセ・マルティ" },
  { text: "投資の中で最も価値があるのは、自分自身への投資", author: "ウォーレン・バフェット" },
  { text: "知識は力なり", author: "フランシス・ベーコン" },
];

// ===== 3. 行動 =====
const ACTION = [
  { text: "知って行わざるは知らざるに同じ", author: "貝原益軒" },
  { text: "知行合一", author: "王陽明" },
  { text: "やってみせ、言って聞かせて、させてみせ、ほめてやらねば、人は動かじ", author: "山本五十六" },
  { text: "千里の道も一歩から", author: "老子" },
  { text: "今日できることを明日に延ばすな", author: "ベンジャミン・フランクリン" },
  { text: "読んだだけでは何も変わらない、行動して初めて変わる", author: "稲盛和夫" },
  { text: "考えるな、感じろ", author: "ブルース・リー" },
  { text: "Just do it.", author: "Nike" },
  { text: "行動しない者には、結果は訪れない", author: "ピーター・ドラッカー" },
  { text: "始めることが、すべての成功の始まり", author: "マーク・トウェイン" },
  { text: "完璧を求めるより、まず始めよ", author: "シェリル・サンドバーグ" },
  { text: "夢を追うのに、年齢は関係ない", author: "C.S.ルイス" },
];

// ===== 4. 継続 =====
const PERSISTENCE = [
  { text: "継続は力なり", author: "住岡夜晃" },
  { text: "習慣は第二の天性なり", author: "キケロ" },
  { text: "成功は毎日の積み重ね、失敗も毎日の積み重ね", author: "ジム・ローン" },
  { text: "雨垂れ石を穿つ", author: "故事" },
  { text: "1日1ページでも、365ページ読める", author: "アンソニー・トロロープ" },
  { text: "小さな進歩こそが、大きな変化を生む", author: "ロビン・シャーマ" },
  { text: "毎日1%成長すれば、1年で37倍になる", author: "ジェームズ・クリアー" },
  { text: "我々は繰り返し行うことの結果である。優秀さは、行動ではなく習慣だ", author: "アリストテレス" },
  { text: "途中で諦めることだけが、唯一の本当の失敗である", author: "孔子" },
  { text: "石の上にも三年", author: "故事" },
  { text: "倒れたら七回でも起きよ", author: "故事" },
  { text: "弱気は最大の敵", author: "尾崎紅葉" },
];

// ===== 5. 失敗と成長 =====
const FAILURE_AND_GROWTH = [
  { text: "失敗は成功の母", author: "故事" },
  { text: "失敗とは、転ぶことではなく、起き上がらないこと", author: "孔子" },
  { text: "成功とは失敗を繰り返しても情熱を失わない能力である", author: "ウィンストン・チャーチル" },
  { text: "私は失敗したことがない。ただ、1万通りのうまくいかない方法を見つけただけだ", author: "トーマス・エジソン" },
  { text: "成長を止めた瞬間、衰退が始まる", author: "レイ・クロック" },
  { text: "最大のリスクは、何もリスクを取らないこと", author: "マーク・ザッカーバーグ" },
  { text: "なりたい自分になるのに、遅すぎることはない", author: "ジョージ・エリオット" },
  { text: "成功は最終ゴールではなく、失敗は致命的でもない。続ける勇気こそが大事", author: "ウィンストン・チャーチル" },
  { text: "今までで最高の自分を、今日始めよう", author: "ロバート・H・シュラー" },
  { text: "あなたの人生は、あなたが思考する全ての結果である", author: "マルクス・アウレリウス" },
];

// ===== 6. 学び =====
const LEARNING = [
  { text: "学んで時にこれを習う、また説ばしからずや", author: "孔子" },
  { text: "我以外、皆我師", author: "吉川英治" },
  { text: "学問のすゝめ", author: "福沢諭吉" },
  { text: "賢者は答えるために学び、愚者は議論するために学ぶ", author: "シェイクスピア" },
  { text: "学びをやめた瞬間、人生は止まる", author: "アインシュタイン" },
  { text: "知らないことを知る、これが本当の知である", author: "ソクラテス" },
  { text: "学ぶことに、終わりはない", author: "ハーバート・スペンサー" },
  { text: "1冊の本が、人生を変えることがある", author: "ジョン・グリーン" },
  { text: "教えることは、二度学ぶことだ", author: "ジョセフ・ジューベル" },
  { text: "学ぶ者は永遠に若い", author: "ヘンリー・フォード" },
];

// ===== 7. 復習・記憶 =====
const REVIEW_AND_MEMORY = [
  { text: "学んだことを思い出すのは、再び学ぶことである", author: "孔子" },
  { text: "1ヶ月後の自分が読んで気づけば、それは資産", author: "" },
  { text: "過去のメモは、未来の自分への手紙", author: "" },
  { text: "振り返らない者に成長はない", author: "ピーター・ドラッカー" },
  { text: "復習は、新しい学びを生む", author: "孔子" },
  { text: "読書は、思い出すたびに新しい発見がある", author: "" },
];

// ===== 8. 自己変革 =====
const SELF_TRANSFORMATION = [
  { text: "変化なくして、成長なし", author: "ジョン・C・マクスウェル" },
  { text: "あなたが変われば、世界が変わる", author: "マハトマ・ガンディー" },
  { text: "明日変わりたければ、今日違うことをせよ", author: "アルベルト・アインシュタイン" },
  { text: "変わる勇気は、最初の一歩から", author: "ローレンス・パーク" },
  { text: "今のあなたは、過去のあなたが選んだ結果", author: "" },
  { text: "未来のあなたは、今日のあなたが選ぶ結果", author: "" },
  { text: "古い殻を破った時、新しい自分が生まれる", author: "" },
  { text: "変わることを恐れるな、変わらないことを恐れよ", author: "孔子" },
  { text: "自分を磨かなければ、宝石も光らない", author: "ベンジャミン・フランクリン" },
  { text: "あなたの人生は、あなたの選択の総和である", author: "" },
  { text: "自分自身を信じる勇気が、すべての始まり", author: "ラルフ・ワルド・エマソン" },
];

// ===== 9. 哲学・智慧 =====
const WISDOM = [
  { text: "我思う、ゆえに我あり", author: "デカルト" },
  { text: "汝自身を知れ", author: "ソクラテス" },
  { text: "知足者富む(足るを知る者は富む)", author: "老子" },
  { text: "急がば回れ", author: "故事" },
  { text: "石の上にも三年", author: "故事" },
  { text: "井の中の蛙、大海を知らず", author: "故事" },
  { text: "百聞は一見に如かず", author: "漢書" },
  { text: "賢者は他人から学び、愚者は自分から学ぶ", author: "オットー・フォン・ビスマルク" },
  { text: "智に働けば角が立つ。情に棹させば流される", author: "夏目漱石" },
  { text: "人生で最も大切なのは、学び続けることだ", author: "アインシュタイン" },
  { text: "始めよう、続けよう、達成しよう", author: "サミュエル・ジョンソン" },
];

// ===== 10. 励まし =====
const ENCOURAGEMENT = [
  { text: "今日のあなたが選ぶ本が、明日のあなたを作る", author: "" },
  { text: "迷ったら、本を開け", author: "" },
  { text: "あなたが変わろうとしている、その姿勢が美しい", author: "" },
  { text: "1冊の本が、人生を変えることがある", author: "" },
  { text: "頑張る人を、本は応援している", author: "" },
  { text: "あなたの読書時間は、未来への贈り物", author: "" },
  { text: "焦らず、休まず、止まらず", author: "ゲーテ" },
  { text: "君の今日の努力は、明日の君が誇りに思う", author: "" },
  { text: "成長する者だけが、本物の喜びを知る", author: "" },
  { text: "夜明け前が一番暗い", author: "故事" },
];

// ===== 11. 達成感 =====
const ACHIEVEMENT = [
  { text: "1冊読み終えた、それは1段成長したということ", author: "" },
  { text: "読了は終わりではない、始まりだ", author: "ラルフ・ウォルドー・エマソン" },
  { text: "完読おめでとう。次の本があなたを待っている", author: "" },
  { text: "本を閉じた瞬間、知恵があなたの中に住み始める", author: "" },
  { text: "読み終えた本の数だけ、人生は豊かになる", author: "ヘミングウェイ" },
  { text: "また一つ、世界が広がりましたね", author: "" },
  { text: "知識は使ってこそ、本物の財産になる", author: "" },
  { text: "今日のあなたを、未来のあなたが感謝するでしょう", author: "" },
];

// ===== 12. 時間と人生 =====
const TIME_AND_LIFE = [
  { text: "時は金なり", author: "ベンジャミン・フランクリン" },
  { text: "光陰矢の如し", author: "故事" },
  { text: "今を生きよ、明日は誰にも分からない", author: "ホラティウス" },
  { text: "人生で最も無駄な日は、笑わなかった日である", author: "チャップリン" },
  { text: "後悔は、行動しなかったことから生まれる", author: "マーク・トウェイン" },
  { text: "60秒間怒っているたびに、60秒の幸福が失われる", author: "ラルフ・ウォルドー・エマソン" },
  { text: "急がない、しかし止まらない", author: "ゲーテ" },
  { text: "今を全力で生きるしか、未来を変える方法はない", author: "" },
];

// 全カテゴリをまとめたオブジェクト(read-only に近い扱い)
export const QUOTES = {
  reading: READING,
  selfInvestment: SELF_INVESTMENT,
  action: ACTION,
  persistence: PERSISTENCE,
  failureAndGrowth: FAILURE_AND_GROWTH,
  learning: LEARNING,
  reviewAndMemory: REVIEW_AND_MEMORY,
  selfTransformation: SELF_TRANSFORMATION,
  wisdom: WISDOM,
  encouragement: ENCOURAGEMENT,
  achievement: ACHIEVEMENT,
  timeAndLife: TIME_AND_LIFE,
};

const FALLBACK = { text: "読書は最高の投資", author: "" };

// ===== Helpers — 必ず関数内で呼ぶこと(モジュール top-level 実行禁止) =====

/**
 * 指定カテゴリ群からランダムに 1 件返す。引数なしで全カテゴリから。
 */
export function getRandomQuote(categories = null) {
  const cats = Array.isArray(categories) && categories.length > 0
    ? categories
    : Object.keys(QUOTES);
  const pool = cats.flatMap((cat) => QUOTES[cat] || []);
  if (pool.length === 0) return FALLBACK;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 単一カテゴリからランダムに 1 件返す。
 */
export function getRandomFromCategory(category) {
  const list = QUOTES[category];
  if (!list || list.length === 0) {
    return { text: "今日も一歩前へ", author: "" };
  }
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * 各カテゴリの件数を返す(デバッグ・ヘルプ表示用)。
 */
export function getQuoteCount() {
  return Object.fromEntries(
    Object.entries(QUOTES).map(([cat, list]) => [cat, list.length])
  );
}

/**
 * 直近 5 件は除外して選ぶ「賢い」ランダム。localStorage を使う。
 * SSR / private mode / storage 失敗時は素の getRandomQuote にフォールバック。
 */
const RECENT_KEY = 'recentQuotes';
const RECENT_LIMIT = 5;

export function getRandomQuoteSmart(categories = null) {
  if (typeof window === 'undefined') return getRandomQuote(categories);
  let recent = [];
  try {
    recent = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    if (!Array.isArray(recent)) recent = [];
  } catch {
    recent = [];
  }

  const cats = Array.isArray(categories) && categories.length > 0
    ? categories
    : Object.keys(QUOTES);
  const all = cats.flatMap((cat) => QUOTES[cat] || []);
  if (all.length === 0) return FALLBACK;

  let pool = all.filter((q) => !recent.includes(q.text));
  if (pool.length === 0) pool = all;
  const quote = pool[Math.floor(Math.random() * pool.length)];

  try {
    const next = [quote.text, ...recent].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / disabled storage */
  }
  return quote;
}
