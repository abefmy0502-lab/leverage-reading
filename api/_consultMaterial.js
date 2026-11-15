// 🧹 相談の材料から、本の概要（あなたのメモではないもの）を外す（2026-11-15 オーナー「本の概要の情報を相談の根拠にされるのは微妙」）。
//   ① 読んだ本の公開の紹介・目次（EARLY_SHELF の塊・メモが 10 件未満の人に補足で付けていた・src/lib/earlyShelf.js）
//   ② AI が作った本のまとめ（books.ai_summary＝「種別: AI 解析（著者の意図・主な主張）」の行・src/lib/ai.js の SYNTH_LABEL）
//   ③ 読書計画シート（books.ai_strategy＝「種別: 読書計画シート」の行・AI が書いた「この本の概要」から始まる・同日オーナーのスクショで「参照したメモ」に出ていた）
// アプリ（1.0.0）はまだ付けて送ってくるので、中継で外す（アプリの出し直しを待たずに効く）。1.0.1 からはアプリも付けない。
// 積読の本の紹介（UNREAD_BOOKS）は「この本が合いそう」と提案するためだけに使うので残す。

const EARLY_SHELF_RE = /={3,} EARLY_SHELF_START ={3,}[\s\S]*?={3,} EARLY_SHELF_END ={3,}\n?/g;
// 【本: … / 種別: AI 解析（著者の意図・主な主張）】本文 … を、次の「\n【」か「\n=====」か終わりまで
const AI_SUMMARY_RE = /【[^【】\n]*種別: (?:AI 解析（著者の意図・主な主張）|読書計画シート)】[\s\S]*?(?=\n【|\n={3,}|$)\n?/g;

export function stripBookSummaries(text) {
  if (typeof text !== 'string' || !text) return text;
  if (!text.includes('EARLY_SHELF_START') && !text.includes('AI 解析（著者の意図・主な主張）') && !text.includes('種別: 読書計画シート')) return text;
  return text.replace(EARLY_SHELF_RE, '').replace(AI_SUMMARY_RE, '');
}
