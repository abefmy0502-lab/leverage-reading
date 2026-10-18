// 短い 1 文か（2026-10-18 ui-critic）。読書中の「この本から得たいこと」の組み方を長さで分ける。
//   短い文（カードで 2 行に収まる 34 字まで）は文節で折り返す＝語の途中で割らない（「伸ばし／たい」を防ぐ）。
//   長い文は文節で区切らず流す＝3 行を目いっぱい使う（文節が入らずに行末が大きく空くのを防ぐ）。
export const SHORT_PHRASE_MAX = 34;

export function isShortPhrase(text) {
  return Array.from(String(text || '').trim()).length <= SHORT_PHRASE_MAX;
}
