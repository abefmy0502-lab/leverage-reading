// 📚 AI 選書の推薦カード（RECOMMENDATIONS の JSON）を、画面に出す前に整える（2026-10-04）。
//
// なぜ（オーナー報告「似たような事象が起きないか」・読書計画シートの「『A』関連 または『B』」と同じ型）:
//   - 書名の欄に 2 冊が入る（「A または B」「『A』『B』」「A シリーズ」）と、どちらの本でもない 1 枚のカード・
//     「読みたいに追加」・Amazon のリンクになる。実在の確かめも、2 冊ぶんの書名では当たらない。
//   - JSON に頼んでいない cover / isbn を AI が付けると、確かめていない表紙・ISBN がそのまま使われていた
//     （画像が開けさえすれば別の本の表紙でも載る・ISBN は本棚に保存される）。
//   - 「注目ポイント」に章番号（「第3章」）を書かせていた。AI は目次を持っていないので、章番号は推測＝事実のように見せない。
// このモジュールは pure（ネットワークに出ない。確かめる関数は呼び出し側が渡す）。
import { splitBookTitle } from './bookItemShape';

// AI が書いた 1 冊を整える。返り値は新しいオブジェクト（null＝書名が無い）。
//   - 書名は『』「」を外す。2 冊を混ぜた形なら _alts（確かめる順の書名）を付ける（確かめて 1 冊にするまで画面に出さない）
//   - AI が付けた cover / isbn は捨てる（表紙と ISBN は書誌で確かめた結果からだけ付ける）
//   - _verify（確かめた結果）はそのまま（保存済みの会話を開き直したとき）
export function normalizeAdvisorRec(rec) {
  if (!rec || typeof rec.title !== 'string') return null;
  // もう整えたカード（2 冊を混ぜた書名の候補 _alts つき）はそのまま（2 回かけても同じ＝候補を落とさない）
  if (Array.isArray(rec._alts) && rec._alts.length > 0) return rec;
  const shape = splitBookTitle(rec.title);
  if (!shape.title) return null;
  const { cover: _aiCover, isbn: _aiIsbn, _alts: _oldAlts, ...rest } = rec;
  const out = { ...rest, title: shape.title, author: String(rec.author || '').trim() };
  // 確かめた結果を持つ（保存済みの）カードは、確かめたときの表紙・ISBN を残す
  if (rec._verify === 'ok') {
    if (_aiCover) out.cover = _aiCover;
    if (_aiIsbn) out.isbn = _aiIsbn;
  }
  if (shape.mixed) {
    out._alts = shape.candidates;
    delete out._verify; // 2 冊を混ぜた書名のまま確かめた結果は使わない（確かめ直す）
  }
  return out;
}

export function normalizeAdvisorRecs(recs) {
  return (Array.isArray(recs) ? recs : []).map(normalizeAdvisorRec).filter(Boolean);
}

// 2 冊を混ぜたカードを、書誌で確かめて 1 冊にする。
//   verify: ({ title, author }) => Promise<{ exists, isbn?, cover?, candidates? }>（lib/bookCover.js の verifyBookExists）
//   返り値 { rec, v }: 見つかった 1 冊の書名にしたカードと、その確かめた結果。
//   どれも見つからない・確かめられない → v.exists は false / null・rec._mixed = true（画面には出さない）
export async function resolveMixedRec(rec, verify, { pause = 0 } = {}) {
  const alts = Array.isArray(rec?._alts) ? rec._alts : [];
  let unknown = false;
  for (let i = 0; i < alts.length; i += 1) {
    if (i > 0 && pause > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, pause); });
    }
    let v = { exists: null };
    try {
      // eslint-disable-next-line no-await-in-loop
      v = (await verify({ title: alts[i], author: rec.author })) || { exists: null };
    } catch { v = { exists: null }; }
    if (v.exists === true) {
      const { _alts, ...base } = rec;
      return { rec: { ...base, title: alts[i] }, v };
    }
    if (v.exists !== false) unknown = true;
  }
  const { _alts, ...base } = rec;
  return { rec: { ...base, _mixed: true }, v: { exists: unknown ? null : false } };
}

// 「注目ポイント」（focus）に章・部・節の番号やページを書いていたら出さない（AI は目次を持っていない＝推測）。
const CHAPTER_CLAIM_RE = /第\s*[0-9０-９一二三四五六七八九十百]+\s*[章部節編回]|[0-9０-９]+\s*章|chapter\s*\d|part\s*\d|[pP]\.\s*\d|[0-9０-９]+\s*ページ/i;
export function focusText(focus) {
  const s = String(focus || '').trim();
  if (!s) return '';
  return CHAPTER_CLAIM_RE.test(s) ? '' : s;
}

// 確かめ終わってカードが 0 枚のときの言い方（2026-10-04 ui-critic）。
//   'none'＝外したカードの書名がどれも「無い」と分かった（同じ相談を送り直しても同じ → 別の条件で探す）
//   'unknown'＝確かめられなかったものがある（通信など → もう一度）。カードがあれば null。
//   dropped: 外したカードの確かめた結果（exists: true | false | null）
export function emptyReasonOf(items, dropped) {
  if (Array.isArray(items) && items.length > 0) return null;
  const list = Array.isArray(dropped) ? dropped : [];
  return list.length > 0 && list.every((x) => x === false) ? 'none' : 'unknown';
}
