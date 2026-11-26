// ⏱ 集中モード（読書の時間・2026-10-09 オーナー「時間を測る際はシンプルでおしゃれなデザインで落ち着く、集中できるように
// 徹底的にこだわって」・SPEC §2-2・DESIGN §5「集中モード」）。
//
// 画面いっぱい（下のタブ・上の行を覆う）。見せるのは 表紙（小さく）・書名・時間 だけ。
//   - 地は暗めの温かい色（明るい画面の設定でもこの画面だけ・--focus-*）。文字は真っ白にしない
//   - 時間は細い大きな数字で分単位（秒は出さない）。タイマーは残り＋細い輪がゆっくり減る。計測は経った時間＋淡い光が呼吸する
//   - 動きを減らす設定では、輪の動き・光の呼吸・地の明るさの移り変わりを止める（components.css）
//   - 画面を暗くしない（Screen Wake Lock・iOS のアプリはプラグイン 'KeepAwake' があれば）
//   - 下の 3 つ: メモ（メモを書くシート・閉じたら戻る・時間は止めない）／おわる（約 1 秒の長押し・止めている間は 1 回押すだけ）／
//     一時停止（もう一度で再開）
//   - タイマーが終わったら、音は鳴らさず短い振動と、地がゆっくり少し明るくなる。「続けて読む」で計測に切り替えて続ける
//   - 時間は始めた時刻から数え直す（裏に回しても正しい）。途中の状態は端末に保存し、戻ったら再開（App.jsx）
//   - おわったら「今日 32 分読みました」（その日のこの本の合計）・主ボタン「メモを書く」・「写真で共有」・文字の「閉じる」・小さく「この本で これまで …」（2026-10-11）
// 連続日数・目標・順位・バッジは入れない（反ゲーミフィケーション）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { PencilLine, Pause, Play, Square } from 'lucide-react';
import { MiniCover } from './BookCards';
import { displayTitle } from '../lib/bookTitle';
import HomeQuickMemo from './HomeQuickMemo';
import { useHaptic } from '../hooks/useHaptic';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBlockEdgeSwipe } from '../hooks/useEdgeSwipeBack';
import { useBackLayer } from '../hooks/useHistoryBack';
import { useReadingSessions } from '../hooks/useReadingSessions';
import { useToast } from './Toast';
import { withPhraseBreaks } from './TightBubble';
import { track, EVENTS, minutesBucket } from '../lib/analytics';
import {
  displayMinutes, timerProgress, isTimerDone, pauseFocus, resumeFocus, continueAsCount,
  sessionRow, saveFocusState, readFocusState, todaySeconds, totalSeconds, fmtDuration, fmtClock, lengthMinutes,
  elapsedSeconds, MAX_SESSION_SEC,
} from '../lib/readingTime';

export const HOLD_MS = 1000;
const LONG_COUNT_SEC = 2 * 3600; // 計測でこれより長い回は、おわったときに「記録しない」を出す
const RING_R = 96;
const HOLD_R = 31;
// 輪の長さは pathLength="1" で 1 として数える（vector-effect="non-scaling-stroke" と画面の px で数えた長さを混ぜると、
// 始めから輪が 3 割ほど欠けて見えた・2026-10-10）。線の太さは viewBox の単位（300px の輪で約 2px）。
// 下の欄の高さ（ひとことの行＋16＋丸いボタン 64＋8＋名前）。どの段でも同じにして、輪・数字の位置を動かさない。
const FOOT_H = 'calc(var(--text-meta) * 3 + var(--space-4) + var(--focus-btn) + var(--space-2))';

// ---------------------------------------------------------------- 画面を暗くしない

function useKeepAwake(active) {
  useEffect(() => {
    if (!active) return undefined;
    let lock = null;
    let gone = false;
    let native = null;
    const request = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.wakeLock && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen');
          if (gone) { lock.release().catch(() => {}); lock = null; }
        }
      } catch { /* 使えない端末・電池の節約中は何もしない */ }
    };
    try {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('KeepAwake')) {
        native = registerPlugin('KeepAwake');
        native.keepAwake().catch(() => {});
      }
    } catch { native = null; }
    request();
    // 裏に回ると外れるので、戻ったら取り直す。
    const onVis = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVis);
      try { lock?.release?.().catch?.(() => {}); } catch { /* ignore */ }
      try { native?.allowSleep?.().catch?.(() => {}); } catch { /* ignore */ }
    };
  }, [active]);
}

// iOS の時計・電池の文字を明るく（暗い地の上なので）。Web はアドレスバーの色を地に合わせる。
function useDarkChrome() {
  useEffect(() => {
    const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));
    const prev = metas.map((m) => m.getAttribute('content'));
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--focus-bg').trim();
    if (bg) metas.forEach((m) => m.setAttribute('content', bg));
    let restore = null;
    let closed = false;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
        restore = () => StatusBar.setStyle({ style: Style.Default }).catch(() => {});
        // 読み込む間に閉じていたら、明るくしたままにしない（すぐ戻す）。
        if (closed) { restore(); return; }
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      }).catch(() => {});
    }
    return () => {
      closed = true;
      metas.forEach((m, i) => { if (prev[i] != null) m.setAttribute('content', prev[i]); });
      restore?.();
    };
  }, []);
}

// ---------------------------------------------------------------- 部品

// 大きな数字（細い字・等幅の数字）。60 分以上は「1 時間 05 分」の形（小さな行の「2 時間 5 分」とは書き分ける・SPEC §2-2）。
// 輪の中心に置くのは数字（と間の「時間」）だけ。最後の「分」は右へぶら下げる（幅を数えない＝右の負の余白が自分の幅と同じ）。
function BigTime({ hours, minutes, dim }) {
  const num = { fontSize: 'var(--focus-time)', fontWeight: 200, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: dim ? 'var(--focus-ink-2)' : 'var(--focus-ink)', transition: 'color var(--duration-base) var(--ease-out)' };
  const unit = { fontSize: 'var(--text-body)', fontWeight: 400, color: 'var(--focus-ink-2)', lineHeight: 1 };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
      {hours > 0 && (<><span style={num}>{hours}</span><span style={{ ...unit, margin: '0 var(--space-2) 0 var(--space-1)' }}>時間</span></>)}
      <span style={num}>{hours > 0 ? String(minutes).padStart(2, '0') : minutes}</span>
      <span style={{ ...unit, width: '1em', marginLeft: 'var(--space-1)', marginRight: 'calc(-1em - var(--space-1))' }}>分</span>
    </span>
  );
}

// 丸いボタン（--focus-btn＝64・枠 --focus-line-strong＝押せる物なので 3:1）＋下に名前。
// ariaLabel: 読み上げの名前を見える名前より詳しくするとき（「メモ」→「メモを書く」・おわったあとの「メモを書く」と同じ操作と分かる）。
function RoundButton({ label, ariaLabel, icon, onClick, children, disabled = false, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0, flex: '1 1 0' }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || label}
        disabled={disabled}
        className="focus-round"
        // 押せないときも薄くしない（DESIGN §5「押せないボタン」）: 枠を淡い線に・アイコンを --focus-ink-3 に。
        style={{ opacity: 1, position: 'relative', width: 'var(--focus-btn)', height: 'var(--focus-btn)', borderRadius: '50%', border: `1px solid ${disabled ? 'var(--focus-line)' : 'var(--focus-line-strong)'}`, background: 'transparent', color: disabled ? 'var(--focus-ink-3)' : 'var(--focus-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer', padding: 0, fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}
        {...rest}
      >
        {icon}
        {children}
      </button>
      <span aria-hidden="true" style={{ fontSize: 'var(--text-meta)', color: 'var(--focus-ink-2)', whiteSpace: 'nowrap' }}>{label.replace(/（.*）$/, '')}</span>
    </div>
  );
}

// 下の 2 つのボタン（タイマーが終わったとき・おわったとき）。主＝温かい塗り、副＝枠。
const footBtn = (primary) => ({
  width: '100%', minHeight: 'var(--btn-h)', borderRadius: 'var(--radius)', fontFamily: 'inherit', fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
  border: primary ? 'none' : '1px solid var(--focus-line-strong)',
  background: primary ? 'var(--focus-accent)' : 'transparent',
  color: primary ? 'var(--focus-accent-ink)' : 'var(--focus-ink)',
});

// 文字のボタン（暗い地の上・高さ 44 以上・17/600・温かい白）。
const footText = {
  minHeight: 'var(--btn-h)', padding: '0 var(--space-4)', border: 'none', background: 'transparent',
  color: 'var(--focus-ink)', fontFamily: 'inherit', fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
};

// ---------------------------------------------------------------- 本体

export default function FocusMode({ book, initial, initialPhase = null, allTags = [], onClose, onOpenFullEditor, onShare = null }) {
  const haptic = useHaptic();
  const toast = useToast();
  const sessions = useReadingSessions();
  const trapRef = useFocusTrap(true);
  useBlockEdgeSwipe(true);
  useDarkChrome();

  // 開き直したとき（本の詳細とほかの画面の間で置き場所が変わった等）は、端末に残った同じ回の新しい状態
  // （一時停止・「続けて読む」）から続ける。
  const [s, setS] = useState(() => {
    const saved = readFocusState();
    return saved && initial && saved.bookId === initial.bookId && saved.startedAt === initial.startedAt ? saved : initial;
  });
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState(() => initialPhase || (isTimerDone(initial) ? 'timerDone' : 'running'));
  const [summary, setSummary] = useState(null); // { todaySec, totalSec }
  // 計測で 2 時間を超えた回は「止め忘れ」のことがあるので、おわったときに外せる（2026-11-22 点検・元に戻すつき）。{ id, row }
  const [longCount, setLongCount] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false); // 'running' | 'summary' | false
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState('');
  const holdTimer = useRef(null);
  const hintTimer = useRef(null);
  const finishing = useRef(false);
  const [busy, setBusy] = useState(false); // おわるを保存している間（ボタンを止める）
  const [memoCount, setMemoCount] = useState(0); // 読んでいる間に書いたメモの数（おわったときに「メモ N 件」）
  const paused = Number.isFinite(s?.pausedAt);

  // 画面を明るいままにするのは読んでいる間だけ（一時停止中・タイマーが終わったあと・6 時間に届いたあとは端末の設定どおりに暗くする
  //   ＝前は終わったまま寝てしまうと朝まで点いていた・2026-11-22 点検）。
  const capped = s?.mode !== 'timer' && elapsedSeconds(s, now) >= MAX_SESSION_SEC;
  useKeepAwake(phase === 'running' && !paused && !capped);

  // ブラウザ・Android の「戻る」で画面を離れない（消えると一時停止・「続けて読む」が失われる）。
  // おわったあとの画面だけは「戻る」で閉じる。
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useBackLayer(true, () => {
    if (phaseRef.current === 'summary') { onCloseRef.current?.(); return true; }
    return false;
  });

  // 途中の状態を端末に（裏に回して戻ったとき・アプリを閉じて開いたときに再開する）。おわるの保存中は書かない。
  useEffect(() => { if (phase !== 'summary' && !finishing.current) saveFocusState(s); }, [s, phase]);
  // おわった画面に替わったとき・メモを書いて戻ったときは、前の画面で押していた形（data-pressed）を残さない
  //   （おわるの長押しの指・シートの保存の指が離れる前に画面が替わると、新しいボタンが縮んだまま見えた・2026-10-10 ui-critic）。
  useEffect(() => {
    if (phase !== 'summary' && phase !== 'timerDone') return;
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-pressed]').forEach((el) => el.removeAttribute('data-pressed'));
  }, [phase, memoCount, memoOpen]);

  // 1 秒ごとに時刻を取り直す（数えるのは始めた時刻から＝足し算しない）。戻ったときはすぐ。
  useEffect(() => {
    if (phase === 'summary') return undefined;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', tick); };
  }, [phase]);

  // タイマーが終わった: 音は鳴らさず、数回（3 回・間をあけて）震わせ、地がゆっくり少し明るくなる
  //   （2026-10-11 オーナー裁定「数回震わせる」・動きを減らす設定でも振動はする）。
  useEffect(() => {
    if (phase === 'running' && !paused && isTimerDone(s, now)) {
      setPhase('timerDone');
      haptic.alarm(3);
    }
  }, [phase, s, now, paused, haptic]);

  useEffect(() => () => { clearTimeout(holdTimer.current); clearTimeout(hintTimer.current); }, []);

  // 初めから「おわったとき」を開く（お試しモードの &focus=summary）。
  useEffect(() => {
    if (initialPhase === 'summary' && !summary && sessions.loaded) {
      const t = Date.now();
      setSummary({ todaySec: todaySeconds(sessions.rows, book.id, t), totalSec: totalSeconds(sessions.rows, book.id) });
    }
  }, [initialPhase, summary, sessions.loaded, sessions.rows, book.id]);

  const showHint = (text) => {
    setHint(text);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(''), 2600);
  };

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
    const t = Date.now();
    const row = sessionRow(s, t);
    let rows = sessions.rows;
    let savedId = null;
    // 途中の状態は、保存（表に入らなければ端末への控え）が終わってから消す（保存の途中でアプリが閉じても、
    // 次に開いたときに再開・記録できる・2026-10-10 監査）。
    try {
      if (row) {
        const r = await sessions.save(row);
        if (r?.row) { savedId = r.row.id; rows = [r.row, ...rows.filter((x) => x.id !== r.row.id)]; }
        if (row.mode === 'count' && row.seconds >= LONG_COUNT_SEC) setLongCount({ id: r?.row?.id || row.id, row: r?.row || row });
      }
    } finally {
      saveFocusState(null);
    }
    // 今日の合計は、いまおえた回をまるごと今日に数える（23:40〜0:10 の回が、0 時からの 10 分だけになり「今日 1 分」などと
    //   小さく出ていた・2026-11-26 点検）。ほかの回は今日に入る分だけ。
    const others = savedId ? rows.filter((x) => x.id !== savedId) : rows;
    const todaySec = todaySeconds(others, book.id, t) + (row?.seconds || 0);
    // 押し間違い（30 秒未満）は記録せずに閉じる（おわったときの画面は出さず、知らせだけ・2026-10-10）。
    if (!row) { toast.info('30 秒より短いので、記録しませんでした。'); onClose(); return; }
    track(EVENTS.FOCUS_DONE, { mode: row.mode === 'count' ? 'count' : 'timer', minutes: minutesBucket(row.seconds) });
    setSummary({ todaySec, totalSec: totalSeconds(rows, book.id) });
    setPhase('summary');
    setBusy(false);
  }, [s, sessions, book.id, onClose, toast]);

  // ---- おわる（長押し）
  const startHold = (e) => {
    if (paused || phase !== 'running' || holding || finishing.current) return;
    if (e?.pointerType === 'mouse' && e.button !== 0) return;
    setHolding(true);
    haptic.light();
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      setHolding(false);
      haptic.medium();
      finish();
    }, HOLD_MS);
  };
  const cancelHold = () => {
    if (!holdTimer.current) return;
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
    showHint('長く押すと、おわります');
  };
  // 止めている間は 1 回押すだけでおわる（誤って触れる心配がない・読み上げの操作でもおわれる）。
  const onEndClick = () => { if (paused) finish(); };

  const togglePause = () => {
    if (finishing.current) return;
    haptic.light();
    const t = Date.now();
    setNow(t);
    setS((cur) => (Number.isFinite(cur.pausedAt) ? resumeFocus(cur, t) : pauseFocus(cur, t)));
  };

  const continueReading = () => {
    if (finishing.current) return;
    const t = Date.now();
    setNow(t);
    setS((cur) => continueAsCount(cur, t));
    setPhase('running');
  };

  const { hours, minutes } = phase === 'timerDone'
    ? (() => { const t = lengthMinutes(s.durationSec || 0); return { hours: Math.floor(t / 60), minutes: t % 60 }; })() // 始める前の「N 分 読めます」と同じ丸め
    : displayMinutes(s, now);
  const isTimer = s?.mode === 'timer';
  const progress = isTimer ? timerProgress(s, now) : 0;
  const caption = phase === 'timerDone' ? '読みました' : paused ? '一時停止中' : isTimer ? '残り' : '経過';
  // 読み上げ（分が変わったときだけ・aria-live は付けない＝毎分読み上げない）。
  // おわる時刻は実際に鳴る時刻から出す（一時停止したぶん後ろへずれる・2026-10-11）。
  //   止めている間は、止めている今の分もずらす（前は止めた分を入れず、止めている間ずっと古い時刻のままだった・2026-11-26 点検）。
  const pausingMs = paused ? Math.max(0, now - s.pausedAt) : 0;
  const untilLabel = isTimer && phase === 'running' && Number.isFinite(s?.until)
    ? `${fmtClock(s.startedAt + (s.pausedMs || 0) + pausingMs + s.durationSec * 1000)} まで` : null;
  // おわったときの「今日 N 分」（読み上げの fmtDuration と同じ分）。
  const todayMin = summary && summary.todaySec > 0 ? lengthMinutes(summary.todaySec) : 0;
  const spoken = `${caption} ${hours ? `${hours} 時間 ` : ''}${minutes} 分${untilLabel ? `・${untilLabel}` : ''}`;

  // メモを書くシートも暗いまま（明るい画面の設定でも・tokens.css の .focus-dark-scope）。
  const memoSheet = memoOpen && (
    <HomeQuickMemo
      scopeClass="focus-dark-scope"
      book={book}
      allTags={allTags}
      onClose={() => setMemoOpen(false)}
      onSaved={() => {
        haptic.success();
        if (memoOpen === 'running') setMemoCount((n) => n + 1);
        // おわったあとのメモだけ知らせる。読んでいる途中は振動だけ（知らせで集中を切らない・2026-10-09 ui-critic）。
        if (memoOpen === 'summary') { toast.success('メモを保存しました。'); onClose(); }
      }}
      firstPrompt={memoOpen === 'summary' ? 'いま読んだところで、心に残った 1 行は？' : ''}
      onOpenFullEditor={memoOpen === 'summary' && onOpenFullEditor ? (prefill) => { setMemoOpen(false); onOpenFullEditor(prefill); } : undefined}
    />
  );

  const surface = (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label="集中モード"
      data-focus-mode={phase}
      className="focus-surface"
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-focus)',
        // タイマーが終わったら少し明るく（おわったときもそのまま＝暗く戻さない）。
        background: phase === 'running' ? 'var(--focus-bg)' : 'var(--focus-bg-done)',
        color: 'var(--focus-ink)', fontFamily: 'var(--font-ui)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        // おわったときは下のボタンが 3 段になるので、下の余白は安全域かその 16 の大きいほう（2026-11-23 点検）。
        padding: phase === 'summary'
          ? 'calc(env(safe-area-inset-top, 0px) + var(--space-8)) var(--space-4) max(var(--space-4), env(safe-area-inset-bottom, 0px))'
          : 'calc(env(safe-area-inset-top, 0px) + var(--space-8)) var(--space-4) calc(env(safe-area-inset-bottom, 0px) + var(--space-6))',
        overflowY: 'auto', overscrollBehavior: 'contain',
        userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 表紙（小さく）と書名 */}
      <header style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', maxWidth: '20em', textAlign: 'center' }}>
        <MiniCover book={book} width={40} />
        <h1 style={{ margin: 0, fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', fontWeight: 400, color: 'var(--focus-ink-2)', lineHeight: 1.5, letterSpacing: '0.04em', wordBreak: 'keep-all', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {withPhraseBreaks(displayTitle(book.title || ''))}
        </h1>
      </header>

      {phase === 'summary' ? (
        <main style={{ flex: 1, width: '100%', maxWidth: 'var(--focus-max)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 'var(--space-3)' }}>
          {summary ? (
            <>
              {/* 集中モードと同じ組み（小さな見出し → 細い大きな数字 → 1 行）。読み上げは 1 文で。 */}
              <p role="status" aria-label={`今日 ${fmtDuration(summary.todaySec)}読みました`} style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span aria-hidden="true" style={{ fontSize: 'var(--text-meta)', color: 'var(--focus-ink-3)', letterSpacing: '0.12em' }}>今日</span>
                {/* 読み上げ（fmtDuration）と同じ丸め（0 秒は 0 分・あとは四捨五入で 1 分から・2026-11-26）。 */}
                <span aria-hidden="true"><BigTime hours={Math.floor(todayMin / 60)} minutes={todayMin % 60} /></span>
                <span aria-hidden="true" style={{ fontSize: 'var(--text-body)', color: 'var(--focus-ink-2)', letterSpacing: '0.04em' }}>読みました</span>
              </p>
              {summary.totalSec > summary.todaySec && (
                <p style={{ margin: 'var(--space-6) 0 0', fontSize: 'var(--text-meta)', color: 'var(--focus-ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                  この本で これまで {fmtDuration(summary.totalSec)}
                </p>
              )}
              {memoCount > 0 && (
                <p style={{ margin: summary.totalSec > summary.todaySec ? 0 : 'var(--space-6) 0 0', fontSize: 'var(--text-meta)', color: 'var(--focus-ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                  メモ {memoCount} 件
                </p>
              )}
              {longCount && (
                <button
                  type="button"
                  disabled={removing}
                  onClick={async () => {
                    if (removing) return;
                    setRemoving(true);
                    const { id, row: kept } = longCount;
                    const ok = await sessions.remove(id);
                    setRemoving(false);
                    if (!ok) { toast.error('記録から外せませんでした。つながってから、もう一度お試しください。'); return; }
                    // 消す操作は「元に戻す」で取り返せるように（同じ id で入れ直す・本の削除と同じ考え）。
                    toast.undo({
                      message: 'この回を記録から外しました。',
                      onUndo: async () => {
                        const r = await sessions.save(kept).catch(() => null);
                        if (!r?.ok && !r?.local) toast.error('記録を戻せませんでした。');
                      },
                      destructive: true,
                    });
                    onClose();
                  }}
                  // 控えめな文字のボタン（SPEC §2-2・枠なし・--focus-ink-2・高さ 44 以上・2026-11-23 ui-critic）。
                  //   外している間は薄くせず、文字を --focus-ink-3 に（DESIGN §5「押せないボタン」）。
                  style={{ marginTop: 'var(--space-4)', minHeight: 'var(--tap-min)', padding: 'var(--space-2) var(--space-4)', background: 'transparent', border: 'none', color: removing ? 'var(--focus-ink-3)' : 'var(--focus-ink-2)', fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere', cursor: removing ? 'default' : 'pointer', fontFamily: 'inherit', opacity: 1 }}
                >
                  {removing ? '外しています…' : withPhraseBreaks('止め忘れていたら、この回を記録から外す')}
                </button>
              )}
            </>
          ) : null}
        </main>
      ) : (
        <main style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6) 0' }}>
          <div style={{ position: 'relative', width: 'var(--focus-ring-size)', height: 'var(--focus-ring-size)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* 計測: 輪の代わりに、ゆっくり呼吸する淡い光（止めている間は止める）。 */}
            {!isTimer && phase === 'running' && (
              <div aria-hidden="true" className={`focus-glow${paused ? ' is-paused' : ''}`} style={{ position: 'absolute', inset: '-6%', borderRadius: '50%', background: 'radial-gradient(circle, var(--focus-glow) 0%, transparent 68%)' }} />
            )}
            {/* タイマー: 残りの細い輪（上から時計回りに減る）。 */}
            {isTimer && (
              <svg aria-hidden="true" viewBox="0 0 200 200" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="100" cy="100" r={RING_R} fill="none" stroke="var(--focus-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                {phase === 'running' && (
                  <circle
                    className="focus-ring-progress"
                    cx="100" cy="100" r={RING_R} fill="none"
                    stroke="var(--focus-ring)" strokeWidth="1.5" strokeLinecap="round"
                    pathLength="1" strokeDasharray="1" strokeDashoffset={progress}
                    style={{ stroke: paused ? 'var(--focus-ring-dim)' : 'var(--focus-ring)' }}
                  />
                )}
              </svg>
            )}
            <div role="timer" aria-label={spoken} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span aria-hidden="true" style={{ fontSize: 'var(--text-meta)', color: paused ? 'var(--focus-ink-2)' : 'var(--focus-ink-3)', letterSpacing: '0.12em' }}>{caption}</span>
              <span aria-hidden="true"><BigTime hours={hours} minutes={minutes} dim={paused} /></span>
              {/* 「◯時◯分まで」で始めたタイマーは、数字の下におわる時刻を小さく（2026-10-10）。 */}
              {untilLabel && (
                <span aria-hidden="true" style={{ fontSize: 'var(--text-meta)', color: 'var(--focus-ink-3)', letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>{untilLabel}</span>
              )}
            </div>
          </div>
        </main>
      )}

      {/* 下: 走っている間は 3 つの丸いボタン。タイマーが終わったら「続けて読む」と「おわる」。おわったら「メモを書く」と「閉じる」。 */}
      <footer style={{ width: '100%', maxWidth: 'var(--focus-max)', minHeight: FOOT_H, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {phase === 'running' && (
          <>
            {/* ひとことの欄（高さは決めておく＝出ても下が跳ねない）。 */}
            <p aria-live="polite" style={{ margin: '0 0 var(--space-4)', minHeight: 'calc(var(--text-meta) * 1.5)', textAlign: 'center', fontSize: 'var(--text-meta)', color: 'var(--focus-ink-2)' }}>
              {holding ? 'そのまま押し続けると、おわります' : hint}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
              <RoundButton label="メモ" ariaLabel="メモを書く" icon={<PencilLine size={22} strokeWidth={1.5} aria-hidden="true" />} onClick={() => setMemoOpen('running')} disabled={busy} />
              <RoundButton
                label={paused ? 'おわる' : 'おわる（長押し）'}
                icon={<Square size={18} strokeWidth={1.5} aria-hidden="true" />}
                onClick={onEndClick}
                disabled={busy}
                onPointerDown={startHold}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onPointerCancel={cancelHold}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !paused) { e.preventDefault(); startHold(); } }}
                onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') cancelHold(); }}
                data-focus-end=""
              >
                {/* 長押しの進み具合（輪が 1 秒で一周する・離すと戻る）。 */}
                <svg aria-hidden="true" viewBox="0 0 66 66" style={{ position: 'absolute', inset: -1, width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
                  <circle
                    cx="33" cy="33" r={HOLD_R} fill="none" stroke="var(--focus-ring)" strokeWidth="2" strokeLinecap="round"
                    pathLength="1" strokeDasharray="1" strokeDashoffset={holding ? 0 : 1}
                    className={holding ? 'focus-hold is-holding' : 'focus-hold'}
                    style={{ opacity: holding ? 1 : 0 }}
                  />
                </svg>
              </RoundButton>
              <RoundButton
                label={paused ? '再開' : '一時停止'}
                icon={paused ? <Play size={22} strokeWidth={1.5} aria-hidden="true" /> : <Pause size={22} strokeWidth={1.5} aria-hidden="true" />}
                onClick={togglePause}
                disabled={busy}
              />
            </div>
          </>
        )}
        {phase === 'timerDone' && (
          <div key="timer-done" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {/* 上＝主「おわる」・下＝副「続けて読む」（おわったときの「メモを書く」「閉じる」と同じ並び）。 */}
            <button type="button" onClick={finish} disabled={busy} style={{ ...footBtn(true), opacity: 1, cursor: busy ? 'default' : 'pointer' }}>おわる</button>
            <button type="button" onClick={continueReading} disabled={busy} style={{ ...footBtn(false), opacity: 1, cursor: busy ? 'default' : 'pointer' }}>続けて読む</button>
          </div>
        )}
        {/* おわったとき（2026-10-11 オーナー裁定）: 「メモを書く」と「写真で共有」の 2 つ＋閉じる。
            写真で共有はほかの入口と同じ選ぶシート（カメラで撮る／写真から選ぶ／写真なし）をこの本で開く。 */}
        {phase === 'summary' && (memoCount > 0 ? (
          // 読んでいる間にメモを書いたなら、主は「閉じる」・「写真で共有」「メモを書く」は文字のボタン（2026-10-10）。
          // key: メモを書く前の組と別の要素にする（同じ button を使い回すと、押した形・フォーカスが「閉じる」に残って縮んで見えた・2026-10-10 ui-critic）。
          <div key="summary-memo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
            {/* 押した形（縮む・薄くなる）を付けない: 長押しで「おわる」を押したまま、この画面に替わると
                指（マウス）の下に来た「閉じる」が押したままの形で残っていた（2026-11-23 ui-critic）。 */}
            <button key="summary-memo-close" type="button" onClick={onClose} style={{ ...footBtn(true), transform: 'none', opacity: 1 }}>閉じる</button>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 'var(--space-4)' }}>
              {onShare && <button type="button" onClick={() => onShare(book)} style={footText}>写真で共有</button>}
              <button type="button" onClick={() => setMemoOpen('summary')} style={footText}>メモを書く</button>
            </div>
          </div>
        ) : (
          <div key="summary-plain" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button type="button" onClick={() => setMemoOpen('summary')} style={footBtn(true)}>メモを書く</button>
            {/* key: 前の画面（タイマーが終わったときの「続けて読む」など）で押していた形を残さない別の要素に。
                押したときに縮める形（scale）もここでは付けない（幅が 6 狭く見えていた・2026-11-23 点検）。 */}
            {onShare
              ? <button key="summary-share" type="button" onClick={() => onShare(book)} style={{ ...footBtn(false), transform: 'none' }}>写真で共有</button>
              : <button key="summary-close" type="button" onClick={onClose} style={footBtn(false)}>閉じる</button>}
            {/* 閉じる手段は残す（文字のボタン・「写真で共有」との間は 12＝親の gap）。 */}
            {onShare && <button key="summary-close-text" type="button" onClick={onClose} style={footText}>閉じる</button>}
          </div>
        ))}
      </footer>
    </div>
  );

  return createPortal(<>{surface}{memoSheet}</>, document.body);
}

