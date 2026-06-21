// Best-effort humanizer for surfacing errors to end users.
// Centralises the patterns we see across Supabase, fetch, and form validation
// so the rest of the app can call `toMessage(err, fallback)` without each call
// site reinventing the lookup.
//
// 🔒 セキュリティ方針（CLAUDE.md「エラーメッセージで内部情報を露出しない」）:
//   未マッチのエラーは生の `.message`（Postgres 生エラー / スタック / SQL /
//   内部 ID など）をそのまま返さず、人間語の `fallback` に倒す。自分たちが
//   投げた安全な日本語メッセージだけは `looksLikeSafeUserMessage` を通して
//   通過させる（過剰防御で有用な日本語まで握り潰さないため）。

// 自分たちが投げた「人に見せて安全な日本語メッセージ」かどうかを判定する。
// 目的は「英語の技術文字列・記号だらけ・極端に長い・スタック/SQL 風」のものを
// fallback に倒すこと。逆に、日本語を含む短めの普通の文はそのまま通す。
function looksLikeSafeUserMessage(text) {
  if (!text) return false;
  const s = text.trim();
  if (!s) return false;

  // 極端に長いものは生ログ/スタックの可能性が高い → 握り潰す
  if (s.length > 160) return false;

  // 改行が複数 = スタックトレース / 複数行ログの疑い
  if ((s.match(/\n/g) || []).length >= 2) return false;

  // 日本語（ひらがな・カタカナ・漢字）を含まないものは、ほぼ確実に
  // 英語の技術メッセージ（Postgres / fetch / JS Error）→ 握り潰す
  const hasJapanese = /[぀-ヿ㐀-鿿ｦ-ﾟ]/.test(s);
  if (!hasJapanese) return false;

  // 内部実装の匂いが強いトークンを含むものは、日本語混じりでも握り潰す
  // （例: 「保存に失敗: relation "books" does not exist」のような連結漏れ）
  const technicalSignals = [
    'select ', 'insert ', 'update ', 'delete from', 'relation "', 'column "',
    'constraint', 'pg_', 'postgres', 'syntaxerror', 'typeerror', 'referenceerror',
    'undefined is not', 'null is not', 'cannot read prop', 'stack', 'at <anonymous',
    '.js:', '0x', 'supabase', 'jwt', 'http://', 'https://', 'function(', '=>',
  ];
  const lower = s.toLowerCase();
  if (technicalSignals.some((t) => lower.includes(t))) return false;

  // 記号だらけ（コード片 / JSON / SQL の疑い）→ 握り潰す。
  // 文字に対する「記号・英数」比率が高すぎる場合はコードとみなす。
  const symbolish = (s.match(/[{}\[\]<>;=|\\/`~^*_]/g) || []).length;
  if (symbolish >= 4) return false;

  return true;
}

export function toMessage(err, fallback = '予期せぬエラーが発生しました。') {
  if (!err) return fallback;
  // 文字列で渡されたものは「呼び出し側が意図的に渡した人間語」とみなして
  // 基本通すが、生ログを文字列化して渡された事故に備え安全判定を通す。
  if (typeof err === 'string') {
    return looksLikeSafeUserMessage(err) ? err : fallback;
  }

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
  if (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('connection') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('err_internet') ||
    lower.includes('err_network')
  ) {
    return '🌐 サーバーに接続できませんでした。少し待って再試行してください。';
  }

  // Auth
  if (status === 401 || status === 403 || code === '401' || code === '403') {
    return '🔒 ログインの有効期限が切れました。再度ログインしてください。';
  }
  if (lower.includes('jwt') && (lower.includes('expired') || lower.includes('invalid'))) {
    return '🔒 ログインの有効期限が切れました。再度ログインしてください。';
  }
  // メール未確認 — サインアップ直後のログイン等
  if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
    return '📧 メールアドレスの確認が完了していません。受信メールのリンクをご確認ください。';
  }
  // ログイン情報の誤り（メール/パスワード違い）。invalid login / invalid credentials
  if (
    lower.includes('invalid login') ||
    lower.includes('invalid credentials') ||
    lower.includes('invalid email or password') ||
    lower.includes('incorrect password') ||
    (lower.includes('user') && lower.includes('not found') && lower.includes('login'))
  ) {
    return '🔑 メールアドレスまたはパスワードが正しくありません。';
  }
  // 既に登録済みのメール
  if (lower.includes('already registered') || lower.includes('user already exists')) {
    return '📧 このメールアドレスは既に登録されています。';
  }

  // Rate limit — AI 系は別メッセージで「混み合ってる感」を出す
  if (
    status === 429 ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('over_request_rate_limit')
  ) {
    if (isAi) return '🤖 AI が混み合っています。少し待ってもう一度お試しください。';
    return '⏳ リクエストが多すぎます。しばらく経ってから再度お試しください。';
  }

  // Storage / file size
  if (
    status === 413 ||
    lower.includes('payload too large') ||
    lower.includes('exceeds maximum size') ||
    lower.includes('exceeded the maximum') ||
    lower.includes('entity too large') ||
    lower.includes('file too large')
  ) {
    return '📷 画像が大きすぎます。1 枚あたり 10MB 以下にしてください。';
  }
  // 不正なファイル形式
  if (
    lower.includes('invalid mime') ||
    lower.includes('mime type') ||
    lower.includes('unsupported') && lower.includes('type')
  ) {
    return '📷 この形式の画像は使えません。JPEG / PNG / WebP をお試しください。';
  }

  // AI / API key missing
  if (lower.includes('api key') || lower.includes('api_key')) {
    return '⚙ API 設定に問題があります。お問い合わせください。';
  }

  // Common Supabase/PostgREST conditions
  if (code === '23505' || lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return '📚 同じデータがすでに存在します。';
  }
  if (code === '23503' || lower.includes('foreign key')) {
    return '関連データが見つからず、保存できませんでした。';
  }
  // NOT NULL violation — 必須項目が空のまま保存しようとした
  if (code === '23502' || lower.includes('null value') || lower.includes('violates not-null')) {
    return '必須の項目が入力されていないため、保存できませんでした。';
  }
  // CHECK 制約違反 — 想定外の値
  if (code === '23514' || lower.includes('check constraint')) {
    return '入力された内容では保存できませんでした。内容をご確認ください。';
  }
  if (code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
    return '🔒 この操作の権限がありません。再度ログインしてお試しください。';
  }
  // スキーマ不一致 — マイグレーション未適用などで起きる「列/テーブルが存在しない」系
  if (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    lower.includes('does not exist') ||
    (lower.includes('column') && lower.includes('not found')) ||
    (lower.includes('relation') && lower.includes('not exist')) ||
    lower.includes('schema cache')
  ) {
    return '💾 データの設定がまだ完了していません。お手数ですが運営までお問い合わせください。';
  }

  // 汎用 5xx
  if (typeof status === 'number' && status >= 500) {
    return '🛠 サーバー側で問題が発生しています。少し待ってもう一度お試しください。';
  }
  // 4xx 全般（上で個別に拾えなかったもの）は安全な汎用文へ
  if (typeof status === 'number' && status >= 400) {
    return fallback;
  }

  // ここまでマッチしなければ、生メッセージを安全判定してから扱う。
  // 自分たちが投げた日本語メッセージはそのまま、技術的/英語/長文は fallback。
  if (looksLikeSafeUserMessage(raw)) return raw;
  return fallback;
}

export function fieldRequiredMessage(label) {
  return `${label}を入力してください。`;
}
