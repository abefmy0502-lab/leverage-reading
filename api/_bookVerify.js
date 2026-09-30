// 📖 AI 選書の「この本は実在するか」の判定（api/cover.js の ?verify=1 が使う・2026-09-30）。
//
// なぜ: それまでの実在判定は「/api/cover が ISBN を 1 つでも返せたら実在」だった。表紙を探す
//   ための照合はわざとゆるく（副題違い・短い書名も拾う）、しかも AI が付けた ISBN はそのまま
//   信用していたので、実在しそうな頭を持つ架空の書名（例『BtoB営業を成功させるSPIN営業術』。
//   本物は『大型商談を成約に導く「SPIN」営業術』）でも、何かの検索結果に引っかかれば実在扱いになっていた。
//
// 決まり（findStrongMatch）: 検索元（楽天・NDL・Google）が返した本の中に、次の両方を満たす本が 1 冊でもあれば実在:
//   1. 書名がはっきり一致する（strongTitleMatch）
//      - 記号・空白・版の頭（完訳・新版…）を落としてまるごと同じ
//      - 副題の前までが同じで、片方がもう片方の頭にある（「エッセンシャル思考」↔「エッセンシャル思考 最少の時間で…」）
//      - 副題の前までが同じで、それが 4 文字以上かつ書名全体の 4 割以上（副題の書き方が少し違うだけ）
//      - 2 文字ずつの重なり（Dice 係数）が 0.85 以上（送り仮名・「の」の有無くらいの揺れ）
//      ※「相手の書名が要求の書名に含まれる」（短い書名に何でも当たる）では一致としない
//   2. 著者を渡したときは著者も一致する（authorMatches・「姓, 名」の順の入れ替えも同じ人とみなす）。
//      検索結果に著者が無いときは、書名がまるごと同じときだけ認める。
// このモジュールは pure（ネットワークに出ない）。テストは api/_bookVerify.test.js。

const EDITION_PREFIX = /^(?:[【[(（〔]?\s*(?:完訳|新訳|新版|改訂新版|増補改訂版|改訂版|増補版|決定版|新装版)\s*[】\])）〕]?[\s:：・]*)+/;
const CORE_SEP = /[\s:：―—–\-(（[［【〔〜~|｜／/]/;
const FLAT_DROP = /[\s「」『』【】[\]［］（）()〔〕〈〉《》・･·:：―—–\-〜~!！?？、,，.。'"“”‘’*＊]/g;

function base(raw) {
  const t = String(raw || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const rest = t.replace(EDITION_PREFIX, '').trim();
  return rest.length >= 2 ? rest : t;
}
export function flatTitle(raw) {
  return base(raw).replace(FLAT_DROP, '');
}
export function coreOfTitle(raw) {
  const t = base(raw);
  return (t.split(CORE_SEP)[0] || t).replace(FLAT_DROP, '');
}

function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}
export function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let inter = 0;
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

/** 要求の書名（AI が挙げた書名）と検索結果の書名が、同じ本とはっきり言えるか。 */
export function strongTitleMatch(want, got) {
  const fw = flatTitle(want);
  const fg = flatTitle(got);
  if (!fw || !fg) return false;
  if (fw === fg) return true;
  const cw = coreOfTitle(want);
  const cg = coreOfTitle(got);
  if (cw && cw === cg && cw.length >= 2) {
    const [short, long] = fw.length <= fg.length ? [fw, fg] : [fg, fw];
    if (long.startsWith(short)) return true;
    if (cw.length >= 4 && cw.length >= fw.length * 0.4) return true;
  }
  return diceSimilarity(fw, fg) >= 0.85;
}

// 著者名の比較用（NFKC・小文字・生没年・役割（著/訳/編…）・かっこ書きを落とす）。
function personKey(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[(（[［][^)）\]］]*[)）\]］]/g, '')
    .replace(/\d{3,4}\s*-\s*\d{0,4}/g, '')
    .replace(/(共著|編著|監修|監訳|著|編|訳|ほか)\s*$/g, '')
    .replace(/[\s　・･·.．,，'’]/g, '');
}
// 「ラッカム, ニール」（NDL の姓, 名）と「ニール・ラッカム」を同じ人とみなすための別の並び。
function personVariants(s) {
  const raw = String(s || '').normalize('NFKC');
  const out = new Set();
  const k = personKey(raw);
  if (k) out.add(k);
  const parts = raw.split(/[,，]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    const rev = personKey(`${parts[1]} ${parts[0]}`);
    if (rev) out.add(rev);
  }
  return [...out];
}
// 連名を 1 人ずつに分ける（楽天「A/B」・「A、B」・「A; B」）。「姓, 名」の読点ではないカンマは割らない。
function splitPeople(s) {
  return String(s || '')
    .normalize('NFKC')
    .split(/[/／、;；&＆]|\s+and\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** 要求の著者（AI が挙げた著者）が、検索結果の著者のだれかと同じ人か。 */
export function authorMatches(want, gotAuthors) {
  const wants = splitPeople(want).flatMap(personVariants).filter((k) => k.length >= 2);
  if (wants.length === 0) return true; // 著者の指定なし＝照合しない
  const gots = (Array.isArray(gotAuthors) ? gotAuthors : [gotAuthors])
    .flatMap(splitPeople)
    .flatMap(personVariants)
    .filter((k) => k.length >= 2);
  if (gots.length === 0) return false;
  return wants.some((w) => gots.some((g) => g.includes(w) || w.includes(g)));
}

/**
 * 検索元が返した本（{ title, authors: string[]|string, isbn, cover?, src }）から、
 * 要求の (title, author) と同じ本を 1 冊返す（無ければ null）。
 */
export function findStrongMatch(items, title, author) {
  const wantAuthor = String(author || '').trim();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !it.title) continue;
    if (!strongTitleMatch(title, it.title)) continue;
    const authors = Array.isArray(it.authors) ? it.authors.filter(Boolean) : [it.authors].filter(Boolean);
    if (!wantAuthor) return it;
    if (authors.length === 0) {
      if (flatTitle(title) === flatTitle(it.title)) return it;
      continue;
    }
    if (authorMatches(wantAuthor, authors)) return it;
  }
  return null;
}
