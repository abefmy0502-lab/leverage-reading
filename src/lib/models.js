// 🤖 AI モデルの単一の真実（コスト/スピード最適化の 2 層ルーティング）。
//
// 方針:
//   - SMART: 推論品質が体験を左右する機能に使う。
//       選書の推薦 / マイ読書脳(自分のメモ根拠の回答) / テーマまとめ / 学び分析 /
//       知識の足あと / 読書計画シート / 運営の作戦会議。
//   - FAST : 定型・低リスクで品質差が出にくい処理に使う（約 1/3 価格・高速）。
//       写真OCRの書き起こし / 凝縮 / カード→まとめ要約 / 週の問い / ヒアリング質問生成。
//
// コスト目安（Anthropic, 入力/出力 per 1M tokens）:
//   SMART = Sonnet 5   … $3 / $15（2026-08-31 まで導入価格 $2 / $10）
//   FAST  = Haiku 4.5  … $1 / $5
//
// ⚠️ モデルを戻したい/変えたい時は **この 2 定数だけ** を変更する。あわせて
//    api/claude.js の ALLOWED_MODELS（サーバー側の許可リスト）も更新すること。
export const MODEL_SMART = 'claude-sonnet-5';
export const MODEL_FAST = 'claude-haiku-4-5';

export default { MODEL_SMART, MODEL_FAST };
