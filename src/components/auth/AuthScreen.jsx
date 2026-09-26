import { useState, useEffect } from 'react';
import { TERMS_URL, PRIVACY_URL } from '../../lib/legalLinks';
import { useAuth } from '../../hooks/useAuth';
import { isSupabaseConfigured } from '../../lib/supabase';
import { LIMITS, validatePassword } from '../../lib/limits';
import { signInWithApple, isNativeApple, isAppleSignInAvailable } from '../../lib/appleAuth';
import { btnPrimary as uiBtnPrimary, btnText, input } from '../../styles/ui';
import { isNative } from '../../lib/iap';
import { MailCheck } from 'lucide-react';

// ボタン正典（styles/ui.js）に統一。初対面画面のボタンだけ radius/weight が
// 微妙に別物だと第一印象で「寄せ集め感」が出るため。
const btnPrimary = { ...uiBtnPrimary, width: '100%' };

// 文字だけのボタン（DESIGN §5「文字」＝リンク風・--accent）。補助リンクなので文字は --text-sub。
const btnLink = { ...btnText, fontSize: 'var(--text-sub)', minHeight: 44 };

// 入力欄の正典（ui.js の input: 角丸 12・枠 --border・高さ 48）。
const inp = { ...input, marginBottom: 'var(--space-3)' };

// 画面の外側余白: 左右 16（DESIGN §1）。ノッチ・ホームインジケータがある端末はセーフエリアを優先。
const screenPadding =
  'max(env(safe-area-inset-top, 0px), var(--space-4)) max(env(safe-area-inset-right, 0px), var(--space-4)) ' +
  'max(env(safe-area-inset-bottom, 0px), var(--space-4)) max(env(safe-area-inset-left, 0px), var(--space-4))';

const screenStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: screenPadding,
  boxSizing: 'border-box',
};

// エラー / 完了の一言（色だけに頼らず文でも伝わる。読み上げにも届くよう role を付ける）。
const errorText = { color: 'var(--error)', fontSize: 'var(--text-meta)', lineHeight: 1.5, margin: '0 0 var(--space-3)' };
// 日本語の折り返し: iOS Safari は word-break: auto-phrase が効かないので、短い案内文は
// 文そのものを短く切り、<br /> で改行位置を決める（358pt 幅で 1 文字だけの行を出さない）。
const jpWrap = { textWrap: 'pretty' };
// 規約・プライバシーポリシーのリンク（文字ボタン・押せる範囲は高さ 44）。
const legalLink = { display: 'inline-flex', alignItems: 'center', minHeight: 44, color: 'var(--accent)', fontSize: 'var(--text-meta)', fontWeight: 600, textDecoration: 'none' };
// 同意のチェックボックス（24 角）。リンク行はチェックボックス＋間隔ぶん字下げして文字の頭に揃える。
const checkboxSize = 'var(--space-6)';

const infoText = { color: 'var(--success)', fontSize: 'var(--text-meta)', lineHeight: 1.5, margin: '0 0 var(--space-3)' };

function humanizeError(err) {
  const msg = (err?.message || '').toLowerCase();
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
    return 'サーバーに接続できませんでした。通信環境をご確認のうえ、しばらくしてから再度お試しください。';
  }
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

  // ログイン画面では見出しを出さない（主ボタン「ログイン」と重複するため）。新規登録・リセットだけ出す。
  const title = mode === 'signup' ? '新規登録' : mode === 'reset' ? 'パスワードリセット' : '';
  const submitLabel = loading
    ? '処理中…'
    : mode === 'signin'
    ? 'ログイン'
    : mode === 'signup'
    ? '登録する'
    : 'リセットメールを送信';

  if (!isSupabaseConfigured) {
    return (
      <div style={{ ...screenStyle, textAlign: 'center' }}>
        <h1 style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: '0 0 var(--space-3)' }}>設定が未完了です</h1>
        <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, maxWidth: 360, margin: 0 }}>
          Supabase の環境変数が設定されていません。<br />
          <code style={{ fontSize: 'var(--text-meta)' }}>VITE_SUPABASE_URL</code> と{' '}
          <code style={{ fontSize: 'var(--text-meta)' }}>VITE_SUPABASE_ANON_KEY</code> を設定してください。
        </p>
      </div>
    );
  }

  // 確認メール待ちの全画面ステップ。signup 後にフォームへ小さく緑文字を出すだけ
  // だと多くの人がメール離脱後に迷子になり離脱（中断離脱の最大谷）。宛先・次の
  // 行動・迷惑メール案内・再送・ログイン戻りを明示して取りこぼしを減らす。
  if (confirmSentTo) {
    return (
      <div style={screenStyle}>
        <div style={{ width: '100%', maxWidth: 400, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <MailCheck size={44} strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" style={{ marginBottom: 'var(--space-3)' }} />
          <h1 style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: '0 0 var(--space-3)' }}>確認メールを送りました</h1>
          <p style={{ ...jpWrap, fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5, margin: '0 0 var(--space-2)' }}>
            <strong style={{ fontWeight: 600, wordBreak: 'break-all' }}>{confirmSentTo}</strong> 宛<br />
            {isNative
              // ネイティブでは確認リンクは Safari（Web）で開く — 「そのまま進める」と
              // 約束すると迷子になる。確認後にこのアプリへ戻る導線を正しく案内する。
              ? <>メール内のリンクで確認が済んだら、<br />このアプリに戻ってログインしてください。</>
              : <>メール内のリンクをタップすると<br />登録が完了し、そのままアプリに進めます。</>}
          </p>
          <p style={{ ...jpWrap, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 var(--space-6)' }}>
            数分待っても届かないときは、<br />
            <strong style={{ fontWeight: 600 }}>迷惑メール・プロモーション</strong>も確認してください。
          </p>
          {error && <p role="alert" style={errorText}>{error}</p>}
          {info && <p role="status" style={infoText}>{info}</p>}
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
            style={{ ...btnLink, marginTop: 'var(--space-3)', opacity: resending ? 0.6 : 1 }}
          >
            {resending ? '再送中…' : '確認メールを再送する'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={screenStyle}>
      {/* アプリアイコン＋文字のワードマークをページ見出し(h1)として提供（暗い画面でも読める）。 */}
      <h1 style={{ margin: '0 0 var(--space-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
        {/* アプリアイコン画像は iOS のアイコン形状（DESIGN §4 の例外＝中身の形）。 */}
        <img src="/icons/icon-192.png" alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 16, display: 'block' }} />
        <span style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.02em' }}>Orime</span>
      </h1>
      <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: '0 0 var(--space-8)', textAlign: 'center' }}>
        読むほど、自分だけの相談相手が育つ
      </p>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 400 }}>
        {title && (
          <h2 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: '0 0 var(--space-4)', textAlign: 'center' }}>{title}</h2>
        )}
        {/* Sign in with Apple — メール確認の往復が不要でワンタップ。HIG 準拠でメール認証より
            目立つ位置（上）に置く。色は Apple のブランド規定（黒地・白文字）に従う例外。 */}
        {showAppleButton && mode !== 'reset' && (
          <>
            <button
              type="button"
              onClick={handleApple}
              disabled={appleBusy}
              aria-label="Appleでサインイン"
              style={{
                ...btnPrimary,
                background: 'var(--apple-btn-bg)', color: 'var(--apple-btn-ink)',
                cursor: appleBusy ? 'default' : 'pointer', opacity: appleBusy ? 0.6 : 1,
              }}
            >
              <svg width="16" height="19" viewBox="0 0 16 19" fill="currentColor" aria-hidden="true">
                <path d="M13.09 10.06c-.02-2.14 1.75-3.17 1.83-3.22-1-1.46-2.55-1.66-3.1-1.68-1.32-.13-2.58.78-3.25.78-.67 0-1.7-.76-2.8-.74-1.44.02-2.77.84-3.51 2.13-1.5 2.6-.38 6.44 1.07 8.55.71 1.03 1.55 2.19 2.66 2.15 1.07-.04 1.47-.69 2.76-.69 1.29 0 1.65.69 2.78.67 1.15-.02 1.87-1.05 2.57-2.09.81-1.2 1.14-2.36 1.16-2.42-.03-.01-2.22-.85-2.24-3.37zM10.94 3.78c.59-.72.99-1.71.88-2.71-.85.03-1.89.57-2.5 1.28-.55.63-1.03 1.65-.9 2.62.95.07 1.92-.48 2.52-1.19z"/>
              </svg>
              {appleBusy ? 'サインイン中…' : 'Appleでサインイン'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', margin: 'var(--space-4) 0' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--separator)' }} />
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-3)' }}>または</span>
              <span style={{ flex: 1, height: 1, background: 'var(--separator)' }} />
            </div>
          </>
        )}
        {mode === 'signup' && !isNative && (
          /* App-only 配信方針: Web で登録しても利用はアプリから。登録前に伝えて
             「登録したのに使えない」という期待外れ（最悪の初回体験）を防ぐ。 */
          <p style={{ ...jpWrap, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 var(--space-4)', textAlign: 'center' }}>
            Orime は iPhone / iPad のアプリです。<br />
            登録後は、アプリからログインしてください。<br />
            <a href="/lp" style={{ ...legalLink, justifyContent: 'center' }}>サービス紹介を見る</a>
          </p>
        )}
        {mode === 'signup' && (
          <input
            style={inp}
            type="text"
            placeholder="表示名（任意）"
            aria-label="表示名（任意）"
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
          aria-label="メールアドレス"
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
            aria-label="パスワード"
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
          <div style={{ marginBottom: 'var(--space-3)' }}>
            {/* ラベルの中はチェックボックスと「同意します」の文だけ（行の高さ 44）。
                リンクを同じ行に置くと、リンクの近くを押しただけでチェックが切り替わるため、
                リンクは下の行に文字ボタンとして分ける。 */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 44, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ width: checkboxSize, height: checkboxSize, margin: 0, flexShrink: 0, accentColor: 'var(--accent)' }}
              />
              <span>利用規約とプライバシーポリシーに同意します</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-6)', paddingLeft: `calc(${checkboxSize} + var(--space-2))` }}>
              <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" style={legalLink}>利用規約</a>
              <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" style={legalLink}>プライバシーポリシー</a>
            </div>
          </div>
        )}
        {error && <p role="alert" style={errorText}>{error}</p>}
        {info && <p role="status" style={infoText}>{info}</p>}
        <button
          type="submit"
          style={{ ...btnPrimary, opacity: loading || (mode === 'signup' && !agreed) ? 0.6 : 1 }}
          disabled={loading || (mode === 'signup' && !agreed)}
        >
          {submitLabel}
        </button>
      </form>
      <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 0, width: '100%', maxWidth: 400, alignItems: 'center' }}>
        {mode !== 'signin' && (
          <button type="button" onClick={() => switchMode('signin')} style={btnLink}>
            ログインに戻る
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
