// ⭐️ App Store レビュー依頼 — 発火点は「本物の想起に『覚えた』と応えた直後」。
//
// なぜこの瞬間か: Orime の核心価値（忘れた頃に自分の言葉が戻ってくる）を
// ユーザーが実際に体感し、しかも「覚えた」と肯定的に応えた感情のピークだから。
// 初回起動時・作業の途中・エラー直後に聞くのは体験を壊すだけでレビューも荒れる。
//
// 設計原則:
//   - 一度きり（localStorage）。しつこいレビュー乞いはブランドの静けさに反する。
//   - 🍎 iOS（Capacitor のネイティブ）は、Apple の仕組み（SKStoreReviewController の requestReview）だけを使う
//     （App Store 審査ガイドライン 5.6.1: アプリ独自のレビュー依頼の画面を出さない・2026-10-04）。
//     ネイティブのプラグイン（名前 'InAppReview'・メソッド requestReview）が入っていないビルドでは、何も出さない
//     （独自のトーストで App Store に送ることもしない）。出すかどうか・回数は Apple が決める（1 年に 3 回まで）。
//     プラグインを入れるのはオーナーの Mac で: `npm i @capacitor-community/in-app-review && npx cap sync ios`
//     （Capacitor 8 に対応した版か確かめる。名前が 'InAppReview' でない別のプラグインにするなら NATIVE_PLUGIN を直す）。
//   - Web（ブラウザ・PWA）は、isAppStoreLive（実 URL が env 設定済み）の時だけ、
//     強制モーダルではなく、アクション付きトースト（無視できる・数秒で消える）。
//     未設定の間は完全 no-op ＝ プレースホルダー URL の 404 に送る事故がない（appStore.js 参照）。
//
// 使い方（呼び出し側）:
//   if (shouldAskForReview()) { markReviewAsked(); askForReview(toast); }

import { Capacitor, registerPlugin } from '@capacitor/core';
import { APP_STORE_URL, isAppStoreLive } from './appStore';

const ASKED_KEY = 'orime-review-asked-v1';
export const NATIVE_PLUGIN = 'InAppReview';

let nativePlugin = null;
function getNativePlugin() {
  if (!nativePlugin) nativePlugin = registerPlugin(NATIVE_PLUGIN);
  return nativePlugin;
}

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// ネイティブで Apple のレビューの仕組みを呼べるか（プラグインが入っているビルドだけ）。
export function canUseNativeReview() {
  if (!isNative()) return false;
  try {
    return Capacitor.isPluginAvailable(NATIVE_PLUGIN);
  } catch {
    return false;
  }
}

export function shouldAskForReview() {
  // ネイティブ: Apple の仕組みが使えるときだけ（無ければ独自の依頼も出さない）。Web: 実 URL があるときだけ。
  if (isNative() ? !canUseNativeReview() : !isAppStoreLive) return false;
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

// App Store のレビュー作成画面へ直行する URL（Web のトーストだけが使う）。
export function getWriteReviewUrl() {
  return `${APP_STORE_URL}?action=write-review`;
}

// Web のトーストに渡す共通ペイロード。文言はここに一元化（複数の発火面で揺れない）。
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

// レビューを頼む。ネイティブは Apple の仕組み（出すかどうかは Apple が決める・失敗しても何もしない）、
// Web はトースト。返り値: 'native' | 'toast' | null（何もしなかった）。
export function askForReview(toast) {
  if (isNative()) {
    if (!canUseNativeReview()) return null;
    try {
      const p = getNativePlugin().requestReview();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* ignore */ }
    return 'native';
  }
  if (toast && typeof toast.show === 'function') {
    toast.show(askReviewToast());
    return 'toast';
  }
  return null;
}
