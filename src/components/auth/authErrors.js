// ログインの画面のエラーの文（AuthScreen.jsx から分けた・2026-11-23）。
//   失敗の文は操作ごとに分ける（前は登録・パスワードの再設定・登録せずに始めるも「ログインできませんでした」だった）。

// 通信やサーバー側の失敗（入力を直しても解決しない）。入力の誤りとは見せ方を分け、ErrorMessage の面で出す。
export const NETWORK_ERROR = 'つながりませんでした。通信状況を確認して、もう一度お試しください。';
export const RATE_LIMIT_ERROR = '短い間に何度も試されました。少し待ってから、もう一度お試しください。';
export const NOT_CONFIGURED_ERROR = 'アプリの設定が未完了です。管理者にお問い合わせください。';
// サーバー（Supabase）が止まっている・壊れている（5xx・一時停止）。入力を直しても解決しない。
export const SERVER_DOWN_ERROR = 'サーバーにつながりません。時間をおいて、もう一度お試しください。';

// 操作ごとの失敗の見出し（op: signin・apple＝ログイン／signup＝登録／reset・resend＝メール／guest＝登録せずに始める）。
const FAIL_LEAD = {
  signin: 'ログインできませんでした',
  apple: 'ログインできませんでした',
  signup: '登録できませんでした',
  reset: 'メールを送れませんでした',
  resend: 'メールを送れませんでした',
  guest: '始められませんでした',
};
const leadOf = (op) => FAIL_LEAD[op] || FAIL_LEAD.signin;
export const unexpectedError = (op) => `${leadOf(op)}。時間をおいて、もう一度お試しください。`;
export const timeoutError = (op) => `${leadOf(op)}。応答がありませんでした。通信状況を確認して、もう一度お試しください。`;

// 待つ長さの上限（Apple と同じく、終わらないときに戻せる・2026-11-23）。
export const AUTH_TIMEOUT_MS = 30000;
export function withTimeout(promise, ms = AUTH_TIMEOUT_MS) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('auth timeout');
      err.code = 'auth_timeout';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

const SYSTEM_ERRORS = new Set([NETWORK_ERROR, RATE_LIMIT_ERROR, NOT_CONFIGURED_ERROR]);
const SYSTEM_PREFIXES = [...new Set(Object.values(FAIL_LEAD))].map((l) => `${l}。`).concat(SERVER_DOWN_ERROR);
export const isSystemError = (e) => !!e && (SYSTEM_ERRORS.has(e) || SYSTEM_PREFIXES.some((p) => e.startsWith(p)));

// 問い合わせ用の手がかり（例: 「（コード: 500 unexpected_failure）」）。本文・内部 ID は出さない。
export function diagCode(err) {
  const clean = (v) => String(v || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
  const parts = [clean(err?.status), clean(err?.code) || clean(err?.name)].filter(Boolean);
  return parts.length ? `（コード: ${parts.join(' ')}）` : '';
}

export function humanizeError(err, op = 'signin') {
  const msg = (err?.message || '').toLowerCase();
  if (err?.code === 'auth_timeout') return timeoutError(op);
  // 通信そのものが失敗（オフライン・サーバー停止・DNS 解決不可など）。
  // 以前はここが未分類で「予期せぬエラー」になり、原因の見当がつかなかった
  // （実例: Supabase の自動一時停止でログイン不能 → 汎用文しか出なかった）。
  if (
    err?.name === 'AuthRetryableFetchError' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed')
  ) {
    return NETWORK_ERROR;
  }
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  if (msg.includes('user already registered')) {
    return 'このメールアドレスは既に登録されています。';
  }
  if (msg.includes('password should be') || msg.includes('password length')) {
    return 'パスワードは 8 文字以上で、英字と数字を含めてください。';
  }
  if (msg.includes('email') && (msg.includes('invalid') || msg.includes('format'))) {
    return 'メールアドレスの形式が正しくありません。';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return RATE_LIMIT_ERROR;
  }
  if (msg.includes('email not confirmed')) {
    return 'メールアドレスの確認が済んでいません。届いたメールのリンクを開いてください。';
  }
  if (msg.includes('not configured')) {
    return NOT_CONFIGURED_ERROR;
  }
  // サインインの方法がサーバーで止まっている（Supabase の Apple・匿名のサインインがオフ・2026-11-21 シミュレータで「400 provider_disabled」）。
  //   待っても直らないので「時間をおいて」と言わない。別の方法へ案内する。
  if (err?.code === 'provider_disabled' || err?.code === 'anonymous_provider_disabled' || msg.includes('provider is not enabled') || msg.includes('provider_disabled') || msg.includes('anonymous sign-ins are disabled')) {
    return `この方法は、いま使えません。メールアドレスで登録・ログインしてください。${diagCode(err)}`;
  }
  // サーバー側の停止・障害（Supabase の自動一時停止は 5xx や独自の 540 を返すことがある）。
  const status = Number(err?.status) || 0;
  if (status >= 500 || msg.includes('paused') || msg.includes('upstream') || msg.includes('service unavailable')) {
    return `${SERVER_DOWN_ERROR}${diagCode(err)}`;
  }
  // 未マッチのエラーは生の Supabase メッセージ（英語の技術文字列・内部 ID など）を
  // そのまま表示せず、安全な汎用文へ倒す（CLAUDE.md セキュリティ方針）。
  // 原因を問い合わせで特定できるよう、状態番号と種類の名前（英数字だけ）を末尾に添える。
  return `${unexpectedError(op)}${diagCode(err)}`;
}
