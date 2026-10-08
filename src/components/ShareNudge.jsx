// 📷 ホームの控えめな 1 行「10月の読書を、1 枚の画像に」／「2026年の読書を、1 枚の画像に」（2026-10-08・SPEC §1・§2-1）。
//
// いつ出すかは lib/shareNudge.js（月末の 3 日間・12 月だけ・押すか閉じたらその月／年は出さない・
// 12 月の 1 行は触らないまま 3 回出したらもう出さない）。
// 見た目: 文字ボタン（btnLink・栗色・上の行の「写真で共有」と同じ強さ＝15 で止める・lucide Images 18）＋右に閉じる ×
// （--tap-min・--text-3）。カードにしない・数字や印を付けない。
// 押すと写真で共有のシートを「今月」／「今年」で開く（カメラは開かない＝写真はシートの「写真」から）。通知は送らない。
//
// useShareNudge はホーム（HomeScreen）がメモの件数（useHomeMemoState）と同じ時点で呼ぶ。今月のメモの件数が要るときは
// 数え終わるまで（最大 MEMO_COUNT_WAIT_MS）ホームを形のまま待たせ、出すかどうかをそこで 1 回だけ決める
// ＝あとから 1 行を差し込んで一覧を押し下げない（2026-10-08 第 2 回 ui-critic）。
import { useEffect, useMemo, useState } from 'react';
import { Images, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { appNow } from '../lib/appNow';
import { track, EVENTS } from '../lib/analytics';
import {
  pickShareNudge, readNudgeState, markNudgeDone, needsMonthMemoCount, recordYearShown, monthKeyOf, yearKeyOf,
} from '../lib/shareNudge';
import { MEMO_COUNT_WAIT_MS } from './HomeFirstStep';
import { withPhraseBreaks } from './TightBubble';
import { btnLink } from '../styles/ui';

function safeStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

// 端末に書けないとき（private ブラウズなど）でも、アプリを開いている間はもう出さない。
let sessionDone = { month: null, year: null };
// 今年の 1 行は、アプリを開いて 1 回だけ数える（タブを行き来しても数えない）。
let yearCountedThisSession = false;

// active: 本を読み込み終えて、本が 1 冊以上あるとき。
// 戻り値: { ready（出すかどうかが決まった）, nudge（{ kind, text } | null）, dismiss(action) }
export function useShareNudge(books, active) {
  const { user } = useAuth();
  const now = useMemo(() => appNow(), []);
  const [state] = useState(() => {
    const saved = readNudgeState(safeStorage());
    return { ...saved, month: saved.month || sessionDone.month, year: saved.year || sessionDone.year };
  });
  const need = active && needsMonthMemoCount({ now, books, state });
  const canCount = need && isSupabaseConfigured && !!user?.id;
  const [count, setCount] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  useEffect(() => {
    if (!canCount) return undefined;
    let alive = true;
    (async () => {
      try {
        const { count: n, error } = await supabase
          .from('book_memos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', since);
        if (alive) { if (error) setTimedOut(true); else setCount(n || 0); }
      } catch { if (alive) setTimedOut(true); }
    })();
    const t = setTimeout(() => { if (alive) setTimedOut(true); }, MEMO_COUNT_WAIT_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [canCount, user?.id, since]);
  const ready = active && (!canCount || count != null || timedOut);

  // 出すかどうかは、決まったときに 1 回だけ（あとから届いた件数で差し込まない）。
  const [decided, setDecided] = useState(undefined); // undefined＝まだ・null＝出さない
  useEffect(() => {
    if (!ready || decided !== undefined) return;
    const n = pickShareNudge({ now, books, monthMemoCount: count, state });
    setDecided(n);
    if (n?.kind === 'year' && !yearCountedThisSession) {
      yearCountedThisSession = true;
      recordYearShown(safeStorage(), now);
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = (action) => {
    const cur = decided;
    if (!cur) return;
    markNudgeDone(safeStorage(), cur.kind, now);
    sessionDone = cur.kind === 'year' ? { ...sessionDone, year: yearKeyOf(now) } : { ...sessionDone, month: monthKeyOf(now) };
    // 📊 押した／閉じた（props は kind と action だけ）。
    track(EVENTS.SHARE_NUDGE, { kind: cur.kind, action });
    setDecided(null);
  };
  // 決まった描画のうちに出す（effect で覚える前の 1 コマで、1 行が遅れて差し込まれないように）。
  const nudge = decided !== undefined ? decided : (ready ? pickShareNudge({ now, books, monthMemoCount: count, state }) : null);
  return { ready: !active || ready, nudge, dismiss };
}

export default function ShareNudge({ nudge, onOpen, onDismiss }) {
  if (!nudge) return null;
  return (
    // 文字ボタンの左の 4 を打ち消して、アイコンの端を題「ホーム」の端にそろえる。× は右の余白 16 の内側で押せる範囲を取る。
    <div data-share-nudge="" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', margin: '0 calc(-1 * var(--space-3)) 0 calc(-1 * var(--space-1))' }}>
      <button
        type="button"
        onClick={() => { onDismiss('open'); onOpen?.(nudge.kind); }}
        // 上の行の「写真で共有」と同じ強さ（15 から大きくしても 20 で止める）。
        style={{ ...btnLink, fontSize: 'min(var(--text-sub), var(--text-bar-max))', flex: 1, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', gap: 'var(--space-2)' }}
      >
        <Images size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
        {/* 文節の切れ目でだけ折り返す（文字を大きくしたとき）。 */}
        <span style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(nudge.text)}</span>
      </button>
      <button
        type="button"
        onClick={() => onDismiss('dismiss')}
        aria-label="この案内を閉じる"
        style={{ width: 'var(--tap-min)', height: 'var(--tap-min)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', borderRadius: 'var(--radius-full)', color: 'var(--text-3)', cursor: 'pointer', padding: 0 }}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
