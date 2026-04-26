// Length limits for user-supplied strings. Used as `maxLength` on inputs and
// for defensive checks before persisting (paste, programmatic input, etc.).
//
// These match the spec: 本タイトル 200 / 著者 100 / メモ 5000 / まとめ 50000 /
// タグ 50 / AI 質問 1000.

export const LIMITS = {
  bookTitle: 200,
  bookAuthor: 100,
  memoText: 5000,
  summaryMemo: 50000,
  tag: 50,
  aiQuestion: 1000,
  displayName: 60,
  email: 254,
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
  if (file.type && !ALLOWED_IMAGE_MIME.includes(file.type)) {
    return '対応している画像形式は JPEG / PNG / WebP のみです。';
  }
  const name = (file.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot === -1) return null; // unknown extension — let MIME check above govern
  const ext = name.slice(dot + 1);
  if (!ALLOWED_IMAGE_EXT.includes(ext)) {
    return '対応している画像形式は JPEG / PNG / WebP のみです。';
  }
  return null;
}
