// 📚 楽天ブックスのジャンル ID（booksGenreId）を読む（2026-10-11・本の分野を決める手がかり）。
//
// 楽天の書籍検索は 1 冊に「001004008001/001019001」のようにジャンル ID を返す（複数は / 区切り・
// 本は 001 で始まり、3 桁ずつ深くなる）。ここでは形を確かめて配列にするだけ（意味は端末の
// src/lib/bookFields.js の GENRE_RULES で分野に結びつける）。
const GENRE_RE = /^001(?:\d{3}){0,5}$/;

export function parseGenreIds(raw) {
  return [...new Set(String(raw || '').split(/[/,\s]+/).map((s) => s.trim()).filter((s) => GENRE_RE.test(s)))].slice(0, 8);
}
