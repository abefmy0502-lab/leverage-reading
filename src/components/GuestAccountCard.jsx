// 👤 登録せずに始めた人の「アカウントを作る」（設定のいちばん上・2026-11-19・App 審査 5.1.1(v)）。
// Apple ID かメールアドレスを、いまのアカウントにつなぐ。本・メモ・行動・プランはそのまま（利用者の id は変わらない）。
// 登録は任意。つながない間は「アプリを消すと戻れない」ことだけを伝える（押しつけない・赤くしない）。
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { isNativeApple, linkAppleToCurrentUser } from '../lib/appleAuth';
import { GUEST_START_AVAILABLE, linkEmailToCurrentUser, linkErrorMessage } from '../lib/guestAuth';
import { validatePassword, LIMITS } from '../lib/limits';
import { toMessage } from '../lib/errors';
import { useToast } from './Toast';
import { btnPrimary, btnGhost, btnLinkQuiet, input as uiInput } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';
import { track, EVENTS } from '../lib/analytics';

const titleStyle = { fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.5 };
const descStyle = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 'var(--space-2) 0 0', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const errStyle = { fontSize: 'var(--text-sub)', color: 'var(--error)', margin: 0, lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const hintStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: '0 0 var(--space-3)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const infoStyle = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 0, lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const inp = { ...uiInput, marginBottom: 'var(--space-2)' };
// 間違えた欄は枠を --error に（入力中の --accent の枠のままだとエラーに見えない）
const inpBad = { borderColor: 'var(--error)' };
// 主ボタンのすぐ上に置くエラー（どのボタンの話か分かるように・2026-11-19 ui-critic）
const errAbove = { ...errStyle, margin: '0 0 var(--space-2)' };

// Apple のブランドの黒いボタン（ログインの画面と同じ例外の色）
const appleBtn = { ...btnPrimary, width: '100%', background: 'var(--apple-btn-bg)', color: 'var(--apple-btn-ink)', opacity: 1, fontWeight: 600 };
const PW_RULE = 'パスワードは 8\u00a0文字以上で、英字と数字を含めてください';
const RESEND_WAIT_MS = 60000;
const cardBody = { padding: 'var(--space-4) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

function AppleMark() {
  return (
    // 文字の大きさに合わせる（em・文字サイズ最大でマークだけ小さく残らない・DESIGN §2）
    <svg width="0.94em" height="1.12em" viewBox="0 0 16 19" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M13.09 10.06c-.02-2.14 1.75-3.17 1.83-3.22-1-1.46-2.55-1.66-3.1-1.68-1.32-.13-2.58.78-3.25.78-.67 0-1.7-.76-2.8-.74-1.44.02-2.77.84-3.51 2.13-1.5 2.6-.38 6.44 1.07 8.55.71 1.03 1.55 2.19 2.66 2.15 1.07-.04 1.47-.69 2.76-.69 1.29 0 1.65.69 2.78.67 1.15-.02 1.87-1.05 2.57-2.09.81-1.2 1.14-2.36 1.16-2.42-.03-.01-2.22-.85-2.24-3.37zM10.94 3.78c.59-.72.99-1.71.88-2.71-.85.03-1.89.57-2.5 1.28-.55.63-1.03 1.65-.9 2.62.95.07 1.92-.48 2.52-1.19z" />
    </svg>
  );
}

export default function GuestAccountCard() {
  const toast = useToast();
  const { user } = useAuth();
  // 確認のメールを送ったあと（まだリンクを開いていない）は、設定を開き直しても「送りました」から（Supabase の new_email）
  const pendingEmail = user?.new_email || '';
  const [mode, setMode] = useState(pendingEmail ? 'sent' : 'choose'); // choose | email | sent
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // どこの話のエラーか: '' | 'email'（メールの欄）| 'password'（パスワードの欄の決まりの文に出す）| 'top'（欄の上に）
  const [errorAt, setErrorAt] = useState('');
  const [email, setEmail] = useState(pendingEmail);
  const [password, setPassword] = useState('');
  const [pwSkipped, setPwSkipped] = useState(false);
  // もう一度送ったあと（カードの中に知らせを残す・60 秒は押せない＝送信の回数の上限に当たらないように・2026-11-19 ui-critic）
  const [resent, setResent] = useState(false);
  const [resendWait, setResendWait] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const showApple = isNativeApple || GUEST_START_AVAILABLE;

  // 設定を開いたら、いまの状態を取り直す（メールのリンクを開いてつながっていれば、ふつうの表示に変わる＝useAuth）
  useEffect(() => {
    supabase.auth.refreshSession().catch(() => { /* 次の更新で */ });
  }, []);

  const clearError = () => { setError(''); setErrorAt(''); };
  const showError = (msg, at = '') => { setError(msg); setErrorAt(at); };
  const errorText = (err) => linkErrorMessage(err) || toMessage(err, 'つなげませんでした。少し時間をおいて、もう一度お試しください。');
  const go = (next) => { setMode(next); clearError(); };

  const linkApple = async () => {
    if (busy) return;
    clearError();
    setBusy('apple');
    try {
      await linkAppleToCurrentUser();
      try { await supabase.auth.refreshSession(); } catch { /* 次の更新で */ }
      track(EVENTS.GUEST_LINKED, { via: 'apple' });
      toast.success('Apple ID とつなぎました。ほかの端末でも同じ本とメモが使えます。');
    } catch (err) {
      if (err?.canceled) return;
      console.error('[account] apple link failed:', err);
      if (linkErrorKind(err) === 'apple_taken') {
        // この Apple ID はもう使われている → すすめるメールの形へそのまま移る（押す回数を減らす・2026-11-19 ui-critic）
        setMode('email');
        showError(errorText(err), 'top');
        setTimeout(() => emailRef.current?.focus(), 0);
      } else {
        showError(errorText(err));
      }
    } finally {
      setBusy('');
    }
  };

  const send = async (addr, pw) => {
    const r = await linkEmailToCurrentUser(addr, pw);
    setPwSkipped(Boolean(r?.passwordSkipped) || !pw);
    return r;
  };

  const sendEmail = async (e) => {
    e.preventDefault();
    if (busy) return;
    clearError();
    const at = email.trim();
    if (!at || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(at)) {
      showError(at ? 'メールアドレスの形を確かめてください。' : 'メールアドレスを入力してください。', 'email');
      emailRef.current?.focus(); return;
    }
    const pwProblem = validatePassword(password);
    // 決まりの文の代わりに出すので、決まりの全体を言う（直したあとに「英字と数字」でもう一度止めない）。推測されやすいときだけその文
    if (pwProblem) { showError(/推測/.test(pwProblem) ? pwProblem : `${PW_RULE}。`, 'password'); passwordRef.current?.focus(); return; }
    setBusy('email');
    try {
      await send(at, password);
      track(EVENTS.GUEST_LINKED, { via: 'email_sent' });
      setMode('sent');
    } catch (err) {
      console.error('[account] email link failed:', err);
      if (linkErrorKind(err) === 'email_taken') { showError(errorText(err), 'email'); emailRef.current?.focus(); }
      else showError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const checkLinked = async () => {
    if (busy) return;
    clearError();
    setBusy('check');
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data?.user && !data.user.is_anonymous) {
        toast.success('アカウントができました。ほかの端末でも同じ本とメモが使えます。');
      } else {
        showError('まだ確認できていません。届いたメールのリンクを開いてから、もう一度押してください。');
      }
    } catch (err) {
      showError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  // 届かないときは、同じアドレスでもう一度（パスワードは最初の回で決めてあるので送らない）
  const resend = async () => {
    if (busy || resendWait) return;
    clearError();
    setBusy('resend');
    try {
      await linkEmailToCurrentUser(email.trim());
      setResent(true);
      setResendWait(true);
      setTimeout(() => setResendWait(false), RESEND_WAIT_MS);
    } catch (err) {
      showError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const alertP = (style) => (error ? <p role="alert" style={style}>{withPhraseBreaks(error)}</p> : null);

  if (mode === 'sent') {
    return (
      <div style={cardBody} role="status">
        <div>
          <p style={titleStyle}>確認のメールを送りました</p>
          <p style={{ ...infoStyle, marginTop: 'var(--space-2)' }}>{withPhraseBreaks(`${email.trim()} に届いたメールのリンクを開くと、アカウントができます。${pwSkipped ? 'ほかの端末では、ログインの画面の「パスワードをお忘れの方」からパスワードを決めてログインできます。' : 'ほかの端末では、このメールアドレスとパスワードでログインできます。'}`)}</p>
        </div>
        {alertP({ ...errStyle, marginBottom: 'calc(-1 * var(--space-1))' })}
        <button type="button" style={{ ...btnPrimary, width: '100%', opacity: 1, cursor: busy ? 'default' : 'pointer' }} onClick={checkLinked} disabled={Boolean(busy)}>
          {busy === 'check' ? '確かめています…' : 'リンクを開いたので、確かめる'}
        </button>
        {resent && <p role="status" style={infoStyle}>{withPhraseBreaks('もう一度送りました。迷惑メールのフォルダも見てください。')}</p>}
        {/* 文字ボタンの間は 8（文字を大きくすると 1 つの塊に見える・AuthScreen と同じ） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <button type="button" style={{ ...btnLinkQuiet, width: '100%', ...(resendWait ? { color: 'var(--text-3)', cursor: 'default' } : null) }} onClick={resend} disabled={Boolean(busy) || resendWait}>
            {busy === 'resend' ? '送っています…' : resendWait ? '60 秒後に、もう一度送れます' : 'メールが届かないときは、もう一度送る'}
          </button>
          <button type="button" style={{ ...btnLinkQuiet, width: '100%' }} onClick={() => go('email')} disabled={Boolean(busy)}>
            メールアドレスを直す
          </button>
        </div>
      </div>
    );
  }

  const pwRuleIsError = errorAt === 'password' && error;
  return (
    <div style={cardBody}>
      <div>
        <p style={titleStyle}>アカウントを作っていません</p>
        <p style={descStyle}>{withPhraseBreaks('Apple かメールアドレスでアカウントを作ると、ほかの端末でも同じ本・メモ・プランが使えます。作らないままアプリを消すと、戻れなくなります。')}</p>
      </div>
      {mode === 'choose' && (
        <>
          {/* つなげなかったときは、押したボタンのすぐ上に（2026-11-19 ui-critic） */}
          {alertP({ ...errStyle, marginBottom: 'calc(-1 * var(--space-1))' })}
          {showApple && (
            <button type="button" style={{ ...appleBtn, cursor: busy ? 'default' : 'pointer' }} onClick={linkApple} disabled={Boolean(busy)}>
              <AppleMark />
              {busy === 'apple' ? 'つないでいます…' : 'Appleで登録'}
            </button>
          )}
          <button type="button" style={{ ...btnGhost, width: '100%' }} onClick={() => go('email')} disabled={Boolean(busy)}>
            メールアドレスで作る
          </button>
        </>
      )}
      {mode === 'email' && (
        <form onSubmit={sendEmail} noValidate style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Apple ID がもう使われていて移ってきたとき（どこの話でもない知らせ）は欄の上に */}
          {errorAt === 'top' && alertP(errAbove)}
          <input
            ref={emailRef}
            style={errorAt === 'email' ? { ...inp, ...inpBad } : inp}
            aria-invalid={errorAt === 'email' || undefined}
            aria-describedby={errorAt === 'email' ? 'guest-email-error' : undefined}
            type="email"
            placeholder="メールアドレス"
            aria-label="メールアドレス"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (errorAt === 'email') clearError(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
            autoComplete="email"
            maxLength={LIMITS.email}
          />
          {errorAt === 'email' && error && <p id="guest-email-error" role="alert" style={errAbove}>{withPhraseBreaks(error)}</p>}
          <input
            ref={passwordRef}
            style={{ ...inp, marginBottom: 'var(--space-1)', ...(pwRuleIsError ? inpBad : null) }}
            aria-invalid={pwRuleIsError ? true : undefined}
            type="password"
            placeholder="パスワード"
            aria-label="パスワード"
            aria-describedby="guest-pw-rule"
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (errorAt === 'password') clearError(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
            autoComplete="new-password"
            maxLength={LIMITS.password}
          />
          {/* パスワードのエラーは、決まりの文をそのままエラーの文と色に替える（同じことを 2 回言わない・2026-11-19 ui-critic） */}
          <p id="guest-pw-rule" role={pwRuleIsError ? 'alert' : undefined} style={pwRuleIsError ? { ...hintStyle, fontSize: 'var(--text-sub)', color: 'var(--error)' } : hintStyle}>
            {withPhraseBreaks(pwRuleIsError ? error : PW_RULE)}
          </p>
          {/* 送れなかったとき（通信など・欄のどちらの話でもない）は主ボタンのすぐ上に */}
          {errorAt === '' && alertP(errAbove)}
          {/* 押せない状態にしない（暗い設定のカードの面と同じ色で消えた・2026-11-19 ui-critic）。押したときに確かめる。 */}
          <button type="submit" style={{ ...btnPrimary, width: '100%', opacity: 1, cursor: busy ? 'default' : 'pointer' }} disabled={Boolean(busy)}>
            {busy === 'email' ? '送っています…' : '確認のメールを送る'}
          </button>
          <button type="button" style={{ ...btnLinkQuiet, width: '100%', marginTop: 'var(--space-2)' }} onClick={() => go('choose')}>
            やめる
          </button>
        </form>
      )}
    </div>
  );
}

// つなぐときのエラーの種類（どの欄の話か）
function linkErrorKind(err) {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  if (code === 'identity_already_exists' || msg.includes('already linked') || msg.includes('identity is already')) return 'apple_taken';
  if (code === 'email_exists' || msg.includes('already been registered') || msg.includes('already registered')) return 'email_taken';
  return '';
}
