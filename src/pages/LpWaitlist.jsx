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
// メールの形が違うとき、どこが違うかを言う（2026-11-21 ui-critic「何が違うかを言えるとなお良い」）。合っていれば ''。
export function emailProblem(raw) {
  const v = String(raw || '').trim();
  if (!v) return 'メールアドレスを入れてください。';
  if (/[＠．]/.test(v)) return '「＠」か「．」が全角です。半角で入れてください。';
  if (/\s/.test(v)) return 'メールアドレスに空白が入っています。';
  const at = (v.match(/@/g) || []).length;
  if (at === 0) return '「@」が入っていません。例：you@example.com';
  if (at > 1) return '「@」が 2 つ以上入っています。';
  const [local, domain] = v.split('@');
  if (!local) return '「@」の前が空いています。例：you@example.com';
  if (!domain) return '「@」の後ろが空いています。例：you@example.com';
  if (!/\.[^.]{2,}$/.test(domain)) return '「@」の後ろの「.com」などが足りません。';
  if (!EMAIL_RE.test(v)) return 'メールアドレスの形が違います。例：you@example.com';
  return '';
}
const ERRORS = {
  invalid_email: 'メールアドレスの形が違います。例：you@example.com',
  rate_limited: '短い間に何度も送られました。少し待ってから、もう一度お試しください。',
  unavailable: 'いま受け付けられませんでした。少し時間をおいて、もう一度お試しください。',
  network: '送れませんでした。通信状況を確認して、もう一度お試しください。',
};

export const WAITLIST_NOTE = `メールは、公開のお知らせにだけ使い、公開から ${noBreak('3 か月以内')}に消去します。`;

export default function LpWaitlist({ loc, done, onDone, launch, center = false }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
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
    const problem = emailProblem(v);
    if (problem) { setError(problem); setInvalid(true); return; }
    setSending(true);
    setError('');
    setInvalid(false);
    const r = await submitWaitlist({ email: v, website: hpRef.current?.value || '' });
    setSending(false);
    lpTrack('waitlist_submit', r.ok ? { ok: true, loc } : { ok: false, loc, error: r.error });
    if (r.ok) onDone?.();
    else { setError(ERRORS[r.error] || ERRORS.unavailable); setInvalid(r.error === 'invalid_email'); }
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
          onChange={(e) => { setEmail(e.target.value); if (error) { setError(''); setInvalid(false); } }}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={`${id}-note${error ? ` ${id}-err` : ''}`}
          required
        />
        {/* 押している間も薄くせず、文字だけ変える（DESIGN §5「押せないボタン」） */}
        <button type="submit" className="lp-btn" aria-disabled={sending || undefined}>{sending ? '送信中…' : '送る'}</button>
      </div>
      {/* 人には見えない欄（機械の送信よけ）。読み上げ・タブ移動からも外す */}
      <input ref={hpRef} className="lp-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {error && <p className="lp-wl-error lp-wbr" id={`${id}-err`} role="alert"><Phrases>{error}</Phrases></p>}
      <p className="lp-wl-note lp-wbr" id={`${id}-note`}><Phrases>{WAITLIST_NOTE}</Phrases><a href="/legal/privacy">プライバシーポリシー</a></p>
    </form>
  );
}
