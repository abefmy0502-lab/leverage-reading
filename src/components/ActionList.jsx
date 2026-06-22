// 🎯 行動リスト — cross-book action page.
//
// Aggregates `book.actions` rows from every book so the user can see "what
// did I commit to do?" at a glance, with completion %, deadline-aware
// coloring, and quick toggle/delete. The actual edit flow stays in the book
// detail view (kebab → 「本を開く」navigates there).

import { useMemo, useState } from 'react';
import { useAllActions } from '../hooks/useAllActions';
import { useHaptic } from '../hooks/useHaptic';
import { ensureHttps } from '../lib/url';
import { track, EVENTS } from '../lib/analytics';
import AnimatedNumber from './AnimatedNumber';
import EmptyState from './EmptyState';
import { Target, MoreVertical, BookOpen, Trash2, Calendar, AlertCircle, Edit3 } from 'lucide-react';

const wrap = { padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 };
const sectionTitle = { fontSize: 13, fontWeight: 600, color: '#5c5043', margin: '0 0 8px' };

const summaryCard = {
  background: '#faf6f0',
  border: '1px solid #e4ddd0',
  borderRadius: 14,
  padding: '16px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const pillRow = {
  display: 'flex',
  gap: 6,
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  paddingBottom: 4,
};

const pill = (active, color = '#5c5043', bg = '#e8e0d2') => ({
  flex: '0 0 auto',
  whiteSpace: 'nowrap',
  fontSize: 12,
  padding: '6px 14px',
  minHeight: 44,
  borderRadius: 999,
  border: active ? `1.5px solid ${color}` : '1px solid #d4ccbe',
  background: active ? bg : 'transparent',
  color: active ? color : '#8a7e6b',
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
  fontFamily: 'inherit',
});

const cardBase = {
  position: 'relative',
  background: '#faf6f0',
  border: '1px solid #e4ddd0',
  borderRadius: 12,
  padding: '12px 40px 12px 14px',
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
};

const kebabBtn = {
  position: 'absolute',
  top: 2,
  right: 4,
  width: 44,
  height: 44,
  background: 'none',
  border: 'none',
  color: '#a89e8c',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  padding: 0,
};

const menuStyle = {
  position: 'absolute',
  top: 32,
  right: 8,
  background: '#fff',
  border: '1px solid #e4ddd0',
  borderRadius: 8,
  boxShadow: '0 4px 14px rgba(30,25,20,0.12)',
  zIndex: 5,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 140,
  overflow: 'hidden',
};

const menuItem = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'none',
  border: 'none',
  padding: '10px 14px',
  fontSize: 13,
  textAlign: 'left',
  fontFamily: 'inherit',
  cursor: 'pointer',
  color: '#3d362c',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function deadlineState(deadline, done) {
  if (done || !deadline) return { kind: 'none' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return { kind: 'none' };
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays < 0) return { kind: 'overdue', days: diffDays };
  if (diffDays === 0) return { kind: 'today', days: 0 };
  if (diffDays <= 3) return { kind: 'soon', days: diffDays };
  return { kind: 'later', days: diffDays };
}

const FILTERS = [
  { key: 'all', label: '全て' },
  { key: 'open', label: '未完了' },
  { key: 'done', label: '完了' },
  { key: 'overdue', label: '⚠ 期限切れ', color: '#a05040', bg: '#fdf0ed' },
  { key: 'today', label: '今日まで', color: '#E65100', bg: '#FFF3E0' },
  { key: 'upcoming', label: '今週期限', color: '#1565C0', bg: '#E3F2FD' },
];

const SORTS = [
  { key: 'deadline', label: '期限順' },
  { key: 'priority', label: '優先度順' },
  { key: 'created', label: '作成順' },
  { key: 'title', label: '本タイトル順' },
];

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

export default function ActionList({ books, onToggleAction, onDeleteAction, onEditAction, onOpenBook }) {
  const { allActions, stats } = useAllActions(books);
  const haptic = useHaptic();
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('deadline');
  const [openMenuKey, setOpenMenuKey] = useState(null);
  // 達成率の集計期間: 'week' | 'month' | 'all'。
  // 旧: 全期間ベースで母数が無限膨張 → 達成率が下がり続ける問題があった
  // ため、デフォルトは「今週」で rolling window 集計を見せる。
  const [statsPeriod, setStatsPeriod] = useState('week');

  const visible = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);

    let list = allActions;
    if (filter === 'open') list = list.filter((a) => !a.done);
    else if (filter === 'done') list = list.filter((a) => a.done);
    else if (filter === 'overdue') {
      // 期限切れ = 未完了 + deadline が today より前
      list = list.filter((a) => {
        if (a.done || !a.deadline) return false;
        const d = new Date(a.deadline);
        return !Number.isNaN(d.getTime()) && d < today;
      });
    } else if (filter === 'today') {
      // 今日まで = 未完了 + deadline が today 以前 (期限切れも含む)
      list = list.filter((a) => {
        if (a.done || !a.deadline) return false;
        const d = new Date(a.deadline);
        return !Number.isNaN(d.getTime()) && d <= today;
      });
    } else if (filter === 'upcoming') {
      list = list.filter((a) => {
        if (a.done || !a.deadline) return false;
        const d = new Date(a.deadline);
        return d >= today && d < weekEnd;
      });
    }

    const sorted = [...list];
    if (sortBy === 'deadline') {
      // Open with deadline first (soonest), then open without deadline,
      // then completed at the end.
      sorted.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const ad = a.deadline || '9999-99-99';
        const bd = b.deadline || '9999-99-99';
        if (ad !== bd) return ad.localeCompare(bd);
        return (a.created_at || '').localeCompare(b.created_at || '');
      });
    } else if (sortBy === 'priority') {
      // 優先度順: 高 → 中 → 低、未完了が先、期限がある方が先。
      sorted.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const pr = (PRIORITY_RANK[a.priority || 'medium'] ?? 1) - (PRIORITY_RANK[b.priority || 'medium'] ?? 1);
        if (pr !== 0) return pr;
        const ad = a.deadline || '9999-99-99';
        const bd = b.deadline || '9999-99-99';
        return ad.localeCompare(bd);
      });
    } else if (sortBy === 'created') {
      sorted.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    } else if (sortBy === 'title') {
      sorted.sort((a, b) => (a.bookTitle || '').localeCompare(b.bookTitle || '', 'ja'));
    }
    return sorted;
  }, [allActions, filter, sortBy]);

  // 期間ベースの達成率表示用 — week / month / all で切替
  const period = statsPeriod === 'all'
    ? { rate: stats.pct, completed: stats.completed, total: stats.total }
    : statsPeriod === 'month' ? stats.month : stats.week;
  const pctColor = period.rate >= 80 ? '#5a7a48' : period.rate >= 50 ? '#d4a040' : '#a05040';

  const handleKebab = (e, key) => {
    e.stopPropagation();
    setOpenMenuKey((cur) => (cur === key ? null : key));
  };

  const closeMenu = () => setOpenMenuKey(null);

  return (
    <div style={wrap} onClick={closeMenu}>
      {/* Page header */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#3d362c', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Target size={18} strokeWidth={1.75} aria-hidden="true" />
          ✅ 本から決めた次の行動を管理
        </h2>
        <p style={{ fontSize: 12, color: '#8a7e6b', marginTop: 2, lineHeight: 1.7 }}>
          完了したらチェックを入れて、習慣化していきましょう
        </p>
      </div>

      {/* Summary card — 期間ベース達成率 (今週 / 今月 / 全期間 で切替) +
          🔥 連続達成日数 + 今週期限件数。母数膨張問題を防ぐため
          デフォルトは「今週」だが、必要なら全期間も見られる。 */}
      {stats.total > 0 && (() => {
        const periodLabel = statsPeriod === 'week' ? '今週' : statsPeriod === 'month' ? '今月' : '全期間';
        const remaining = Math.max(0, period.total - period.completed);
        const milestone =
          period.total === 0
            ? `${periodLabel}に予定された行動はまだありません`
            : period.rate >= 100
            ? `🎉 ${periodLabel}の予定をすべて完了`
            : `あと ${remaining} 件で ${periodLabel}を完了`;
        return (
          <div style={summaryCard}>
            {/* 期間切替タブ */}
            <div
              style={{
                display: 'flex',
                gap: 4,
                padding: 3,
                background: '#eae3d6',
                borderRadius: 10,
                alignSelf: 'flex-start',
              }}
              role="tablist"
              aria-label="達成率の表示期間を選択"
            >
              {[
                { key: 'week', label: '今週' },
                { key: 'month', label: '今月' },
                { key: 'all', label: '全期間' },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={statsPeriod === p.key}
                  onClick={() => setStatsPeriod(p.key)}
                  style={{
                    padding: '5px 12px',
                    minHeight: 30,
                    borderRadius: 8,
                    border: 'none',
                    background: statsPeriod === p.key ? '#5c5043' : 'transparent',
                    color: statsPeriod === p.key ? '#faf6f0' : '#5c5548',
                    fontSize: 12,
                    fontWeight: statsPeriod === p.key ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 11, color: '#8a7e6b' }}>{periodLabel}の達成率</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: pctColor, lineHeight: 1.1 }}>
                  <AnimatedNumber value={period.rate} duration={700} />
                  <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 2 }}>%</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                  {milestone}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#5c5043' }}>
                  <AnimatedNumber value={period.completed} duration={500} /> / {period.total} 完了
                </div>
                {stats.streak > 0 && (
                  <div style={{ fontSize: 11, color: '#b07028', marginTop: 4 }}>
                    🔥 連続 {stats.streak} 日
                  </div>
                )}
                {stats.upcomingThisWeek > 0 && (
                  <div style={{ fontSize: 11, color: '#a05040', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={11} strokeWidth={1.75} aria-hidden="true" />
                    今週期限 {stats.upcomingThisWeek} 件
                  </div>
                )}
              </div>
            </div>
            <div className="progress-bar" role="progressbar" aria-valuenow={period.rate} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="progress-fill"
                style={{
                  width: `${period.rate}%`,
                  background: `linear-gradient(90deg, ${pctColor}, var(--color-accent-strong))`,
                }}
              />
            </div>
          </div>
        );
      })()}

      {/* Filter pills */}
      {stats.total > 0 && (
        <div style={pillRow} className="lvg-no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={pill(filter === f.key, f.color, f.bg)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Sort */}
      {stats.total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#8a7e6b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>並び順</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ fontSize: 16, padding: '8px 8px', minHeight: 44, borderRadius: 8, border: '1px solid #d4ccbe', background: '#faf6f0', color: '#3d362c', fontFamily: 'inherit' }}
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <span>{visible.length}件</span>
        </div>
      )}

      {/* List */}
      {stats.total === 0 ? (
        <EmptyState
          icon="🎯"
          title="次の一歩が、ここに集まります"
          description={(
            <>
              本のメモから「やってみること」を決めると、<br />
              本を横断してここに並びます。
            </>
          )}
          tip="💡 各本の詳細画面 → 「行動リスト」セクションから追加できます"
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="条件に合う行動がありません"
          description="フィルタや並び順を変えてみてください。"
        />
      ) : (
        <div className="list-item-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((a) => {
            const ds = deadlineState(a.deadline, a.done);
            const key = `${a.bookId}:${a.actionIdx}:${a.id || ''}`;
            const cardStyle = {
              ...cardBase,
              background: a.done ? '#f0ebe2' : ds.kind === 'overdue' ? '#fdf0ed' : '#faf6f0',
              borderColor: ds.kind === 'overdue' && !a.done ? '#e0b0a0' : '#e4ddd0',
            };
            return (
              <div key={key} className="list-item-enter" style={cardStyle}>
                {/* Checkbox — `key={a.done}` resets the inner ✓ so the
                    pop keyframe replays on every toggle. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // 完了にする瞬間だけ成功ハプティクス。戻す時は軽いタップ感に
                    // 留めて、過剰なお祝いにならないようにする。
                    if (a.done) haptic.light();
                    else {
                      haptic.success();
                      // 未完了→完了にトグルした瞬間だけ 1 回計測（PII なし・fire-and-forget）
                      track(EVENTS.ACTION_COMPLETED);
                    }
                    onToggleAction?.(a.bookId, a.actionIdx);
                  }}
                  aria-label={a.done ? '未完了に戻す' : '完了にする'}
                  aria-checked={a.done}
                  role="checkbox"
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: 'var(--radius-sm)',
                    border: a.done ? 'none' : '1.5px solid var(--color-border)',
                    background: a.done ? 'var(--color-success)' : 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    lineHeight: 1,
                    fontFamily: 'inherit',
                    padding: 0,
                    marginTop: 1,
                    transition: 'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-spring)',
                    transform: a.done ? 'scale(1.05)' : 'scale(1)',
                  }}
                >
                  {a.done && (
                    <span key={`${key}-on`} className="check-pop" aria-hidden="true" style={{ display: 'block', fontWeight: 700 }}>
                      ✓
                    </span>
                  )}
                </button>

                {/* Body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: a.done ? '#9a8e7a' : '#3d362c',
                      textDecoration: a.done ? 'line-through' : 'none',
                      margin: 0,
                      wordBreak: 'break-word',
                    }}
                  >
                    {a.text}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const book = (books || []).find((b) => b.id === a.bookId);
                        if (book) onOpenBook?.(book);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 11,
                        color: '#8a7040',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontFamily: 'inherit',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {a.bookCover ? (
                        <img
                          src={ensureHttps(a.bookCover)}
                          alt=""
                          style={{ width: 14, height: 18, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                        />
                      ) : (
                        <BookOpen size={11} strokeWidth={1.75} aria-hidden="true" />
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.bookTitle}
                      </span>
                    </button>
                    {a.deadline && (() => {
                      // 期限の状態で色とラベルを切替。期限切れ=赤 / 今日=橙(警告) /
                      // 数日以内=アクセント / それ以降=控えめグレー。色はトークン参照。
                      const dColor =
                        ds.kind === 'overdue'
                          ? 'var(--color-error)'
                          : ds.kind === 'today'
                            ? 'var(--color-warning)'
                            : ds.kind === 'soon'
                              ? 'var(--color-accent)'
                              : 'var(--color-text-tertiary)';
                      const emphasized = ds.kind === 'overdue' || ds.kind === 'today';
                      return (
                        <span
                          style={{
                            fontSize: 10,
                            color: dColor,
                            fontWeight: emphasized ? 600 : 400,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          {ds.kind === 'overdue' || ds.kind === 'today' ? (
                            <AlertCircle size={10} strokeWidth={1.75} aria-hidden="true" />
                          ) : (
                            <Calendar size={10} strokeWidth={1.75} aria-hidden="true" />
                          )}
                          {fmtDate(a.deadline)}
                          {ds.kind === 'overdue' && ' (期限切れ)'}
                          {ds.kind === 'today' && ' (今日まで)'}
                          {ds.kind === 'soon' && ` (あと${ds.days}日)`}
                        </span>
                      );
                    })()}
                    {/* 優先度バッジ — 'medium' は default なので表示しない */}
                    {a.priority === 'high' && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#FFEBEE', color: '#C62828', fontWeight: 600 }}>🔴 高</span>
                    )}
                    {a.priority === 'low' && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#E8F5E9', color: '#2E7D32' }}>🟢 低</span>
                    )}
                    {/* 繰り返し */}
                    {a.recurrence && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#F3E5F5', color: '#6A1B9A' }}>
                        🔁 {a.recurrence === 'weekly' ? '毎週' : '毎月'}
                      </span>
                    )}
                    {/* 引用ページ */}
                    {a.sourcePage && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#FFFDE7', color: '#5D4037' }}>
                        🔗 p.{a.sourcePage}
                      </span>
                    )}
                  </div>
                  {/* 完了後の振り返りメモ */}
                  {a.done && a.reflection && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '8px 10px',
                        background: '#f5efde',
                        border: '1px solid #e0d0a8',
                        borderRadius: 8,
                        fontSize: 12,
                        color: '#5c5043',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      💭 {a.reflection}
                    </div>
                  )}
                </div>

                {/* Kebab */}
                <button
                  type="button"
                  onClick={(e) => handleKebab(e, key)}
                  style={kebabBtn}
                  aria-label="メニューを開く"
                >
                  <MoreVertical size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
                {openMenuKey === key && (
                  <div style={menuStyle} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      style={menuItem}
                      onClick={() => {
                        setOpenMenuKey(null);
                        // a は useAllActions で transform 済みなので
                        // text/deadline/priority/recurrence/reflection を含む
                        onEditAction?.(a.bookId, a.actionIdx, a);
                      }}
                    >
                      <Edit3 size={14} strokeWidth={1.75} aria-hidden="true" />
                      編集
                    </button>
                    <button
                      type="button"
                      style={menuItem}
                      onClick={() => {
                        setOpenMenuKey(null);
                        const book = (books || []).find((b) => b.id === a.bookId);
                        if (book) onOpenBook?.(book);
                      }}
                    >
                      <BookOpen size={14} strokeWidth={1.75} aria-hidden="true" />
                      本を開く
                    </button>
                    <button
                      type="button"
                      style={{ ...menuItem, color: '#a05040' }}
                      onClick={() => {
                        setOpenMenuKey(null);
                        onDeleteAction?.(a.bookId, a.actionIdx);
                      }}
                    >
                      <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                      削除
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
