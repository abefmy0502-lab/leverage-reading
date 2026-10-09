// ⌨️ 相談の入力欄に書いている間の見せ方（2026-10-08・オーナーの iPhone で「答えも自分の文も見えにくい」）。
//   純粋な関数だけ（MyBookBrain.jsx が使う・テストは composerView.test.js）。
//
//   - 入力欄にカーソルがある間は、深掘りのチップの行と相談相手・答え方の行を出さない（SPEC §3・DESIGN §5）。
//     以前は「文字が入っている間」だけ隠していたので、カーソルを置いただけ（空のまま）の間は出たままだった。
//   - 書き終えて入力欄から外れたら戻す。文字が残っていればチップは出さない（いつもの決まり）。

/**
 * 入力欄のまとまりの上に出す行を決める。
 * @param {{ focused?: boolean, text?: string }} s
 * @returns {{ chips: boolean, scopeBar: boolean }}
 *   chips＝深掘りのチップの行を出してよいか（ほかの条件＝書き終えた答えがある等は呼ぶ側で足す）
 *   scopeBar＝相談相手・答え方の行を出すか
 */
export function composerChrome({ focused = false, text = '' } = {}) {
  const hasText = String(text || '').trim().length > 0;
  return { chips: !focused && !hasText, scopeBar: !focused };
}

/**
 * 会話の欄で、最新の答えの終わり（endOffset＝欄の中身の上端からの位置）が見えるように送る位置。
 * もう見えていれば null（読んでいる場所を動かさない）。下にだけ送る（上へは戻さない）。
 * @param {{ scrollTop: number, clientHeight: number, endOffset: number, pad?: number }} s
 * @returns {number|null}
 */
export function answerEndScrollTop({ scrollTop, clientHeight, endOffset, pad = 0 }) {
  if (![scrollTop, clientHeight, endOffset].every(Number.isFinite) || clientHeight <= 0) return null;
  const want = Math.ceil(endOffset + pad - clientHeight);
  return want > scrollTop + 1 ? want : null;
}

// 入力欄は書いた量に合わせて伸び、この行数を超えたら中を送る（文字 17・行の高さ 1.5）。
export const COMPOSER_MAX_LINES = 5;

/**
 * 入力欄の高さ（px）。空のときは 1 行（min）、書くほど伸び、max を超えたら max（中を送る）。
 * @param {{ scrollHeight: number, min?: number, max: number }} s
 */
export function composerHeight({ scrollHeight, min = 44, max }) {
  const h = Number.isFinite(scrollHeight) ? scrollHeight : min;
  return Math.min(Math.max(h, min), Math.max(min, max));
}

/**
 * 指で使う端末か（画面にキーボードが出る＝iPhone など）。マウスの端末では入力欄にカーソルがあっても場所は減らない。
 * 測れないときは false（今までどおりの見せ方）。
 */
export function isTouchUi() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}
