// 📚 AI が「本 1 冊」として出した欄（読書計画シートの関連書籍の 1 行・AI 選書の書名）に、
//    本が本当に 1 冊だけ入っているかを見る（2026-10-04・オーナー報告「似たような事象が起きないか」）。
//
// なぜ: AI は 1 つの欄に 2 冊を混ぜる（「『A』関連 または『B』」「A／B」「A シリーズ」「『A』（続編も）」）。
//   そのまま 1 枚のカード・「読みたいに追加」・Amazon のリンクにすると、どちらの本でもない 1 冊ができてしまう。
//   ここでは形だけを見る（実在は書誌で確かめる＝lib/bookCover.js の verifyBookExists）。
//   - mixed: false → そのまま 1 冊として扱ってよい形（title は 『』「」を外した書名）
//   - mixed: true  → 1 冊とは言えない形。candidates（確かめる順の書名）を 1 冊ずつ書誌で確かめ、
//                    見つかった 1 冊だけにする（見つからなければ出さない）。確かめるまでは画面に出さない。
// このモジュールは pure（ネットワークにも React にも依存しない）。

// 2 冊を「または」でつないだ形（書名の中の「または」は『』で囲まれていれば書名として扱う＝ここには来ない）。
const ALT_SPLIT_RE = /\s*(?:または|もしくは|あるいは|ないしは)\s*|\s+or\s+|\s*[／]\s*|\s+\/\s+/i;
// 書名の後ろに付いた説明（「関連」「シリーズ」「など」）。
const TAIL_WORD_RE = /\s*(?:に関連する本|の関連書籍|関連(?:書籍|書|本|図書)?|シリーズ(?:全般|全巻|各巻)?|など|ほか|等)\s*$/;
// 書名の後ろの説明のかっこ（「（続編も）」「（シリーズ）」「(関連書)」）。巻（「（上）」）や副題のかっこは説明ではない。
const TAIL_PAREN_RE = /\s*[（(][^（）()]*(?:も|シリーズ|続編|関連|など|ほか|全巻|いずれか|どちらか)[^（）()]*[）)]\s*$/;

const squeeze = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// 書名らしい長さ・形か（文や説明の見出しを本として扱わない）。
//   2〜40 字・文の終わりの記号（。！？）やコロンが無い。
export function looksLikeSingleTitle(s) {
  const t = squeeze(s);
  if (t.length < 2 || t.length > 40) return false;
  if (/[。！？!?：:]/.test(t)) return false;
  return true;
}

// 書名の欄を読む。返り値 { title, mixed, candidates }。
//   candidates: 確かめる順の書名（重複なし・最大 3）。mixed: false のときは [title]。
export function splitBookTitle(raw) {
  let s = squeeze(raw);
  if (!s) return { title: '', mixed: false, candidates: [] };
  // 『』で囲んだ書名が 2 つ以上 → 2 冊を混ぜている（『A』または『B』・『A』『B』）
  const quoted = [...s.matchAll(/『([^』]+)』/g)].map((m) => squeeze(m[1])).filter(Boolean);
  if (quoted.length >= 2) return { title: quoted[0], mixed: true, candidates: [...new Set(quoted)].slice(0, 3) };
  if (quoted.length === 1) {
    const rest = squeeze(s.replace(/『[^』]+』/, ''));
    // 『』の外に言葉がある（「『A』関連」「『A』（続編も）」）→ 1 冊とは言えない。候補は『』の中の書名。
    if (rest) return { title: quoted[0], mixed: true, candidates: [quoted[0]] };
    // 『』だけ → 中身がそのまま書名（書名の中の「または」も書名の一部とみなす）
    return { title: quoted[0], mixed: false, candidates: [quoted[0]] };
  }
  // 全体を「」で囲んだ書名は外す
  const bracket = s.match(/^「([^「」]+)」$/);
  if (bracket) s = squeeze(bracket[1]);
  let mixed = false;
  // 後ろの説明（「関連」「シリーズ」「（続編も）」）を外す
  for (let k = 0; k < 3; k += 1) {
    const next = squeeze(s.replace(TAIL_PAREN_RE, '').replace(TAIL_WORD_RE, ''));
    if (next === s || !next) break;
    s = next;
    mixed = true;
  }
  // 「A または B」「A／B」→ 2 冊。まるごと（本当にそういう書名のこともある）→ A → B の順に確かめる。
  const parts = s.split(ALT_SPLIT_RE).map((p) => squeeze(p.replace(/^「|」$/g, '').replace(TAIL_WORD_RE, ''))).filter(Boolean);
  if (parts.length >= 2) {
    return { title: parts[0], mixed: true, candidates: [...new Set([s, ...parts])].slice(0, 3) };
  }
  return { title: s, mixed, candidates: s ? [s] : [] };
}
