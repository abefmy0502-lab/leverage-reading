// 🎯 行動リスト — cross-book action page.
//
// Aggregates `book.actions` rows from every book so the user can see "what
// did I commit to do?" at a glance, with completion %, deadline-aware
// coloring, and quick toggle/delete. The actual edit flow stays in the book
// detail view (kebab → 「本を開く」navigates there).

import { useMemo, useState } from 'react';
import { useAllActions } from '../hooks/useAllActions';
import { ensureHttps } from '../lib/url';
import { Target, MoreVertical, BookOpen, Trash2, Calendar, AlertCircle } from 'lucide-react';

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
  minHeight: 32,
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
  top: 8,
  right: 10,
  width: 28,
  height: 28,
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
  if (diffDays <= 3) return { kind: 'soon', days: diffDays };
  return { kind: 'later', days: diffDays };
}

const FILTERS = [
  { key: 'all', label: '全て' },
  { key: 'open', label: '未完了' },
  { key: 'done', label: '完了' },
  { key: 'upcoming', label: '今週期限', color: '#a05040', bg: '#fdf0ed' },
];

const SORTS = [
  { key: 'deadline', label: '期限順' },
  { key: 'created', label: '作成順' },
  { key: 'title', label: '本タイトル順' },
];

export default function ActionList({ books, onToggleAction, onDeleteAction, onOpenBook }) {
  const { allActions, stats } = useAllActions(books);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('deadline');
  const [openMenuKey, setOpenMenuKey] = useState(null);

  const visible = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);

    let list = allActions;
    if (filter === 'open') list = list.filter((a) => !a.done);
    else if (filter === 'done') list = list.filter((a) => a.done);
    else if (filter === 'upcoming') {
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
    } else if (sortBy === 'created') {
      sorted.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    } else if (sortBy === 'title') {
      sorted.sort((a, b) => (a.bookTitle || '').localeCompare(b.bookTitle || '', 'ja'));
    }
    return sorted;
  }, [allActions, filter, sortBy]);

  const pctColor = stats.pct >= 80 ? '#5a7a48' : stats.pct >= 50 ? '#d4a040' : '#a05040';

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
          行動リスト
        </h2>
        <p style={{ fontSize: 12, color: '#8a7e6b', marginTop: 2 }}>本から学んだ行動を実生活に</p>
      </div>

      {/* Summary card */}
      {stats.total > 0 && (
        <div style={summaryCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 11, color: '#8a7e6b' }}>完了率</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: pctColor, lineHeight: 1.1 }}>
                {stats.pct}<span style={{ fontSize: 14, fontWeight: 500, marginLeft: 2 }}>%</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: '#5c5043' }}>{stats.completed} / {stats.total} 完了</div>
              {stats.upcomingThisWeek > 0 && (
                <div style={{ fontSize: 11, color: '#a05040', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={11} strokeWidth={1.75} aria-hidden="true" />
                  今週期限 {stats.upcomingThisWeek}件
                </div>
              )}
            </div>
          </div>
          <div style={{ height: 8, background: '#e8e0d2', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${stats.pct}%`,
                background: pctColor,
                borderRadius: 4,
                transition: 'width .4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            />
          </div>
        </div>
      )}

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
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid #d4ccbe', background: '#faf6f0', color: '#3d362c', fontFamily: 'inherit' }}
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
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#5c5548' }}>
          <Target size={48} strokeWidth={1.5} aria-hidden="true" style={{ color: '#c4b8a6', marginBottom: 8 }} />
          <p style={{ fontSize: 14, color: '#3d362c', margin: '0 0 6px', fontWeight: 500 }}>まだ行動がありません</p>
          <p style={{ fontSize: 12, color: '#8a7e6b', margin: 0, lineHeight: 1.7 }}>
            本詳細画面で「行動リスト」に追加すると、<br />
            ここに集約されます。
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 20px', color: '#8a7e6b', fontSize: 13 }}>
          条件に合う行動がありません。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((a) => {
            const ds = deadlineState(a.deadline, a.done);
            const key = `${a.bookId}:${a.actionIdx}:${a.id || ''}`;
            const cardStyle = {
              ...cardBase,
              background: a.done ? '#f0ebe2' : ds.kind === 'overdue' ? '#fdf0ed' : '#faf6f0',
              borderColor: ds.kind === 'overdue' && !a.done ? '#e0b0a0' : '#e4ddd0',
            };
            return (
              <div key={key} style={cardStyle}>
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleAction?.(a.bookId, a.actionIdx);
                  }}
                  aria-label={a.done ? '未完了に戻す' : '完了にする'}
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: a.done ? 'none' : '1.5px solid #c4b8a6',
                    background: a.done ? '#5a7a48' : 'transparent',
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
                  }}
                >
                  {a.done ? '✓' : ''}
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
                    {a.deadline && (
                      <span
                        style={{
                          fontSize: 10,
                          color:
                            ds.kind === 'overdue'
                              ? '#a05040'
                              : ds.kind === 'soon'
                                ? '#b07028'
                                : '#9a8e7a',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        {ds.kind === 'overdue' ? (
                          <AlertCircle size={10} strokeWidth={1.75} aria-hidden="true" />
                        ) : (
                          <Calendar size={10} strokeWidth={1.75} aria-hidden="true" />
                        )}
                        {fmtDate(a.deadline)}
                        {ds.kind === 'overdue' && ' (期限切れ)'}
                        {ds.kind === 'soon' && ds.days === 0 && ' (今日)'}
                        {ds.kind === 'soon' && ds.days > 0 && ` (あと${ds.days}日)`}
                      </span>
                    )}
                  </div>
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
