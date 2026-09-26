// 📮 問い合わせ先の唯一の真実（single source of truth）。
//
// プレミアム（有料プロダクト）としての信頼性のため、将来は独自ドメインの
// アドレス（例: support@orime.app）に差し替える想定。差し替えはこの 1 行だけ
// 変えれば全画面（エラー画面・設定・特商法・プライバシー・LP フッター）に反映される。
//
// ※ 元帥へ: 独自ドメインのメールが用意でき次第、下の値を差し替えてください。
// VITE_SUPPORT_EMAIL を設定すると差し替わる（サービス名「Orime」と揃ったアドレスにする。旧名の入ったアドレスは出さない）。
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'leverage.book0502@gmail.com';
