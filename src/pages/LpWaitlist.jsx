// ✉️ 公開のお知らせの入口（App Store の URL＝VITE_APP_STORE_URL が無い間だけ・2026-10-05）。
//
// 押せない「App Store で近日公開」のボタンの代わりに、メール 1 欄＋「送る」。送ると api/lp-waitlist.js が
// lp_waitlist に 1 行入れる（同じメールは 1 行）。送ったあとは「公開の日にお知らせします。」。
// LP の中に何か所か置くが、1 か所で送ったら全部が「お知らせします」になる（状態は Landing.jsx が持つ）。
// メールの使い道（公開のお知らせだけ・公開から 3 か月以内に消去）とプライバシーポリシーへのリンクを欄の下に必ず出す
// （プライバシーポリシーの「公開のお知らせのメールアドレス」と同じ約束）。
// 記録: waitlist_submit（props.ok・失敗は props.error・props.loc＝置いた場所）。
import { useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { lpTrack, submitWaitlist } from '../lib/lpTrack';
import Phrases from './LpPhrases';
import { noBreak } from '../lib/foundingOffer';

// 送る前に画面で確かめる形（サーバーでもう一度確かめる）。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ERRORS = {
  invalid_email: 'メールアドレスの形を確かめてください。',
  rate_limited: '続けて送られたため、受け付けられませんでした。少し時間をおいて、もう一度お試しください。',
  unavailable: 'いま受け付けられませんでした。少し時間をおいて、もう一度お試しください。',
  network: 'つながらなかったため、送れませんでした。通信を確かめて、もう一度お試しください。',
};

export const WAITLIST_NOTE = `メールは、公開のお知らせにだけ使い、公開から ${noBreak('3 か月以内')}に消去します。`;

export default function LpWaitlist({ loc, done, onDone, launch, center = false }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const hpRef = useRef(null);
  const doneRef = useRef(null);

  if (done) {
    return (
      <div className={`lp-wl${center ? ' is-center' : ''}`}>
        {launch && <p className="lp-wl-when lp-wbr"><Phrases>{launch}</Phrases></p>}
        <p className="lp-wl-done" role="status" tabIndex={-1} ref={doneRef}>
          <Check size="1.1em" strokeWidth={2.4} aria-hidden="true" />
          <span>公開の日にお知らせします。</span>
        </p>
        <p className="lp-wl-note lp-wbr"><Phrases>{WAITLIST_NOTE}</Phrases><a href="/legal/privacy">プライバシーポリシー</a></p>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    const v = email.trim();
    if (!EMAIL_RE.test(v)) { setError(ERRORS.invalid_email); return; }
    setSending(true);
    setError('');
    const r = await submitWaitlist({ email: v, website: hpRef.current?.value || '' });
    setSending(false);
    lpTrack('waitlist_submit', r.ok ? { ok: true, loc } : { ok: false, loc, error: r.error });
    if (r.ok) onDone?.();
    else setError(ERRORS[r.error] || ERRORS.unavailable);
  };

  return (
    <form className={`lp-wl${center ? ' is-center' : ''}`} onSubmit={submit} noValidate>
      {launch && <p className="lp-wl-when lp-wbr"><Phrases>{launch}</Phrases></p>}
      <label className="lp-wl-label lp-wbr" htmlFor={`${id}-email`}><Phrases>公開の日に、メールでお知らせします</Phrases></label>
      <div className="lp-wl-row">
        <input
          id={`${id}-email`}
          className="lp-wl-input"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
          aria-invalid={error === ERRORS.invalid_email ? 'true' : undefined}
          aria-describedby={`${id}-note${error ? ` ${id}-err` : ''}`}
          required
        />
        {/* 押している間も薄くせず、文字だけ変える（DESIGN §5「押せないボタン」） */}
        <button type="submit" className="lp-btn" aria-disabled={sending || undefined}>{sending ? '送っています…' : '送る'}</button>
      </div>
      {/* 人には見えない欄（機械の送信よけ）。読み上げ・タブ移動からも外す */}
      <input ref={hpRef} className="lp-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {error && <p className="lp-wl-error" id={`${id}-err`} role="alert">{error}</p>}
      <p className="lp-wl-note lp-wbr" id={`${id}-note`}><Phrases>{WAITLIST_NOTE}</Phrases><a href="/legal/privacy">プライバシーポリシー</a></p>
    </form>
  );
}
