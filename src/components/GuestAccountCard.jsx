// 👤 登録せずに始めた人の「アカウントを作る」（設定のいちばん上・2026-11-19・App 審査 5.1.1(v)）。
// Apple ID かメールアドレスを、いまのアカウントにつなぐ。本・メモ・行動・プランはそのまま（利用者の id は変わらない）。
// 登録は任意。つながない間は「アプリを消すと戻れない」ことだけを伝える（押しつけない・赤くしない）。
import { useEffect, useState } from 'react';
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
const descStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 'var(--space-1) 0 0', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const errStyle = { fontSize: 'var(--text-sub)', color: 'var(--error)', margin: 0, lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const hintStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: '0 0 var(--space-3)', lineHeight: 1.5 };
const infoStyle = { fontSize: 'var(--text-meta)', color: 'var(--text)', margin: 0, lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const inp = { ...uiInput, marginBottom: 'var(--space-2)' };

// Apple のブランドの黒いボタン（ログインの画面と同じ例外の色）
const appleBtn = { ...btnPrimary, width: '100%', background: 'var(--apple-btn-bg)', color: 'var(--apple-btn-ink)', opacity: 1, fontWeight: 600 };
const cardBody = { padding: 'var(--space-4) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

function AppleMark() {
  return (
    <svg width="16" height="19" viewBox="0 0 16 19" fill="currentColor" aria-hidden="true">
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
  const [email, setEmail] = useState(pendingEmail);
  const [pwSkipped, setPwSkipped] = useState(false);

  // 設定を開いたら、いまの状態を取り直す（メールのリンクを開いてつながっていれば、ふつうの表示に変わる＝useAuth）
  useEffect(() => {
    supabase.auth.refreshSession().catch(() => { /* 次の更新で */ });
  }, []);

  const checkLinked = async () => {
    if (busy) return;
    setError('');
    setBusy('check');
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data?.user && !data.user.is_anonymous) {
        toast.success('アカウントができました。ほかの端末でも同じ本とメモが使えます。');
      } else {
        setError('まだ確認できていません。届いたメールのリンクを開いてから、もう一度押してください。');
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy('');
    }
  };
  const [password, setPassword] = useState('');
  const showApple = isNativeApple || GUEST_START_AVAILABLE;

  const fail = (err) => {
    console.error('[account] link failed:', err);
    setError(linkErrorMessage(err) || toMessage(err, 'つなげませんでした。少し時間をおいて、もう一度お試しください。'));
  };

  const linkApple = async () => {
    if (busy) return;
    setError('');
    setBusy('apple');
    try {
      await linkAppleToCurrentUser();
      try { await supabase.auth.refreshSession(); } catch { /* 次の更新で */ }
      track(EVENTS.GUEST_LINKED, { via: 'apple' });
      toast.success('Apple ID とつなぎました。ほかの端末でも同じ本とメモが使えます。');
    } catch (err) {
      if (!err?.canceled) fail(err);
    } finally {
      setBusy('');
    }
  };

  const sendEmail = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!email.trim()) { setError('メールアドレスを入力してください。'); return; }
    const pwProblem = validatePassword(password);
    if (pwProblem) { setError(pwProblem); return; }
    setBusy('email');
    try {
      const r = await linkEmailToCurrentUser(email.trim(), password);
      setPwSkipped(Boolean(r?.passwordSkipped));
      track(EVENTS.GUEST_LINKED, { via: 'email_sent' });
      setMode('sent');
    } catch (err) {
      fail(err);
    } finally {
      setBusy('');
    }
  };

  if (mode === 'sent') {
    return (
      <div style={cardBody} role="status">
        <p style={titleStyle}>確認のメールを送りました</p>
        <p style={infoStyle}>{withPhraseBreaks(`${email.trim()} に届いたメールのリンクを開くと、アカウントができます。${pwSkipped || (pendingEmail && !password) ? 'ほかの端末では、ログインの画面の「パスワードをお忘れの方」からパスワードを決めてログインできます。' : 'ほかの端末では、このメールアドレスとパスワードでログインできます。'}`)}</p>
        <button type="button" style={{ ...btnPrimary, width: '100%', opacity: 1, cursor: busy ? 'default' : 'pointer' }} onClick={checkLinked} disabled={Boolean(busy)}>
          {busy === 'check' ? '確かめています…' : 'リンクを開いたので、確かめる'}
        </button>
        <button type="button" style={{ ...btnLinkQuiet, width: '100%' }} onClick={() => { setMode('email'); setError(''); }}>
          メールアドレスを直す
        </button>
        {error && <p role="alert" style={errStyle}>{withPhraseBreaks(error)}</p>}
      </div>
    );
  }

  return (
    <div style={cardBody}>
      <div>
        <p style={titleStyle}>アカウントを作っていません</p>
        <p style={descStyle}>{withPhraseBreaks('Apple かメールアドレスでアカウントを作ると、ほかの端末でも同じ本・メモ・プランが使えます。作らないままアプリを消すと、戻れなくなります。')}</p>
      </div>
      {mode === 'choose' && (
        <>
          {showApple && (
            <button type="button" style={{ ...appleBtn, cursor: busy ? 'default' : 'pointer' }} onClick={linkApple} disabled={Boolean(busy)}>
              <AppleMark />
              {busy === 'apple' ? 'つないでいます…' : 'Appleで登録'}
            </button>
          )}
          <button type="button" style={{ ...btnGhost, width: '100%' }} onClick={() => { setMode('email'); setError(''); }} disabled={Boolean(busy)}>
            メールアドレスで作る
          </button>
        </>
      )}
      {mode === 'email' && (
        <form onSubmit={sendEmail} style={{ display: 'flex', flexDirection: 'column' }}>
          <input
            style={inp}
            type="email"
            placeholder="メールアドレス"
            aria-label="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
            required
            autoComplete="email"
            maxLength={LIMITS.email}
          />
          <input
            style={{ ...inp, marginBottom: 'var(--space-1)' }}
            type="password"
            placeholder="パスワード"
            aria-label="パスワード"
            aria-describedby="guest-pw-rule"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
            required
            minLength={8}
            maxLength={LIMITS.password}
            autoComplete="new-password"
          />
          <p id="guest-pw-rule" style={hintStyle}>パスワードは 8&nbsp;文字以上で、英字と数字を含めてください</p>
          {/* 押せない状態にしない（暗い設定のカードの面と同じ色で消えた・2026-11-19 ui-critic）。押したときに確かめる。 */}
          <button type="submit" style={{ ...btnPrimary, width: '100%', opacity: 1, cursor: busy ? 'default' : 'pointer' }} disabled={Boolean(busy)}>
            {busy === 'email' ? '送っています…' : '確認のメールを送る'}
          </button>
          <button type="button" style={{ ...btnLinkQuiet, width: '100%', marginTop: 'var(--space-2)' }} onClick={() => { setMode('choose'); setError(''); }}>
            やめる
          </button>
        </form>
      )}
      {error && <p role="alert" style={errStyle}>{withPhraseBreaks(error)}</p>}
    </div>
  );
}
