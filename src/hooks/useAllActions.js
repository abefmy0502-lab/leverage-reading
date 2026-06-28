// Cross-book action aggregator for the standalone "行動リスト" page.
//
// Each `book.actions` row already arrives sorted by created_at from useBooks.
// We flatten across all books and decorate each action with the originating
// book's metadata so the list view can render the source line + jump back to
// the book detail. The actionIdx is the index inside that book's actions
// array, which the parent uses for toggle/delete via saveBook.
//
// 🔁 繰り返しタスクの先取り防止 — 完了時に作られる「次回分」は
//    scheduledFor (= 表示開始日時) を持つ。この hook は scheduledFor が
//    未来の行を allActions から除外する。これによってユーザーは
//    「今やるべきタスク」だけが見え、先取り完了が物理的にできなくなる。
//
// 📊 達成率の母数膨張対策 — 全期間ベースの pct (legacy) に加えて、
//    今週 / 今月の rolling-window 集計を返す。
//    UI は週 / 月切替で「今この期間の達成率」を見せられる。

import { useMemo } from 'react';

function startOfWeek(d) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  // 月曜始まり (日本のビジネス週)。getDay は 0=日, 1=月, ..., 6=土。
  const dow = t.getDay() || 7; // 日曜を 7 として扱う
  t.setDate(t.getDate() - dow + 1);
  return t;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function inRange(iso, start, end) {
  if (!iso) return false;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return false;
  return t >= start && t < end;
}

// 期間内に「関連する」行動を数える + その期間に完了したものを数える。
// 関連 = deadline が期間内 OR created_at が期間内 (完了済も含む)。
// 完了 = completed_at が期間内。completedAt が無い (レガシーデータ:
//   supabase_actions_full.sql で列追加される前の done=true 行) は
//   created_at を fallback として使う。これで「完了済み表示なのに
//   統計 0%」の事故を防ぐ。本格修正は supabase_actions_completed_at_
//   backfill.sql で DB 側を埋めること。
function computeForPeriod(actions, periodStart, periodEnd) {
  const periodActions = actions.filter((a) => {
    if (a.deadline) {
      const d = new Date(a.deadline + 'T00:00:00');
      if (!Number.isNaN(d.getTime()) && d >= periodStart && d < periodEnd) return true;
    }
    return inRange(a.created_at, periodStart, periodEnd);
  });
  const completed = periodActions.filter((a) => {
    if (!a.done) return false;
    // completedAt があれば厳密にその日時で判定。無ければ created_at を fallback。
    const ts = a.completedAt || a.created_at;
    return inRange(ts, periodStart, periodEnd);
  });
  const total = periodActions.length;
  return {
    total,
    completed: completed.length,
    rate: total > 0 ? Math.round((completed.length / total) * 100) : 0,
  };
}

// 連続達成日数: 今日から遡って、行動を 1 つ以上完了した日の連続数。
// 今日まだ完了がなければ昨日基準で数える (24 時間以内に必ず触らないと
// 連続が切れる、という UX は厳しすぎるため)。
// （撤去）computeStreak — 連続達成日数。連続日数は煽り（ゲーミフィケーション）のため
// ActionList のバッジごと撤去（CLAUDE.md: バッジ/連続日数/レベルは 2026-05-04 削除済み）。

export function useAllActions(books) {
  const allActions = useMemo(() => {
    const now = new Date();
    const out = [];
    // 同一行動の重複を排除する。繰り返しタスクの spawn 等で、同じ本・同じ文言・
    // 同じ期限・同じ完了状態の行が複数できてしまうことがあり、そのまま出すと
    // 「同じタスクが何個も並ぶ」「達成率の母数が水増しされる」事故になる。
    // 最初の 1 件だけ採用（actionIdx を保持＝トグル対象は元の行のまま）。
    const seen = new Set();
    (books || []).forEach((b) => {
      (b.actions || []).forEach((act, i) => {
        if (!act?.text?.trim()) return;
        // 表示開始日 (scheduledFor) が未来なら隠す。これで「先取り完了」を防ぐ。
        if (act.scheduledFor) {
          const showFrom = new Date(act.scheduledFor);
          if (!Number.isNaN(showFrom.getTime()) && showFrom > now) return;
        }
        const dedupKey = `${b.id}|${act.text.trim()}|${act.deadline || ''}|${act.done ? 1 : 0}|${act.recurrence || ''}`;
        if (seen.has(dedupKey)) return; // 完全重複はスキップ
        seen.add(dedupKey);
        out.push({
          ...act,
          bookId: b.id,
          bookTitle: b.title,
          bookAuthor: b.author,
          bookCover: b.cover,
          bookStatus: b.status,
          actionIdx: i,
        });
      });
    });
    return out;
  }, [books]);

  const stats = useMemo(() => {
    const total = allActions.length;
    const completed = allActions.filter((a) => a.done).length;
    const pct = total ? Math.round((completed / total) * 100) : 0;

    // "今週期限" — open actions whose deadline falls within the next 7 days
    // (today inclusive). Used as a forward-looking nudge in the summary card,
    // since the actions table doesn't store a per-row completed_at.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const upcomingThisWeek = allActions.filter((a) => {
      if (a.done || !a.deadline) return false;
      // 日付のみ文字列はローカル0時で解釈（ActionList と統一・JST 1日ずれ防止）。
      const d = /^\d{4}-\d{2}-\d{2}$/.test(a.deadline) ? new Date(a.deadline + 'T00:00:00') : new Date(a.deadline);
      if (Number.isNaN(d.getTime())) return false;
      return d >= today && d < weekEnd;
    }).length;

    // 期間ベース集計 (rolling window) — 母数膨張対策
    const now = new Date();
    const wkStart = startOfWeek(now);
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkEnd.getDate() + 7);
    const moStart = startOfMonth(now);
    const moEnd = new Date(moStart);
    moEnd.setMonth(moEnd.getMonth() + 1);

    return {
      total,
      completed,
      pct,
      upcomingThisWeek,
      week: computeForPeriod(allActions, wkStart, wkEnd),
      month: computeForPeriod(allActions, moStart, moEnd),
    };
  }, [allActions]);

  return { allActions, stats };
}
