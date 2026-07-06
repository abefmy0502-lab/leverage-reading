// 検索結果が AI 推薦 / 手入力と「同じ本」と確信できるかの判定。誤マッチで間違った
// ISBN が保存され、後段の cover lookup で別の本の表紙が出る事故を防ぐため。
// 判定ルール:
//   - 著者がある場合: 互いの著者文字列が含み合いの関係であること
//   - タイトル: 完全一致 OR 「短い方が長い方の prefix」かつ shorter/longer ≥ 0.7
//   - 続編判定: prefix が一致しても、続く部分が「2」「上」「下」「続編」等の
//     巻数 / シリーズ表記なら別書誌扱い (例: 「1分で話せ」と「1分で話せ2」)。
//   タイトルの部分一致だけ (例: 共通の漢字「思考」) では一致と認めない。
//
// App.jsx（本追加フロー）と BookAdvisor（AI 選書）が共有するため lib に集約。

const _normTitle = (s) => (s || '').toString().normalize('NFKC').toLowerCase().replace(/[\s・()()\[\]【】「」『』:、,.。!?!?\-—‐−~〜:;]/g, '');
const _normAuthor = (s) => (s || '').toString().normalize('NFKC').toLowerCase().replace(/[\s・,、;:]/g, '');

// `longer` が `shorter` で始まる時、その続きの部分が「巻数 / 続編」を示すか。
// 「1分で話せ」と「1分で話せ2」を別書誌として扱うために導入。NFKC 後は
// 全角数字 / ローマ数字も半角・ラテン文字に正規化されているのでこの判定で OK。
function _suffixIsVolume(longer, shorter) {
  const tail = longer.slice(shorter.length);
  if (!tail) return false;
  // 数字始まり (続編 / 巻数: 「1分で話せ2」「ドラゴンボール3」等)
  if (/^\d/.test(tail)) return true;
  // ローマ数字 (NFKC で ii / iii / iv / v / vi ... に展開済み) — 末尾が数字判定っぽい
  if (/^(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)([^a-z]|$)/.test(tail)) return true;
  // よくある巻数 / 続編 / 章 表記。"超" は「ドラゴンボール超」のような明確な
  // 続編接尾を想定。"新装版 / 改訂版 / 文庫版" は同じ内容扱いにしたいので入れない。
  if (/^(上|下|前編|後編|続編|完結編|外伝|新章|別巻|超)/.test(tail)) return true;
  // 英語の vol / part 表記
  if (/^(vol|part|book|chapter|episode)/.test(tail)) return true;
  return false;
}

export function isStrictMatch(candidate, original) {
  const ct = _normTitle(candidate?.title);
  const ot = _normTitle(original?.title);
  if (!ct || !ot) return false;
  if (ct !== ot) {
    const longer = ct.length >= ot.length ? ct : ot;
    const shorter = ct.length >= ot.length ? ot : ct;
    if (!longer.startsWith(shorter)) return false;
    // 続編 (「1分で話せ」と「1分で話せ2」) は別書誌
    if (_suffixIsVolume(longer, shorter)) return false;
    if (shorter.length / longer.length < 0.7) return false;
  }
  if (original?.author) {
    const ca = _normAuthor(candidate?.author);
    const oa = _normAuthor(original.author);
    if (!ca || !oa) return false;
    if (!ca.includes(oa) && !oa.includes(ca)) return false;
  }
  return true;
}
