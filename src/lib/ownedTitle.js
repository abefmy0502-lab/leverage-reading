// 📚 「もう本棚にある本か」を書名で見る（読書計画シートの関連書籍の「追加済み」・2026-11-18〜19 本番の確かめ）。
//   空白・記号を除いて同じなら同じ本。AI が書名と副題の順を入れ替えて書くこともある
//   （本棚「確率思考の戦略論USJでも実証された…」↔ カード「USJでも実証された… 確率思考の戦略論」）ので、
//   空白で区切った各部分（2 字以上）がすべて本棚の書名に含まれ、長さもほぼ同じ（9 割以上）なら同じ本とみなす。
import { flatTitle } from '../../api/_bookVerify.js';

export function sameBookTitle(a, b) {
  const fa = flatTitle(a);
  const fb = flatTitle(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const partsIn = (text, whole) => {
    const parts = String(text || '').normalize('NFKC').split(/[\s　:：―—–\-〜~]+/).map(flatTitle).filter((p) => p.length >= 2);
    if (parts.length < 2) return false;
    const total = parts.reduce((n, p) => n + p.length, 0);
    return total >= whole.length * 0.9 && total <= whole.length * 1.1 && parts.every((p) => whole.includes(p));
  };
  return partsIn(a, fb) || partsIn(b, fa);
}

/** 本棚（books）に同じ書名の本があるか。 */
export function onShelfByTitle(books, title) {
  return (Array.isArray(books) ? books : []).some((x) => x?.title && sameBookTitle(x.title, title));
}
