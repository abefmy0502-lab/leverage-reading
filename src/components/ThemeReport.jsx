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
} from '../lib/ai';
import MarkdownSections from './MarkdownSections';
import EmptyState from './EmptyState';
import PullToRefresh from './PullToRefresh';
import { BarChart3, Sparkles, Square } from 'lucide-react';

// 親の .ai-page-body (flex 1, overflow hidden) にぴったり収める flex column。
const wrap = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' };
const viewScroll = { flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 16px 28px' };
const card = { background: '#faf6f0', border: '1px solid #e4ddd0', borderRadius: 12, padding: '14px 16px' };
const inp = { width: '100%', padding: '11px 12px', fontSize: 16, border: '1px solid #d4ccbe', borderRadius: 10, background: '#fff', color: '#3d362c', fontFamily: 'inherit', boxSizing: 'border-box' };
const btnPrimary = { minHeight: 44, padding: '12px 20px', borderRadius: 10, border: 'none', background: '#5c5043', color: '#faf6f0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, letterSpacing: 1 };
const btnGhost = { minHeight: 44, padding: '10px 14px', borderRadius: 10, border: '1px solid #d4ccbe', background: 'transparent', color: '#5c5043', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 };
const pill = (active) => ({
  flex: '0 0 auto',
  whiteSpace: 'nowrap',
  minHeight: 36,
  padding: '6px 12px',
  border: 'none',
  background: active ? '#5c5043' : 'transparent',
  color: active ? '#faf6f0' : '#5c5548',
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 8,
});

const STAGE_LABEL = {
  search: '📚 テーマのメモを集めています…',
  generate: '🧠 レポートを作成中…',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ThemeReport() {
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
          haptic.success();
          // Persist (no-op + history stays hidden if the table isn't applied).
          const saved = await saveThemeReport({ userId: user.id, theme, content: finalText });
          if (saved) {
            setHistoryAvailable(true);
            setHistory((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
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

  const openHistoryReport = useCallback((row) => {
    setActiveTheme(row.theme || '');
    setReportText(row.content || '');
    setNotice('');
    setNoticeKind('info');
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
          📊 作成
        </button>
        {historyAvailable && (
          <button style={pill(view === 'history')} onClick={() => setView('history')} role="tab" aria-selected={view === 'history'}>
            🕒 履歴{history.length > 0 ? `（${history.length}）` : ''}
          </button>
        )}
      </div>

      {view === 'history' ? (
        <PullToRefresh onRefresh={refreshHistory}>
          <div style={viewScroll}>
            {history.length === 0 ? (
              <EmptyState
                icon="🕒"
                title="まだレポートがありません"
                description="「📊 作成」からテーマを選んでレポートを作ると、ここに保存されていきます。"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map((row) => (
                  <div key={row.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      onClick={() => openHistoryReport(row)}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#3d362c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        📊 {row.theme}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b5f4d', marginTop: 2 }}>{fmtDate(row.generated_at)}</div>
                    </button>
                    <button
                      onClick={() => removeHistory(row)}
                      style={{ ...btnGhost, minHeight: 36, padding: '6px 10px', color: '#a05040', borderColor: '#e0cabf' }}
                      aria-label={`「${row.theme}」のレポートを削除`}
                    >
                      🗑
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
                <BarChart3 size={18} aria-hidden="true" style={{ color: '#5c5043' }} />
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#3d362c', margin: 0, flex: 1, minWidth: 0 }}>
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
                  <button onClick={resetToPicker} style={btnGhost} aria-label="テーマ選択に戻る">🔄 別のテーマ</button>
                )}
              </div>

              {/* body */}
              {notice ? (
                <div
                  role={noticeKind === 'error' ? 'alert' : 'status'}
                  style={{
                    ...card,
                    background: noticeKind === 'error' ? '#fbf2ee' : card.background,
                    borderColor: noticeKind === 'error' ? '#e6c9bd' : card.border,
                    display: 'flex',
                    gap: 10,
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1.5, flex: '0 0 auto' }}>
                    {noticeKind === 'error' ? '⚠️' : '📭'}
                  </span>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 13, color: '#5c5548', minWidth: 0 }}>
                    {notice}
                  </div>
                </div>
              ) : showStageBlock ? (
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-live="polite" aria-busy="true">
                  <div className="ai-thinking">
                    <span className="ai-thinking-dot" aria-hidden="true" />
                    <span>{STAGE_LABEL[stage] || '🧠 レポートを準備中…'}</span>
                  </div>
                  <div className="ai-skeleton" aria-hidden="true">
                    <div className="ai-skeleton-line" style={{ width: '90%' }} />
                    <div className="ai-skeleton-line" style={{ width: '76%' }} />
                    <div className="ai-skeleton-line" style={{ width: '84%' }} />
                    <div className="ai-skeleton-line" style={{ width: '64%' }} />
                  </div>
                </div>
              ) : (
                <div aria-live="polite" aria-busy={generating || undefined}>
                  <MarkdownSections text={reportText} />
                  {generating && <span className="streaming-cursor" aria-hidden="true" />}
                </div>
              )}

              {/* error notice → offer a retry of the same theme */}
              {!generating && notice && noticeKind === 'error' && activeTheme && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
                  <button onClick={() => generate(activeTheme)} style={btnPrimary} aria-label={`テーマ「${activeTheme}」でもう一度作成`}>
                    🔄 もう一度試す
                  </button>
                </div>
              )}

              {/* actions (only when a finished report is shown) */}
              {!generating && !notice && reportText && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
                  <button onClick={copyReport} style={btnGhost} aria-label="レポートをクリップボードにコピー">
                    📋 コピー
                  </button>
                  {historyAvailable && (
                    <button onClick={() => setView('history')} style={btnGhost} aria-label="保存済みのレポート履歴を見る">
                      🕒 履歴
                    </button>
                  )}
                  <button onClick={resetToPicker} style={btnPrimary} aria-label="別のテーマでレポートを作成">
                    🔄 別のテーマで作る
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
          <Sparkles size={18} aria-hidden="true" style={{ color: '#5c5043' }} />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#3d362c', margin: 0 }}>
            あなたの読書が、1 枚のレポートに
          </h2>
        </div>
        <p style={{ fontSize: 13, color: '#6b5f4d', margin: 0, lineHeight: 1.7 }}>
          テーマを選ぶと、その分野で残してきたメモを横断して、要点・共通パターン・あなたへの行動提案を 1 枚にまとめます。
        </p>
      </div>

      {/* detected theme chips */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#5c5548', margin: '0 0 8px' }}>
          📌 あなたのメモから見つけたテーマ
          {!themesLoading && themes.length > 0 && (
            <span style={{ fontWeight: 500, color: '#6b5f4d' }}>（{themes.length}）</span>
          )}
        </p>
        {themesLoading ? (
          <div className="ai-skeleton" aria-hidden="true" style={{ maxWidth: 360 }}>
            <div className="ai-skeleton-line" style={{ width: '70%' }} />
            <div className="ai-skeleton-line" style={{ width: '52%' }} />
          </div>
        ) : themes.length === 0 ? (
          <p style={{ fontSize: 12, color: '#6b5f4d', margin: 0, lineHeight: 1.7 }}>
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
                  border: '1px solid #e0d8c8',
                  background: '#fff',
                  color: '#3d362c',
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
        <label htmlFor="theme-custom" style={{ fontSize: 12, fontWeight: 600, color: '#5c5548', display: 'block', marginBottom: 8 }}>
          ✏️ テーマを自分で入力
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
            📊 作成
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#6b5f4d', margin: '8px 0 0', lineHeight: 1.6 }}>
          そのテーマに関連するメモ（タグ・@カテゴリ・本文）を集めてレポートにします。
        </p>
      </div>
    </div>
  );
}
