import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { isSupabaseConfigured } from '../../lib/supabase';
import { LIMITS, validatePassword } from '../../lib/limits';
import { signInWithApple, isNativeApple, isAppleSignInAvailable } from '../../lib/appleAuth';
import { btnPrimary as uiBtnPrimary } from '../../styles/ui';
import { isNative } from '../../lib/iap';

// ボタン正典（styles/ui.js）に統一。初対面画面のボタンだけ radius/weight が
// 微妙に別物だと第一印象で「寄せ集め感」が出るため。
const btnPrimary = { ...uiBtnPrimary, width: '100%' };

const btnLink = {
  background: 'none',
  border: 'none',
  fontSize: 12,
  // WCAG AA: #8a7e6b はクリーム背景で約2.7:1 と不足 → var(--c-ink-2)（約4.6:1）へ。
  color: 'var(--c-ink-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: '12px 8px',
  minHeight: 44,
};

const inp = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 16,
  border: '1px solid var(--c-hairline-strong)',
  borderRadius: 8,
  fontFamily: 'inherit',
  background: 'var(--c-card)',
  color: 'var(--c-ink)',
  marginBottom: 10,
  boxSizing: 'border-box',
};

function humanizeError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  if (msg.includes('user already registered')) {
    return 'このメールアドレスは既に登録されています。';
  }
  if (msg.includes('password should be') || msg.includes('password length')) {
    return 'パスワードは8文字以上で、英字と数字を含めてください。';
  }
  if (msg.includes('email') && (msg.includes('invalid') || msg.includes('format'))) {
    return 'メールアドレスの形式が正しくありません。';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'リクエストが多すぎます。しばらく経ってから再度お試しください。';
  }
  if (msg.includes('email not confirmed')) {
    return 'メール確認が完了していません。確認メールをご確認ください。';
  }
  if (msg.includes('not configured')) {
    return 'アプリの設定が未完了です。管理者にお問い合わせください。';
  }
  // 未マッチのエラーは生の Supabase メッセージ（英語の技術文字列・内部 ID など）を
  // そのまま表示せず、安全な汎用文へ倒す（CLAUDE.md セキュリティ方針）。
  return '予期せぬエラーが発生しました。時間をおいて再度お試しください。';
}

// LP の「始める」CTA は /?auth=signup で着地する。初見の購入希望者を
// ログイン画面でなく新規登録画面に直接乗せ、直接課金導線の摩擦を減らす。
function initialAuthMode() {
  if (typeof window === 'undefined') return 'signin';
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('auth') === 'signup' ? 'signup' : 'signin';
  } catch {
    return 'signin';
  }
}

export default function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, sendPasswordResetEmail, resendConfirmation } = useAuth();
  const [mode, setMode] = useState(initialAuthMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  // signup 成功後、確認メール待ちの全画面ステップへ切替える宛先（中断離脱の最大谷を緩和）。
  const [confirmSentTo, setConfirmSentTo] = useState('');
  const [resending, setResending] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);

  // 🍎 Apple でサインイン。iOS は常時表示（HIG 準拠）。Web は Apple/Supabase の
  // Web 設定が済むまで誤爆させないため、環境変数で明示的に有効化した時だけ表示。
  const showAppleButton = isAppleSignInAvailable() && (isNativeApple || import.meta.env.VITE_APPLE_SIGNIN_WEB === 'true');

  const handleApple = async () => {
    if (appleBusy) return;
    setError('');
    setInfo('');
    setAppleBusy(true);
    try {
      await signInWithApple();
      // 成功時は onAuthStateChange がセッションを拾い、上位が画面遷移する
      // （Web はリダイレクトで離脱）。ここで明示的な遷移は不要。
    } catch (err) {
      // ユーザーキャンセルはエラー表示しない（静かに戻す）。
      if (!err?.canceled) {
        // 画面には安全な汎用文のみ表示し、生のエラーはコンソールにだけ残す
        // （ユーザー本人がブラウザの開発者ツールを開かない限り見えない・
        // 原因切り分け用。CLAUDE.md の「スタックトレースを画面に出さない」
        // 方針とは矛盾しない）。
        console.error('[auth] apple sign-in failed:', err);
        setError(err?.code === 'plugin_missing'
          ? 'この端末では Apple サインインを利用できません。メールでご登録ください。'
          : humanizeError(err));
      }
    } finally {
      setAppleBusy(false);
    }
  };

  // 一度この画面に来たユーザーは「既知」扱い。以後 "/" は LP を挟まず直接この
  // 認証画面に来る（毎回マーケLPを見せられる煩わしさを防ぐ）。新規初見だけ LP。
  useEffect(() => {
    try { window.localStorage.setItem('orime-returning', 'true'); } catch { /* ignore */ }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    // Signup: enforce policy + ToS agreement client-side.
    if (mode === 'signup') {
      if (!agreed) {
        setError('利用規約とプライバシーポリシーへの同意が必要です。');
        return;
      }
      const pwErr = validatePassword(password);
      if (pwErr) {
        setError(pwErr);
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email.trim(), password);
      } else if (mode === 'signup') {
        const data = await signUpWithEmail(email.trim(), password, displayName.trim());
        // Supabase はメール確認有効時、既存メールへの signUp をエラーにせず
        // identities: [] の難読化された成功で返す（列挙攻撃対策の仕様）。
        // このとき確認メールは送られないので、「送りました」画面で永遠に
        // 待たせず、ログイン/リセットへ誘導する。
        if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setError('このメールアドレスは既に登録されています。ログイン、またはパスワードをお忘れの場合はリセットをお試しください。');
          setMode('signin');
          return;
        }
        // 小さな緑文字でなく、全画面の「メール確認待ち」ステップに切替える。
        setConfirmSentTo(email.trim());
      } else if (mode === 'reset') {
        await sendPasswordResetEmail(email.trim());
        setInfo('パスワードリセット用のメールを送信しました。');
      }
    } catch (err) {
      // 画面には安全な汎用文のみ、生のエラーはコンソールにだけ残す（原因切り分け用）。
      console.error(`[auth] ${mode} failed:`, err);
      setError(humanizeError(err));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setInfo('');
  };

  const handleResend = async () => {
    if (resending || !confirmSentTo) return;
    setResending(true);
    setError('');
    setInfo('');
    try {
      await resendConfirmation(confirmSentTo);
      setInfo('確認メールを再送しました。');
    } catch (err) {
      console.error('[auth] resend confirmation failed:', err);
      setError(humanizeError(err));
    } finally {
      setResending(false);
    }
  };

  const blockEnterWhileComposing = (e) => {
    if (e.key === 'Enter' && e.nativeEvent.isComposing) {
      e.preventDefault();
    }
  };

  const title = mode === 'signin' ? 'ログイン' : mode === 'signup' ? '新規登録' : 'パスワードリセット';
  const submitLabel = loading
    ? '処理中…'
    : mode === 'signin'
    ? 'ログイン'
    : mode === 'signup'
    ? '登録する'
    : 'リセットメールを送信';

  if (!isSupabaseConfigured) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 'max(env(safe-area-inset-top, 0px), 20px) max(env(safe-area-inset-right, 0px), 20px) max(env(safe-area-inset-bottom, 0px), 20px) max(env(safe-area-inset-left, 0px), 20px)', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, color: 'var(--c-ink)', marginBottom: 12 }}>⚠️ 設定が未完了です</h1>
        <p style={{ fontSize: 13, color: 'var(--c-ink-2)', lineHeight: 1.8, maxWidth: 360 }}>
          Supabase の環境変数が設定されていません。<br />
          <code style={{ fontSize: 11 }}>VITE_SUPABASE_URL</code> と{' '}
          <code style={{ fontSize: 11 }}>VITE_SUPABASE_ANON_KEY</code> を設定してください。
        </p>
      </div>
    );
  }

  // 📩 確認メール待ちの全画面ステップ。signup 後にフォームへ小さく緑文字を出すだけ
  //    だと多くの人がメール離脱後に迷子になり離脱（中断離脱の最大谷）。宛先・次の
  //    行動・迷惑メール案内・再送・ログイン戻りを明示して取りこぼしを減らす。
  if (confirmSentTo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 'env(safe-area-inset-top, 0px) max(env(safe-area-inset-right, 0px), 20px) env(safe-area-inset-bottom, 0px) max(env(safe-area-inset-left, 0px), 20px)' }}>
        <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }} aria-hidden="true">📩</div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--c-ink)', margin: '0 0 12px' }}>確認メールを送りました</h1>
          <p style={{ fontSize: 14, color: 'var(--c-ink-soft)', lineHeight: 1.9, margin: '0 0 8px' }}>
            <strong style={{ wordBreak: 'break-all' }}>{confirmSentTo}</strong> 宛にメールを送りました。<br />
            {isNative
              // ネイティブでは確認リンクは Safari（Web）で開く — 「そのまま進める」と
              // 約束すると迷子になる。確認後にこのアプリへ戻る導線を正しく案内する。
              ? 'メール内のリンクを開いて確認が完了したら、このアプリに戻ってログインしてください。'
              : 'メール内のリンクをタップすると登録が完了し、そのままアプリに進めます。'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--c-ink-2)', lineHeight: 1.8, margin: '0 0 20px' }}>
            数分待っても届かない場合は、<strong>迷惑メール / プロモーション</strong>フォルダもご確認ください。
          </p>
          {error && <p style={{ color: 'var(--c-critical)', fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>{error}</p>}
          {info && <p style={{ color: 'var(--c-positive)', fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>{info}</p>}
          <button
            type="button"
            onClick={() => { setConfirmSentTo(''); setInfo(''); setError(''); switchMode('signin'); }}
            style={btnPrimary}
          >
            確認が済んだので、ログインする
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            style={{ ...btnLink, opacity: resending ? 0.6 : 1 }}
          >
            {resending ? '再送中…' : '確認メールを再送する'}
          </button>

        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 'env(safe-area-inset-top, 0px) max(env(safe-area-inset-right, 0px), 20px) env(safe-area-inset-bottom, 0px) max(env(safe-area-inset-left, 0px), 20px)' }}>
      {/* ロゴをページ見出し(h1)として提供。alt="Orime" がアクセシブルな見出し名になる。
          aspectRatio で読み込み前にスペースを確保しCLSを防ぐ。 */}
      <h1 style={{ margin: '0 0 14px' }}>
        <img
          src="/logo-lockup.png"
          alt="Orime"
          width={168}
          height={156}
          style={{ width: 168, height: 'auto', aspectRatio: '430 / 400', display: 'block' }}
        />
      </h1>
      <p style={{ fontSize: 14, color: 'var(--c-ink-2)', marginBottom: 28, textAlign: 'center' }}>
        読みっぱなしを、やめる。<br />気づきを後から呼び戻し、行動に変える読書アプリ。
      </p>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 340 }}>
        <h2 style={{ fontSize: 16, color: 'var(--c-ink)', marginBottom: 16, textAlign: 'center', fontWeight: 500 }}>{title}</h2>
        {/* 🍎 Sign in with Apple — メール確認の往復が不要でワンタップ。HIG 準拠で
            メール認証より目立つ位置（上）に、公式カラー（黒）で置く。 */}
        {showAppleButton && mode !== 'reset' && (
          <>
            <button
              type="button"
              onClick={handleApple}
              disabled={appleBusy}
              aria-label="Appleでサインイン"
              style={{
                width: '100%', minHeight: 48, display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', gap: 8, background: '#000', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-md)', fontFamily: 'inherit', fontSize: 15,
                fontWeight: 600, cursor: appleBusy ? 'default' : 'pointer', opacity: appleBusy ? 0.6 : 1,
              }}
            >
              <svg width="16" height="19" viewBox="0 0 16 19" fill="currentColor" aria-hidden="true">
                <path d="M13.09 10.06c-.02-2.14 1.75-3.17 1.83-3.22-1-1.46-2.55-1.66-3.1-1.68-1.32-.13-2.58.78-3.25.78-.67 0-1.7-.76-2.8-.74-1.44.02-2.77.84-3.51 2.13-1.5 2.6-.38 6.44 1.07 8.55.71 1.03 1.55 2.19 2.66 2.15 1.07-.04 1.47-.69 2.76-.69 1.29 0 1.65.69 2.78.67 1.15-.02 1.87-1.05 2.57-2.09.81-1.2 1.14-2.36 1.16-2.42-.03-.01-2.22-.85-2.24-3.37zM10.94 3.78c.59-.72.99-1.71.88-2.71-.85.03-1.89.57-2.5 1.28-.55.63-1.03 1.65-.9 2.62.95.07 1.92-.48 2.52-1.19z"/>
              </svg>
              {appleBusy ? 'サインイン中…' : 'Appleでサインイン'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--c-hairline)' }} />
              <span style={{ fontSize: 11, color: 'var(--c-ink-3)' }}>または</span>
              <span style={{ flex: 1, height: 1, background: 'var(--c-hairline)' }} />
            </div>
          </>
        )}
        {mode === 'signup' && !isNative && (
          /* App-only 配信方針: Web で登録しても利用はアプリから。登録前に伝えて
             「登録したのに使えない」という期待外れ（最悪の初回体験）を防ぐ。 */
          <p style={{ fontSize: 12, color: 'var(--c-ink-2)', lineHeight: 1.8, margin: '0 0 12px', textAlign: 'center' }}>
            Orime は iPhone / iPad アプリでのご利用となります。<br />
            ここで登録したアカウントで、アプリからログインできます。{' '}
            <a href="/lp" style={{ color: 'var(--c-ink-2)' }}>サービス紹介を見る</a>
          </p>
        )}
        {mode === 'signup' && (
          <input
            style={inp}
            type="text"
            placeholder="表示名（任意）"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={blockEnterWhileComposing}
            autoComplete="name"
            maxLength={LIMITS.displayName}
          />
        )}
        <input
          style={inp}
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={blockEnterWhileComposing}
          required
          autoComplete="email"
          maxLength={LIMITS.email}
        />
        {mode !== 'reset' && (
          <input
            style={inp}
            type="password"
            placeholder={mode === 'signup' ? 'パスワード（8文字以上、英字＋数字）' : 'パスワード'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={blockEnterWhileComposing}
            required
            minLength={mode === 'signup' ? 8 : 6}
            maxLength={LIMITS.password}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        )}
        {mode === 'signup' && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--c-ink-soft)', lineHeight: 1.6, marginBottom: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0 }}
            />
            <span>
              <a href="/legal/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-brand)' }}>利用規約</a>
              {' '}と{' '}
              <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-brand)' }}>プライバシーポリシー</a>
              {' '}に同意します
            </span>
          </label>
        )}
        {error && <p style={{ color: 'var(--c-critical)', fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>{error}</p>}
        {info && <p style={{ color: 'var(--c-positive)', fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>{info}</p>}
        <button
          type="submit"
          style={{ ...btnPrimary, opacity: loading || (mode === 'signup' && !agreed) ? 0.6 : 1 }}
          disabled={loading || (mode === 'signup' && !agreed)}
        >
          {submitLabel}
        </button>
      </form>
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 340, alignItems: 'center' }}>
        {mode !== 'signin' && (
          <button type="button" onClick={() => switchMode('signin')} style={btnLink}>
            ← ログインに戻る
          </button>
        )}
        {mode === 'signin' && (
          <>
            <button type="button" onClick={() => switchMode('signup')} style={btnLink}>
              アカウントをお持ちでない方はこちら
            </button>
            <button type="button" onClick={() => switchMode('reset')} style={btnLink}>
              パスワードをお忘れの方
            </button>
          </>
        )}
      </div>
    </div>
  );
}
