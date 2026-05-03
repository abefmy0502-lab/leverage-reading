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
  // どの API でこけたか — AI 系だけ「混み合っています」のような特化メッセージ
  // を出したいのでヒントとして使う。url に "anthropic" / "claude" / "/api/claude"
  // を含む fetch エラーは AI 系として分類。
  const url = (err.url || err.requestUrl || err.config?.url || '').toString().toLowerCase();
  const isAi = url.includes('anthropic') || url.includes('/api/claude') || url.includes('claude');

  // Network-level
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '🌐 ネット接続が切れています。再接続してから再試行してください。';
  }
  if (err.name === 'AbortError' || lower.includes('timeout') || lower.includes('timed out')) {
    return '⏱ 処理に時間がかかりすぎました。少し待ってもう一度お試しください。';
  }
  if (err.name === 'TypeError' && lower.includes('fetch')) {
    return '🌐 サーバーに接続できませんでした。少し待って再試行してください。';
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return '🌐 サーバーに接続できませんでした。少し待って再試行してください。';
  }

  // Auth
  if (status === 401 || status === 403 || code === '401' || code === '403') {
    return '🔒 ログインの有効期限が切れました。再度ログインしてください。';
  }
  if (lower.includes('jwt') && lower.includes('expired')) {
    return '🔒 ログインの有効期限が切れました。再度ログインしてください。';
  }

  // Rate limit — AI 系は別メッセージで「混み合ってる感」を出す
  if (status === 429 || lower.includes('rate limit')) {
    if (isAi) return '🤖 AI が混み合っています。少し待ってもう一度お試しください。';
    return '⏳ リクエストが多すぎます。しばらく経ってから再度お試しください。';
  }

  // Storage / file size
  if (lower.includes('payload too large') || lower.includes('exceeds maximum size')) {
    return '📷 画像が大きすぎます。1 枚あたり 10MB 以下にしてください。';
  }

  // AI / API key missing
  if (lower.includes('api key') || lower.includes('api_key')) {
    return '⚙ API 設定に問題があります。お問い合わせください。';
  }

  // Common Supabase/PostgREST conditions
  if (code === '23505' || lower.includes('duplicate key')) {
    return '📚 同じデータがすでに存在します。';
  }
  if (code === '23503' || lower.includes('foreign key')) {
    return '関連データが見つからず、保存できませんでした。';
  }
  if (code === '42501' || lower.includes('row-level security')) {
    return '🔒 この操作の権限がありません。再度ログインしてお試しください。';
  }
  // スキーマ不一致 — マイグレーション未適用などで起きる「列が存在しない」系
  if (lower.includes('does not exist') || lower.includes('column') && lower.includes('not found')) {
    return '💾 データの設定がまだ完了していません。お手数ですが運営までお問い合わせください。';
  }

  // 汎用 5xx
  if (typeof status === 'number' && status >= 500) {
    return '🛠 サーバー側で問題が発生しています。少し待ってもう一度お試しください。';
  }

  if (raw) return raw;
  return fallback;
}

export function fieldRequiredMessage(label) {
  return `${label}を入力してください。`;
}
