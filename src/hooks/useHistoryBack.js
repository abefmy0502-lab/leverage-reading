// 🔙 ブラウザ / Android の「戻る」をアプリ内の戻るにつなぐ（2026-09-27）。
//
// アプリは画面を URL で持たないので、そのままだと「戻る」1 回でアプリごと離れてしまう。
// 画面の深さ（depth: 0 = 各タブの一番上）が増えたら同じ URL で履歴を 1 つ積み、
// 「戻る」（popstate）が来たら onBack（‹ や左端スワイプと同じ処理）を 1 段だけ行う。
// アプリ内の ‹ で浅くなったときは、積んだ履歴を history.go で自分で戻す（その popstate は無視）。
// onBack が false を返したら（未保存の変更で「編集を続ける」等）、履歴を積み直してその場に留まる。
// 一番上（depth 0）では何も積まないので、「戻る」は普通にアプリを離れる。
// iOS（Capacitor）は戻るボタンが無いので、積むだけで害は無い。

import { useCallback, useEffect, useRef } from 'react';

const KEY = 'orimeDepth';
const readDepth = (s) => (s && Number.isFinite(s[KEY]) ? s[KEY] : 0);

export function useHistoryBack({ depth, onBack }) {
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; });
  const depthRef = useRef(depth);
  depthRef.current = depth;
  // いまの履歴の項目が表す深さ（再読み込み後も history.state に残る）。
  const histRef = useRef(null);
  // 自分で呼んだ history.go の popstate を待っている数。
  const skipRef = useRef(0);
  const skipTimerRef = useRef(null);

  const sync = useCallback(() => {
    if (typeof window === 'undefined' || skipRef.current > 0) return;
    const want = depthRef.current;
    const have = histRef.current;
    try {
      if (want > have) {
        for (let d = have + 1; d <= want; d += 1) {
          window.history.pushState({ ...(window.history.state || {}), [KEY]: d }, '');
        }
        histRef.current = want;
      } else if (want < have) {
        skipRef.current += 1;
        histRef.current = want;
        window.history.go(want - have);
        // popstate が来ない環境（戻る先が無い等）で止まらないように、少し待って解除する。
        clearTimeout(skipTimerRef.current);
        skipTimerRef.current = setTimeout(() => {
          if (skipRef.current > 0) {
            skipRef.current = 0;
            histRef.current = readDepth(window.history.state);
            sync();
          }
        }, 800);
      }
    } catch { /* 履歴を触れない環境では何もしない */ }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (histRef.current == null) histRef.current = readDepth(window.history.state);
    const onPop = async (e) => {
      const d = readDepth(e.state);
      if (skipRef.current > 0) {
        skipRef.current -= 1;
        histRef.current = d;
        if (skipRef.current === 0) clearTimeout(skipTimerRef.current);
        sync();
        return;
      }
      const prev = histRef.current;
      histRef.current = d;
      // 進む・同じ深さ・すでに浅い画面にいる → 画面に合わせるだけ。
      if (d >= prev || depthRef.current <= d) { sync(); return; }
      let ok = true;
      try { ok = (await onBackRef.current?.()) !== false; } catch { ok = false; }
      // 戻れなかった（キャンセル）→ 積み直して同じ画面に留まる。戻れたら depth の変化で sync が走る。
      if (!ok) sync();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      clearTimeout(skipTimerRef.current);
    };
  }, [sync]);

  useEffect(() => { sync(); }, [depth, sync]);
}
