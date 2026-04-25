// Best-effort humanizer for surfacing errors to end users.
// Centralises the patterns we see across Supabase, fetch, and form validation
// so the rest of the app can call `toMessage(err, fallback)` without each call
// site reinventing the lookup.

export function toMessage(err, fallback = '予期せぬエラーが発生しました。') {
  if (!err) return fallback;
  if (typeof err === 'string') return err;

  const status = err.status ?? err.statusCode;
  const code = (err.code || err.error_code || '').toString();
  const raw = (err.message || err.error_description || err.error || '').toString();
  const lower = raw.toLowerCase();

  // Network-level
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'ネット接続が切れています。再接続してから再試行してください。';
  }
  if (err.name === 'TypeError' && lower.includes('fetch')) {
    return 'サーバーに接続できませんでした。少し待って再試行してください。';
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'サーバーに接続できませんでした。少し待って再試行してください。';
  }

  // Auth
  if (status === 401 || status === 403 || code === '401' || code === '403') {
    return 'ログインの有効期限が切れました。再度ログインしてください。';
  }
  if (lower.includes('jwt') && lower.includes('expired')) {
    return 'ログインの有効期限が切れました。再度ログインしてください。';
  }

  // Rate limit
  if (status === 429) {
    return 'リクエストが多すぎます。しばらく経ってから再度お試しください。';
  }

  // Storage / file size
  if (lower.includes('payload too large') || lower.includes('exceeds maximum size')) {
    return '画像が大きすぎます。1枚あたり10MB以下にしてください。';
  }

  // Common Supabase/PostgREST conditions
  if (code === '23505' || lower.includes('duplicate key')) {
    return '同じデータがすでに存在します。';
  }
  if (code === '23503' || lower.includes('foreign key')) {
    return '関連データが見つからず、保存できませんでした。';
  }
  if (code === '42501' || lower.includes('row-level security')) {
    return 'この操作の権限がありません。再度ログインしてお試しください。';
  }

  if (raw) return raw;
  return fallback;
}

export function fieldRequiredMessage(label) {
  return `${label}を入力してください。`;
}
