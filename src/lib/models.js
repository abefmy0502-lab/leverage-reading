// 🤖 AI モデルの単一の真実（コスト/スピード最適化の 2 層ルーティング）。
//
// 方針:
//   - ADVISOR: AI 選書の推薦だけ（実在の本を挙げる＝知識量が効く）。Sonnet 5。
//   - SMART: 相談 / 読書計画シート / 運営の作戦会議。
//       2026-09-27 から Haiku 4.5（原価を約半分に。有料会員 1 人から ¥900 を残す上限 ¥243 で
//       相談なら月 80 回前後）。品質を戻すときはこの定数を 'claude-sonnet-5' に。
//   - FAST : 写真OCRの書き起こし / 凝縮 / カード→まとめ要約 / 週の問い / ヒアリング質問生成。
//
// コスト目安（Anthropic, 入力/出力 per 1M tokens）:
//   ADVISOR = Sonnet 5 … $2 / $10（2026-09-27 に公式で確認）
//   SMART = FAST = Haiku 4.5 … $1 / $5
//
// ⚠️ モデルを戻したい/変えたい時は **この 3 定数だけ** を変更する。あわせて
//    api/claude.js の ALLOWED_MODELS（サーバー側の許可リスト）と、原価の単価表
//    api/_aiCost.js の PRICES も更新すること（無い単価は高めに数えて上限が早く来る）。
// 🧭 2026-10-01〜: アプリは呼び出しごとに用途（purpose）も送り、どの会社のどのモデルで答えるかは
//    サーバー（api/_aiRouting.js・docs/ai-routing.md）が決める。相談と AI 選書の推薦は Claude、読書計画シート・
//    ヒアリング・凝縮・まとめ・写真の書き起こしは Google Gemini、運営の相談だけ OpenAI（失敗したら Claude）。
//    ここの定数は「用途を知らないサーバー」と「Claude に戻すとき」に使う Claude のモデル。
// 2026-09-27 オーナー裁定: AI 選書（推薦）だけ Sonnet 5、ほかはすべて Haiku 4.5（原価を約半分に・
// 同じ上限で相談できる回数を約 2 倍に）。MODEL_SMART は「品質が効く機能」の名前のまま Haiku を指す。
export const MODEL_SMART = 'claude-haiku-4-5';
// 🔍 AI 選書の推薦だけに使う（実在の本を AI の知識から挙げるので、存在しない本・著者違いを
//    減らすため大きいモデルに残す）。BookAdvisor.jsx の推薦の呼び出しが使う。
export const MODEL_ADVISOR = 'claude-sonnet-5';
export const MODEL_FAST = 'claude-haiku-4-5';

export default { MODEL_SMART, MODEL_FAST, MODEL_ADVISOR };
