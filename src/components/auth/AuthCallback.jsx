import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured, isDemo } from '../../lib/supabase';

// 🧪 お試しモード（開発専用）: &cb=wait＝認証しています…のまま／&cb=timeout＝確かめられなかった画面／
//   &cb=slow＝パスワードの更新が 8 秒かかる（更新しています…）。本番では isDemo が false なので何もしない。
const demoCb = () => {
  if (!isDemo || typeof window === 'undefined') return '';
  try { return new URLSearchParams(window.location.search).get('cb') || ''; } catch { return ''; }
};
import { LIMITS, validatePassword } from '../../lib/limits';
import { btnPrimary, btnPrimaryOff, input } from '../../styles/ui';
import { withPhraseBreaks } from '../TightBubble';

function parseHashParams() {
  if (typeof window === 'undefined') return {};
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function clearAuthHash() {
  if (typeof window === 'undefined') return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}#`);
}

function errorMessage(code) {
  // error_description は Supabase の生の英語文のため表示しない（技術文言を
  // ユーザーに見せない規範）。code → 和文マップ + 安全な汎用文に倒す。
  // この画面から送り直せないので、できること（ログインの画面から送り直す）を言う（2026-10-04 ui-critic）。
  if (code === 'otp_expired') return 'リンクの有効期限が切れています。ログイン画面から、もう一度メールを送ってください。';
  return 'リンクが使えませんでした。ログイン画面から、もう一度お試しください。';
}

// 見た目はログインの画面（AuthScreen）とそろえる（トークンと ui.js の部品だけ・2026-10-04）。
//   以前は 12〜14px の文字・角丸 10・絵文字の見出し・薄くした押せないボタンが残っていた。
const wrap = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  minHeight: '100vh',
  boxSizing: 'border-box',
  padding: 'calc(var(--space-16) + env(safe-area-inset-top, 0px)) max(env(safe-area-inset-right, 0px), var(--space-4)) max(env(safe-area-inset-bottom, 0px), var(--space-4)) max(env(safe-area-inset-left, 0px), var(--space-4))',
  fontFamily: 'var(--font-ui)',
  color: 'var(--text)',
  background: 'var(--bg)',
};
const inner = { width: '100%', maxWidth: 400, textAlign: 'center' };
const phrase = { wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const titleStyle = { fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: '0 0 var(--space-3)', ...phrase };
const bodyStyle = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 var(--space-6)', ...phrase };
const hintStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, margin: 'var(--space-1) 0 var(--space-3)', textAlign: 'left' };
const errorStyle = { fontSize: 'var(--text-meta)', color: 'var(--error)', lineHeight: 1.5, margin: '0 0 var(--space-3)', textAlign: 'left' };
const btn = { ...btnPrimary, width: '100%' };

export default function AuthCallback({ onDone }) {
  const [initial] = useState(parseHashParams);
  const hasError = Boolean(initial.error || initial.error_code);
  const hasAccessToken = Boolean(initial.access_token);
  // パスワードリセットのリンク (#type=recovery) は、セッション確立後に
  // 「新しいパスワードを設定する」フォームを必ず挟む。ここで挟まないと、
  // リセット導線がどこにも存在せず、ユーザーは古いパスワードのまま
  // 毎回リセットメールを送る無限ループに陥る。
  const isRecovery = initial.type === 'recovery';
  const [recoveryReady, setRecoveryReady] = useState(false); // セッション確立済み
  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [waiting, setWaiting] = useState(hasAccessToken && !hasError);

  useEffect(() => {
    if (hasError || !hasAccessToken) return;
    if (demoCb() === 'wait') return undefined;
    if (demoCb() === 'timeout') { setWaiting(false); return undefined; }
    if (!isSupabaseConfigured) {
      clearAuthHash();
      onDone();
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearAuthHash();
      // recovery はアプリに流さず、新パスワード設定フォームを表示する。
      if (isRecovery) setRecoveryReady(true);
      else {
        // 📩 メール確認リンク経由（signup 等）の着地を WebAppOnlyGate に伝える
        // 一回きりのフラグ。アプリで登録 → メールのリンクが Safari で開く →
        // Web に着地、という遷移で「確認は完了した。次はアプリに戻る」を明示できる。
        if (initial.type === 'signup') {
          try { window.sessionStorage.setItem('orime-email-confirmed', 'true'); } catch { /* ignore */ }
        }
        onDone();
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    const timeout = setTimeout(() => {
      if (done) return;
      setWaiting(false);
    }, 8000);

    return () => {
      done = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [hasError, hasAccessToken, onDone]);

  const handleBackToLogin = async () => {
    clearAuthHash();
    try {
      if (isSupabaseConfigured) await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    // 「ログイン画面に戻る」の約束どおりログイン画面に着地させる。
    // このフラグが無い初見ブラウザ（メールアプリ内など）では、戻り先が
    // マーケティング LP になってしまい文言と矛盾する。
    try { window.localStorage.setItem('orime-returning', 'true'); } catch { /* ignore */ }
    onDone();
  };

  const handleSetNewPassword = async (e) => {
    e?.preventDefault?.();
    if (pwBusy) return;
    const pwErr = validatePassword(newPassword);
    if (pwErr) { setPwError(pwErr); return; }
    setPwBusy(true);
    setPwError('');
    try {
      if (demoCb() === 'slow') await new Promise((r) => setTimeout(r, 8000));
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      try { window.localStorage.setItem('orime-returning', 'true'); } catch { /* ignore */ }
      onDone();
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      setPwError(
        msg.includes('should be different')
          ? '現在と同じパスワードは設定できません。別のパスワードをお試しください。'
          : 'パスワードの更新に失敗しました。時間をおいて再度お試しください。',
      );
    } finally {
      setPwBusy(false);
    }
  };

  if (recoveryReady) {
    return (
      <div style={wrap}>
        <div style={inner}>
          <h1 style={titleStyle}>新しいパスワードを設定</h1>
          <p style={bodyStyle}>{withPhraseBreaks('本人確認ができました。新しいパスワードを入力してください。')}</p>
          <form onSubmit={handleSetNewPassword}>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPwError(''); }}
              placeholder="新しいパスワード"
              aria-label="新しいパスワード"
              aria-describedby={pwError ? 'cb-pw-hint cb-pw-error' : 'cb-pw-hint'}
              aria-invalid={pwError ? true : undefined}
              autoComplete="new-password"
              maxLength={LIMITS.password}
              autoFocus
              style={input}
            />
            {/* 決まりは placeholder だけに書かず、欄の下に常に出す（DESIGN §5 入力欄）。 */}
            <p id="cb-pw-hint" style={hintStyle}>パスワードは 8&nbsp;文字以上で、英字と数字を含めてください</p>
            {pwError && <p id="cb-pw-error" role="alert" style={errorStyle}>{pwError}</p>}
            {/* 処理中も薄くせず、文言で示す（DESIGN §5 押せないボタン）。 */}
            <button type="submit" disabled={pwBusy} aria-busy={pwBusy || undefined} style={pwBusy ? { ...btnPrimaryOff, width: '100%' } : btn}>
              {pwBusy ? '更新しています…' : 'パスワードを更新してはじめる'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (hasError) {
    const message = errorMessage(initial.error_code, initial.error_description);
    return (
      <div style={wrap}>
        <div style={inner}>
          <h1 style={titleStyle}>認証リンクが利用できません</h1>
          <p style={bodyStyle}>{withPhraseBreaks(message)}</p>
          <button type="button" onClick={handleBackToLogin} style={btn}>
            ログイン画面に戻る
          </button>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div style={wrap} role="status" aria-live="polite">
        <div style={inner}>
          <h1 style={titleStyle}>認証しています…</h1>
          <p style={bodyStyle}>{withPhraseBreaks('少しお待ちください。')}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={inner}>
        <h1 style={titleStyle}>認証を確認できませんでした</h1>
        <p style={bodyStyle}>{withPhraseBreaks('時間がかかっています。ログイン画面からやり直してください。')}</p>
        <button type="button" onClick={handleBackToLogin} style={btn}>
          ログイン画面に戻る
        </button>
      </div>
    </div>
  );
}
