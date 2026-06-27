// 📊 テーマレポート — turns the user's memos for one theme (e.g. 営業) into a
// single cross-book report.
//
// Flow: pick a theme (auto-detected chips from the user's own tags/categories,
// or free text) → generate → a structured Markdown report streams in →
// copy / save. Past reports live in theme_reports (optional; the surface
// degrades to in-session-only when the migration isn't applied).
//
// Mirrors マイ読書脳's data approach (RAG from the same gatherKnowledge), but
// the output is a synthesis, not an answer. Lives as the 3rd AI sub-tab.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useHaptic } from '../hooks/useHaptic';
import { toMessage } from '../lib/errors';
import { LIMITS } from '../lib/limits';
import {
  listThemes,
  streamThemeReport,
  saveThemeReport,
  loadThemeReports,
  deleteThemeReport,
  setLeverageRecall,
  addThemeAction,
} from '../lib/ai';
import MarkdownSections from './MarkdownSections';
import EmptyState from './EmptyState';
import PullToRefresh from './PullToRefresh';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost } from '../styles/ui';
import { BarChart3, Sparkles, Square, History, Trash2, RotateCw, Inbox, AlertTriangle, Ruler, TrendingUp, Target, Copy, RefreshCw, Pin, Pencil, CheckCircle2, Square as SquareIcon } from 'lucide-react';

// 親の .ai-page-body (flex 1, overflow hidden) にぴったり収める flex column。
const wrap = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' };
const viewScroll = { flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 16px 28px' };
const card = { background: 'var(--c-card)', border: '1px solid var(--c-hairline)', borderRadius: 12, padding: '14px 16px' };
const inp = { width: '100%', padding: '11px 12px', fontSize: 16, border: '1px solid var(--c-hairline-strong)', borderRadius: 10, background: '#fff', color: 'var(--c-ink)', fontFamily: 'inherit', boxSizing: 'border-box' };
const btnPrimary = { ...uiBtnPrimary, width: 'auto', minHeight: 44, padding: '12px 20px', fontSize: 14 };
const btnGhost = { ...uiBtnGhost, width: 'auto', minHeight: 44, padding: '10px 14px', fontSize: 13 };
const pill = (active) => ({
  flex: '0 0 auto',
  whiteSpace: 'nowrap',
  minHeight: 36,
  padding: '6px 12px',
  border: 'none',
  background: active ? 'var(--c-brand)' : 'transparent',
  color: active ? 'var(--c-card)' : 'var(--c-ink-soft)',
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 8,
});

const STAGE_LABEL = {
  search: '📚 テーマのメモと行動を集めています…',
  generate: '🧠 レバレッジメモを作成中…',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// レポート Markdown から「## 🧭 核心」セクションの本文（1行）を取り出す。
// 想起ループにセットする核心テキストの抽出に使う。見つからなければ先頭の非空行。
function extractCore(md) {
  if (!md || typeof md !== 'string') return '';
  const lines = md.split('\n');
  let inCore = false;
  const buf = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) {
      if (inCore) break; // next heading → 核心 セクション終わり
      inCore = /核心/.test(line);
      continue;
    }
    if (inCore && line) buf.push(line.replace(/^[-*]\s+/, ''));
  }
  const core = buf.join(' ').trim();
  if (core) return core;
  const first = lines.map((l) => l.trim()).find((l) => l && !/^#{1,6}\s/.test(l));
  return (first || '').replace(/^[-*]\s+/, '');
}

// 「## 〜次の一歩」セクションの本文を取り出す（1タップ行動化のテキスト）。
function extractNextStep(md) {
  if (!md || typeof md !== 'string') return '';
  const lines = md.split('\n');
  let inSec = false;
  const buf = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) {
      if (inSec) break;
      inSec = /次の一歩|next/i.test(line);
      continue;
    }
    if (inSec && line) buf.push(line.replace(/^[-*\d.]+\s+/, ''));
  }
  return buf.join(' ').trim();
}

// 核心セクション（## 〜核心 … 次の見出しまで）を取り除いた残りの Markdown を返す。
// 核心は専用のヒーローカードで描くので、本文(原則/次の一歩)からは外す。
function stripCoreSection(md) {
  if (!md || typeof md !== 'string') return md || '';
  const lines = md.split('\n');
  const out = [];
  let dropping = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) {
      if (/核心/.test(line)) { dropping = true; continue; }
      dropping = false;
    }
    if (!dropping) out.push(raw);
  }
  return out.join('\n').trim();
}

// 端末ローカルの「前回スナップショット」で 📈 前回からの変化 を出す（DB 変更ゼロ）。
// 偽の数字を出さないため、前回が無ければ delta は null。
const SNAP_KEY = 'leverage-memo-snap';
function readSnap(theme) {
  try {
    const all = JSON.parse(localStorage.getItem(SNAP_KEY) || '{}');
    return all[theme] || null;
  } catch { return null; }
}
function writeSnap(theme, snap) {
  try {
    const all = JSON.parse(localStorage.getItem(SNAP_KEY) || '{}');
    all[theme] = snap;
    localStorage.setItem(SNAP_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export default function ThemeReport({ onActionAdded, onOpenActions } = {}) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const haptic = useHaptic();

  const [view, setView] = useState('create'); // 'create' | 'history'
  const [themes, setThemes] = useState([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [customTheme, setCustomTheme] = useState('');

  // Active report rendering
  const [activeTheme, setActiveTheme] = useState('');
  const [reportText, setReportText] = useState('');
  const [stage, setStage] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [notice, setNotice] = useState(''); // shown when a theme has no memos yet
  const [noticeKind, setNoticeKind] = useState('info'); // 'info' (メモ0件) | 'error'
  const abortRef = useRef(null);

  // 🎯 行動の鏡 / 根拠スコープ / 📈 前回比 / 🔄 想起ループ の状態。
  const [actionStats, setActionStats] = useState(null); // { declared, completed, idle, blindSpot }
  const [scope, setScope] = useState(null); // { memoTotal, bookCount }
  const [delta, setDelta] = useState(null); // { memo, book, at } | null
  const [recallSet, setRecallSet] = useState(false);
  const [recallBusy, setRecallBusy] = useState(false);
  // 🎯→✅ 次の一歩を行動リストへ（主役の本へ追加）。
  const [primaryBook, setPrimaryBook] = useState(null); // { id, title }
  const [actionAdded, setActionAdded] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // History (optional persistence)
  const [history, setHistory] = useState([]);
  const [historyAvailable, setHistoryAvailable] = useState(false);

  const refreshThemes = useCallback(async () => {
    if (!user?.id) return;
    setThemesLoading(true);
    try {
      const list = await listThemes(user.id);
      setThemes(Array.isArray(list) ? list : []);
    } catch {
      setThemes([]);
    } finally {
      setThemesLoading(false);
    }
  }, [user?.id]);

  const refreshHistory = useCallback(async () => {
    if (!user?.id) return;
    const res = await loadThemeReports(user.id);
    setHistoryAvailable(!!res.available);
    setHistory(res.rows || []);
  }, [user?.id]);

  useEffect(() => {
    refreshThemes();
    refreshHistory();
  }, [refreshThemes, refreshHistory]);

  // Cancel any in-flight stream on unmount.
  useEffect(() => () => {
    try { abortRef.current?.abort(); } catch { /* ignore */ }
  }, []);

  const generate = useCallback(async (rawTheme) => {
    const theme = (rawTheme || '').trim();
    if (!theme || generating || !user?.id) return;
    haptic.light();
    setActiveTheme(theme);
    setReportText('');
    setNotice('');
    setNoticeKind('info');
    setStage('search');
    setGenerating(true);
    setAborting(false);
    setActionStats(null);
    setScope(null);
    setDelta(null);
    setRecallSet(false);
    setPrimaryBook(null);
    setActionAdded(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await streamThemeReport({
        userId: user.id,
        theme,
        signal: controller.signal,
        onStage: (s) => setStage(s),
        onChunk: (text) => setReportText(text),
      });

      const wasAborted = controller.signal.aborted;
      if (wasAborted) {
        // 中止＝キャンセル扱い。中途半端なレポートを残さず選択画面に戻す
        // (search 段階での中止で「空のレポート」が表示される事故も防ぐ)。
        setActiveTheme('');
        setReportText('');
        setNotice('');
      } else if ((result?.memoCount ?? 0) === 0) {
        // No memos matched this theme yet — show guidance, not a saved report.
        setNoticeKind('info');
        setNotice(result?.body || `テーマ「${theme}」に関連するメモが見つかりませんでした。`);
        setReportText('');
      } else {
        const finalText = (result?.body || '').trim();
        if (finalText) {
          setReportText(finalText);
          // 🎯 行動の鏡 + 根拠スコープ（AI ではなく実データ）。
          setActionStats(result?.actionStats || null);
          const memoTotal = result?.memoTotal ?? 0;
          const bookCount = result?.bookCount ?? 0;
          setScope({ memoTotal, bookCount });
          // 🎯→✅ 次の一歩の追加先（主役の本）。
          setPrimaryBook(result?.primaryBookId ? { id: result.primaryBookId, title: result.primaryBookTitle || '' } : null);
          // 📈 前回からの変化（端末ローカルのスナップショット比較・偽数字は出さない）。
          const prev = readSnap(theme);
          if (prev && (memoTotal !== prev.memoTotal || bookCount !== prev.bookCount)) {
            setDelta({ memo: memoTotal - (prev.memoTotal || 0), book: bookCount - (prev.bookCount || 0), at: prev.at });
          } else {
            setDelta(null);
          }
          writeSnap(theme, { memoTotal, bookCount, at: new Date().toISOString() });
          haptic.success();
          // Persist (no-op + history stays hidden if the table isn't applied).
          const saved = await saveThemeReport({ userId: user.id, theme, content: finalText });
          if (saved) {
            setHistoryAvailable(true);
            setHistory((prev2) => [saved, ...prev2.filter((r) => r.id !== saved.id)]);
          }
        }
      }
    } catch (e) {
      if (!(controller.signal.aborted || (e && e.name === 'AbortError'))) {
        toast.error(toMessage(e, 'レポートの作成に失敗しました。'));
        setNoticeKind('error');
        setNotice('レポートの作成に失敗しました。少し時間をおいて再度お試しください。');
      }
    } finally {
      setStage(null);
      setGenerating(false);
      setAborting(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [generating, user?.id, haptic, toast]);

  const stopGeneration = useCallback(() => {
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) return;
    setAborting(true);
    haptic.light();
    try { controller.abort(); } catch { /* ignore */ }
  }, [haptic]);

  const resetToPicker = useCallback(() => {
    setActiveTheme('');
    setReportText('');
    setNotice('');
    setNoticeKind('info');
  }, []);

  const copyReport = useCallback(async () => {
    const text = `【テーマレポート: ${activeTheme}】\n\n${reportText}`;
    try {
      await navigator.clipboard.writeText(text);
      haptic.success();
      toast.success('レポートをコピーしました');
    } catch {
      toast.error('コピーできませんでした');
    }
  }, [activeTheme, reportText, haptic, toast]);

  const handleSetRecall = useCallback(async () => {
    if (recallBusy || recallSet) return;
    const core = extractCore(reportText);
    if (!core) { toast.error('核心を取り出せませんでした'); return; }
    setRecallBusy(true);
    try {
      const res = await setLeverageRecall({ userId: user.id, theme: activeTheme, core });
      if (res?.ok) {
        setRecallSet(true);
        haptic.success();
        toast.success('想起ループにセットしました。振り返り・通知でそっと戻ってきます。');
      } else {
        toast.error('セットできませんでした。少し時間をおいて再度お試しください。');
      }
    } finally {
      setRecallBusy(false);
    }
  }, [recallBusy, recallSet, reportText, activeTheme, user?.id, toast, haptic]);

  const handleAddNextStep = useCallback(async () => {
    if (actionBusy || actionAdded) return;
    const step = extractNextStep(reportText);
    if (!step) { toast.error('「次の一歩」を取り出せませんでした'); return; }
    if (!primaryBook?.id) { toast.error('追加先の本が見つかりませんでした'); return; }
    setActionBusy(true);
    try {
      const res = await addThemeAction({ userId: user.id, bookId: primaryBook.id, text: step });
      if (res?.ok) {
        setActionAdded(true);
        haptic.success();
        try { onActionAdded?.(); } catch { /* ignore */ }
        toast.success('🎯 振り返りタブ →「行動」に追加しました。');
      } else {
        toast.error('追加できませんでした。少し時間をおいて再度お試しください。');
      }
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, actionAdded, reportText, primaryBook, user?.id, toast, haptic]);

  const openHistoryReport = useCallback((row) => {
    setActiveTheme(row.theme || '');
    setReportText(row.content || '');
    setNotice('');
    setNoticeKind('info');
    // 履歴は保存済み Markdown のみ。ライブ集計（行動の鏡・スコープ・前回比）は持た
    // ないのでクリアし、想起セットは核心から再実行できるよう false に。
    setActionStats(null);
    setScope(null);
    setDelta(null);
    setRecallSet(false);
    setPrimaryBook(null);
    setActionAdded(false);
    setView('create');
  }, []);

  const removeHistory = useCallback(async (row) => {
    const ok = await confirm({
      title: 'レポートを削除',
      message: `「${row.theme}」のレポートを削除しますか？`,
      confirmLabel: '削除',
      danger: true,
    });
    if (!ok) return;
    setHistory((h) => h.filter((r) => r.id !== row.id)); // optimistic
    const done = await deleteThemeReport(row.id);
    if (!done) {
      // rollback: re-insert the row without clobbering any report saved meanwhile.
      setHistory((h) => (h.some((r) => r.id === row.id)
        ? h
        : [...h, row].sort((a, b) => (b.generated_at || '').localeCompare(a.generated_at || ''))));
      toast.error('削除できませんでした');
    } else {
      haptic.medium();
    }
  }, [confirm, toast, haptic]);

  const hasReport = reportText.length > 0 || generating || !!notice;
  const showStageBlock = generating && reportText.length === 0 && !notice;

  // ---- Render --------------------------------------------------------------

  return (
    <div style={wrap}>
      {/* sub navigation */}
      <div
        className="lvg-no-scrollbar"
        style={{ display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto', borderBottom: '1px solid #ece5d8', flex: '0 0 auto' }}
        role="tablist"
        aria-label="テーマレポートの表示切替"
      >
        <button style={pill(view === 'create')} onClick={() => setView('create')} role="tab" aria-selected={view === 'create'}>
          <BarChart3 size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />作成
        </button>
        {historyAvailable && (
          <button style={pill(view === 'history')} onClick={() => setView('history')} role="tab" aria-selected={view === 'history'}>
            <History size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />履歴{history.length > 0 ? `（${history.length}）` : ''}
          </button>
        )}
      </div>

      {view === 'history' ? (
        <PullToRefresh onRefresh={refreshHistory}>
          <div style={viewScroll}>
            {history.length === 0 ? (
              <EmptyState
                icon={<History size={40} aria-hidden="true" />}
                title="まだレバレッジメモがありません"
                description="「📊 作成」からテーマを選んでレバレッジメモを作ると、ここに保存されていきます。"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map((row) => (
                  <div key={row.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      onClick={() => openHistoryReport(row)}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <BarChart3 size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />{row.theme}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--c-ink-2)', marginTop: 2 }}>{fmtDate(row.generated_at)}</div>
                    </button>
                    <button
                      onClick={() => removeHistory(row)}
                      style={{ ...btnGhost, minHeight: 36, padding: '6px 10px', color: 'var(--c-critical)', borderColor: '#e0cabf' }}
                      aria-label={`「${row.theme}」のレポートを削除`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PullToRefresh>
      ) : (
        <div style={viewScroll}>
          {!activeTheme && !hasReport ? (
            <ThemePicker
              themes={themes}
              themesLoading={themesLoading}
              customTheme={customTheme}
              setCustomTheme={setCustomTheme}
              onGenerate={generate}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* report header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <BarChart3 size={18} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-ink)', margin: 0, flex: 1, minWidth: 0 }}>
                  {activeTheme}
                </h2>
                {generating ? (
                  <button
                    onClick={stopGeneration}
                    disabled={aborting}
                    style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: aborting ? 0.6 : 1 }}
                    aria-label={aborting ? '中止しています' : 'レポート作成を中止'}
                  >
                    <Square size={13} aria-hidden="true" /> {aborting ? '中止中…' : '中止'}
                  </button>
                ) : (
                  <button onClick={resetToPicker} style={btnGhost} aria-label="テーマ選択に戻る"><RefreshCw size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />別のテーマ</button>
                )}
              </div>

              {/* レバレッジメモ + 根拠スコープ */}
              {!notice && (
                <div style={{ fontSize: 11, color: 'var(--c-ink-3)', margin: '-4px 0 2px', letterSpacing: '.02em' }}>
                  <Ruler size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />レバレッジメモ
                  {scope && (scope.memoTotal > 0 || scope.bookCount > 0) && (
                    <> ・ 本 {scope.bookCount} 冊・メモ {scope.memoTotal} 件を横断</>
                  )}
                </div>
              )}

              {/* body */}
              {notice ? (
                <div
                  role={noticeKind === 'error' ? 'alert' : 'status'}
                  style={{
                    ...card,
                    background: noticeKind === 'error' ? '#fbf2ee' : card.background,
                    borderColor: noticeKind === 'error' ? 'var(--c-critical-line)' : card.border,
                    display: 'flex',
                    gap: 10,
                  }}
                >
                  <span aria-hidden="true" style={{ lineHeight: 1.5, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}>
                    {noticeKind === 'error' ? <AlertTriangle size={18} /> : <Inbox size={18} />}
                  </span>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 13, color: 'var(--c-ink-soft)', minWidth: 0 }}>
                    {notice}
                  </div>
                </div>
              ) : showStageBlock ? (
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-live="polite" aria-busy="true">
                  <div className="ai-thinking">
                    <span className="ai-thinking-dot" aria-hidden="true" />
                    <span>{STAGE_LABEL[stage] || '🧠 レバレッジメモを準備中…'}</span>
                  </div>
                  <div className="ai-skeleton" aria-hidden="true">
                    <div className="ai-skeleton-line" style={{ width: '90%' }} />
                    <div className="ai-skeleton-line" style={{ width: '76%' }} />
                    <div className="ai-skeleton-line" style={{ width: '84%' }} />
                    <div className="ai-skeleton-line" style={{ width: '64%' }} />
                  </div>
                </div>
              ) : generating ? (
                // ストリーミング中は素の Markdown を流す（核心の途中分割でチラつかせない）。
                <div aria-live="polite" aria-busy="true">
                  <MarkdownSections text={reportText} />
                  <span className="streaming-cursor" aria-hidden="true" />
                </div>
              ) : (
                // 完成後は「核心」を専用ヒーローカードで強調し、残り(原則/次の一歩)を下に。
                <div aria-live="polite">
                  {extractCore(reportText) && <CoreCard line={extractCore(reportText)} />}
                  <MarkdownSections text={stripCoreSection(reportText)} />
                </div>
              )}

              {/* error notice → offer a retry of the same theme */}
              {!generating && notice && noticeKind === 'error' && activeTheme && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
                  <button onClick={() => generate(activeTheme)} style={btnPrimary} aria-label={`テーマ「${activeTheme}」でもう一度作成`}>
                    <RefreshCw size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />もう一度試す
                  </button>
                </div>
              )}

              {/* 🎯→✅ 次の一歩を 1 タップで行動リストへ（残す→活かすの輪を閉じる） */}
              {!generating && !notice && reportText && primaryBook?.id && extractNextStep(reportText) && (
                <>
                <button
                  type="button"
                  onClick={actionAdded ? (() => onOpenActions?.()) : handleAddNextStep}
                  disabled={actionBusy}
                  aria-label={actionAdded ? '追加した行動を行動リストで見る' : '次の一歩を行動リストに追加'}
                  style={{
                    width: '100%', minHeight: 48, borderRadius: 13, border: 'none', fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 700, cursor: actionBusy ? 'default' : 'pointer',
                    background: actionAdded ? 'var(--c-positive-soft)' : 'var(--c-positive)',
                    color: actionAdded ? 'var(--c-positive)' : 'var(--c-card)',
                    boxShadow: actionAdded ? 'none' : '0 1px 2px rgba(60,48,30,.18)',
                    opacity: actionBusy ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  }}
                >
                  {actionAdded ? (
                    <><CheckCircle2 size={14} aria-hidden="true" />追加済み ・ <Target size={14} aria-hidden="true" />行動リストで見る →</>
                  ) : actionBusy ? '追加中…' : (
                    <><CheckCircle2 size={14} aria-hidden="true" />この一歩を行動リストに入れる</>
                  )}
                </button>
                {!actionAdded && (
                  <p style={{ fontSize: 10.5, color: 'var(--c-ink-3)', margin: '-4px 2px 0', lineHeight: 1.5 }}>
                    追加先は「振り返り」タブ →「<Target size={11} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> 行動」（最も関連が深い本に紐づきます）
                  </p>
                )}
                </>
              )}

              {/* 🎯 行動の鏡 — 学びが行動に変わっているかを実データで突きつける */}
              {!generating && !notice && reportText && actionStats && (
                <ActionMirror stats={actionStats} memoTotal={scope?.memoTotal ?? 0} />
              )}

              {/* 📈 前回からの変化（端末ローカル比較・あるときだけ） */}
              {!generating && !notice && reportText && delta && (
                <div style={{ ...card, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--c-ink)', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TrendingUp size={14} aria-hidden="true" />前回からの変化
                    {delta.at && <span style={{ fontWeight: 500, color: 'var(--c-ink-3)', fontSize: 10.5 }}>（前回 {fmtDate(delta.at)}）</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--c-ink-2)', lineHeight: 1.6 }}>
                    {delta.book > 0 && <>本 +{delta.book} 冊　</>}
                    {delta.memo > 0 ? <>メモ +{delta.memo} 件を追加</> : delta.memo < 0 ? <>メモ {delta.memo} 件</> : <>新しい根拠が増えました</>}
                  </div>
                </div>
              )}

              {/* 🔄 想起ループ接続 — 読んで終わりにしない仕組み */}
              {!generating && !notice && reportText && (
                <RecallBanner busy={recallBusy} done={recallSet} onSet={handleSetRecall} />
              )}

              {/* actions (only when a finished report is shown) */}
              {!generating && !notice && reportText && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
                  <button onClick={copyReport} style={btnGhost} aria-label="レバレッジメモをクリップボードにコピー">
                    <Copy size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />コピー
                  </button>
                  {historyAvailable && (
                    <button onClick={() => setView('history')} style={btnGhost} aria-label="保存済みのレバレッジメモ履歴を見る">
                      <History size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />履歴
                    </button>
                  )}
                  <button onClick={resetToPicker} style={btnPrimary} aria-label="別のテーマでレバレッジメモを作成">
                    <RefreshCw size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />別のテーマで作る
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThemePicker({ themes, themesLoading, customTheme, setCustomTheme, onGenerate }) {
  const canGenerate = customTheme.trim().length > 0;
  const submitCustom = () => {
    if (canGenerate) onGenerate(customTheme.trim());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* intro */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-ink)', margin: 0 }}>
            あなたの読書が、1 枚のレバレッジメモに
          </h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--c-ink-2)', margin: 0, lineHeight: 1.7 }}>
          テーマを選ぶと、その分野のメモを横断して<strong>「核心1行・繰り返す原則・次の一歩」</strong>に凝縮。さらに<strong>行動の鏡</strong>で実践度を映し、<strong>振り返り・通知</strong>に乗せて忘れた頃に呼び戻します。
        </p>
      </div>

      {/* detected theme chips */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink-soft)', margin: '0 0 8px' }}>
          <Pin size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />あなたのメモから見つけたテーマ
          {!themesLoading && themes.length > 0 && (
            <span style={{ fontWeight: 500, color: 'var(--c-ink-2)' }}>（{themes.length}）</span>
          )}
        </p>
        {themesLoading ? (
          <div className="ai-skeleton" aria-hidden="true" style={{ maxWidth: 360 }}>
            <div className="ai-skeleton-line" style={{ width: '70%' }} />
            <div className="ai-skeleton-line" style={{ width: '52%' }} />
          </div>
        ) : themes.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--c-ink-2)', margin: 0, lineHeight: 1.7 }}>
            まだ候補はありません。メモにタグや「@カテゴリ」を付けていくと、ここにあなただけのテーマが並びます。今は下の入力欄から自由にテーマを指定して始められます。
          </p>
        ) : (
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
            role="list"
            aria-label="メモから見つかったテーマ候補"
          >
            {themes.map((t) => (
              <button
                key={t.theme}
                onClick={() => onGenerate(t.theme)}
                role="listitem"
                aria-label={`テーマ「${t.theme}」（メモ ${t.count} 件）でレポートを作成`}
                style={{
                  minHeight: 44,
                  padding: '8px 8px 8px 14px',
                  borderRadius: 999,
                  border: '1px solid var(--c-hairline-strong)',
                  background: '#fff',
                  color: 'var(--c-ink)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  touchAction: 'manipulation',
                }}
              >
                <span style={{ fontWeight: 600 }}>{t.theme}</span>
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#7a6f5c',
                    background: '#f0eadd',
                    borderRadius: 999,
                    minWidth: 20,
                    height: 20,
                    padding: '0 6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* free-text theme */}
      <div style={card}>
        <label htmlFor="theme-custom" style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink-soft)', display: 'block', marginBottom: 8 }}>
          <Pencil size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />テーマを自分で入力
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            id="theme-custom"
            type="text"
            value={customTheme}
            onChange={(e) => setCustomTheme(e.target.value.slice(0, LIMITS.theme))}
            onKeyDown={(e) => {
              // IME 変換中の Enter は誤送信防止のため無視。
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submitCustom();
              }
            }}
            placeholder="例: 営業 / リーダーシップ / 習慣"
            maxLength={LIMITS.theme}
            style={{ ...inp, flex: 1, minWidth: 160 }}
          />
          <button
            onClick={submitCustom}
            disabled={!canGenerate}
            style={{ ...btnPrimary, opacity: canGenerate ? 1 : 0.5, cursor: canGenerate ? 'pointer' : 'default' }}
          >
            <BarChart3 size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />作成
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '8px 0 0', lineHeight: 1.6 }}>
          そのテーマのメモ（タグ・@カテゴリ・本文）と行動を集めて、1 枚のレバレッジメモにします。
        </p>
      </div>
    </div>
  );
}

// 🧭 核心 — レバレッジメモの中心。暗記して持ち歩く「この1行」をヒーロー表示する。
function CoreCard({ line }) {
  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--c-soft)',
        border: '1px solid var(--c-hairline)', borderRadius: 16,
        padding: '18px 18px 18px 22px', marginBottom: 14,
        boxShadow: '0 1px 3px rgba(60,48,30,.06)',
      }}
    >
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'var(--c-brand)' }} />
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--c-ink-3)', letterSpacing: '.18em', marginBottom: 8 }}>
        核心 — この1行
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.55, color: 'var(--c-ink)' }}>
        {line}
      </div>
    </div>
  );
}

// 🎯 行動の鏡 — 宣言/完了/放置 を実データで表示し、学びが行動に変わっているかを
// 突きつける（本田哲学の「実践してこそ」）。数値は AI ではなく actions の集計。
function ActionMirror({ stats, memoTotal }) {
  const { declared = 0, completed = 0, idle = 0, blindSpot = false, openSteps = [] } = stats || {};
  const statBox = (n, k, color) => (
    <div style={{ flex: 1, background: '#faf6ee', border: '1px solid var(--c-hairline)', borderRadius: 11, padding: '9px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color }}>{n}</div>
      <div style={{ fontSize: 9.5, color: 'var(--c-ink-3)', marginTop: 5, letterSpacing: '.04em' }}>{k}</div>
    </div>
  );
  return (
    <div style={{ ...card, padding: '14px 15px 15px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 11px', display: 'flex', alignItems: 'center', gap: 7, color: 'var(--c-ink)' }}>
        <Target size={15} aria-hidden="true" />行動の鏡
      </h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: declared > 0 || blindSpot ? 12 : 0 }}>
        {statBox(declared, '宣言した行動', 'var(--c-ink)')}
        {statBox(completed, '完了', 'var(--c-positive)')}
        {statBox(idle, '放置中', idle > 0 ? 'var(--c-critical)' : 'var(--c-ink)')}
      </div>
      {declared === 0 ? (
        <div style={{ background: 'var(--c-critical-soft)', border: '1px solid var(--c-critical-line)', borderRadius: 12, padding: '11px 13px', display: 'flex', gap: 9 }}>
          <span style={{ lineHeight: 1.4, flex: '0 0 auto', display: 'inline-flex' }} aria-hidden="true"><AlertTriangle size={16} /></span>
          <div style={{ fontSize: 12.5, lineHeight: 1.65, color: '#6e4a3c' }}>
            このテーマに紐づく行動が<b style={{ color: 'var(--c-critical)', fontWeight: 800 }}>まだ0件</b>。学びを、まず1つだけ行動に落としましょう。
          </div>
        </div>
      ) : blindSpot ? (
        <div style={{ background: 'var(--c-critical-soft)', border: '1px solid var(--c-critical-line)', borderRadius: 12, padding: '11px 13px', display: 'flex', gap: 9 }}>
          <span style={{ lineHeight: 1.4, flex: '0 0 auto', display: 'inline-flex' }} aria-hidden="true"><AlertTriangle size={16} /></span>
          <div style={{ fontSize: 12.5, lineHeight: 1.65, color: '#6e4a3c' }}>
            メモは<b style={{ color: 'var(--c-critical)', fontWeight: 800 }}>{memoTotal}件</b>あるのに、完了した行動は<b style={{ color: 'var(--c-critical)', fontWeight: 800 }}>0件</b>。学びが行動に変わっていません。
          </div>
        </div>
      ) : null}

      {/* 🔸 やり残しの一歩を名指しで突き返す（本田: 宣言した一歩がどうなったか） */}
      {openSteps.length > 0 && (
        <div style={{ marginTop: 11 }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--c-critical)', letterSpacing: '.06em', margin: '0 0 6px' }}>
            <AlertTriangle size={12} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />まだやれていない一歩
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {openSteps.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.55, color: 'var(--c-ink-soft)' }}>
                <span aria-hidden="true" style={{ color: '#c08a6a', flexShrink: 0, marginTop: 1, display: 'inline-flex' }}><SquareIcon size={13} /></span>
                <span style={{ minWidth: 0 }}>{s}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10.5, color: '#9a8c74', margin: '7px 0 0', lineHeight: 1.5 }}>
            <Target size={11} aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: 4 }} />行動タブで完了にすると、ここから消えます。
          </p>
        </div>
      )}
    </div>
  );
}

// 🔄 想起ループ接続 — 核心を「振り返り・通知」に乗せる仕組みの説明＋セットボタン。
function RecallBanner({ busy, done, onSet }) {
  return (
    <div style={{ background: 'var(--c-soft)', border: '1px solid var(--c-hairline-strong)', borderRadius: 16, padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <span style={{ lineHeight: 1.2, flex: '0 0 auto', display: 'inline-flex' }} aria-hidden="true"><RotateCw size={21} /></span>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, color: '#5b4f3c' }}>
          <b style={{ color: 'var(--c-ink)', fontWeight: 800 }}>このメモは、読んで終わりにしません。</b><br />
          核心を <b style={{ color: 'var(--c-ink)' }}>振り返りタブ</b> と <b style={{ color: 'var(--c-ink)' }}>想起通知</b> に乗せると、忘れた頃にそっと戻ってきて、無意識に動けるまで体に入れます。
        </div>
      </div>
      <button
        type="button"
        onClick={onSet}
        disabled={busy || done}
        aria-label={done ? '想起ループにセット済み' : '核心を想起ループにセット'}
        style={{
          minHeight: 46, borderRadius: 13, border: 'none', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700,
          cursor: busy || done ? 'default' : 'pointer',
          background: done ? 'var(--c-positive-soft)' : 'var(--c-brand)',
          color: done ? 'var(--c-positive)' : 'var(--c-card)',
          boxShadow: done ? 'none' : '0 1px 2px rgba(60,48,30,.18)',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {done ? (
          <><RotateCw size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />想起ループにセット済み ✓</>
        ) : busy ? 'セット中…' : (
          <><RotateCw size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />想起ループにセット</>
        )}
      </button>
    </div>
  );
}
