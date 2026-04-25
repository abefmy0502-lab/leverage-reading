// Personal Capital Dashboard — gives the user a portfolio view of their reading
// "investments". Renders inside a Modal (own scroll container).
//
// Composition:
//   <CapitalDashboard>
//     <SummaryCard />               — always-visible top stats
//     <SubTabs>                     — 4 tabs: knowledge map / ROI / plan / growth
//     <Tab content>                 — varies
//
// All charts are pure SVG (no chart library).
// AI-generated insights are deferred to a future iteration; the structure leaves
// room to drop them in per tab.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { callClaude } from '../lib/ai';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import AIInsight from './AIInsight';

const closeBtn = { background: 'none', border: 'none', fontSize: 22, color: '#8a7e6b', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'inherit' };
const inp = { width: '100%', padding: '8px 10px', fontSize: 16, border: '1px solid #d4ccbe', borderRadius: 8, background: '#fff', color: '#3d362c', fontFamily: 'inherit', boxSizing: 'border-box' };
const btnS = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#5c5043', color: '#faf6f0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, letterSpacing: 1 };

const cardBase = {
  background: '#faf6f0',
  borderRadius: 12,
  padding: '12px 14px',
  border: '1px solid #e4ddd0',
};

const subTabBtn = (active) => ({
  flex: 1,
  padding: '10px 0',
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  borderBottom: active ? '2px solid #5c5043' : '2px solid transparent',
  color: active ? '#3d362c' : '#a89e8c',
  fontWeight: active ? 500 : 400,
  minHeight: 44,
});

// ===== Helpers =====
const PAGE_MINUTES = 2; // rough average reading speed assumption
const isoDay = (d) => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const todayDay = () => isoDay(new Date());
const yesterdayDay = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDay(d);
};

function formatHours(minutes) {
  if (!minutes || minutes <= 0) return '0';
  const hours = minutes / 60;
  if (hours < 10) return hours.toFixed(1);
  return Math.round(hours).toString();
}

function computeStreak(memoDates) {
  if (!memoDates?.length) return 0;
  const days = new Set(memoDates.map(isoDay));
  // Anchor to today if there's a memo today, else yesterday (so a day off
  // doesn't immediately reset the streak counter mid-day).
  const today = todayDay();
  const yesterday = yesterdayDay();
  let cursor;
  if (days.has(today)) cursor = new Date();
  else if (days.has(yesterday)) {
    cursor = new Date();
    cursor.setDate(cursor.getDate() - 1);
  } else return 0;

  let count = 0;
  while (days.has(isoDay(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

// Reading-level tiers based on done-book count.
function levelFromDone(done) {
  const tiers = [
    { level: 1, threshold: 0 },
    { level: 2, threshold: 3 },
    { level: 3, threshold: 5 },
    { level: 4, threshold: 8 },
    { level: 5, threshold: 12 },
    { level: 6, threshold: 18 },
    { level: 7, threshold: 25 },
    { level: 8, threshold: 35 },
    { level: 9, threshold: 50 },
    { level: 10, threshold: 75 },
    { level: 12, threshold: 100 },
    { level: 15, threshold: 150 },
    { level: 20, threshold: 200 },
  ];
  let current = tiers[0];
  let next = tiers[1];
  for (let i = 0; i < tiers.length; i += 1) {
    if (done >= tiers[i].threshold) {
      current = tiers[i];
      next = tiers[i + 1] || null;
    }
  }
  const remaining = next ? Math.max(0, next.threshold - done) : 0;
  const span = next ? next.threshold - current.threshold : 1;
  const progressInTier = next ? Math.min(1, (done - current.threshold) / span) : 1;
  return { level: current.level, next, remaining, progressInTier };
}

function computeBadges({ doneCount, memoCount, actionsDone, streak, distinctTagsDone }) {
  const all = [
    { id: 'first-done', icon: '🌱', label: '初めての読了', earned: doneCount >= 1, hint: '1 冊読了' },
    { id: 'reader-10', icon: '📚', label: '読書家', earned: doneCount >= 10, hint: '10 冊読了' },
    { id: 'master-50', icon: '🏆', label: 'マスター', earned: doneCount >= 50, hint: '50 冊読了' },
    { id: 'streak-7', icon: '🔥', label: '連続 7 日', earned: streak >= 7, hint: '7 日連続でメモ' },
    { id: 'streak-30', icon: '⚡', label: '連続 30 日', earned: streak >= 30, hint: '30 日連続でメモ' },
    { id: 'action-10', icon: '🎯', label: '行動派', earned: actionsDone >= 10, hint: '10 件のアクション完了' },
    { id: 'memo-100', icon: '💎', label: '100 メモ達成', earned: memoCount >= 100, hint: '100 件のメモ' },
    { id: 'diversity-5', icon: '📐', label: '多様性', earned: distinctTagsDone >= 5, hint: '5 ジャンル以上で読了' },
  ];
  return all;
}

// Stable, dependency-free hash for cache keys.
function makeHash(obj) {
  const str = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

// ===== Pure-SVG components =====
function RadarChart({ axes, maxScore }) {
  // axes: [{ name, score }]
  const cx = 130;
  const cy = 130;
  const R = 100;
  const n = Math.max(axes.length, 3);

  const pointFor = (i, ratio) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: cx + Math.cos(angle) * (R * ratio), y: cy + Math.sin(angle) * (R * ratio) };
  };

  const ringRatios = [0.25, 0.5, 0.75, 1];
  const ringPolys = ringRatios.map((r) =>
    Array.from({ length: n }, (_, i) => pointFor(i, r))
      .map((p) => `${p.x},${p.y}`)
      .join(' ')
  );

  const dataPoly = axes
    .map((a, i) => pointFor(i, maxScore > 0 ? a.score / maxScore : 0))
    .map((p) => `${p.x},${p.y}`)
    .join(' ');

  return (
    <svg viewBox="0 0 260 260" width="100%" style={{ maxWidth: 320, display: 'block', margin: '0 auto' }} aria-label="知識マップ レーダーチャート">
      {ringPolys.map((poly, i) => (
        <polygon key={i} points={poly} fill="none" stroke="#e0d8c8" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const end = pointFor(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#e0d8c8" strokeWidth="1" />;
      })}
      {axes.length > 0 && (
        <polygon points={dataPoly} fill="rgba(92,80,67,0.22)" stroke="#5c5043" strokeWidth="2" strokeLinejoin="round" />
      )}
      {axes.map((a, i) => {
        const labelPos = pointFor(i, 1.18);
        return (
          <text
            key={a.name}
            x={labelPos.x}
            y={labelPos.y}
            fontSize="10"
            fill="#5c5548"
            textAnchor={Math.abs(labelPos.x - cx) < 4 ? 'middle' : labelPos.x > cx ? 'start' : 'end'}
            dominantBaseline={Math.abs(labelPos.y - cy) < 4 ? 'middle' : labelPos.y > cy ? 'hanging' : 'auto'}
          >
            #{a.name}
          </text>
        );
      })}
    </svg>
  );
}

function StreakHeatmap({ memoDates }) {
  const days = 91; // ~13 weeks
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const counts = new Map();
  memoDates.forEach((iso) => {
    const day = isoDay(iso);
    counts.set(day, (counts.get(day) || 0) + 1);
  });

  const cellSize = 14;
  const gap = 3;
  const cols = Math.ceil(days / 7);
  const width = cols * (cellSize + gap);
  const height = 7 * (cellSize + gap);

  const cells = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - i));
    const day = isoDay(date);
    const count = counts.get(day) || 0;
    cells.push({ x: Math.floor(i / 7), y: i % 7, count, day });
  }

  const colorFor = (n) => {
    if (n === 0) return '#ece5d6';
    if (n === 1) return '#cbdab5';
    if (n === 2) return '#9bbf85';
    if (n <= 4) return '#7aa86b';
    return '#5a7a48';
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} aria-label="メモ記録のヒートマップ">
        {cells.map((c) => (
          <rect
            key={c.day}
            x={c.x * (cellSize + gap)}
            y={c.y * (cellSize + gap)}
            width={cellSize}
            height={cellSize}
            rx="2"
            fill={colorFor(c.count)}
          >
            <title>{`${c.day}: ${c.count} メモ`}</title>
          </rect>
        ))}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#9a8e7a', marginTop: 6 }}>
        <span>少</span>
        {[0, 1, 2, 3, 5].map((n) => (
          <span key={n} style={{ width: 12, height: 12, borderRadius: 2, background: colorFor(n) }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}

function StatTile({ icon, label, value, sub }) {
  return (
    <div style={{ flex: '1 1 30%', minWidth: 110, padding: '10px 12px', background: '#faf6f0', border: '1px solid #e4ddd0', borderRadius: 12 }}>
      <div style={{ fontSize: 11, color: '#8a7e6b', marginBottom: 4 }}>
        <span style={{ fontSize: 13, marginRight: 4 }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: '#3d362c', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#a89e8c', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ===== Learning Plans (AI-generated) =====
const PLANS_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

function readPlansCache(userId) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`aiPlans_${userId || 'anon'}`);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.plans || !Array.isArray(obj.plans)) return null;
    if (typeof obj.savedAt !== 'number') return null;
    if (Date.now() - obj.savedAt > PLANS_TTL_MS) return null;
    return obj.plans;
  } catch {
    return null;
  }
}

function writePlansCache(userId, plans) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      `aiPlans_${userId || 'anon'}`,
      JSON.stringify({ plans, savedAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

function parsePlans(text) {
  if (typeof text !== 'string') return [];
  const m = text.match(/PLANS_START\s*([\s\S]*?)\s*PLANS_END/);
  const blob = m ? m[1] : text;
  // Try to extract a JSON array even if the model wrapped it loosely.
  const start = blob.indexOf('[');
  const end = blob.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const arr = JSON.parse(blob.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (p) => p && typeof p.title === 'string' && Array.isArray(p.books) && p.books.length > 0
    );
  } catch {
    return [];
  }
}

function LearningPlans({ userId, books, allTags, onAddBookFromPlan }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [plans, setPlans] = useState(() => readPlansCache(userId) || []);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [adding, setAdding] = useState(null); // plan title currently being added

  const generate = useCallback(
    async ({ force = false } = {}) => {
      if (!force) {
        const cached = readPlansCache(userId);
        if (cached?.length) {
          setPlans(cached);
          return;
        }
      }
      setLoading(true);
      setErrorMsg(null);
      try {
        const doneBooks = books.filter((b) => b.status === 'done');
        const topRated = [...doneBooks]
          .filter((b) => (b.rating || 0) >= 4)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 5)
          .map((b) => `「${b.title}」(★${b.rating})`)
          .join('、');
        const tagSummary = allTags.slice(0, 8).join('、') || 'なし';

        const system =
          'あなたは読書プランナーです。ユーザーの読書傾向から、テーマ別の学習プランを 3 つ提案します。実在する日本語で読める本のみを推薦してください。';
        const user =
          `以下のユーザー情報から、おすすめの学習プランを 3 つ JSON 形式で提案してください。\n\n` +
          `【ユーザー情報】\n` +
          `- 既存タグ: ${tagSummary}\n` +
          `- 読了済み: ${doneBooks.length} 冊\n` +
          `- 評価が高かった本: ${topRated || 'まだなし'}\n\n` +
          `以下の形式で必ず 3 プラン返してください。JSON 以外のテキストは含めないでください:\n\n` +
          `PLANS_START\n` +
          `[\n` +
          `  {"title": "プラン名", "description": "説明 (2-3 文)", "duration": "期間目安", "tags": ["関連タグ"], "books": ["本1", "本2", "本3", "本4", "本5"], "rationale": "なぜこのプランか (1-2 文)"}\n` +
          `]\n` +
          `PLANS_END\n\n` +
          `各プランの books は実在する日本語で読める本のタイトルを 5 冊。ユーザーの今のレベルから一歩進める内容で。`;

        const result = await callClaude(system, user, { max_tokens: 2000 });
        const parsed = parsePlans(result);
        if (parsed.length === 0) {
          setErrorMsg('学習プランの生成に失敗しました。少し時間をおいて再度お試しください。');
          return;
        }
        setPlans(parsed);
        writePlansCache(userId, parsed);
      } catch {
        setErrorMsg('学習プランの生成に失敗しました。少し時間をおいて再度お試しください。');
      } finally {
        setLoading(false);
      }
    },
    [userId, books, allTags]
  );

  useEffect(() => {
    if (plans.length === 0) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleAdd = async (plan) => {
    if (!onAddBookFromPlan) {
      toast.error('本の追加機能が利用できません。');
      return;
    }
    const ok = await confirm({
      title: 'このプランで読みますか？',
      message: `「${plan.title}」の ${plan.books.length} 冊を「読みたい」リストに追加します。`,
      confirmLabel: '追加する',
      cancelLabel: 'キャンセル',
    });
    if (!ok) return;
    setAdding(plan.title);
    let added = 0;
    let failed = 0;
    for (const bookTitle of plan.books) {
      try {
        await onAddBookFromPlan({ title: bookTitle, author: '', tags: plan.tags || [] });
        added += 1;
      } catch {
        failed += 1;
      }
    }
    setAdding(null);
    if (added > 0 && failed === 0) toast.success(`${added} 冊を「読みたい」に追加しました`);
    else if (added > 0 && failed > 0) toast.info(`${added} 冊追加 / ${failed} 冊失敗`);
    else toast.error('追加に失敗しました。少し待って再試行してください。');
  };

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 13, color: '#5c5043', fontWeight: 600, margin: 0 }}>
          📚 おすすめ学習プラン
        </p>
        <button
          type="button"
          onClick={() => generate({ force: true })}
          disabled={loading}
          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid #d4ccbe', background: 'transparent', color: '#5c5043', cursor: 'pointer', fontFamily: 'inherit', minHeight: 28, opacity: loading ? 0.5 : 1 }}
        >
          {loading ? '生成中...' : '↻ 再生成'}
        </button>
      </div>

      {loading && plans.length === 0 && (
        <div style={cardBase}>
          <p style={{ fontSize: 12, color: '#a89e8c', margin: 0 }}>AI がプランを生成しています...</p>
        </div>
      )}

      {!loading && plans.length === 0 && errorMsg && (
        <div style={{ ...cardBase, background: '#f9eae6' }}>
          <p style={{ fontSize: 12, color: '#a05040', margin: 0, lineHeight: 1.7 }}>{errorMsg}</p>
        </div>
      )}

      {plans.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plans.map((plan) => {
            const isAdding = adding === plan.title;
            return (
              <div key={plan.title} style={cardBase}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <p style={{ fontSize: 14, color: '#3d362c', fontWeight: 600, margin: 0 }}>{plan.title}</p>
                  <span style={{ fontSize: 10, color: '#8a7e6b', whiteSpace: 'nowrap' }}>
                    {plan.duration || ''} · {plan.books.length} 冊
                  </span>
                </div>
                {plan.description && (
                  <p style={{ fontSize: 12, color: '#5c5548', margin: '0 0 6px', lineHeight: 1.7 }}>
                    {plan.description}
                  </p>
                )}
                {plan.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {plan.tags.map((t) => (
                      <span key={t} style={{ fontSize: 10, padding: '2px 6px', background: '#eae3d6', color: '#7a6e58', borderRadius: 8 }}>#{t}</span>
                    ))}
                  </div>
                )}
                <details style={{ marginBottom: 8 }}>
                  <summary style={{ fontSize: 11, color: '#8a7e6b', cursor: 'pointer' }}>
                    収録予定の {plan.books.length} 冊を表示
                  </summary>
                  <ul style={{ fontSize: 12, color: '#5c5548', lineHeight: 1.8, margin: '6px 0 0', paddingLeft: 18 }}>
                    {plan.books.map((b, i) => (
                      <li key={`${b}-${i}`}>{b}</li>
                    ))}
                  </ul>
                </details>
                {plan.rationale && (
                  <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 10px', lineHeight: 1.6, fontStyle: 'italic' }}>
                    💡 {plan.rationale}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => handleAdd(plan)}
                  disabled={isAdding}
                  style={{ ...btnS, width: '100%', padding: '10px 0', fontSize: 13, opacity: isAdding ? 0.6 : 1 }}
                >
                  {isAdding ? '追加中...' : '📚 このプランで読む'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {plans.length > 0 && (
        <p style={{ fontSize: 10, color: '#a89e8c', marginTop: 8, lineHeight: 1.5 }}>
          学習プランは 1 日キャッシュされます。新しい提案がほしい時は「再生成」をタップ。
        </p>
      )}
    </div>
  );
}

// ===== Main component =====
export default function CapitalDashboard({ books, readingPlans, onUpdatePlans, onClose, onAddBookFromPlan }) {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState('map');
  const [editingTheme, setEditingTheme] = useState(null);
  const [targetInput, setTargetInput] = useState('');
  const scrollRef = useRef(null);

  // Fetch all memos for this user once. We only need created_at + book_id.
  const [memoMeta, setMemoMeta] = useState({ count: 0, dates: [], byBook: new Map(), loaded: false });
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('book_memos')
        .select('id, book_id, created_at')
        .eq('user_id', user.id);
      if (cancelled) return;
      if (error) {
        console.warn('memo stats fetch failed:', error);
        setMemoMeta({ count: 0, dates: [], byBook: new Map(), loaded: true });
        return;
      }
      const dates = [];
      const byBook = new Map();
      (data || []).forEach((m) => {
        if (m.created_at) dates.push(m.created_at);
        byBook.set(m.book_id, (byBook.get(m.book_id) || 0) + 1);
      });
      setMemoMeta({ count: data?.length || 0, dates, byBook, loaded: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, books.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0, behavior: 'auto' });
  }, [subTab]);

  // ===== Aggregations =====
  const themeData = useMemo(() => {
    const themes = {};
    books.forEach((b) => {
      const tags = (b.tags || []).length > 0 ? b.tags : ['未分類'];
      const cardMemoCount = memoMeta.byBook.get(b.id) || 0;
      const legacyMemoLines = b.leverageMemo?.trim()
        ? b.leverageMemo.split('\n').filter((l) => l.trim()).length
        : 0;
      const totalMemos = cardMemoCount + legacyMemoLines;
      tags.forEach((tag) => {
        if (!themes[tag]) themes[tag] = { total: 0, done: 0, reading: 0, want: 0, ratings: [], memoCount: 0, actionsDone: 0, actionsTotal: 0 };
        themes[tag].total += 1;
        if (b.status === 'done') {
          themes[tag].done += 1;
          if (b.rating) themes[tag].ratings.push(b.rating);
        }
        if (b.status === 'reading') themes[tag].reading += 1;
        if (b.status === 'want' || b.status === 'before') themes[tag].want += 1;
        themes[tag].memoCount += totalMemos;
        (b.actions || []).forEach((a) => {
          if (a.text?.trim()) {
            themes[tag].actionsTotal += 1;
            if (a.done) themes[tag].actionsDone += 1;
          }
        });
      });
    });
    return Object.entries(themes)
      .map(([name, d]) => ({
        name,
        ...d,
        avgRoi: d.ratings.length ? d.ratings.reduce((s, r) => s + r, 0) / d.ratings.length : 0,
        target: readingPlans[name] || 0,
        capitalScore: d.done * 3 + d.memoCount * 0.5 + d.actionsDone * 2,
      }))
      .sort((a, b) => b.total - a.total);
  }, [books, readingPlans, memoMeta]);

  const totals = useMemo(() => {
    const doneBooks = books.filter((b) => b.status === 'done');
    const totalPagesDone = doneBooks.reduce((s, b) => s + (b.totalPages || 0), 0);
    const investedMinutes = totalPagesDone * PAGE_MINUTES;
    const actionsTotal = books.reduce(
      (s, b) => s + (b.actions || []).filter((a) => a.text?.trim()).length,
      0
    );
    const actionsDone = books.reduce(
      (s, b) => s + (b.actions || []).filter((a) => a.done).length,
      0
    );
    const avgRating = (() => {
      const rated = doneBooks.filter((b) => b.rating);
      if (!rated.length) return 0;
      return rated.reduce((s, b) => s + b.rating, 0) / rated.length;
    })();
    const distinctDoneTags = new Set();
    doneBooks.forEach((b) => (b.tags || []).forEach((t) => distinctDoneTags.add(t)));
    const streak = computeStreak(memoMeta.dates);

    // Investment efficiency score (rough, 0–100):
    //   action completion + average rating + memo activity, normalised by hours
    //   so users with light reading aren't penalised against heavy readers.
    const hours = investedMinutes / 60 || 1;
    const raw = (actionsDone * 5 + avgRating * 10 + memoMeta.count * 0.5) / Math.max(hours, 1);
    const roiScore = Math.max(0, Math.min(100, Math.round(raw * 4)));

    return {
      doneCount: doneBooks.length,
      investedMinutes,
      memoCount: memoMeta.count,
      actionsTotal,
      actionsDone,
      actionsRate: actionsTotal > 0 ? Math.round((actionsDone / actionsTotal) * 100) : 0,
      streak,
      avgRating,
      distinctDoneTags: distinctDoneTags.size,
      roiScore,
    };
  }, [books, memoMeta]);

  const radarAxes = useMemo(() => {
    const top = themeData.slice(0, 6);
    if (top.length === 0) return { axes: [], max: 0 };
    const max = Math.max(...top.map((t) => t.capitalScore), 1);
    return { axes: top.map((t) => ({ name: t.name, score: t.capitalScore })), max };
  }, [themeData]);

  const top3Strengths = themeData.slice(0, 3);

  const badges = useMemo(
    () =>
      computeBadges({
        doneCount: totals.doneCount,
        memoCount: totals.memoCount,
        actionsDone: totals.actionsDone,
        streak: totals.streak,
        distinctTagsDone: totals.distinctDoneTags,
      }),
    [totals]
  );

  const levelInfo = useMemo(() => levelFromDone(totals.doneCount), [totals.doneCount]);

  const setTarget = (theme) => {
    const val = parseInt(targetInput, 10) || 0;
    onUpdatePlans({ ...readingPlans, [theme]: val });
    setEditingTheme(null);
    setTargetInput('');
  };

  const isEmpty = books.length === 0;

  return (
    <div ref={scrollRef} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid #e0d8c8', marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: '#3d362c', margin: 0 }}>📊 パーソナルキャピタル</h3>
        <button onClick={onClose} style={closeBtn} aria-label="閉じる">×</button>
      </div>

      {/* Always-visible summary */}
      <div style={{ ...cardBase, marginBottom: 14 }}>
        <p style={{ fontSize: 12, color: '#8a7e6b', margin: '0 0 10px', fontWeight: 500 }}>
          📊 あなたの読書投資ポートフォリオ
        </p>
        {isEmpty ? (
          <div style={{ textAlign: 'center', padding: '14px 0' }}>
            <p style={{ fontSize: 13, color: '#5c5548', margin: '0 0 10px' }}>
              まだ本が登録されていません。
            </p>
            <button type="button" onClick={onClose} style={{ ...btnS, padding: '10px 20px', fontSize: 13 }}>
              まず 1 冊登録してみよう
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <StatTile icon="📚" label="累計読了" value={`${totals.doneCount} 冊`} />
            <StatTile icon="⏱️" label="投資時間" value={`約 ${formatHours(totals.investedMinutes)} 時間`} sub={`${totals.investedMinutes >= 60 ? '読了ページ × 2 分換算' : ''}`} />
            <StatTile icon="💎" label="気づき" value={`${totals.memoCount} 件`} />
            <StatTile icon="🎯" label="アクション" value={`${totals.actionsDone} 件`} sub={totals.actionsTotal > 0 ? `完了 ${totals.actionsRate}%` : '未登録'} />
            <StatTile icon="🔥" label="連続記録" value={`${totals.streak} 日`} />
          </div>
        )}
      </div>

      {/* Sub tabs */}
      <div style={{ display: 'flex', marginBottom: 16, borderBottom: '1px solid #e0d8c8' }}>
        {[
          { k: 'map', l: '🗺️ 知識' },
          { k: 'roi', l: '📈 ROI' },
          { k: 'plan', l: '🎯 計画' },
          { k: 'growth', l: '✨ 成長' },
        ].map((t) => (
          <button key={t.k} onClick={() => setSubTab(t.k)} style={subTabBtn(subTab === t.k)}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ===== Knowledge Map ===== */}
      {subTab === 'map' && (
        themeData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#8a7e6b', fontSize: 12, lineHeight: 1.8 }}>
            タグ付きでメモを残すと、ここに知識マップが描かれます。<br />
            まず 1 冊にタグを付けてみましょう（例：#営業 #思考法）。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={cardBase}>
              <p style={{ fontSize: 12, color: '#8a7e6b', margin: '0 0 6px', fontWeight: 500 }}>
                上位 {radarAxes.axes.length} 分野の知識厚み
              </p>
              <RadarChart axes={radarAxes.axes} maxScore={radarAxes.max} />
            </div>

            {top3Strengths.length > 0 && (
              <div>
                <p style={{ fontSize: 12, color: '#8a7e6b', margin: '0 0 6px', fontWeight: 500 }}>
                  💪 あなたの強み
                </p>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                  {top3Strengths.map((t, i) => (
                    <div key={t.name} style={{ ...cardBase, flex: '0 0 46%', minWidth: 150, background: ['#f5efde', '#f0ebe2', '#faf6f0'][i] }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#3d362c', margin: '0 0 4px' }}>#{t.name}</p>
                      <p style={{ fontSize: 11, color: '#8a7e6b', margin: 0, lineHeight: 1.6 }}>
                        読了 {t.done} / メモ {t.memoCount} / 行動 {t.actionsDone}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 11, color: '#a89e8c', margin: 0 }}>
                分野別の累積資本（読了 ×3 + メモ ×0.5 + 行動完了 ×2）
              </p>
              {themeData.map((t) => {
                const maxScore = Math.max(...themeData.map((x) => x.capitalScore), 1);
                const pct = Math.round((t.capitalScore / maxScore) * 100);
                return (
                  <div key={t.name} style={cardBase}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#3d362c' }}>#{t.name}</span>
                      <span style={{ fontSize: 11, color: '#8a7e6b' }}>{t.total} 冊</span>
                    </div>
                    <div style={{ height: 10, background: '#e0d8c8', borderRadius: 5, marginBottom: 8 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pct >= 70 ? '#5a7a48' : pct >= 40 ? '#d4a040' : '#4a6e8a', borderRadius: 5, transition: 'width .4s' }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 10, color: '#9a8e7a' }}>
                      <span>✅ 読了 {t.done}</span>
                      <span>📖 読書中 {t.reading}</span>
                      <span>📝 メモ {t.memoCount}</span>
                      <span>⚡ 行動 {t.actionsDone}/{t.actionsTotal}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <AIInsight
              tabKey="map"
              title="🤖 あなたの読書傾向"
              contextHash={makeHash({
                tags: themeData.slice(0, 8).map((t) => [t.name, t.done, t.reading, t.memoCount]),
                memoCount: totals.memoCount,
                doneCount: totals.doneCount,
              })}
              systemPrompt="あなたは温かい敬語で語りかける読書投資アドバイザーです。"
              userPrompt={
                `以下のユーザーの読書履歴から、その人の読書傾向を 3 行程度で分析してください。\n\n` +
                `【データ】\n` +
                `- 累計読了: ${totals.doneCount} 冊\n` +
                `- 累計メモ: ${totals.memoCount} 件\n` +
                `- 上位ジャンル(タグ): ${themeData.slice(0, 6).map((t) => `#${t.name}(読了${t.done}/メモ${t.memoCount})`).join('、') || 'なし'}\n\n` +
                `親しみやすい敬語で、強み 1 点 + 次のおすすめ 1 点 を含めて、合計 3 行程度で。`
              }
            />
          </div>
        )
      )}

      {/* ===== ROI Analysis ===== */}
      {subTab === 'roi' && (
        themeData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#8a7e6b', fontSize: 12 }}>
            読了した本に評価をつけると ROI 分析が表示されます。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Overall ROI score */}
            <div style={{ ...cardBase, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: '#8a7e6b', margin: '0 0 6px' }}>📈 投資効率スコア</p>
              <div style={{ fontSize: 36, fontWeight: 700, color: '#5c5043', lineHeight: 1.1 }}>
                {totals.roiScore}<span style={{ fontSize: 14, color: '#a89e8c' }}> / 100</span>
              </div>
              <div style={{ height: 8, background: '#e0d8c8', borderRadius: 4, marginTop: 8 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${totals.roiScore}%`,
                    background: `linear-gradient(90deg, #d4a040, ${totals.roiScore >= 70 ? '#5a7a48' : '#7aa86b'})`,
                    borderRadius: 4,
                    transition: 'width .4s',
                  }}
                />
              </div>
              <p style={{ fontSize: 10, color: '#a89e8c', marginTop: 8, lineHeight: 1.6 }}>
                行動完了・平均評価・メモ活動量を投資時間で正規化したスコアです。
              </p>
            </div>

            <p style={{ fontSize: 11, color: '#a89e8c', margin: 0 }}>
              どの分野の読書が自分にとって投資効果が高いか。
            </p>
            {[...themeData].filter((t) => t.avgRoi > 0).sort((a, b) => b.avgRoi - a.avgRoi).map((t) => {
              const actionRate = t.actionsTotal > 0 ? Math.round((t.actionsDone / t.actionsTotal) * 100) : 0;
              return (
                <div key={t.name} style={cardBase}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#3d362c' }}>#{t.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: 600, color: t.avgRoi >= 4 ? '#5a7a48' : t.avgRoi >= 3 ? '#d4a040' : '#a05040' }}>{t.avgRoi.toFixed(1)}</span>
                      <span style={{ fontSize: 11, color: '#9a8e7a' }}>/ 5.0</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: '#9a8e7a', minWidth: 60 }}>平均ROI</span>
                    <div style={{ flex: 1, height: 6, background: '#e0d8c8', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${(t.avgRoi / 5) * 100}%`, background: t.avgRoi >= 4 ? '#5a7a48' : t.avgRoi >= 3 ? '#d4a040' : '#a05040', borderRadius: 3 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#9a8e7a', minWidth: 60 }}>行動実行率</span>
                    <div style={{ flex: 1, height: 6, background: '#e0d8c8', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${actionRate}%`, background: actionRate >= 70 ? '#5a7a48' : actionRate >= 40 ? '#d4a040' : '#4a6e8a', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 10, color: '#8a7e6b', minWidth: 32, textAlign: 'right' }}>{actionRate}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#9a8e7a', marginTop: 6 }}>
                    <span>{t.done} 冊読了</span>
                    <span>メモ {t.memoCount} 件</span>
                  </div>
                </div>
              );
            })}
            {themeData.filter((t) => t.avgRoi > 0).length === 0 && (
              <p style={{ textAlign: 'center', padding: 20, color: '#b5aa96', fontSize: 12 }}>
                読了した本に評価をつけると ROI 分析が表示されます。
              </p>
            )}

            <AIInsight
              tabKey="roi"
              title="🤖 投資効率を上げるヒント"
              contextHash={makeHash({
                roi: totals.roiScore,
                rate: totals.actionsRate,
                avg: Math.round(totals.avgRating * 10),
                done: totals.doneCount,
                memos: totals.memoCount,
              })}
              systemPrompt="あなたは読書投資の効率化を支援する実用派アドバイザーです。"
              userPrompt={
                `以下の読書 ROI 指標から、投資効率を上げる具体的アドバイスを 3 行程度で。\n\n` +
                `【データ】\n` +
                `- 投資効率スコア: ${totals.roiScore} / 100\n` +
                `- アクション完了率: ${totals.actionsRate}% (${totals.actionsDone}/${totals.actionsTotal})\n` +
                `- 平均評価: ${totals.avgRating.toFixed(1)} / 5.0\n` +
                `- 累計読了: ${totals.doneCount} 冊\n` +
                `- メモ件数: ${totals.memoCount} 件\n\n` +
                `具体的な行動提案を含めて、合計 3 行程度で。`
              }
            />
          </div>
        )
      )}

      {/* ===== Reading Plan ===== */}
      {subTab === 'plan' && (
        themeData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#8a7e6b', fontSize: 12 }}>
            タグ付きで本を登録すると、テーマ別の読書計画を立てられます。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 11, color: '#a89e8c', lineHeight: 1.5, margin: 0 }}>
              テーマ別に目標冊数を設定。同じテーマを集中的に読むと知識資本が一気に厚くなる。
            </p>
            {themeData.map((t) => {
              const progress = t.target > 0 ? Math.min(Math.round((t.done / t.target) * 100), 100) : 0;
              const completed = t.target > 0 && t.done >= t.target;
              return (
                <div key={t.name} style={cardBase}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#3d362c' }}>
                      #{t.name}
                      {completed && <span style={{ marginLeft: 8, fontSize: 10, color: '#5a7a48' }}>✅ 完了</span>}
                    </span>
                    {editingTheme === t.name ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="number" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} placeholder="目標" style={{ ...inp, width: 60, padding: '4px 8px', textAlign: 'center' }} autoFocus />
                        <span style={{ fontSize: 10, color: '#9a8e7a' }}>冊</span>
                        <button onClick={() => setTarget(t.name)} style={{ ...btnS, padding: '4px 10px', fontSize: 10 }}>設定</button>
                        <button onClick={() => setEditingTheme(null)} style={{ background: 'none', border: 'none', fontSize: 14, color: '#a89e8c', cursor: 'pointer' }}>×</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingTheme(t.name); setTargetInput(String(t.target || '')); }} style={{ fontSize: 11, color: '#4a6e8a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                        {t.target > 0 ? `目標: ${t.target} 冊` : '目標を設定'}
                      </button>
                    )}
                  </div>
                  {t.target > 0 && (
                    <>
                      <div style={{ height: 8, background: '#e0d8c8', borderRadius: 4, marginBottom: 4 }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: progress >= 100 ? '#5a7a48' : '#d4a040', borderRadius: 4, transition: 'width .4s' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9a8e7a' }}>
                        <span>{t.done} / {t.target} 冊読了{progress >= 100 ? ' 🎉' : ''}</span>
                        <span>{progress}%</span>
                      </div>
                    </>
                  )}
                  {t.target === 0 && (
                    <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#9a8e7a' }}>
                      <span>全 {t.total} 冊</span>
                      <span>読了 {t.done}</span>
                      <span>読書中 {t.reading}</span>
                      <span>待機 {t.want}</span>
                    </div>
                  )}
                </div>
              );
            })}

            <LearningPlans
              userId={user?.id}
              books={books}
              allTags={themeData.map((t) => t.name)}
              onAddBookFromPlan={onAddBookFromPlan}
            />
          </div>
        )
      )}

      {/* ===== Growth ===== */}
      {subTab === 'growth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Streak hero */}
          <div style={{ ...cardBase, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#8a7e6b', margin: '0 0 4px' }}>連続記録</p>
            <div style={{ fontSize: 40, lineHeight: 1, color: '#a05040', fontWeight: 700 }}>
              🔥 {totals.streak}<span style={{ fontSize: 16, color: '#8a7e6b', marginLeft: 4 }}>日</span>
            </div>
            <p style={{ fontSize: 11, color: '#a89e8c', marginTop: 8 }}>
              {totals.streak === 0
                ? '今日メモを 1 件書くと記録スタート。'
                : '継続は最大の投資。明日も 1 件メモを残しましょう。'}
            </p>
          </div>

          {/* Heatmap */}
          <div style={cardBase}>
            <p style={{ fontSize: 12, color: '#8a7e6b', margin: '0 0 8px', fontWeight: 500 }}>
              📅 メモの記録（過去 90 日）
            </p>
            <StreakHeatmap memoDates={memoMeta.dates} />
          </div>

          {/* Level */}
          <div style={cardBase}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <p style={{ fontSize: 12, color: '#8a7e6b', margin: 0, fontWeight: 500 }}>
                レベル
              </p>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#5c5043' }}>Lv. {levelInfo.level}</span>
            </div>
            <div style={{ height: 10, background: '#e0d8c8', borderRadius: 5, marginBottom: 6 }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(levelInfo.progressInTier * 100)}%`,
                  background: '#5a7a48',
                  borderRadius: 5,
                  transition: 'width .4s',
                }}
              />
            </div>
            <p style={{ fontSize: 11, color: '#a89e8c', margin: 0 }}>
              {levelInfo.next
                ? `次のレベルまで残り ${levelInfo.remaining} 冊`
                : '最高レベル到達 🏆'}
            </p>
          </div>

          {/* Badges */}
          <div style={cardBase}>
            <p style={{ fontSize: 12, color: '#8a7e6b', margin: '0 0 10px', fontWeight: 500 }}>
              🏅 バッジ（{badges.filter((b) => b.earned).length} / {badges.length} 獲得）
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {badges.map((b) => (
                <div
                  key={b.id}
                  style={{
                    padding: '10px 6px',
                    borderRadius: 10,
                    background: b.earned ? '#f5efde' : '#f4f0e6',
                    border: b.earned ? '1px solid #d4a040' : '1px solid #e4ddd0',
                    textAlign: 'center',
                    opacity: b.earned ? 1 : 0.4,
                  }}
                  title={b.hint}
                >
                  <div style={{ fontSize: 24, marginBottom: 2 }}>{b.icon}</div>
                  <div style={{ fontSize: 10, color: '#5c5548', lineHeight: 1.3 }}>{b.label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10, color: '#a89e8c', marginTop: 8, lineHeight: 1.6 }}>
              バッジをホバー / タップすると獲得条件が表示されます。
            </p>
          </div>

          <AIInsight
            tabKey="growth"
            title="🤖 次の一歩"
            contextHash={makeHash({
              streak: totals.streak,
              level: levelInfo.level,
              done: totals.doneCount,
              earnedBadges: badges.filter((b) => b.earned).map((b) => b.id),
            })}
            systemPrompt="あなたは読書習慣の継続を励ますポジティブなコーチです。"
            userPrompt={
              `以下の成長記録から、次に取り組むと良いことを 3 行程度で。\n\n` +
              `【データ】\n` +
              `- 連続記録: ${totals.streak} 日\n` +
              `- レベル: Lv.${levelInfo.level}${levelInfo.next ? ` (次まで ${levelInfo.remaining} 冊)` : ' (最高)'}\n` +
              `- 累計読了: ${totals.doneCount} 冊\n` +
              `- 獲得バッジ: ${badges.filter((b) => b.earned).map((b) => b.label).join('、') || 'なし'}\n` +
              `- 未獲得バッジ: ${badges.filter((b) => !b.earned).slice(0, 3).map((b) => `${b.label}(${b.hint})`).join('、') || 'すべて獲得済み'}\n\n` +
              `励ましのトーンで、具体的な小さな目標を含めて、合計 3 行程度で。`
            }
          />
        </div>
      )}
    </div>
  );
}
