import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

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

function errorMessage(code, description) {
  if (code === 'otp_expired') return 'リンクの有効期限が切れています。';
  if (description) {
    try {
      return decodeURIComponent(description.replace(/\+/g, ' '));
    } catch {
      return 'リンクが無効です。';
    }
  }
  return 'リンクが無効です。';
}

const wrap = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: 'env(safe-area-inset-top, 0px) max(env(safe-area-inset-right, 0px), 20px) env(safe-area-inset-bottom, 0px) max(env(safe-area-inset-left, 0px), 20px)',
  textAlign: 'center',
  fontFamily: "'Noto Serif JP', Georgia, serif",
  color: '#3d362c',
  background: '#f5f0e8',
};

const btn = {
  marginTop: 18,
  padding: '12px 24px',
  background: '#5c5043',
  color: '#faf6f0',
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
      onDone();
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
    onDone();
  };

  if (hasError) {
    const message = errorMessage(initial.error_code, initial.error_description);
    return (
      <div style={wrap}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>認証リンクが利用できません</h1>
        <p style={{ fontSize: 13, color: '#6b5f4d', lineHeight: 1.8, maxWidth: 360 }}>{message}</p>
        <p style={{ fontSize: 12, color: '#6b5f4d', marginTop: 8, lineHeight: 1.7, maxWidth: 360 }}>
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
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>認証中...</h1>
        <p style={{ fontSize: 13, color: '#6b5f4d' }}>セッションを確認しています。</p>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>認証を確認できませんでした</h1>
      <p style={{ fontSize: 13, color: '#6b5f4d', lineHeight: 1.8, maxWidth: 360 }}>
        セッションの確立に時間がかかっています。ログイン画面からやり直してください。
      </p>
      <button type="button" onClick={handleBackToLogin} style={btn}>
        ログイン画面に戻る
      </button>
    </div>
  );
}
