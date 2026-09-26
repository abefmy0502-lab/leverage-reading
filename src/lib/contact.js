// 📮 問い合わせ先の唯一の真実（single source of truth）。
//
// プレミアム（有料プロダクト）としての信頼性のため、将来は独自ドメインの
// アドレス（例: support@orime.app）に差し替える想定。差し替えはこの 1 行だけ
// 変えれば全画面（エラー画面・設定・特商法・プライバシー・LP フッター）に反映される。
//
// ※ 元帥へ: 独自ドメインのメールが用意でき次第、下の値を差し替えてください。
// 2026-09-26 に Orime 名の Gmail を用意（旧アドレスは表示しない）。独自ドメインのメールに移るときは VITE_SUPPORT_EMAIL で差し替える。
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'orime.support@gmail.com';
