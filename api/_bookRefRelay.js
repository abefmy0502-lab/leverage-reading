// 📚 読書計画シートに「書評の参考」をサーバーで足す（2026-11-17 オーナー「iPhone のアプリにもサーバー側で届くようにして」）。
//   新しいアプリ（Web）は自分で「書評の参考」を付けて送る（src/lib/bookRef.js）。iPhone の今の版は付けないので、
//   中継（api/claude.js）がここで書名と著者を AI への文から読み取り、推薦用の本のデータ（advisor_books＋advisor_book_ext）
//   から同じ本を探して、出力の形の指示の前に塊を差し込む。
//   - 用途は読書計画シート（setup_sheet）だけ。この本で学べること（book_brief）は今のアプリが「紹介と目次に無い語」の
//     行を消すので、書評の要約に頼った行が消えて空になりうる＝アプリの出し直しで届ける。
//   - 同じ本だけ: 書名がまるごと同じ（副題まで・記号と空白を除いて）で、著者も合うとき。別の版に別の本のデータを渡さない。
//   - もう「===== 書評の参考」が入っていれば何もしない。探せない・遅い（1.5 秒）ときも何もしない＝今までどおり。
import { flatTitle, authorMatches } from './_bookVerify.js';

export const REF_MARK = '===== 書評の参考';
export const REF_PURPOSES = new Set(['setup_sheet']);
const LOOKUP_MS = 1500;
const SUMMARY_MAX = 500;
const ANCHOR = '\n次のフォーマットで出力してください';

/** AI への文から書名と著者（読書計画シートの形「- 本のタイトル: …」「- 著者: …」）。 */
export function bookFromSheetPrompt(text) {
  const s = String(text || '');
  const t = s.match(/^- 本のタイトル: (.+)$/m);
  if (!t) return null;
  const a = s.match(/^- 著者: (.+)$/m);
  const author = a ? a[1].trim() : '';
  return { title: t[1].trim(), author: author === '不明' ? '' : author };
}

/** 推薦用の本のデータの行から、この本と同じ 1 冊（書名がまるごと同じ＋著者が合う）。 */
export function pickSameBook(rows, { title, author }) {
  const want = flatTitle(title);
  if (!want || want.length < 2) return null;
  return (Array.isArray(rows) ? rows : []).find((r) => {
    const names = [flatTitle(r.title), flatTitle(`${r.title || ''} ${r.subtitle || ''}`)];
    if (!names.includes(want)) return false;
    return !author || !r.author || authorMatches(author, r.author);
  }) || null;
}

/** 差し込む塊（新しいアプリの src/lib/bookRef.js の refForPrompt と同じ形＋今のアプリの指示文に無い決まりを 1 行）。 */
export function refBlockText(book, ext) {
  const lines = [];
  const d = Number(book?.difficulty);
  const prereq = String(book?.prereq || '').trim();
  const label = { 1: '入門', 2: '中級', 3: '上級' }[d];
  if (label) lines.push(`- 難しさ: ${label}${prereq ? `（前提: ${prereq}）` : ''}`);
  else if (prereq) lines.push(`- 前提知識: ${prereq}`);
  const endorsers = Array.isArray(ext?.endorsers) ? ext.endorsers.length : 0;
  if (endorsers) lines.push(`- この本をすすめた人: ${endorsers} 人`);
  const summary = String(ext?.summary || '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_MAX);
  if (summary) lines.push(`- 書評サイトの要約（参考・言い回しを写さない）: ${summary}`);
  if (lines.length === 0) return '';
  lines.push('- 使い方: 主張のつかみ方・重点の選び方の参考にしてよい（章の名前は目次からだけ・言い回しを写さない・書評サイトや推薦した人の名前を書かない）。難しさが上級か前提知識があるときは「注意点・落とし穴」に、前もって押さえておくことを 1 行。');
  return `\n${REF_MARK}（難しさ・書評サイトの要約・データ・言い回しを写さない） =====\n${lines.join('\n')}\n===== 書評の参考ここまで =====\n`;
}

/** 文に塊を差し込む（出力の形の指示の前・無ければ差し込まない）。 */
export function insertRef(text, block) {
  const s = String(text || '');
  const i = s.indexOf(ANCHOR);
  if (!block || i < 0 || s.includes(REF_MARK)) return s;
  return s.slice(0, i) + block + s.slice(i);
}

const cache = new Map();
async function lookup(db, book) {
  const key = `${flatTitle(book.title)}|${book.author}`;
  if (cache.has(key)) return cache.get(key);
  const head = String(book.title).split(/[\s:：―—(（]/)[0].replace(/[%_\\]/g, '').slice(0, 30);
  if (head.length < 2) return '';
  const { data: rows, error } = await db.from('advisor_books')
    .select('isbn, title, subtitle, author, difficulty, prereq')
    .ilike('title', `${head}%`).in('status', ['ready', 'thin']).limit(20);
  if (error) return '';
  const hit = pickSameBook(rows, book);
  let block = '';
  if (hit) {
    const { data: ext } = await db.from('advisor_book_ext').select('endorsers, summary').eq('isbn', hit.isbn).maybeSingle();
    block = refBlockText(hit, ext || null);
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, block);
  return block;
}

/**
 * 中継が組み立てた messages の最後の利用者の文に、書評の参考を足す（足さないときは同じ配列を返す）。
 * 失敗・遅いときは何もしない。
 */
export async function addBookRef({ db, purpose, messages, timeoutMs = LOOKUP_MS }) {
  if (!db || !REF_PURPOSES.has(purpose) || !Array.isArray(messages) || messages.length === 0) return messages;
  const idx = messages.length - 1;
  const m = messages[idx];
  if (m?.role !== 'user') return messages;
  const textOf = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : '';
  if (!textOf || textOf.includes(REF_MARK) || !textOf.includes(ANCHOR)) return messages;
  const book = bookFromSheetPrompt(textOf);
  if (!book) return messages;
  let block = '';
  try {
    block = await Promise.race([lookup(db, book), new Promise((r) => { setTimeout(() => r(''), timeoutMs); })]);
  } catch { block = ''; }
  if (!block) return messages;
  const out = messages.slice();
  if (typeof m.content === 'string') {
    out[idx] = { ...m, content: insertRef(m.content, block) };
  } else {
    let done = false;
    out[idx] = { ...m, content: m.content.map((b) => {
      if (done || b?.type !== 'text' || !b.text.includes(ANCHOR)) return b;
      done = true;
      return { ...b, text: insertRef(b.text, block) };
    }) };
  }
  return out;
}
