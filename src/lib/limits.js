// Length limits for user-supplied strings. Used as `maxLength` on inputs and
// for defensive checks before persisting (paste, programmatic input, etc.).
//
// These match the spec: 本タイトル 200 / 著者 100 / メモ 5000 / まとめ 50000 /
// タグ 50 / AI 質問 1000.

export const LIMITS = {
  password: 128, // サインアップ/リセットの両画面で共有（片方だけ 72 に落ちて 73〜128 字が入力不能になる事故を防ぐ）
  bookTitle: 200,
  bookAuthor: 100,
  memoText: 5000,
  summaryMemo: 50000,
  tag: 50,
  aiQuestion: 1000,
  // AI 選書の聞き取りの答え・受け取った悩みの直し（1 回ぶん・2026-10-08）
  advisorAnswer: 400,
  displayName: 60,
  email: 254,
  actionText: 500,
  bookIsbn: 20,
  // For per-memo text snippets sent into AI prompts (defense-in-depth).
  promptMemoExcerpt: 2000,
};

// Hard-truncate a string to `max` characters. Returns the original string if
// already within bounds. Use only at storage boundaries; for inputs, prefer
// `maxLength` so the user can see they hit the cap.
export function clamp(str, max) {
  if (typeof str !== 'string') return str;
  if (str.length <= max) return str;
  return str.slice(0, max);
}

// ===== Password policy =====
//
// 8+ chars, must contain a letter and a digit, must not be in the
// well-known weak list. Returns null on success, error message on failure.
const WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty12',
  'qwerty123',
  'abc12345',
  'abcd1234',
  'asdf1234',
  'pass1234',
  'admin123',
  '00000000',
  '11111111',
  'iloveyou',
]);

export function validatePassword(pw) {
  if (typeof pw !== 'string') return 'パスワードを入力してください。';
  if (pw.length < 8) return 'パスワードは 8 文字以上にしてください。';
  if (!/[a-zA-Z]/.test(pw)) return 'パスワードには英字を含めてください。';
  if (!/[0-9]/.test(pw)) return 'パスワードには数字を含めてください。';
  if (WEAK_PASSWORDS.has(pw.toLowerCase())) {
    return 'このパスワードは推測されやすいため、別のものを使ってください。';
  }
  return null;
}

// ===== Image upload policy =====
//
// 10 MB hard cap (matches spec); JPEG / PNG / WebP. Returns null on success.
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateImageFile(file) {
  if (!file) return null;
  if (typeof file.size !== 'number') return null;
  if (file.size > MAX_IMAGE_BYTES) {
    return '画像が大きすぎます。1 枚あたり 10 MB 以下にしてください。';
  }
  const type = file.type || '';
  const name = (file.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot + 1);
  const mimeOk = ALLOWED_IMAGE_MIME.includes(type);
  const extOk = ALLOWED_IMAGE_EXT.includes(ext);
  // fail-closed: MIME か拡張子のいずれかが「許可された画像」だと積極的に確認できない
  // 限り拒否する（旧実装は MIME 空 + 拡張子不明を素通しさせていた）。正規の画像は
  // ファイルピッカー/カメラ由来で image/* の MIME を持つため誤拒否しない。
  if (!mimeOk && !extOk) {
    return '対応している画像形式は JPEG / PNG / WebP のみです。';
  }
  return null;
}
