// 💬 相談の小さな決まりごと（AI を使わない・画面の文を組み立てるだけ）。
//
// - buildConsultExamples: 相談例（ホームの相談カード・相談の空の画面で共通）。
//     0. この 7 日で、ふりかえりを書いて完了した行動（「やってみた「…」、次はどうする？」・2026-09-29）
//     1. 前の相談の続き（「前に相談した「…」、その後どう進める？」）
//     2. 本の「現在の課題」（読書準備でユーザーが書いた言葉＝いちばん本人の悩みに近い）
//     3. メモのある本から（『書名』の学びで、明日から使えるものは？）
//     4. よくある困りごと（LP の「試しに、相談してみる」と同じ形）
//   「「タグ」で迷ったとき、私のメモからヒントをください」の型は不自然なので 2026-09-29 にやめた。
// - standaloneAction: 答えの一歩を行動リストに入れるとき、あとで一覧で読んでも分かる文にする
//     （「この件」「それ」で始まる一歩には、相談の要約を頭に付ける。頭の「明日の朝、」「今日は」は外す）。
// - questionGist: 相談の要約。「前に相談した「X」…」の続きの相談は X を要約し、かっこの中では切らない
//     （かっこは必ず閉じる・2026-09-29）。
//
// - selectThreadTurns: 深掘りの会話（2026-09-30）で、次の相談に文脈として渡す「これまでのやりとり」を選ぶ。
// - parseAskSection / nextStepChips / wantsAction: 行動は会話で決める（2026-09-30）。最初の答えの
//     【あなたに聞きたいこと】の問いと候補、入力欄の上のチップ（返事・「行動を決める」）、行動を求める言葉。
//
// ⚠️ src では正規表現の後読み（lookbehind）を使わない。

// よくある困りごと（相談の形・LP の相談の流れ（LpFlow）と同じ「部下が報告をくれなくて困っています」など）
export const WORRY_EXAMPLES = [
  '部下が報告をくれなくて困っています',
  '会議で話がまとまりません',
  '仕事を抱えすぎて手が回りません',
];

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// 🪙 トークンの数は 3 桁ごとに区切る（「1,000」・画面の数字はすべてこれで）。
export const fmtTokens = (n) => (Number(n) || 0).toLocaleString('ja-JP');
// 残りのトークンで相談できるおよその回数（相談 1 回 約 perConsult トークン）。
// 残りが 1 回分に満たなくても、残りがあれば最後の 1 回は始められる（サーバーの「最後の 1 回」）ので 1 回。
export function consultsLeft(tokens, perConsult = 10) {
  const t = Math.max(0, Math.floor(Number(tokens) || 0));
  if (t <= 0) return 0;
  return Math.max(1, Math.floor(t / Math.max(1, perConsult)));
}

// 📝 「メモ N 件」の数え方（相談・ホーム・初日クイックスタート・記録で同じ・2026-09-29 オーナー裁定）:
//   メモ＝カード式＋まとめ式（GLOSSARY）。book_memos の全件（カード式＋学び）に、
//   「この本のまとめ」（books.leverage_memo）が入っている本を 1 冊 1 件として足す。
//   読書メーター等の感想を取り込んだ人（まとめだけ）も、相談の入口に進めるように。
export function hasSummaryMemo(book) {
  const v = book?.leverageMemo ?? book?.leverage_memo;
  return typeof v === 'string' && v.trim().length > 0;
}
// bookIds を渡すと、その本だけを数える（相談相手を絞ったとき）。
export function countSummaryMemos(books, bookIds = null) {
  const list = Array.isArray(books) ? books : [];
  const only = bookIds ? new Set(bookIds) : null;
  return list.filter((b) => (!only || only.has(b.id)) && hasSummaryMemo(b)).length;
}

// 初日クイックスタートの「よく読まれている本」12 冊に 1 つずつ決めた困りごと（2026-09-29）。
// できあがりの画面の「たとえば」に、えらんだ本の困りごとを先に出す（AI を使わない＝原価ゼロ）。
// 本を足し替えるときは PastBooksQuickstart.jsx の POPULAR_BOOKS と一緒に直す。
export const BOOK_WORRIES = {
  '7つの習慣': '目の前の仕事に追われて、大事なことが後回しになっています',
  '人を動かす': '相手を説得しようとすると、かえって反発されます',
  '嫌われる勇気': '人の目が気になって、言いたいことが言えません',
  'イシューからはじめよ': '頑張っているのに、成果につながっている気がしません',
  'エッセンシャル思考': '仕事を抱えすぎて手が回りません',
  'FACTFULNESS': '思い込みで判断して、あとから間違いに気づくことがあります',
  '影響力の武器': '提案しても、なかなか「はい」と言ってもらえません',
  '伝え方が9割': '頼みごとをすると、いつも断られてしまいます',
  '1兆ドルコーチ': 'チームのメンバーが本音を話してくれません',
  '数値化の鬼': '目標があいまいで、何から手をつければいいか分かりません',
  '思考の整理学': '考えがまとまらず、企画が出てきません',
  '夢をかなえるゾウ': '変わりたいのに、いつも三日坊主で終わります',
};
const titleKey = (t) => {
  let s = String(t || '');
  try { s = s.normalize('NFKC'); } catch { /* そのまま */ }
  return s.replace(/[\s・:：]/g, '').toLowerCase();
};
const WORRY_BY_TITLE = Object.entries(BOOK_WORRIES).map(([t, w]) => [titleKey(t), w]);

// 本の困りごと（書名が一致、または「7つの習慣 人格主義の回復」のように先頭が一致）。無ければ空。
export function worryForBook(book) {
  const key = titleKey(book?.title);
  if (!key) return '';
  const exact = WORRY_BY_TITLE.find(([k]) => k === key);
  if (exact) return exact[1];
  const prefix = WORRY_BY_TITLE.find(([k]) => key.startsWith(k));
  return prefix ? prefix[1] : '';
}

// 🖊 これまで読んだ本から始める: 「いちばん覚えていることは？」の欄の例（よく読まれている本だけ・2026-09-30）。
//   その本で覚えていそうな一言。無い本は空（画面は「覚えている一言（うろ覚えでOK）」）。
export const BOOK_MEMO_EXAMPLES = {
  '7つの習慣': '緊急ではないけれど重要なことに時間を使う',
  '人を動かす': '人は議論に負けても、考えを変えない',
  '嫌われる勇気': '他人の課題には踏み込まない',
  'イシューからはじめよ': '答えを出す前に、本当に答えるべき問いを見極める',
  'エッセンシャル思考': 'やらないことを決めるのが、一番大事な仕事',
  'FACTFULNESS': '思い込みより、データで世界を見る',
  '影響力の武器': '人は先に何かをもらうと、お返しをしたくなる',
  '伝え方が9割': 'お願いは、相手のメリットから伝える',
  '1兆ドルコーチ': 'チームが第一。信頼がすべての土台',
  '数値化の鬼': '行動の量を数字で決めてから動く',
  '思考の整理学': '考えは一晩寝かせると整理される',
  '夢をかなえるゾウ': '小さな行動を毎日続けることから変わる',
};
const MEMO_EXAMPLE_BY_TITLE = Object.entries(BOOK_MEMO_EXAMPLES).map(([t, w]) => [titleKey(t), w]);
export function memoExampleForBook(book) {
  const key = titleKey(book?.title);
  if (!key) return '';
  const exact = MEMO_EXAMPLE_BY_TITLE.find(([k]) => k === key);
  if (exact) return exact[1];
  const prefix = MEMO_EXAMPLE_BY_TITLE.find(([k]) => key.startsWith(k));
  return prefix ? prefix[1] : '';
}

// えらんだ本の困りごとを先に、次に「『書名』の学びで、明日から使えるものは？」（困りごとの無い本から・
// えらんだ本に結びつく問いを、よくある困りごとより先に出す・2026-09-29）、それでも足りない分はよくある困りごとで
// （同じ文は重ねない）。
export function quickstartWorries(books, count = 2) {
  const list = (Array.isArray(books) ? books : []).filter((b) => b && String(b.title || '').trim());
  const bookQuestion = (b) => `『${shortTitle(b.title)}』の学びで、明日から使えるものは？`;
  const out = [];
  [
    ...list.map(worryForBook),
    ...list.filter((b) => !worryForBook(b)).map(bookQuestion),
    ...list.filter((b) => worryForBook(b)).map(bookQuestion),
    ...WORRY_EXAMPLES,
  ].forEach((w) => {
    if (w && !out.includes(w) && out.length < count) out.push(w);
  });
  return out;
}

const OPEN = { '「': '」', '『': '』', '（': '）', '(': ')' };
const CLOSE = new Set(Object.values(OPEN));
const CONTINUE_HEAD = '前に相談した「';

// 「前に相談した「X」、その後どう進める？」（相談例の「続き」）なら X を取り出す（入れ子もほどく）。
function unwrapContinue(text) {
  let s = text;
  for (let guard = 0; guard < 5 && s.startsWith(CONTINUE_HEAD); guard += 1) {
    let depth = 0;
    let end = -1;
    for (let i = CONTINUE_HEAD.length - 1; i < s.length; i += 1) {
      if (s[i] === '「') depth += 1;
      else if (s[i] === '」') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    const inner = (end > 0 ? s.slice(CONTINUE_HEAD.length, end) : s.slice(CONTINUE_HEAD.length)).trim();
    if (!inner) break;
    s = inner;
  }
  return s;
}

// 最初の 1 文（かっこの中の「。」「？」では切らない）。
function firstSentence(text) {
  const stack = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (OPEN[ch]) stack.push(OPEN[ch]);
    else if (CLOSE.has(ch)) { if (stack.length && stack[stack.length - 1] === ch) stack.pop(); }
    else if (stack.length === 0 && /[。？?！!]/.test(ch)) {
      const head = text.slice(0, i).trim();
      if (head) return head;
    }
  }
  return text.trim();
}

// 開いたままのかっこ（閉じの順）。
function unclosed(text) {
  const stack = [];
  for (const ch of text) {
    if (OPEN[ch]) stack.push(OPEN[ch]);
    else if (CLOSE.has(ch) && stack.length && stack[stack.length - 1] === ch) stack.pop();
  }
  return stack;
}

// かっこの手前がこの形で終わるとき（中身の無い決まり文句）は、かっこの中を要約に使う（2026-09-30）。
const STOCK_BEFORE_QUOTE = /(に残した|に書いた|に書き残した|で読んだ|の)$/;
// 末尾の「…」「‥」「...」（要約の「…」と重ねないため）。
const ELLIPSIS_END = /(…|‥|\.{2,})+$/;

// t の open 番目の開きかっこの中身の頭を、同じかっこでくくって返す（全体 n 文字まで・入らない分は「…」）。
function innerQuoteGist(t, open, n) {
  const openCh = t[open];
  const closeCh = OPEN[openCh];
  let depth = 0;
  let end = t.length;
  for (let i = open; i < t.length; i += 1) {
    if (t[i] === openCh) depth += 1;
    else if (t[i] === closeCh) { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  const inner = t.slice(open + 1, end).trim();
  // かっこの中がもう「…」で終わっていれば、後ろに「…」を重ねない（「「X…」…」にしない・2026-09-30）。
  if (inner.length <= n - 2) return `${openCh}${inner}${closeCh}${end < t.length - 1 && !ELLIPSIS_END.test(inner) ? '…' : ''}`;
  let head = inner.slice(0, Math.max(1, n - 3)).replace(/[、，,。\s]+$/, '').replace(ELLIPSIS_END, '');
  const need = unclosed(head).length;
  if (need) head = head.slice(0, Math.max(1, n - 3 - need));
  return `${openCh}${head}…${unclosed(head).reverse().join('')}${closeCh}`;
}

// 相談の文の要約（最初の 1 文・末尾の句読点を外して n 文字まで）。
//   - 相談例の「前に相談した「X」、その後どう進める？」なら X を要約する（「前に相談した「前に相談した…」」にしない）
//   - かっこ（「」『』（））の中では切らない。切るとかっこが開いたままになるときは、かっこの手前で切る
//     （手前に何も残らないときだけ中で切り、閉じかっこを補う）
export function questionGist(question, n = 20) {
  const t = firstSentence(unwrapContinue(oneLine(question))).replace(/[、，,\s]+$/, '');
  if (!t) return '';
  if (t.length <= n) {
    const rest = unclosed(t);
    return rest.length ? `${t}${rest.reverse().join('')}` : t;
  }
  let cut = t.slice(0, n - 1);
  // 切り口がかっこの中なら、いちばん外の開いたかっこの手前まで戻す。
  const stack = [];
  for (let i = 0; i < cut.length; i += 1) {
    if (OPEN[cut[i]]) stack.push(i);
    else if (CLOSE.has(cut[i]) && stack.length) stack.pop();
  }
  if (stack.length) {
    const before = cut.slice(0, stack[0]).replace(/[、，,\s]+$/, '');
    // かっこの手前が決まり文句（「メモに残した」「〇〇の」）だけなら、手前で切ると中身が何も残らない
    //   （「メモに残した…」）。かっこの中の頭を取り出して「〈中の頭〉…」にする（2026-09-30）。
    if (STOCK_BEFORE_QUOTE.test(before)) return innerQuoteGist(t, stack[0], n);
    cut = before.length >= 4 ? before : cut;
  }
  // 切り口がもう「…」「...」で終わっていれば外してから「…」を 1 つだけ付ける（「……」にしない・2026-09-30）。
  cut = cut.replace(/[、，,\s]+$/, '').replace(ELLIPSIS_END, '');
  // 補う閉じかっこの分だけ短くして、全体を n 文字に収める。
  const need = unclosed(cut).length;
  if (need) cut = cut.slice(0, Math.max(1, n - 1 - need));
  return `${cut}…${unclosed(cut).reverse().join('')}`;
}

// 本の「現在の課題」を相談の形に（「〜。どう考えればいい？」）。
function challengeQuestion(challenge) {
  const t = oneLine(challenge).replace(/[。．.]+$/, '');
  if (!t) return '';
  const clipped = t.length > 40 ? `${t.slice(0, 39)}…` : t;
  if (/[？?]$/.test(clipped)) return clipped;
  return `${clipped}。どう考えればいい？`;
}

// 📕 相談例に出す短い書名（2026-09-29）。読書メーターなどから取り込んだ本は副題まで書名に入っている
//   （「嫌われる勇気―自己啓発の源流「アドラー」の教え」）ので、長い書名は最初の区切り（空白・「：」「―」など）までにする。
//   - 短い書名（12 文字まで）はそのまま
//   - 英単語どうしの空白では切らない（「LIFE SHIFT」）
//   - 「完訳」「新版」などの頭だけにならないよう、次のまとまりまでつなぐ（「完訳 7つの習慣」）
const SHORT_TITLE_MAX = 12;
const TITLE_SEPS = new Set([' ', '\u3000', '：', ':', '―', '—', '─', '〜', '～']);
const EDITION_HEADS = new Set(['完訳', '新版', '新装版', '改訂版', '増補版', '決定版', '文庫版', '超訳', '図解', 'マンガ', 'まんが']);
const isAsciiLetter = (ch) => /[A-Za-z]/.test(ch || '');
export function shortTitle(title) {
  const t = oneLine(title);
  if (t.length <= SHORT_TITLE_MAX) return t;
  const cuts = [];
  for (let i = 1; i < t.length - 1; i += 1) {
    const ch = t[i];
    if (!TITLE_SEPS.has(ch)) continue;
    // 英単語どうしの空白（「LIFE SHIFT」）では切らない。
    if ((ch === ' ' || ch === '\u3000') && isAsciiLetter(t[i - 1]) && isAsciiLetter(t[i + 1])) continue;
    cuts.push(i);
  }
  for (const i of cuts) {
    const head = t.slice(0, i).replace(/[\s：:―—─〜～]+$/, '');
    if (head.length < 2 || EDITION_HEADS.has(head)) continue;
    return head;
  }
  return t;
}

// 🎯 行動の短い形（相談例の「やってみた「…」」）。相談の答えから入れた行動は頭に「〈相談の要約〉：」が
//   付いている（standaloneAction）ので、そのあとの一歩だけにする。最初の 1 文・かっこは閉じる（questionGist と同じ）。
//   頭の「「上司への報告」の場面で、」も外す（相談例では場面より一歩を見せたい・2026-09-29）。
//   全体が「…」でくくられた形は外側のかっこを外す（例の文で「「…」」と二重にならないように）。
export function actionGist(text, n = 22) {
  let t = oneLine(text);
  const i = t.indexOf('：');
  if (i > 0 && i <= 22 && t.length - i - 1 >= 4) t = t.slice(i + 1).trim();
  t = stripScenePrefix(t, { minLength: 0 });
  const g = questionGist(t, n);
  return unwrapWholeQuote(g);
}

// 「「…」の場面で、」「〈場面〉の場面で、」の頭（相談の答えの一歩によくある形）を外す（2026-09-29）。
//   minLength: 文全体がこの長さを超えるときだけ外す（行動リストでは短い文の場面は残す）。
//   外したあとが短すぎる（12 文字未満）・「この」「それ」などで始まって単独で分からないときはそのまま。
const SCENE_PREFIX = /^(「[^「」]{1,40}」|[^「」、，,。\s]{1,20})の場面で[、，,\s]*/;
export function stripScenePrefix(text, { minLength = 40 } = {}) {
  const t = oneLine(text);
  if (t.length <= minLength) return t;
  const m = t.match(SCENE_PREFIX);
  if (!m) return t;
  const rest = t.slice(m[0].length).trim();
  if (rest.length < 12 || needsSubject(rest)) return t;
  return rest;
}

// 全体が 1 組の「…」でくくられていれば、外側のかっこを外す（中にさらに「」があるときは外さない）。
function unwrapWholeQuote(t) {
  if (t.length >= 3 && t.startsWith('「') && t.endsWith('」')) {
    const inner = t.slice(1, -1);
    if (!/[「」]/.test(inner)) return inner;
  }
  return t;
}

// 「」の中に入れる文の中の「」を『』に（かぎかっこの入れ子・「「…」」と二重に見えないように）。
function nestQuotes(t) {
  return String(t || '').replace(/「/g, '『').replace(/」/g, '』');
}

const REFLECTED_DAYS = 7;
// この 7 日で、ふりかえり（やってみてどうだったか）を書いて完了した行動のうち、いちばん新しいもの。無ければ null。
//   actions: useAllActions の allActions など（done / completedAt / reflection / text）。
export function recentReflectedAction(actions, now = Date.now()) {
  const since = now - REFLECTED_DAYS * 86400000;
  let best = null;
  let bestAt = -Infinity;
  (Array.isArray(actions) ? actions : []).forEach((a) => {
    if (!a?.done || !oneLine(a.reflection) || !oneLine(a.text)) return;
    const at = Date.parse(a.completedAt || a.completed_at || '');
    if (!Number.isFinite(at) || at < since || at > now + 86400000) return;
    if (at > bestAt) { best = a; bestAt = at; }
  });
  return best;
}

// books: アプリの本（camelCase の currentChallenge / status / title / updatedAt）
// memoBookIds: メモのある本の id（Set・null＝まだ分からない）
// lastConsult: { question } 前の相談（無ければ null）
// memoCount: 自分のメモの件数（null＝まだ分からない）。10 件未満の間は、よく読まれている本（BOOK_WORRIES）を
//   本棚に入れていれば、その本の困りごとを 2 番目に出す（メモが少ないうちは「本の学び」より答えやすい・2026-09-29）。
// actions: 行動（useAllActions の allActions）。この 7 日でふりかえりを書いて完了した行動があれば、1 つ目の例にする。
// now: 今の時刻（テスト用）
// freeUsedUp: 無料プランで今月のトークンを使い切った（メモが答える相談＝前の相談の続きとしては答えられないので
//   「前に相談した「…」、その後どう進める？」を出さない・2026-10-01 ui-critic）
// 返り値: [{ text, kind: 'acted' | 'continue' | 'challenge' | 'book' | 'worry' }]
export const FEW_MEMOS = 10;
export function buildConsultExamples({ books = [], memoBookIds = null, lastConsult = null, count = 3, memoCount = null, actions = null, now = Date.now(), freeUsedUp = false } = {}) {
  const out = [];
  const push = (text, kind) => {
    if (text && !out.some((e) => e.text === text) && out.length < count) out.push({ text, kind });
  };
  // やってみた行動の次（読んで → 行動して → また相談する、の輪をつなぐ）。
  const acted = recentReflectedAction(actions, now);
  const actedGist = acted ? actionGist(acted.text) : '';
  if (actedGist) push(`やってみた「${nestQuotes(actedGist)}」、次はどうする？`, 'acted');
  const gist = lastConsult?.question && !freeUsedUp ? questionGist(lastConsult.question, 18) : '';
  if (gist) push(`前に相談した「${gist}」、その後どう進める？`, 'continue');

  const list = Array.isArray(books) ? books : [];
  const withChallenge = list
    .filter((b) => oneLine(b.currentChallenge))
    .sort((a, b) => String(b.updatedAt || b.updated_at || '').localeCompare(String(a.updatedAt || a.updated_at || '')));
  if (withChallenge[0]) push(challengeQuestion(withChallenge[0].currentChallenge), 'challenge');

  // メモのある本＝カード式のメモがある本、または「この本のまとめ」が入っている本（メモ＝カード式＋まとめ式）。
  const hasMemo = (b) => memoBookIds == null || memoBookIds.has(b.id) || hasSummaryMemo(b);
  const recent = list.find((b) => b.status === 'reading' && hasMemo(b))
    || list.find((b) => b.status === 'done' && hasMemo(b))
    || (memoBookIds ? list.find((b) => hasMemo(b)) : null);
  if (recent?.title) push(`『${shortTitle(recent.title)}』の学びで、明日から使えるものは？`, 'book');

  // メモが少ない間: えらんだ（本棚に入れた）よく読まれている本の困りごとを 2 番目に。
  if (Number.isFinite(memoCount) && memoCount < FEW_MEMOS) {
    const byRecent = [...list].sort((a, b) => String(b.updatedAt || b.updated_at || '').localeCompare(String(a.updatedAt || a.updated_at || '')));
    const worry = byRecent.filter(hasMemo).map(worryForBook).find(Boolean) || byRecent.map(worryForBook).find(Boolean);
    if (worry && !out.some((e) => e.text === worry)) {
      out.splice(Math.min(1, out.length), 0, { text: worry, kind: 'worry' });
      if (out.length > count) out.length = count;
    }
  }

  WORRY_EXAMPLES.forEach((w) => push(w, 'worry'));
  return out;
}

// 🌱 初日の「相談してみる」（2026-10-02・lib/firstDay.js）: 取り込み・ページを撮る・読んだ本に一言ずつ残す を
//   終えたあと、相談の入力欄に入れておく相談（送らない＝トークンは送ったときだけ）。相談例（buildConsultExamples）と
//   同じ作り方で、いま書いた・取り込んだメモのある本から作った問いを先に（『書名』の学びで…）、次にその本の困りごと、
//   足りない分はよくある困りごと。前の相談の続き・やってみた行動の次は初日には無いので出さない。
//   books: メモのある本を先に並べる（呼び出し側）。memoBookIds: メモのある本の id（Set）。
const FIRST_DAY_ORDER = { book: 0, challenge: 1, worry: 2 };
export function firstConsultSuggestions({ books = [], memoBookIds = null, memoCount = null, count = 2 } = {}) {
  const ids = memoBookIds instanceof Set ? memoBookIds : new Set(memoBookIds || []);
  const list = Array.isArray(books) ? books : [];
  const examples = buildConsultExamples({ books: list, memoBookIds: ids, memoCount, count: count + 3 })
    .filter((e) => e.kind in FIRST_DAY_ORDER)
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => (FIRST_DAY_ORDER[a.kind] - FIRST_DAY_ORDER[b.kind]) || (a.i - b.i));
  return examples.slice(0, Math.max(0, count)).map((e) => e.text);
}
export function firstConsultQuestion(args = {}) {
  return firstConsultSuggestions({ ...args, count: 1 })[0] || WORRY_EXAMPLES[0];
}

// 「この件」「それ」などで始まる（または中で指す）一歩は、あとで行動の一覧だけを見ても分からない。
const DEMONSTRATIVE_START = /^(この|その|あの|これ|それ|あれ)/;
const VAGUE_REF = /(この件|その件|この問題|その問題|この悩み|その悩み|この状況|その状況|このこと|そのこと|それについて|これについて)/;

export function needsSubject(action) {
  const t = oneLine(action);
  return !!t && (DEMONSTRATIVE_START.test(t) || VAGUE_REF.test(t));
}

// 読む日で意味が変わる言葉（「明日の朝、」「今日は」）で始まる一歩は、その頭だけを外す（2026-09-29）。
//   相談の答えから入れた行動は期限＝明日なので、一覧で「明日の朝、…」が明日以降に読まれてもずれないように。
//   控えめに外す: 外したあとが「の」「まで」「から」などで始まる（「明日までに」「明日の朝の会議」）ときや、
//   残りが短すぎるときは、次に短い頭を試し、どれも合わなければそのまま。
const DAY_WORDS = ['明日', '今日'];
const DAY_PARTS = ['の午前中', 'の午後', 'の夕方', 'の朝', 'の夜'];
// 長い頭から試す（「明日の朝に」→「明日の朝」→「明日の」→「明日」）。
const RELATIVE_DAY_LEADS = DAY_WORDS.flatMap((d) => [
  ...DAY_PARTS.flatMap((p) => [`${d}${p}に`, `${d}${p}は`, `${d}${p}`]),
  `${d}中に`, `${d}は`, `${d}の`,
]).sort((a, b) => b.length - a.length);
const LEAD_REST_NG = /^(の|に|まで|から|中|以降|以内|じゅう|と|や|も)/;
const SEP = /^[、，,\s]+/;
export function stripRelativeDayLead(action) {
  const t = oneLine(action);
  const tryRest = (rest) => (rest.length >= 4 && !LEAD_REST_NG.test(rest) ? rest : null);
  for (const lead of RELATIVE_DAY_LEADS) {
    if (!t.startsWith(lead)) continue;
    const ok = tryRest(t.slice(lead.length).replace(SEP, ''));
    if (ok) return ok;
  }
  // 「明日」「今日」だけの頭は、すぐ後に区切り（「明日、」）があるときだけ外す（「明日香さん」を崩さない）。
  for (const d of DAY_WORDS) {
    if (!t.startsWith(d)) continue;
    const after = t.slice(d.length);
    if (!SEP.test(after)) continue;
    const ok = tryRest(after.replace(SEP, ''));
    if (ok) return ok;
  }
  return t;
}

// 行動リストに入れる文。単独で分かる文ならそのまま、そうでなければ「〈相談の要約〉：」を頭に付ける。
//   頭の「明日の朝、」「今日は」は外す（上の stripRelativeDayLead）。
export function standaloneAction(action, question, max = 500) {
  const t = stripRelativeDayLead(action);
  if (!t || !needsSubject(t)) return t.slice(0, max);
  const gist = questionGist(question, 20);
  if (!gist) return t.slice(0, max);
  return `${gist}：${t}`.slice(0, max);
}

// 🔎 トークンを使い切ったときの「メモを検索して探す」（2026-09-29）: 相談の文から、振り返りのメモ検索に入れる言葉を作る。
//   漢字・カタカナ・英数字のまとまり（2 文字以上）を、出てきた順に 3 つまで（空白で区切る＝どれかを含むメモを探す）。
//   ひらがなだけの相談など、言葉を取り出せないときは、相談の最初の 1 文をそのまま（20 文字まで）。
const SEARCH_STOP = new Set(['自分', '方法', '場合', '感じ', '最近', '毎回', '今日', '明日', '相談', '本当']);
export function memoSearchQuery(question, max = 3) {
  const t = unwrapContinue(oneLine(question));
  if (!t) return '';
  const words = [];
  (t.match(/[一-鿿々]+|[゠-ヿ]+|[A-Za-z0-9]+/g) || []).forEach((w) => {
    const k = w.replace(/^[ー・]+/, '').replace(/・+$/, '');
    if (k.length < 2 || SEARCH_STOP.has(k) || words.includes(k) || words.length >= max) return;
    words.push(k);
  });
  if (words.length) return words.join(' ');
  return firstSentence(t).replace(/[。．.]+$/, '').slice(0, 20);
}

// 🎯 相談の答えの一歩（「〜してください」の呼びかけ）を、行動リストの言い切りの形に直す（2026-09-29）。
//   「してみてください」→「してみる」、「〜てみてください」→「〜てみる」。
//   「してください」「しましょう」は、前が漢字・カタカナ 2 文字以上（確認／共有／メモ）なら「〜する」、
//   そうでなければ す で終わる動詞（残す／話す／書き出す／探す／渡す）とみなして「〜す」。
//   前が無い・「を」「に」・区切り・英字・名詞の「〜し」（「確認をしてください」「大切にしてください」
//   「後押ししてください」）は「する」。
//   ただし前の漢字が す の動詞にしかほぼ使わない字（残・探・渡…）なら、漢字が続いていても「〜す」
//   （「1行残してください」→「1行残す」「全部渡してください」→「全部渡す」）。
//   「話」は「会話・対話・電話…する」を除いて「〜話す」（「直接話してください」→「直接話す」）。
//   ※ 後読み（lookbehind）の正規表現は古い Safari で落ちるので使わない。
const ASK_TAIL = /(してください|しましょう)[。！!]?$/;
const SURU_NOUN = /[一-鿿々゠-ヿ]{2,}$/;
const SURU_AFTER = /(^|[をにし、。，,\sA-Za-zＡ-Ｚａ-ｚ])$/;
const SU_VERB_KANJI = /[残探渡返戻貸押試隠]$/;
const SURU_WA = /(会話|対話|電話|通話|談話|世話|発話)$/;
function isSuruHead(head) {
  if (SURU_AFTER.test(head)) return true;
  if (SU_VERB_KANJI.test(head)) return false;
  if (/話$/.test(head)) return SURU_WA.test(head);
  return SURU_NOUN.test(head);
}
export function answerStepToAction(text) {
  const t = String(text ?? '').trim();
  if (!t) return '';
  const tried = t
    .replace(/してみてください[。！!]?$/, 'してみる')
    .replace(/てみてください[。！!]?$/, 'てみる')
    .replace(/でみてください[。！!]?$/, 'でみる');
  if (tried !== t) return tried;
  const m = t.match(ASK_TAIL);
  if (!m) return t;
  const head = t.slice(0, t.length - m[0].length);
  return `${head}${isSuruHead(head) ? 'する' : 'す'}`;
}

// 💬 深掘りの会話（2026-09-30）: いま見えている会話（「新しい相談をはじめる」より後）から、
// 答えを書き終えたやりとり [{ question, answer }]（古い順）を、新しいものから max 組まで選ぶ。
//   - 失敗・案内（上限など）・書いている途中・中止・通信の中断で途中までの答えは入れない
//   - before（ISO 時刻）: その時刻以降の相談は入れない（「別の角度で答えて」＝同じ相談を答え直すとき）
//   - carry: 過去の相談の「この相談の続きを聞く」で持ってきた相談。もう送った（used）あとは会話の始まりとして入れる
//     （まだ送っていない間は、次の相談に prior として渡すのでここには入れない）
const THREAD_TEMP_ID = /^(err|streaming|bg-wait)-/;
const THREAD_STOPPED = '回答を中止しました。';
const THREAD_CUT_NOTE = /\n— (?:ここで中止しました|通信が中断された)/;
export function isCompletedAnswer(a) {
  if (!a || a.role !== 'assistant' || a.streaming || a.error || a.notice) return false;
  const text = String(a.content || '').trim();
  return !!text && text !== THREAD_STOPPED && !THREAD_CUT_NOTE.test(text);
}
export function selectThreadTurns(messages, { max = 3, before = null, carry = null } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const turns = [];
  if (carry && carry.used && String(carry.question || '').trim() && String(carry.answer || '').trim()) {
    turns.push({ question: String(carry.question), answer: String(carry.answer) });
  }
  list.forEach((m, i) => {
    if (!m || m.role !== 'user' || THREAD_TEMP_ID.test(String(m.id)) || !String(m.content || '').trim()) return;
    if (before && m.createdAt && m.createdAt >= before) return;
    const a = list[i + 1];
    if (!isCompletedAnswer(a)) return;
    // 本を探す問いの答え（本とメモの一節の一覧）は、続きの相談の文脈に入れない。
    //   次の「いまにどう活かす？」はふつうの最初の相談として答える（状況を 1 つ聞く・2026-09-30）。
    if (isBookLookup(m.content)) return;
    turns.push({ question: String(m.content), answer: String(a.content).trim() });
  });
  return max > 0 ? turns.slice(-max) : [];
}

// 深掘りのチップ（答えのあと・入力欄の上）。「ほかの本では…」は相談相手にメモのある本が 2 冊以上のときだけ。
export const FOLLOWUP_MORE = 'もっと具体的に';
export const FOLLOWUP_IF_FAIL = 'うまくいかなかったら？';
export const FOLLOWUP_OTHER_BOOKS = 'ほかの本ではどう言ってる？';
// チップの見た目は短く（送るのは上の文のまま・入力欄の上の 1 行で読めるように・2026-09-30 ui-critic）。
export const FOLLOWUP_OTHER_BOOKS_LABEL = 'ほかの本では？';
// lastAsked: いま送った相談の文。同じチップは出さない（続けて同じ聞き方を並べない・2026-09-30）。
// （2026-10-08 から答えのあとのチップは見方を変える 3 つ＝lensChips。これは前の形の深掘りの聞き方の一覧として残す）
export function followupChips({ booksWithMemos = 0, lastAsked = '' } = {}) {
  const sent = String(lastAsked || '').trim();
  return [FOLLOWUP_MORE, FOLLOWUP_IF_FAIL, ...(booksWithMemos >= 2 ? [FOLLOWUP_OTHER_BOOKS] : [])].filter((q) => q !== sent);
}

// 🔭 見方を変える 3 つのチップ（2026-10-08 オーナー承認・記事「視点・視野・視座」から）。答えのあと「もっと具体的に」
//   「別の角度で答えて」の代わりに置く。押すとすぐ送る。AI への頼み方は ai.js の turnHint（LENS）と BRAIN_SYSTEM ルール 10。
//   - 視点＝ほかの本の視点で: 同じ悩みに、直前の答えで使っていない別の本のメモを根拠に答え直す（メモのある本が 2 冊以上のときだけ）
//   - 視座＝2 つ上の立場なら: ユーザーの立場から 2 段上（担当なら部長・課長なら役員）の視点で考え直す
//   - 視野＝前と後ろの工程から: 自分の仕事の一つ前と一つ後ろの工程で、誰が何を指標に動いているかから原因を考え直す
export const LENS_CHIPS = {
  otherBook: { label: 'ほかの本の視点で', send: 'ほかの本の視点で、同じ悩みに答え直して' },
  up: { label: '2 つ上の立場なら', send: '2 つ上の立場なら、どう考えるかで答え直して' },
  flow: { label: '前と後ろの工程から', send: '仕事の前と後ろの工程から、原因を考え直して' },
};
// その相談が見方を変える頼みか（チップの送る文そのもの）→ 'otherBook' | 'up' | 'flow' | null。
export function lensOf(text) {
  const t = String(text || '').trim();
  const hit = Object.entries(LENS_CHIPS).find(([, c]) => c.send === t);
  return hit ? hit[0] : null;
}
//   work: 仕事の相談か（isWorkConsult）。「2 つ上の立場なら」「前と後ろの工程から」は仕事の言葉なので、仕事の相談のときだけ。
//   used: いまの区切りで使った見方（usedLenses）。使った見方は出さない（見方を回り続けない・2026-10-08 ui-critic）。
export function lensChips({ booksWithMemos = 0, work = true, used = [] } = {}) {
  const usedSet = new Set(Array.isArray(used) ? used : []);
  return [
    ...(booksWithMemos >= 2 ? [['otherBook', LENS_CHIPS.otherBook]] : []),
    ...(work ? [['up', LENS_CHIPS.up], ['flow', LENS_CHIPS.flow]] : []),
  ].filter(([k]) => !usedSet.has(k)).map(([, c]) => ({ ...c, kind: 'lens' }));
}

// 見方は 1 つの区切りで 2 つまで。2 つ使ったら「ここで答えと行動を」だけ（ゴールが見えるように）。
export const LENS_LIMIT = 2;
// いまの区切り（最後に行動を決めた答えより後）で使った見方 → ['up', …]。turns は [{ question, answer }]（古い順）。
export function usedLenses(turns) {
  let used = [];
  (Array.isArray(turns) ? turns : []).forEach((t) => {
    if (ACTION_SECTION_RE.test(String(t?.answer || ''))) { used = []; return; }
    const k = lensOf(t?.question);
    if (k && !used.includes(k)) used.push(k);
  });
  return used;
}

// 仕事の相談か（2026-10-08 ui-critic）。相談の文（この会話の相談たち）に仕事の言葉があるか、
//   相談相手に絞った本のタグ・書名が仕事の本（ビジネス・マネジメント・営業など）なら仕事。どちらも無ければ仕事ではない。
//   言葉は 2 段: 仕事にしか使わない語（部下・上司・会社・売上…）はそれだけで仕事。学校・部活・家庭でも使う語
//   （チーム・評価・担当・会議・報告・リーダー・先輩…）は、学校・家庭の言葉（子ども・学校・部活・先生・家族…）が無いときだけ仕事。
const WORK_STRONG_RE = /部下|上司|同僚|会社|職場|社員|顧客|お客様|取引|商談|営業|売上|案件|プロジェクト|業務|仕事|納期|昇進|転職|残業|クライアント|経営|部署|部長|課長|役員|事業|キャリア|出社|在宅勤務|給料|年収/;
const WORK_WEAK_RE = /チーム|組織|会議|評価|担当|報告|リーダー|マネジ|プレゼン|先輩|後輩|お客/;
const PRIVATE_RE = /子ども|子供|息子|娘|学校|部活|クラス|先生|保護者|PTA|受験|家族|家庭|夫|妻|親|友だち|友達|趣味|サークル/;
const WORK_BOOK_RE = /ビジネス|仕事|マネジメント|マネジャー|マネージャー|リーダー|営業|経営|組織|キャリア|会議|プレゼン|戦略|マーケティング|働き方|チーム|上司|部下/;
export function isWorkConsult({ texts = [], books = [] } = {}) {
  const t = (Array.isArray(texts) ? texts : [texts]).map((x) => String(x || '')).join(' ');
  if (WORK_STRONG_RE.test(t)) return true;
  if (WORK_WEAK_RE.test(t) && !PRIVATE_RE.test(t)) return true;
  return (Array.isArray(books) ? books : []).some((b) => {
    const tags = [...(Array.isArray(b?.tags) ? b.tags : []), ...(Array.isArray(b?.collections) ? b.collections : [])].join(' ');
    return WORK_BOOK_RE.test(`${tags} ${b?.title || ''}`);
  });
}
// 見方を変えた答えは問いで締めない（聞き返しにしない・2026-10-08 ui-critic）。答えの下に 1 行（LENS_NEXT_LINE）、
//   入力欄の上のチップは「ここで答えと行動を」（この見方で結論＋行動）と、まだ使っていないほかの見方（nextStepChips）。
export const LENS_NEXT_LINE = '「ここで答えと行動を」で、この見方から行動を 1 つ決めます';

// 🎯 行動は会話で決める（2026-09-30 オーナー要望「最初から勝手に行動を決めるのではなく、会話を進めていって行動を決めたい」）。
//   最初の答えは行動を決めず、【あなたに聞きたいこと】で状況を 1 つ聞く（問い 1 文＋答えの候補 2〜3 行「・会議の前」）。
//   候補は入力欄の上の返事のチップになる。行動は「行動を決める」のチップ（または自分の言葉）で頼んだときだけ。
export const ASK_REPLY_MAX = 3;
// 候補は 10 字以内と頼む。少しの超えは許し、12 字を超える行はチップにしない（入力欄の上の行で「行動を決める」の横に
//   読める長さ＝約 215pt・15px で 11 字ほど・2026-09-30 ui-critic）。
export const ASK_REPLY_CHARS = 12;
// 🏁 ゴールが見える相談（2026-10-08 オーナー「ひたすら質問が続いてゴールが見えない」）: 最初の聞き返しから
//   「ここで答えと行動を」（旧「行動を決める」と「ここまでで答えて」を 1 つに）。押すと聞き返さずに結論＋行動 1 つ。
export const DECIDE_CHIP = 'ここで答えと行動を';
export const DECIDE_REQUEST = 'ここまでの話で答えをまとめて、私がやる行動を 1 つ決めたい';
// 聞き返すのは 1 つの相談で最大 2 回まで。2 回答えたら、次の答えは聞き返さずに結論＋行動 1 つ（ai.js の turnHint）。
//   ユーザーが「もっと聞いて」と頼んだときだけ続けて聞く（wantsMoreAsk）。行動を決めた答えのあとは数え直す。
export const ASK_LIMIT = 2;
const ASK_SECTION_RE = /【\s*[^】]*聞きたい[^】]*】\s*([\s\S]*?)(?:\n\s*【|REFS_START|$)/;
const ACTION_SECTION_RE = /【\s*明日からできる[^】]*】/;
// その答えが状況を聞き返したか（【あなたに聞きたいこと】に問いがある・行動を決めた答えではない）。
export function answerAsks(text) {
  const t = String(text || '');
  if (ACTION_SECTION_RE.test(t)) return false;
  const m = t.match(ASK_SECTION_RE);
  return !!m && !!parseAskSection(m[1]).question;
}
// これまでのやりとり（[{ answer }]・古い順）で、いまの区切り（最後に行動を決めた答えより後）に何回聞き返したか。
//   見方を変えた答え（lensOf）の最後の「続けるかどうか」の問いは数えない（状況を聞き返したのではないため）。
export function countAsks(turns) {
  let n = 0;
  (Array.isArray(turns) ? turns : []).forEach((t) => {
    const a = String(t?.answer || '');
    if (ACTION_SECTION_RE.test(a)) n = 0;
    else if (answerAsks(a) && !lensOf(t?.question)) n += 1;
  });
  return n;
}
// 「もっと聞いて」と頼んだか（聞き返しの上限を超えても、もう 1 つ聞く）。
const WANTS_MORE_ASK_RE = /もっと(?:聞いて|質問して|たずねて)|(?:もう少し|もう\s*1\s*つ|もうひとつ|もう一つ)(?:聞いて|質問して)/;
export function wantsMoreAsk(text) {
  return WANTS_MORE_ASK_RE.test(String(text || ''));
}
// この回は聞き返さずに結論＋行動 1 つにするか（turnHint と、書いている途中の形を決める画面の両方が使う）。
//   followUp: 会話の続き（THREAD か前の相談がある）/ asked: これまでの聞き返しの回数（countAsks）。
export function shouldDecide({ followUp = false, question = '', asked = 0 } = {}) {
  if (!followUp || isBookLookup(question)) return false;
  // 見方を変える頼みは、聞き返しの回数に関係なく、その見方で答える（行動は決めない）。
  if (lensOf(question)) return false;
  if (wantsAction(question)) return true;
  return asked >= ASK_LIMIT && !wantsMoreAsk(question);
}
// 聞き返しの答えの下の 1 行（いまどこにいるか・13/--text-2）。k＝この答えまでの聞き返しの回数（countAsks）。
export function askProgressText(k) {
  if (!Number.isFinite(k) || k < 1) return '';
  return k < ASK_LIMIT ? 'あと 1 つ聞いたら、答えと行動をまとめます' : '次で答えと行動をまとめます';
}
// 候補の行の頭の印（指示は「・」。- * • → や「1.」も受ける）。
const ASK_REPLY_RE = /^\s*(?:[・•\-*→＞>]|[0-9０-９]+\s*[.．)）、])\s*(.+?)\s*$/;
// 【あなたに聞きたいこと】の中身 → { question, replies, rest }。
//   question: 候補の前の文（1 段落）/ replies: 候補（印を外す・かっこを外す・重複と長すぎる行は除く・最大 3）
//   rest: 候補の後ろに続く段落（お試しモードの注記など）。書いている途中（候補がまだ）でも question だけ返す。
export function parseAskSection(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const q = [];
  const replies = [];
  const rest = [];
  let phase = 'question';
  for (const raw of lines) {
    const line = raw.trim();
    if (phase === 'question') {
      if (!line) { if (q.length) phase = 'replies'; continue; }
      const m = line.match(ASK_REPLY_RE);
      if (m && q.length) { phase = 'replies'; replies.push(m[1]); continue; }
      q.push(line.replace(/^[\s:：]+/, ''));
      continue;
    }
    if (phase === 'replies') {
      if (!line) { if (replies.length) phase = 'rest'; continue; }
      const m = line.match(ASK_REPLY_RE);
      if (m) { replies.push(m[1]); continue; }
      phase = 'rest';
      rest.push(line);
      continue;
    }
    if (line) rest.push(line);
  }
  const seen = new Set();
  const clean = replies
    .map((r) => r.replace(/\*\*/g, '').replace(/^[「『"]+|[」』"]+$/g, '').replace(/[。．]$/, '').trim())
    .filter((r) => r && r.length <= ASK_REPLY_CHARS && !seen.has(r) && seen.add(r))
    .slice(0, ASK_REPLY_MAX);
  return { question: q.join('\n').replace(/\*\*/g, '').trim(), replies: clean, rest: rest.join('\n') };
}

// ユーザーが自分の言葉で行動を求めたか（「何をすれば」「どうしたら」「行動」「決めたい」など）。
//   相談の続き（会話・前の相談があるとき）で当たれば、AI に「今回は行動を 1 つ決める」と念を押す（ai.js の turnHint）。
//   書いている途中の形（行動の箱／問いの箱）を先に決めるのにも使う。
const WANTS_ACTION_RE = /(?:何|なに)を(?:すれば|したら|すべき|やれば|やったら)|どう(?:したら|すれば|すべき)|行動|決めたい|やることを/;
export function wantsAction(text) {
  return WANTS_ACTION_RE.test(String(text || ''));
}

// 「『…』みたいなことを書いた本はどれ？」のような、本を探す問いか（2026-09-30）。すべての本の検索の「相談で探す」が入れる問い。
//   本を探しているだけなので、最初の答えでも問い返さず・行動も出さず、当てはまる本とメモの一節だけを返す（ai.js の turnHint・BRAIN_SYSTEM ルール 5）。
const BOOK_LOOKUP_RE = /本はどれ|どの本|なんの本|何の本/;
export function isBookLookup(text) {
  return BOOK_LOOKUP_RE.test(String(text || ''));
}

// 本を探す問いの、探している言葉（「『断る』みたいなことを書いた本はどれ？」→「断る」）。
//   『』があればその中、無ければ探す言い回しを外した残り（30 字まで）。取れなければ ''。
export function lookupTerm(text) {
  const s = String(text || '').trim();
  const m = s.match(/『([^』]{1,60})』/);
  if (m) return m[1].trim();
  const rest = s
    .replace(/(?:みたいな|のような|ような)?(?:こと)?(?:を|が)?(?:書いた|書いていた|読んだ)?(?:のは)?(?:本はどれ|どの本|なんの本|何の本)[^。]*$/, '')
    .replace(/[「」『』？?。、\s]+/g, ' ')
    .trim();
  return [...rest].slice(0, 30).join('');
}

// 答えのあとの「次に」のチップ（入力欄の上の 1 行・押すとすぐ送る）。{ label, send, kind } の配列。
//   - 答えに問いの候補があれば: 候補（返事）→「行動を決める」（候補の答えを待っている間はほかの聞き方を並べない）
//   - 行動を決めた答え: もっと具体的に・うまくいかなかったら？（・ほかの本では）
//   - 行動も候補も無い答え（問いだけ・心に残るもの など）: 「行動を決める」→ もっと具体的に（・ほかの本では）
//   いま送った文と同じチップは出さない（「行動を決める」で答えが行動にならなかったとき、同じチップを繰り返さない）。
//   「別の角度で答えて」は画面の側で行の最後に足す。
// 🔎 本を探す問い（isBookLookup）の答えのあと（2026-09-30 ui-critic）: 行動・深掘り・別の角度のチップは出さず、
//   「いまにどう活かす？」（ふつうの最初の相談として送る＝いつもどおり問い返す）と、本が見つかったときだけ
//   「ほかにも書いてた？」。どちらの送る文も本を探す問いには当たらない（続けて送っても lookup にならない）。
export const LOOKUP_APPLY_CHIP = 'いまにどう活かす？';
export const LOOKUP_MORE_CHIP = 'ほかにも書いてた？';
export function lookupChips({ term = '', found = 0 } = {}) {
  const t = String(term || '').trim();
  const subject = t ? `『${t}』について書いたメモ` : 'このメモ';
  const list = [{ label: LOOKUP_APPLY_CHIP, send: `${subject}を、いまの自分にどう活かせる？`, kind: 'lookup' }];
  if (found > 0) list.push({ label: LOOKUP_MORE_CHIP, send: t ? `『${t}』に近いことを、ほかのメモにも書いていたら教えて` : 'これに近いことを、ほかのメモにも書いていたら教えて', kind: 'lookup' });
  return list;
}

// work: 仕事の相談か（isWorkConsult）/ used: いまの区切りで使った見方（usedLenses）。
export function nextStepChips({ replies = [], hasAction = false, booksWithMemos = 0, lastAsked = '', lookup = false, term = '', found = 0, work = true, used = [] } = {}) {
  const sent = String(lastAsked || '').trim();
  if (lookup) return lookupChips({ term, found }).filter((c) => c.send !== sent);
  const usedNow = [...new Set([...(Array.isArray(used) ? used : []), ...(lensOf(sent) && !hasAction ? [lensOf(sent)] : [])])];
  // 見方は 1 つの区切りで 2 つまで（2 つ使ったら出さない）。
  const lensesLeft = usedNow.length >= LENS_LIMIT ? [] : lensChips({ booksWithMemos, work, used: usedNow });
  // 🔭 見方を変えた答えのあと（行動を決めていない）: 「ここで答えと行動を」（この見方で結論＋行動）が先頭 → まだ使っていない見方。
  if (!hasAction && lensOf(sent)) {
    return [{ label: DECIDE_CHIP, send: DECIDE_REQUEST, kind: 'decide' }, ...lensesLeft];
  }
  const reply = (Array.isArray(replies) ? replies : []).slice(0, ASK_REPLY_MAX).map((r) => ({ label: r, send: r, kind: 'reply' }));
  const decide = { label: DECIDE_CHIP, send: DECIDE_REQUEST, kind: 'decide' };
  // label＝チップに出す文・send＝送る文（「ほかの本では？」と出して「ほかの本ではどう言ってる？」を送る）。
  const follow = (q, label = q) => ({ label, send: q, kind: 'followup' });
  const followOf = (q) => follow(q, q === FOLLOWUP_OTHER_BOOKS ? FOLLOWUP_OTHER_BOOKS_LABEL : q);
  // 🔭 2026-10-08: 「もっと具体的に」「別の角度で答えて」は、見方を変える 3 つ（lensChips）に置き換えた。
  //   行動を決めたあとは 3 つ＋「うまくいかなかったら？」、問いも行動も無い答えは「ここで答えと行動を」＋3 つ。
  //   問いに答えている間（返事の候補がある）は、候補＋「ここで答えと行動を」だけ（今までどおり）。
  //   行動を決めたあとは「うまくいかなかったら？」が先頭・見方は 2 つまで（2026-10-08 ui-critic）。
  let list;
  if (hasAction) list = [followOf(FOLLOWUP_IF_FAIL), ...lensChips({ booksWithMemos, work }).slice(0, LENS_LIMIT)];
  else if (reply.length > 0) list = [...reply, decide];
  else list = [decide, ...lensesLeft];
  return list.filter((c) => c.send !== sent);
}
