// 📷 ホームの控えめな 1 行「10月の読書を、1 枚の画像に」／「2026年の読書を、1 枚の画像に」（2026-10-08・SPEC §1・§2-1）。
//
// いつ出すかは lib/shareNudge.js（月末の 3 日間・12 月だけ・押すか閉じたらその月／年は出さない）。
// 見た目: 文字ボタン（btnLink・栗色・lucide Images 18）＋右に閉じる ×（44・--text-3）。カードにしない・数字や印を付けない。
// 押すと写真で共有のシートを「今月」／「今年」で開く（カメラは開かない＝写真は シートの「写真」から）。通知は送らない。
import { useEffect, useMemo, useState } from 'react';
import { Images, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { appNow } from '../lib/appNow';
import { track, EVENTS } from '../lib/analytics';
import {
  pickShareNudge, readNudgeState, markNudgeDone, needsMonthMemoCount, monthKeyOf, yearKeyOf,
} from '../lib/shareNudge';
import { withPhraseBreaks } from './TightBubble';
import { btnLink } from '../styles/ui';

function safeStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

// 今月のメモの件数（月末で、読了だけでは決まらないときだけ数える）。数えられなければ null（出さない）。
function useMonthMemoCount(enabled, now) {
  const { user } = useAuth();
  const [count, setCount] = useState(null);
  const since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !user?.id) return undefined;
    let alive = true;
    (async () => {
      try {
        const { count: n, error } = await supabase
          .from('book_memos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', since);
        if (alive && !error) setCount(n || 0);
      } catch { /* 数えられなければ出さない */ }
    })();
    return () => { alive = false; };
  }, [enabled, user?.id, since]);
  return count;
}

// 端末に書けないとき（private ブラウズなど）でも、アプリを開いている間はもう出さない。
let sessionDone = { month: null, year: null };

export default function ShareNudge({ books = [], onOpen }) {
  const now = useMemo(() => appNow(), []);
  const [state, setState] = useState(() => {
    const saved = readNudgeState(safeStorage());
    return { month: saved.month || sessionDone.month, year: saved.year || sessionDone.year };
  });
  const memoCount = useMonthMemoCount(needsMonthMemoCount({ now, books, state }), now);
  const nudge = pickShareNudge({ now, books, monthMemoCount: memoCount, state });

  if (!nudge) return null;
  const done = (action) => {
    markNudgeDone(safeStorage(), nudge.kind, now);
    sessionDone = nudge.kind === 'year' ? { ...sessionDone, year: yearKeyOf(now) } : { ...sessionDone, month: monthKeyOf(now) };
    setState((st) => (nudge.kind === 'year' ? { ...st, year: yearKeyOf(now) } : { ...st, month: monthKeyOf(now) }));
    // 📊 押した／閉じた（props は kind と action だけ）。
    track(EVENTS.SHARE_NUDGE, { kind: nudge.kind, action });
  };
  return (
    // 文字ボタンの左の 4 を打ち消して、アイコンの端を題「ホーム」の端にそろえる。× は右の余白 16 の内側で 44 を取る。
    <div data-share-nudge="" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', margin: '0 calc(-1 * var(--space-3)) 0 calc(-1 * var(--space-1))' }}>
      <button
        type="button"
        onClick={() => { done('open'); onOpen?.(nudge.kind); }}
        style={{ ...btnLink, flex: 1, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', gap: 'var(--space-2)' }}
      >
        <Images size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
        {/* 文節の切れ目でだけ折り返す（文字を大きくしたとき）。 */}
        <span style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(nudge.text)}</span>
      </button>
      <button
        type="button"
        onClick={() => done('dismiss')}
        aria-label="この案内を閉じる"
        style={{ width: 44, height: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', borderRadius: 'var(--radius-full)', color: 'var(--text-3)', cursor: 'pointer', padding: 0 }}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
