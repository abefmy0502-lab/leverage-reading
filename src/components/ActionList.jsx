// 🎯 行動 — 本を横断した行動リスト（振り返りタブの最初のサブタブ・SPEC §4）。
//
// 役割: 相談や読書で決めた行動を、やり切るまで見届ける場所。最重要アクション＝完了にする。
//   - やることを 期限を過ぎた / 今日 / 今週（月〜日の暦の週） / 来週以降・期限なし に分けて上から並べる
//   - 完了した行動は一覧の最後の「完了した行動（N）」1 行から開く（切り替えを 2 段重ねにしない・DESIGN §5）
//   - 期限切れは控えめな警告色（責めない）。多いときだけ「期限を見直す」をそっと出す
//   - 達成率などの数字の演出はしない（反ゲーミフィケーション）。今週の完了数を 1 行だけ
//   - 行動 0 件は「相談の答えや、メモから行動を作れます」＋相談へのボタン
// 編集は ⋮ → 編集（App の編集シート）、本の詳細へは ⋮ → 本を開く。
// 見た目は DESIGN.md のトークンのみ。

import { useMemo, useState } from 'react';
import { useAllActions } from '../hooks/useAllActions';
import { stripInlineMd } from '../lib/text';
import { track, EVENTS } from '../lib/analytics';
import EmptyState from './EmptyState';
import ContextMenu from './ContextMenu';
import { MoreVertical, BookOpen, Trash2, Pencil, CheckCircle2, Circle, ListTodo, Plus, MessageCircle, ChevronDown, ChevronRight } from 'lucide-react';

const wrap = { padding: 'var(--space-3) var(--space-4) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' };
const groupTitle = { fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-2)' };
const card = { position: 'relative', background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4) var(--space-12) var(--space-4) var(--space-4)', display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' };
const rowBtn = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 };

// 期限('YYYY-MM-DD' の日付のみ文字列)をローカル0時で解釈する。素の new Date('YYYY-MM-DD')
// は UTC0時扱いになり JST(+9) で1日ずれ、「期限切れ/今週期限」判定が日付境界でずれる。
function parseDeadline(s) {
  if (!s) return new Date(NaN);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
}

// 期限までの日数（今日=0・過ぎたら負）。期限なし・不正は null。
function daysUntil(deadline) {
  if (!deadline) return null;
  const d = parseDeadline(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function fmtShort(deadline) {
  const d = parseDeadline(deadline);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const GROUPS = [
  { key: 'overdue', label: '期限を過ぎた行動' },
  { key: 'today', label: '今日' },
  { key: 'week', label: '今週' },
  { key: 'later', label: '来週以降・期限なし' },
];

// 今日から今週の日曜までの日数（月曜はじまり＝useAllActions の「今週の予定」と同じ暦の週）。
function daysLeftInWeek() {
  const dow = new Date().getDay() || 7; // 日曜=7
  return 7 - dow;
}

function groupOf(a) {
  const n = daysUntil(a.deadline);
  if (n == null) return 'later';
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n <= daysLeftInWeek()) return 'week';
  return 'later';
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const byDeadline = (a, b) => {
  const ad = a.deadline || '9999-99-99';
  const bd = b.deadline || '9999-99-99';
  if (ad !== bd) return ad.localeCompare(bd);
  const pr = (PRIORITY_RANK[a.priority || 'medium'] ?? 1) - (PRIORITY_RANK[b.priority || 'medium'] ?? 1);
  if (pr !== 0) return pr;
  return (a.created_at || '').localeCompare(b.created_at || '');
};

export default function ActionList({ books, onToggleAction, onDeleteAction, onEditAction, onOpenBook, onGoToBooks, onAddAction, onGoConsult }) {
  const { allActions, stats } = useAllActions(books);
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, action }

  const open = useMemo(() => allActions.filter((a) => !a.done).sort(byDeadline), [allActions]);
  const done = useMemo(
    () => allActions.filter((a) => a.done).sort((a, b) => (b.completedAt || b.created_at || '').localeCompare(a.completedAt || a.created_at || '')),
    [allActions],
  );
  const grouped = useMemo(() => {
    const m = new Map(GROUPS.map((g) => [g.key, []]));
    open.forEach((a) => m.get(groupOf(a)).push(a));
    return m;
  }, [open]);
  const overdueCount = grouped.get('overdue').length;
  const bookOf = (a) => (books || []).find((b) => b.id === a.bookId);
  const canAdd = !!onAddAction && (books || []).length > 0;

  // 行動 0 件: 作り方の案内だけ（相談が主な入口・SPEC §4 エッジケース）。
  if (stats.total === 0) {
    return (
      <div style={wrap}>
        <EmptyState
          icon={<ListTodo size={32} strokeWidth={1.5} aria-hidden="true" />}
          title="まだ行動はありません"
          description="相談の答えや、メモから行動を作れます。読んで決めた一歩を、ここでやり切りましょう。"
          actions={[
            ...(onGoConsult ? [{ label: '相談する', icon: <MessageCircle size={18} aria-hidden="true" />, onClick: onGoConsult }] : []),
            ...(canAdd
              ? [{ label: '行動を追加', icon: <Plus size={18} aria-hidden="true" />, onClick: onAddAction, variant: 'secondary' }]
              : onGoToBooks ? [{ label: '本を追加する', icon: <BookOpen size={18} aria-hidden="true" />, onClick: onGoToBooks, variant: 'secondary' }] : []),
          ]}
        />
      </div>
    );
  }

  const renderRow = (a) => {
    const key = `${a.bookId}:${a.actionIdx}:${a.id || ''}`;
    const n = daysUntil(a.deadline);
    const overdue = !a.done && n != null && n < 0;
    const meta = [];
    if (a.bookTitle) meta.push(a.bookTitle);
    if (a.deadline && !a.done) {
      meta.push(
        overdue ? `期限 ${fmtShort(a.deadline)}（過ぎています）`
          : n === 0 ? '今日まで'
          : n === 1 ? '明日まで'
          : `期限 ${fmtShort(a.deadline)}`,
      );
    }
    if (a.priority === 'high') meta.push('優先');
    if (a.recurrence) meta.push(a.recurrence === 'weekly' ? '毎週' : '毎月');
    if (a.sourcePage) meta.push(`p.${a.sourcePage}`);
    return (
      <li key={key} style={card}>
        {/* 完了チェック（この画面の最頻操作・押せる範囲 44）。本の詳細の行動と同じ丸。 */}
        <button
          type="button"
          role="checkbox"
          aria-checked={a.done}
          aria-label={a.done ? `「${stripInlineMd(a.text)}」を未完了に戻す` : `「${stripInlineMd(a.text)}」を完了にする`}
          onClick={() => {
            // 未完了→完了の瞬間だけ計測（PII なし）。ハプティクスは applyActionToggle が一元発火。
            if (!a.done) track(EVENTS.ACTION_COMPLETED);
            onToggleAction?.(a.bookId, a.actionIdx);
          }}
          style={{ flexShrink: 0, width: 44, height: 44, margin: 'calc(-1 * var(--space-3)) 0 calc(-1 * var(--space-3)) calc(-1 * var(--space-3))', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {a.done
            ? <span key="on" className="check-pop" style={{ display: 'flex' }}><CheckCircle2 size={24} aria-hidden="true" style={{ color: 'var(--success)' }} /></span>
            : <Circle size={24} aria-hidden="true" style={{ color: 'var(--border)' }} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.5, color: a.done ? 'var(--text-3)' : 'var(--text)', textDecoration: a.done ? 'line-through' : 'none', wordBreak: 'break-word' }}>
            {stripInlineMd(a.text)}
          </p>
          {meta.length > 0 && (
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-meta)', color: overdue ? 'var(--warning)' : 'var(--text-3)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
              {meta.join('・')}
            </p>
          )}
          {a.done && a.reflection && (
            <p style={{ margin: 'var(--space-2) 0 0', padding: 'var(--space-2) var(--space-3)', background: 'var(--fill)', borderRadius: 'var(--radius)', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {a.reflection}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="この行動の操作"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 8, y: r.bottom + 4, action: a }); }}
          style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}
        >
          <MoreVertical size={18} aria-hidden="true" />
        </button>
      </li>
    );
  };

  const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

  return (
    <div style={wrap}>
      {/* 上: 今週の完了数 1 行（数字の演出はしない）＋ 追加。完了一覧は最後の 1 行から。 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5 }}>
          {stats.week?.total > 0
            ? `今週の予定 ${stats.week.total} 件のうち ${stats.week.completed} 件を完了`
            : `やること ${open.length} 件`}
        </p>
        {canAdd && (
          <button type="button" onClick={onAddAction} style={rowBtn}>
            <Plus size={16} aria-hidden="true" />追加
          </button>
        )}
      </div>

      {open.length === 0 && (
        <EmptyState
          icon={<CheckCircle2 size={32} strokeWidth={1.5} aria-hidden="true" />}
          title="やることはすべて完了しています"
          description="次の一歩は、相談の答えやメモから作れます。"
          actions={onGoConsult ? [{ label: '相談する', onClick: onGoConsult, variant: 'secondary' }] : []}
        />
      )}

      {/* 期限切れが多いとき: 責めずに、見直しをそっと促す。 */}
      {overdueCount >= 3 && (
        <div style={{ background: 'var(--fill)', borderRadius: 'var(--radius)', padding: 'var(--space-3) var(--space-4)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.6 }}>
            期限を過ぎた行動が {overdueCount} 件あります。いまの予定に合う日に、置き直してみませんか。
          </p>
          {onEditAction && (
            <button
              type="button"
              onClick={() => { const a = grouped.get('overdue')[0]; onEditAction(a.bookId, a.actionIdx, a); }}
              style={{ ...rowBtn, marginTop: 'var(--space-2)' }}
            >
              期限を見直す
            </button>
          )}
        </div>
      )}

      {GROUPS.map((g) => {
        const items = grouped.get(g.key);
        if (!items.length) return null;
        return (
          <section key={g.key} aria-labelledby={`act-${g.key}`}>
            <h2 id={`act-${g.key}`} style={groupTitle}>{g.label}</h2>
            <ul style={listStyle}>{items.map(renderRow)}</ul>
          </section>
        );
      })}

      {/* 完了した行動は一覧の最後の 1 行から開く。 */}
      {done.length > 0 && (
        <section aria-label="完了した行動">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', background: 'none', border: 'none', borderTop: '1px solid var(--separator)', padding: 'var(--space-2) 0 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            <span style={{ fontSize: 'var(--text-body)', color: 'var(--text)' }}>完了した行動（{done.length}）</span>
            {showDone
              ? <ChevronDown size={20} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
              : <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)' }} />}
          </button>
          {showDone && <ul style={{ ...listStyle, marginTop: 'var(--space-3)' }}>{done.map(renderRow)}</ul>}
        </section>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(onEditAction ? [{ label: '編集', icon: <Pencil size={16} aria-hidden="true" />, onClick: () => onEditAction(menu.action.bookId, menu.action.actionIdx, menu.action) }] : []),
            { label: '本を開く', icon: <BookOpen size={16} aria-hidden="true" />, onClick: () => { const b = bookOf(menu.action); if (b) onOpenBook?.(b); } },
            { label: '削除', icon: <Trash2 size={16} aria-hidden="true" />, destructive: true, onClick: () => onDeleteAction?.(menu.action.bookId, menu.action.actionIdx) },
          ]}
        />
      )}
    </div>
  );
}
