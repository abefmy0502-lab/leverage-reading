// 🔄 ホーム（本棚）上部の「今日の想起」カード。
//
// 思想（CLAUDE.md 厳守）:
//   - 静か・控えめ・Apple Notes 級・反ゲーミフィケーション。
//   - 振り返りタブを開かずに「過去メモが 1 枚ふいに戻ってくる」体験を surface する、
//     プッシュ通知（環境待ち）のアプリ内版。
//   - うるさくしないのが絶対条件:
//       ① メモが十分貯まっていない（5 件未満）なら出さない。
//       ② 当日 × で閉じたら、その日は二度と出さない（localStorage 記録）。
//       ③ 1 日 1 枚まで・日替わりで安定（同じ日は同じ 1 枚）。
//   - バッジ / 連続日数 / 目標は付けない。
//
// 自己完結: 本棚カードの再 render を誘発しないよう、fetch も state もこの中に閉じる。

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useHaptic } from '../hooks/useHaptic';
import { MessageSquareQuote } from 'lucide-react';
import { recallFraming, memoExcerpt, pickRecallMemo } from '../lib/recall';

const DISMISS_KEY = 'orime-home-recall-dismissed';
const MIN_MEMOS = 5; // これ未満なら出さない（控えめさの肝）

// YYYY-MM-DD（ローカル日付）。dismiss の判定とログに使う。
function todayKey(now = Date.now()) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isDismissedToday(now = Date.now()) {
  try {
    return localStorage.getItem(DISMISS_KEY) === todayKey(now);
  } catch {
    return false;
  }
}

function markDismissedToday(now = Date.now()) {
  try {
    localStorage.setItem(DISMISS_KEY, todayKey(now));
  } catch {
    /* localStorage 不可（プライベートモード等）でも致命ではない */
  }
}

export default function HomeRecall({ onOpen }) {
  const { user } = useAuth();
  const haptic = useHaptic();
  const [memo, setMemo] = useState(null); // { id, text, createdAt, book }
  // 当日 dismiss 済みなら最初から描画しない（マウント時に確定）。
  const [dismissed, setDismissed] = useState(() => isDismissedToday());

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id || dismissed) {
      setMemo(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('book_memos')
          .select('id, text, created_at, book_id, book:books(title)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(200);
        if (!active) return;
        if (error || !Array.isArray(data) || data.length < MIN_MEMOS) {
          setMemo(null); // 失敗・件数不足は静かに何も出さない
          return;
        }
        const notes = data.map((r) => ({
          id: r.id,
          text: r.text,
          createdAt: r.created_at,
          bookId: r.book_id || null,
          title: r.book?.title || '',
        }));
        // 日替わりで安定（同じ日は同じ 1 枚）。minAgeDays:7 で「忘れた頃」に寄せる。
        const seed = Math.floor(Date.now() / 86400000);
        const picked = pickRecallMemo(notes, { now: Date.now(), minAgeDays: 7, seed });
        // recallFraming が空（＝今日書いたばかり等）なら出さない。
        if (!picked || !recallFraming(picked.createdAt)) {
          setMemo(null);
          return;
        }
        setMemo(picked);
      } catch {
        if (active) setMemo(null); // 例外も静かに握りつぶす
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id, dismissed]);

  if (dismissed || !memo) return null;

  const framing = recallFraming(memo.createdAt);
  if (!framing) return null;
  const excerpt = memoExcerpt(memo.text, 140);

  const handleOpen = () => {
    try {
      haptic.light();
    } catch {
      /* haptics は非必須 */
    }
    // その本の詳細（メモ一覧・行動追加がある場所）へ直接着地させ、想起→再読→行動の
    // ループを最短で閉じる。本が特定できない場合は呼び出し側が振り返りタブへ退避。
    onOpen?.(memo.bookId);
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    markDismissedToday();
    setDismissed(true);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${framing}を振り返る`}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen();
        }
      }}
      className="list-item-enter"
      style={{
        position: 'relative',
        marginBottom: 14,
        padding: '12px 14px',
        background: '#fbf7f0',
        border: '1px solid #ece3d4',
        borderRadius: 12,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        boxShadow: '0 1px 2px rgba(60, 50, 30, 0.04)',
      }}
    >
      <p
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--c-ink-2)',
          margin: '0 0 6px',
          paddingRight: 32, // × ボタンと重ならない
        }}
      >
        <MessageSquareQuote size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
        {framing}
      </p>
      <p
        style={{
          fontSize: 13,
          color: 'var(--c-ink)',
          lineHeight: 1.6,
          margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {excerpt}
      </p>
      {memo.title && (
        <p
          style={{
            fontSize: 11,
            color: 'var(--c-ink-2)',
            margin: '6px 0 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          『{memo.title}』
        </p>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="今日は閉じる"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          color: 'var(--c-ink-2)',
          fontSize: 16,
          cursor: 'pointer',
          fontFamily: 'inherit',
          lineHeight: 1,
        }}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
