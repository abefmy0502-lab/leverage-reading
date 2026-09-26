import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { LIMITS, validatePassword } from '../../lib/limits';

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
  if (code === 'otp_expired') return 'リンクの有効期限が切れています。もう一度メールを送信してください。';
  if (code === 'access_denied') return 'リンクが無効です。お手数ですが、もう一度お試しください。';
  return 'リンクが無効です。お手数ですが、もう一度お試しください。';
}

const wrap = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: 'env(safe-area-inset-top, 0px) max(env(safe-area-inset-right, 0px), 20px) env(safe-area-inset-bottom, 0px) max(env(safe-area-inset-left, 0px), 20px)',
  textAlign: 'center',
  fontFamily: "var(--font-app)",
  color: 'var(--c-ink)',
  background: 'var(--color-bg)',
};

const btn = {
  marginTop: 18,
  padding: '12px 24px',
  background: 'var(--c-brand)',
  color: 'var(--accent-ink)',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
};

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
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>🔑 新しいパスワードを設定</h1>
        <p style={{ fontSize: 13, color: 'var(--c-ink-2)', lineHeight: 1.8, maxWidth: 360 }}>
          本人確認ができました。新しいパスワードを入力してください。
        </p>
        <form onSubmit={handleSetNewPassword} style={{ width: '100%', maxWidth: 320, marginTop: 14 }}>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setPwError(''); }}
            placeholder="新しいパスワード（8文字以上）"
            autoComplete="new-password"
            maxLength={LIMITS.password}
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 16,
              borderRadius: 10, border: '1px solid var(--c-hairline-strong)', fontFamily: 'inherit',
              background: 'var(--c-card)', color: 'var(--c-ink)',
            }}
          />
          {pwError && (
            <p style={{ fontSize: 12, color: 'var(--c-critical)', marginTop: 8, lineHeight: 1.6 }}>{pwError}</p>
          )}
          <button type="submit" disabled={pwBusy} style={{ ...btn, width: '100%', opacity: pwBusy ? 0.6 : 1 }}>
            {pwBusy ? '更新中…' : 'パスワードを更新してはじめる'}
          </button>
        </form>
      </div>
    );
  }

  if (hasError) {
    const message = errorMessage(initial.error_code, initial.error_description);
    return (
      <div style={wrap}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>認証リンクが利用できません</h1>
        <p style={{ fontSize: 13, color: 'var(--c-ink-2)', lineHeight: 1.8, maxWidth: 360 }}>{message}</p>
        <p style={{ fontSize: 12, color: 'var(--c-ink-2)', marginTop: 8, lineHeight: 1.7, maxWidth: 360 }}>
          お手数ですが、もう一度ログイン画面から操作をやり直してください。
        </p>
        <button type="button" onClick={handleBackToLogin} style={btn}>
          ログイン画面に戻る
        </button>
      </div>
    );
  }

  if (waiting) {
    return (
      <div style={wrap}>
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>認証中…</h1>
        <p style={{ fontSize: 13, color: 'var(--c-ink-2)' }}>セッションを確認しています。</p>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>認証を確認できませんでした</h1>
      <p style={{ fontSize: 13, color: 'var(--c-ink-2)', lineHeight: 1.8, maxWidth: 360 }}>
        セッションの確立に時間がかかっています。ログイン画面からやり直してください。
      </p>
      <button type="button" onClick={handleBackToLogin} style={btn}>
        ログイン画面に戻る
      </button>
    </div>
  );
}
