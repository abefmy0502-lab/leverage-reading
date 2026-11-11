// 📕 表示用の書名（2026-11-11）
//   国会図書館などの書誌から入った本は、書名に並列書名（「イシューからはじめよ ＝ ISSUE DRIVEN+」）や
//   副題（「 : 知的生産の「シンプルな本質」」）が付いたまま保存されていることがある。
//   画面に本の名前として出すときだけ、その前までを書名にする（保存した書名は変えない・検索や重複の判定にも使わない）。
//   - 「＝」「=」の後ろが英字で始まるときだけ並列書名とみなす（「7=3」のような式は切らない）
//   - 副題の区切りは 「：」・空白つきの「:」「—」「―」。前が 3 字以上で、かな・漢字を含むときだけ
//   - 切ったあとが空なら元のまま
const PARALLEL = /^(.{2,}?)\s*[＝=]\s+(?=[A-Za-z])/;
// 副題の前は 3 字以上で、かな・漢字を 1 字以上含む（「Re：ゼロから始める…」の英字の頭は切らない・2026-11-11 ui-critic）
const SUBTITLE = /^(?=.{3,})(?=[^：]*[\u3040-\u30ff\u3400-\u9fff])(.+?)\s*(?:：|\s:\s|\s—\s|\s―\s)/;
export function displayTitle(title) {
  const raw = String(title || '').replace(/\s+/g, ' ').trim();
  let s = raw;
  const eq = s.match(PARALLEL);
  if (eq && eq[1].trim()) s = eq[1].trim();
  const m = s.match(SUBTITLE);
  if (m && m[1].trim()) s = m[1].trim();
  return s || raw;
}
