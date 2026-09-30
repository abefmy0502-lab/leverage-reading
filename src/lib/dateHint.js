// 📅 空の日付の欄に出す案内（iOS だけ・index.css の input[type=date][data-empty]::before が読む）。
// iOS の WKWebView は、端末の見た目を外した（appearance: none）空の日付の欄を何も書いていない箱にするため、
// 空のときだけ data-empty にこの文を入れて、欄の中に薄い文字で出す（2026-10-01）。
export const DATE_HINT = '日付を選ぶ';
