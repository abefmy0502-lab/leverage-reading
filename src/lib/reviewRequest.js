// ⭐️ App Store レビュー依頼 — 発火点は「本物の想起に『覚えた』と応えた直後」。
//
// なぜこの瞬間か: Orime の核心価値（忘れた頃に自分の言葉が戻ってくる）を
// ユーザーが実際に体感し、しかも「覚えた」と肯定的に応えた感情のピークだから。
// 初回起動時・作業の途中・エラー直後に聞くのは体験を壊すだけでレビューも荒れる。
//
// 設計原則:
//   - 一度きり（localStorage）。しつこいレビュー乞いはブランドの静けさに反する。
//   - isAppStoreLive（実 URL が env 設定済み）の時だけ動く。未設定の間は完全
//     no-op ＝ プレースホルダー URL の 404 に送る事故がない（appStore.js 参照）。
//   - 強制モーダルではなく、アクション付きトースト（無視できる・数秒で消える）。
//
// 使い方（呼び出し側）:
//   if (shouldAskForReview()) { markReviewAsked(); toast.show(askReviewToast()); }

import { APP_STORE_URL, isAppStoreLive } from './appStore';

const ASKED_KEY = 'orime-review-asked-v1';

export function shouldAskForReview() {
  if (!isAppStoreLive) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(ASKED_KEY) !== '1';
  } catch {
    return false; // 保存できない環境では「毎回聞く」より「聞かない」に倒す
  }
}

export function markReviewAsked() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(ASKED_KEY, '1');
  } catch { /* ignore */ }
}

// App Store のレビュー作成画面へ直行する URL（iOS はレビューシートが開く）。
export function getWriteReviewUrl() {
  return `${APP_STORE_URL}?action=write-review`;
}

// トーストに渡す共通ペイロード。文言はここに一元化（複数の発火面で揺れない）。
export function askReviewToast() {
  return {
    type: 'info',
    message: '⭐️ Orime は役に立ちそうですか？よければ App Store のレビューで教えてください。',
    duration: 9000,
    action: {
      label: 'レビューを書く',
      onClick: () => {
        try {
          window.open(getWriteReviewUrl(), '_blank', 'noopener');
        } catch { /* ignore */ }
      },
    },
  };
}
