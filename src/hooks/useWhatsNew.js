// 🆕 更新したあと、はじめて開いたときに 1 回だけ「新しくなったこと」を出す（2026-10-05）。
//
// - ready（本を読み込み終えた）になったら 1 度だけ決める（lib/whatsNew.js の decideWhatsNew）
//   新規の人（初回ガイドがまだ・本が 0 冊）には出さず、いまの版を見たことにする
// - 出すのはホームが落ち着いたとき（safe＝新しい版の知らせと同じ条件＋初日クイックスタート・取り込み・共有などが閉じている）。
//   さらに、入力欄にカーソルがある・ほかのシートやダイアログ（aria-modal）が開いている間は待つ。
//   続けて 2 回（約 1.2 秒）落ち着いていたら開く（画面が切り替わった瞬間に重ねない）
// - 開いた時点で見たことにする（途中でアプリを閉じても、もう一度は出さない）

import { useCallback, useEffect, useRef, useState } from 'react';
import { decideWhatsNew, markReleaseSeen, readSeenRelease } from '../lib/whatsNew';

const POLL_MS = 600;

function isBusyScreen() {
  if (typeof document === 'undefined') return true;
  try {
    const el = document.activeElement;
    const tag = el?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return true;
    if (document.querySelector('[aria-modal="true"]')) return true;
    if (document.visibilityState === 'hidden') return true;
  } catch {
    return true;
  }
  return false;
}

export function useWhatsNew({ ready, isNewUser, safe }) {
  const [pending, setPending] = useState(null);
  const [open, setOpen] = useState(false);
  const decidedRef = useRef(false);
  const isNewUserRef = useRef(isNewUser);
  isNewUserRef.current = isNewUser;

  useEffect(() => {
    if (!ready || decidedRef.current) return;
    decidedRef.current = true;
    const fn = isNewUserRef.current;
    const { show, markSeen } = decideWhatsNew({
      seenId: readSeenRelease(),
      isNewUser: typeof fn === 'function' ? Boolean(fn()) : Boolean(fn),
    });
    if (markSeen) markReleaseSeen(markSeen);
    if (show.length) setPending(show);
  }, [ready]);

  useEffect(() => {
    if (!pending || open || !safe) return undefined;
    let calm = 0;
    const t = setInterval(() => {
      if (isBusyScreen()) { calm = 0; return; }
      calm += 1;
      if (calm < 2) return;
      clearInterval(t);
      markReleaseSeen(pending[0]?.id);
      setOpen(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [pending, open, safe]);

  const close = useCallback(() => {
    setOpen(false);
    setPending(null);
  }, []);

  return { open, releases: pending || [], close };
}
