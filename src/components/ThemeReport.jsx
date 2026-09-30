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
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useHaptic } from '../hooks/useHaptic';
import { toMessage } from '../lib/errors';
import { stripInlineMd } from '../lib/text';
import { LIMITS } from '../lib/limits';
import { usePaywall } from '../state/PaywallContext';
import { TOKEN_COSTS, PAID_TOKENS, runCostLine, monthDayLabelJa } from '../lib/tokens';
import { nextResetLabelJa } from '../lib/freeTrial';
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
import { withPhraseBreaks } from './TightBubble';
import ErrorMessage from './ErrorMessage';
import PullToRefresh from './PullToRefresh';
import { SkeletonBlock } from './Skeleton';
import ContextMenu from './ContextMenu';
import { btnPrimary as uiBtnPrimary, btnPrimaryOff as uiBtnPrimaryOff, btnGhost as uiBtnGhost, btnGhostOff as uiBtnGhostOff, btnText as uiBtnText, btnLink as uiBtnLink, input as uiInput } from '../styles/ui';
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack';
import { History, Trash2, BookmarkPlus, Ruler, RefreshCw, CheckCircle2, ChevronLeft, ChevronRight, MoreHorizontal, Copy, BookOpen } from 'lucide-react';

// 見た目は DESIGN.md のトークンのみ。
// 親の .ai-page-body (flex 1, overflow hidden) にぴったり収める flex column。
const wrap = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' };
const viewScroll = { flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'var(--space-2) var(--space-4) var(--space-8)' }; // 上 8＝AI 選書と見出しの高さを揃える
const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const inp = { ...uiInput, flex: 1, minWidth: 0, width: 'auto' };
const btnPrimary = { ...uiBtnPrimary, width: 'auto', flexShrink: 0 };
const btnPrimaryOff = { ...uiBtnPrimaryOff, width: 'auto', flexShrink: 0 };
const btnGhost = { ...uiBtnGhost };
// 文字ボタン（DESIGN §5「文字」: --accent・15/600・高さ 44）。
const btnLink = { ...uiBtnLink, gap: 'var(--space-1)', flexShrink: 0 };
// 上の行（相談・AI 選書と同じ高さ 52・右端にアイコン）。親の上の余白 8 は打ち消す。
// 右端のアイコンは押せる範囲 44 のまま右へ 12 はみ出させ、見た目の右端を相談と同じ位置（16）にそろえる。
const topRow = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-1)', minHeight: 52, margin: 'calc(-1 * var(--space-2)) calc(-1 * var(--space-3)) 0 0' };
// 見出しの横の文字ボタンは、文字の右端を画面の右余白（16）にそろえる（btnLink の左右 4 を打ち消す）。
const btnLinkEnd = { ...btnLink, marginRight: 'calc(-1 * var(--space-1))' };
const btnText = { ...uiBtnText, minHeight: 44, fontSize: 'var(--text-sub)', gap: 'var(--space-1)', padding: 'var(--space-2) 0' };
const groupTitle = { fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-2)' };
// アイコンだけのボタン（44×44・AI 選書／相談の上部と同じ）。
const iconBtn = { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-full)', color: 'var(--text-2)', cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0 };
const metaText = { fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 };
// 読む文章（明朝 18・行間 1.6）。
const readText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)' };

// 案内文の「10月1日」を途中で改行させない（サーバーの文に結合文字が無い場合の保険）。
function keepDateTogether(text) {
  const re = /(\d{1,2}\u2060?月\u2060?\d{1,2}\u2060?日)/;
  return String(text || '').split(re).map((p, i) => (i % 2 === 1 ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{p}</span> : p));
}

const STAGE_LABEL = {
  search: 'テーマのメモと行動を集めています…',
  generate: 'テーマまとめを作成中…',
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
// 「繰り返す原則」の見出しの下の「N. 〜 — 『書名』」から、原則の文だけを順に取り出す。
function principlesOf(lines) {
  const out = [];
  let inSec = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s/.test(line)) {
      if (inSec) break;
      inSec = /原則/.test(line);
      continue;
    }
    const m = inSec && line.match(/^\d+[.．)]\s*(.+)$/);
    if (m) {
      const text = m[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\s*[—–-]+\s*『[^』]*』\s*$/, '').replace(/[。．]$/, '').trim();
      if (text) out.push(text);
    }
  }
  return out;
}

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
  // 「原則 1」のような番号参照は、行動リストだけを見たときに意味が通らない。
  // 同じまとめの「繰り返す原則」の N 番目の文に置き換える（括弧だけの参照は外す）。
  const principles = principlesOf(lines);
  const step = buf.join(' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[（(]\s*原則\s*\d+\s*[)）]/g, '')
    .replace(/原則\s*(\d+)\s?/g, (m, n) => (principles[Number(n) - 1] ? `「${principles[Number(n) - 1]}」` : 'この原則'))
    .trim();
  if (step) return step;
  // フォールバック: 「次の一歩」見出しが崩れても行動追加を不発にしない。
  // 末尾の非空・非見出し行（次の一歩は通常ドキュメント末尾）を採用する。
  const tail = lines
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l))
    .pop();
  return (tail || '').replace(/^[-*\d.]+\s+/, '');
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

export default function ThemeReport({ onActionAdded, onOpenActions, onGoBookshelf, onWriteLearning } = {}) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const haptic = useHaptic();
  // テーマまとめはプランの機能（フリーミアム）。無料プランなら作る前に有料プランの画面を開く。
  const { requirePlan, canBuyTokens, openTokenSheet, plan, freeMode, tokensRemaining, purchasedTokens, tokensAvailable, tokenAllowance, trialEndsAt } = usePaywall();
  // 「まとめる」のそばに 1 回の目安と残り（相談と同じ言い方・無料プランはプランの機能なので出さない・2026-09-29）。
  const costLine = freeMode ? '' : runCostLine({ plan, remaining: tokensRemaining, purchased: purchasedTokens, cost: TOKEN_COSTS.themeReport });
  // 🪙 残り（その月の分＋追加分）が 0 と分かっているときは、押してから断らない（2026-09-29）:
  //   「まとめる」を押せない形にし、上限の案内カード＋「トークンを追加」を先に出す（相談の TokensOutCard と同じ）。
  //   1 以上残っていれば、サーバーの「最後の 1 回」（使ったトークンが上限未満なら始められる）に合わせて作れる。
  const tokensShort = canBuyTokens && tokensAvailable != null && tokensAvailable <= 0;

  const [view, setView] = useState('create'); // 'create' | 'history'
  // 履歴では、左端から右へ払うと作る画面へ戻る（左上の ‹ と同じ・2026-09-29）。
  useEdgeSwipeBack({ enabled: view === 'history', onBack: () => setView('create') });
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
  // 出力上限で途中切れ。notice と違い本文を置き換えず、本文の下に 1 行添えるだけ。
  const [truncated, setTruncated] = useState(false);
  const abortRef = useRef(null);
  const runIdRef = useRef(0); // 生成の実行トークン（履歴を開いたら無効化）

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
  // 右上の「…」メニュー（コピー）。{ x, y } | null
  const [moreMenu, setMoreMenu] = useState(null);

  // History (optional persistence)
  const [history, setHistory] = useState([]);
  const [historyAvailable, setHistoryAvailable] = useState(false);

  // メモ総数（head カウントのみ・行は取らない）。0 件のうちは生成 UI を出さず
  // 先回り案内に倒す — 「押してから空振り」（生成 → 関連メモなし notice）を防ぐ。
  // マイ読書脳の先回り案内と同じ思想。
  const [memoTotal, setMemoTotal] = useState(null); // null = 未取得
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) { setMemoTotal(0); return; }
    let alive = true;
    (async () => {
      try {
        const { count, error } = await supabase
          .from('book_memos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);
        // supabase-js は失敗時も throw せず { count: null, error } を返す。
        // エラーを 0 扱いすると既存ユーザーの生成 UI が消える（fail-closed）ため、
        // 不明時は null のままゲートしない（安全側 = 従来挙動）。
        if (alive) setMemoTotal(error ? null : (count || 0));
      } catch {
        if (alive) setMemoTotal(null); // 不明時はゲートしない（安全側 = 従来挙動）
      }
    })();
    return () => { alive = false; };
  }, [user?.id]);

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
    if (!requirePlan('テーマまとめ')) return;
    if (tokensShort) return; // 案内カードが出ている（押せない形）。Enter で送られても始めない。
    haptic.light();
    // 実行トークン: 生成中に履歴レポートを開く等で runId が進んだら、この
    // 実行のストリーム/完了処理は一切 state を触らない（履歴の内容がテーマ
    // 違いの生成結果で上書きされ、誤テーマの核心が想起ループに載る事故を防ぐ）。
    const runId = ++runIdRef.current;
    const isLive = () => runIdRef.current === runId;
    setActiveTheme(theme);
    setReportText('');
    setNotice('');
    setNoticeKind('info');
    setTruncated(false);
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
        onStage: (s) => { if (isLive()) setStage(s); },
        onChunk: (text) => { if (isLive()) setReportText(text); },
      });

      if (!isLive()) return; // 履歴表示等に切り替わった — 何も上書きしない
      const wasAborted = controller.signal.aborted;
      if (wasAborted) {
        // 中止＝キャンセル扱い。中途半端なレポートを残さず選択画面に戻す
        // (search 段階での中止で「空のレポート」が表示される事故も防ぐ)。
        setActiveTheme('');
        setReportText('');
        setNotice('');
      } else if ((result?.memoCount ?? 0) === 0 || result?.blocked) {
        // メモ0件、またはコンテンツガードで弾かれた場合は「案内」を出すだけで
        // レポートとして保存/履歴化しない（案内文が成果物として残らないように）。
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
          if (result?.truncated) {
            // 出力上限で途中切れ。画面には表示するが、欠けたレポートを完成品として
            // 履歴に永続化しない（再表示しても欠けたままになる事故を防ぐ）。
            // 以前は notice に入れていたため本文が案内カードに置き換わっていた — 本文は残し、
            // 下に 1 行の注記だけを出す。
            setTruncated(true);
          } else {
            // Persist (no-op + history stays hidden if the table isn't applied).
            const saved = await saveThemeReport({ userId: user.id, theme, content: finalText });
            if (saved) {
              setHistoryAvailable(true);
              // 作った日時は必ず持たせる（一覧で日付が空にならないように）。
              const row = { ...saved, generated_at: saved.generated_at || saved.created_at || new Date().toISOString() };
              setHistory((prev2) => [row, ...prev2.filter((r) => r.id !== row.id)]);
            }
          }
        }
      }
    } catch (e) {
      if (isLive() && !(controller.signal.aborted || (e && e.name === 'AbortError'))) {
        // 失敗は画面内の ErrorMessage 1 か所で伝える（トーストと二重に出さない・考えの足あとと同じ）。
        // 先頭の絵文字（toMessage が付ける 🌐 等）は外す — アイコンに絵文字を使わない（DESIGN §3-2）。
        if (e?.monthlyLimit || e?.paywall) {
          // 月の上限・プラン案内は失敗ではない（相談と同じく、案内として出す・再試行ボタンなし）。
          setNoticeKind('info');
          setNotice(e.message);
        } else {
          setNoticeKind('error');
          setNotice(toMessage(e, 'テーマまとめを作れませんでした。').replace(/^[\p{Extended_Pictographic}️\s]+/u, ''));
        }
      }
    } finally {
      // runId が進んでいる（履歴を開いた/新しい生成が始まった）場合、この古い
      // run の finally が新しい run の generating/stage を巻き戻さないようにする。
      if (isLive()) {
        setStage(null);
        setGenerating(false);
        setAborting(false);
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [generating, user?.id, haptic, toast, requirePlan, tokensShort]);

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
    setTruncated(false);
  }, []);

  const copyReport = useCallback(async () => {
    const text = `【テーマまとめ: ${activeTheme}】\n\n${reportText}`;
    try {
      await navigator.clipboard.writeText(text);
      haptic.success();
      toast.success('テーマまとめをコピーしました。');
    } catch {
      toast.error('コピーできませんでした。');
    }
  }, [activeTheme, reportText, haptic, toast]);

  const handleSetRecall = useCallback(async () => {
    if (recallBusy || recallSet) return;
    const core = extractCore(reportText);
    if (!core) { toast.error('核心を取り出せませんでした。'); return; }
    setRecallBusy(true);
    try {
      const res = await setLeverageRecall({ userId: user.id, theme: activeTheme, core });
      if (res?.ok) {
        setRecallSet(true);
        haptic.success();
        toast.success('思い出しカードに加えました。振り返り・通知でそっと戻ってきます。');
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
    if (!step) { toast.error('「次の一歩」を取り出せませんでした。'); return; }
    if (!primaryBook?.id) { toast.error('追加先の本が見つかりませんでした。'); return; }
    setActionBusy(true);
    try {
      const res = await addThemeAction({ userId: user.id, bookId: primaryBook.id, text: step });
      if (res?.ok) {
        setActionAdded(true);
        // 「行動できてる？」の数をその場で合わせる（決めた +1・まだ +1・やれていない一歩の先頭へ）。
        setActionStats((prev) => (prev ? {
          ...prev,
          declared: (prev.declared || 0) + 1,
          idle: (prev.idle || 0) + 1,
          openSteps: [step, ...(prev.openSteps || []).filter((s) => s !== step)].slice(0, 3),
        } : prev));
        haptic.success();
        try { onActionAdded?.(); } catch { /* ignore */ }
        // 知らせは出さない（2026-09-29）: ボタンがその場で「行動に追加しました・見る」に変わるので足りる（相談と同じ）。
      } else {
        toast.error('追加できませんでした。少し時間をおいて再度お試しください。');
      }
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, actionAdded, reportText, primaryBook, user?.id, toast, haptic]);

  const openHistoryReport = useCallback((row) => {
    // 進行中の生成があれば無効化＋中止（放置すると履歴の内容をストリームが上書きする）。
    runIdRef.current += 1;
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    setGenerating(false);
    setStage(null);
    setActiveTheme(row.theme || '');
    setReportText(row.content || '');
    setNotice('');
    setNoticeKind('info');
    setTruncated(false);
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
      title: 'テーマまとめを削除しますか？',
      message: `「${row.theme}」のテーマまとめを削除しますか？`,
      confirmLabel: '削除する',
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
      toast.error('削除できませんでした。');
    } else {
      haptic.medium();
    }
  }, [confirm, toast, haptic]);

  const hasReport = reportText.length > 0 || generating || !!notice;
  const showStageBlock = generating && reportText.length === 0 && !notice;

  // ---- Render --------------------------------------------------------------
  // 切り替え（作成 / 履歴）はサブタブの下に 2 段目のタブとして重ねない（DESIGN §5）。
  // 履歴へは画面内の「履歴」文字ボタンから入り、「‹ テーマまとめ」で戻る。

  const reportDone = !generating && !notice && !!reportText;
  // 途中切れでは末尾が欠けた断片になりうるので、次の一歩の 1 タップ追加は出さない。
  const nextStep = reportDone && !truncated && primaryBook?.id ? extractNextStep(reportText) : '';

  return (
    <div style={wrap}>
      {view === 'history' ? (
        <PullToRefresh onRefresh={refreshHistory}>
          <div style={viewScroll}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <button type="button" onClick={() => setView('create')} style={{ ...btnText, fontSize: 'var(--text-body)', fontWeight: 400, gap: 'var(--space-1)' }}>
                  <ChevronLeft size={20} aria-hidden="true" />テーマまとめ
                </button>
              </div>
              {history.length === 0 ? (
                <EmptyState
                  icon={<History size={32} strokeWidth={1.5} aria-hidden="true" />}
                  title="まだテーマまとめがありません"
                  actions={[{ label: 'テーマまとめを作る', onClick: () => setView('create'), variant: 'secondary' }]}
                />
              ) : (
                <>
                  <p style={metaText}>{history.length} 件</p>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {history.map((row) => (
                      <li key={row.id} style={{ ...card, padding: 'var(--space-1) var(--space-1) var(--space-1) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <button
                          type="button"
                          onClick={() => openHistoryReport(row)}
                          style={{ flex: 1, minWidth: 0, minHeight: 44, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 'var(--space-2) 0', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                              {row.theme}
                            </span>
                            <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>{fmtDate(row.generated_at || row.created_at)}</span>
                          </span>
                          <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeHistory(row)}
                          style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius)', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}
                          aria-label={`「${row.theme}」のテーマまとめを削除`}
                        >
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </PullToRefresh>
      ) : (
        <div style={viewScroll}>
          {!activeTheme && !hasReport ? (
            memoTotal === 0 ? (
              /* メモ 0 件では何を入力しても「関連するメモが見つかりません」で空振りする。
                 誘ってから外すのではなく、先回りして最初の一歩（メモを書く）へ案内する。 */
              <EmptyState
                icon={<Ruler size={32} strokeWidth={1.5} aria-hidden="true" />}
                // 文節の途中（「テーマまと／め」）で改行しないよう、意味の切れ目ごとに折り返さない塊にする
                // （iOS の Safari は word-break: auto-phrase に未対応のため）。
                title={<><span style={{ whiteSpace: 'nowrap' }}>メモがたまると、</span><span style={{ whiteSpace: 'nowrap' }}>テーマまとめが作れます</span></>}
                description={<><span style={{ whiteSpace: 'nowrap' }}>まず本を開いて、</span><span style={{ whiteSpace: 'nowrap' }}>気づきを 1 行メモに残しましょう。</span></>}
                actions={onGoBookshelf ? [{ label: 'すべての本へ', icon: <BookOpen size={18} aria-hidden="true" />, onClick: onGoBookshelf, variant: 'secondary' }] : []}
              />
            ) : (
            <ThemePicker
              themes={themes}
              themesLoading={themesLoading}
              customTheme={customTheme}
              setCustomTheme={setCustomTheme}
              onGenerate={generate}
              historyCount={historyAvailable ? history.length : null}
              onOpenHistory={() => setView('history')}
              costLine={costLine}
              tokensOut={tokensShort ? (
                <TokensShortCard
                  plan={plan}
                  available={tokensAvailable}
                  allowance={tokenAllowance}
                  trialEndLabel={plan === 'trial' ? monthDayLabelJa(trialEndsAt) : ''}
                  onAdd={openTokenSheet}
                />
              ) : null}
            />
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              {/* 上の行（テーマを選ぶ画面と同じ位置）: 履歴の時計 ＋ 完成後は「…」（コピー） */}
              <div>
              <div style={topRow}>
                {historyAvailable && (
                  <HistoryButton count={history.length} onOpen={() => setView('history')} />
                )}
                {reportDone && (
                  <button
                    type="button"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setMoreMenu({ x: r.left + r.width / 2, y: r.bottom });
                    }}
                    style={iconBtn}
                    aria-label="その他の操作"
                    aria-haspopup="menu"
                    aria-expanded={!!moreMenu}
                    title="その他"
                  >
                    <MoreHorizontal size={22} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>
              {moreMenu && (
                <ContextMenu
                  x={moreMenu.x}
                  y={moreMenu.y}
                  onClose={() => setMoreMenu(null)}
                  items={[
                    { label: 'コピー', icon: <Copy size={16} aria-hidden="true" />, onClick: copyReport },
                  ]}
                />
              )}
              {/* 見出し: テーマ名 ＋ 中止 / 別のテーマ ＋ 根拠の範囲（データだけ） */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <h2 style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: 0, flex: 1, minWidth: 0, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                    {activeTheme}
                  </h2>
                  {generating ? (
                    <button
                      type="button"
                      onClick={stopGeneration}
                      disabled={aborting}
                      style={{ ...btnLinkEnd, ...(aborting ? { color: 'var(--text-3)', opacity: 1, cursor: 'default' } : null) }}
                      aria-label={aborting ? '中止しています' : 'テーマまとめの作成を中止'}
                    >
                      {aborting ? '中止中…' : '中止'}
                    </button>
                  ) : (
                    <button type="button" onClick={resetToPicker} style={btnLinkEnd} aria-label="別のテーマを選ぶ">
                      <RefreshCw size={16} aria-hidden="true" />別のテーマ
                    </button>
                  )}
                </div>
                {!notice && scope && (scope.memoTotal > 0 || scope.bookCount > 0) && (
                  <p style={metaText}>本 {scope.bookCount} 冊・メモ {scope.memoTotal} 件{scope.bookCount === 1 ? 'から' : 'を横断'}</p>
                )}
                {/* 前回からの変化（端末ローカル比較・あるときだけ） */}
                {reportDone && delta && (
                  <p style={metaText}>
                    前回からの変化{delta.at && <>（前回 {fmtDate(delta.at)}）</>}：
                    {delta.book > 0 && <>本 +{delta.book} 冊　</>}
                    {delta.memo > 0 ? <>メモ +{delta.memo} 件を追加</> : delta.memo < 0 ? <>メモ {delta.memo} 件</> : <>新しい根拠が増えました</>}
                  </p>
                )}
              </div>
              </div>

              {/* body */}
              {notice && noticeKind === 'error' ? (
                // 題は必ず付け、内部の文（notice）は見せない（DESIGN §5・やり直しは「もう一度」・2026-09-29）。
                <ErrorMessage
                  icon={null}
                  title="まとめを作れませんでした"
                  description="通信の状態を確かめて、もう一度お試しください。"
                  actions={activeTheme ? [{
                    label: 'もう一度',
                    ariaLabel: `テーマ「${activeTheme}」でもう一度作成`,
                    onClick: () => generate(activeTheme),
                    variant: 'primary',
                  }] : []}
                />
              ) : notice ? (
                // 案内（月の上限・関連するメモが無い 等）は AI 選書の案内カードと同じ形（カード＋15/--text・アイコンなし）。
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <p role="status" style={{ ...card, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 'var(--text-sub)', color: 'var(--text)', wordBreak: 'auto-phrase' }}>
                    {keepDateTogether(notice)}
                  </p>
                  {/* 🪙➕ プランの人がトークンを使い切ったら「トークンを追加」 */}
                  {canBuyTokens && /^(今月のトークン|無料期間のトークン)/.test(notice) && (
                    <button type="button" onClick={openTokenSheet} style={uiBtnPrimary}>
                      トークンを追加
                    </button>
                  )}
                  {/* 関連するメモが無いときの案内は「学びを書く」をすすめるので、その場で開けるように（テーマをタグに入れて・2026-09-29）。 */}
                  {onWriteLearning && noticeKind === 'info' && notice.includes('「学びを書く」') && (
                    <button type="button" onClick={() => onWriteLearning(activeTheme)} style={uiBtnGhost}>
                      学びを書く
                    </button>
                  )}
                </div>
              ) : showStageBlock ? (
                // 相談・AI 選書と同じ「考え中」の形（.ai-thinking＋.ai-skeleton）。
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-live="polite" aria-busy="true">
                  <div className="ai-thinking">
                    <span className="ai-thinking-dot" aria-hidden="true" />
                    <span>{STAGE_LABEL[stage] || 'テーマまとめを準備中…'}</span>
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
                // 完成後は「核心」を先頭のカードで示し、残り(原則/次の一歩)を下に。
                // ここは live region にしない（中の「行動に追加しました」の role="status" と二重に読まれていた・2026-09-30）。
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {extractCore(reportText) && <CoreCard line={extractCore(reportText)} />}
                  <MarkdownSections text={stripCoreSection(reportText)} />
                  {/* 次の一歩を 1 タップで行動リストへ（この画面の主ボタン）。「次の一歩」のカードのすぐ下に置く */}
                  {/* 追加したあとは相談と同じ形: 「行動に追加しました（期限は明日）」＋ 見る（2026-09-29）。 */}
                  {nextStep && actionAdded && (
                    <p role="status" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-1)', minHeight: 44, margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--success)' }}>
                      <CheckCircle2 size={16} aria-hidden="true" />行動に追加しました（期限は明日）
                      {onOpenActions && <button type="button" onClick={() => onOpenActions()} aria-label="追加した行動を見る" style={{ ...uiBtnLink, marginLeft: 'var(--space-1)' }}>見る</button>}
                    </p>
                  )}
                  {nextStep && !actionAdded && (
                    <button
                      type="button"
                      onClick={handleAddNextStep}
                      disabled={actionBusy}
                      // 名前は見えている文字のまま（aria-label で別の言葉にしない・2026-09-29）
                      style={actionBusy ? uiBtnPrimaryOff : uiBtnPrimary}
                    >
                      {actionBusy ? '追加中…' : 'この一歩を行動に追加'}
                    </button>
                  )}
                  {truncated && (
                    <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>長さの上限で、ここまでになりました。<span style={{ whiteSpace: 'nowrap' }}>履歴には残しません。</span></p>
                      <button type="button" onClick={resetToPicker} style={{ ...uiBtnLink, marginLeft: 'calc(-1 * var(--space-1))' }}>テーマを絞って作り直す</button>
                    </div>
                  )}
                </div>
              )}

              {/* 行動の鏡 — 学びが行動に変わっているかを実データで示す */}
              {reportDone && actionStats && (
                <ActionMirror stats={actionStats} memoTotal={scope?.memoTotal ?? 0} onOpenActions={onOpenActions} />
              )}

              {/* 想起ループ接続（副ボタン）。コピーは右上の「…」、履歴は右上の時計 */}
              {reportDone && (
                <RecallButton busy={recallBusy} done={recallSet} onSet={handleSetRecall} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThemePicker({ themes, themesLoading, customTheme, setCustomTheme, onGenerate, historyCount, onOpenHistory, costLine = '', tokensOut = null }) {
  // トークンが足りないときは選べても作れない（「まとめる」は押せない形・主ボタンは案内カードの「トークンを追加」）。
  const canGenerate = customTheme.trim().length > 0 && !tokensOut;
  const submitCustom = () => {
    if (canGenerate) onGenerate(customTheme.trim());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* 上の行（相談・AI 選書と同じ高さ 52・右端に履歴の時計）→ その下に見出し。サブタブを切り替えても
          見出しの位置が動かないように、相談の上の行と同じ寸法にそろえる（上の余白 8 は打ち消す）。 */}
      <div>
      <div style={topRow}>
        {historyCount != null && <HistoryButton count={historyCount} onOpen={onOpenHistory} />}
      </div>
      <h2 style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: 'var(--space-2) 0 0', lineHeight: 1.3 }}>
        どのテーマをまとめますか
      </h2>
      </div>

      {/* トークンが 1 回分に足りない: 押してから断らず、先に案内（相談と同じカード） */}
      {tokensOut}

      {/* detected theme chips */}
      <section aria-labelledby="theme-detected">
        <h3 id="theme-detected" style={groupTitle}>
          あなたのメモから見つけたテーマ
          {!themesLoading && themes.length > 0 && <>（{themes.length}）</>}
        </h3>
        {themesLoading ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }} aria-hidden="true">
            <SkeletonBlock width={96} height={44} radius="var(--radius)" />
            <SkeletonBlock width={128} height={44} radius="var(--radius)" />
            <SkeletonBlock width={80} height={44} radius="var(--radius)" />
          </div>
        ) : themes.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
            まだ候補はありません。下の欄にテーマを入力して始めましょう。
          </p>
        ) : (
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
            role="group"
            aria-label="メモから見つかったテーマ候補"
          >
            {themes.map((t) => {
              // 押すと選ぶだけ（下の欄に入る）。作るのは「まとめる」を押したとき＝押しただけでトークンを使わない（2026-09-29）。
              const selected = customTheme.trim() === t.theme;
              return (
              <button
                key={t.theme}
                type="button"
                onClick={() => setCustomTheme(selected ? '' : t.theme)}
                aria-pressed={selected}
                aria-label={`テーマ「${t.theme}」（メモ ${t.count} 件）を選ぶ`}
                style={{
                  minHeight: 44,
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius)',
                  border: 'none',
                  background: selected ? 'var(--accent-soft)' : 'var(--fill)',
                  color: selected ? 'var(--accent)' : 'var(--text)',
                  fontWeight: selected ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'var(--text-sub)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  touchAction: 'manipulation',
                }}
              >
                <span>{t.theme}</span>
                <span aria-hidden="true" style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: selected ? 'var(--accent)' : 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                  {t.count}
                </span>
              </button>
              );
            })}
          </div>
        )}
      </section>

      {/* free-text theme */}
      <div>
        <label htmlFor="theme-custom" style={{ ...groupTitle, display: 'block' }}>
          まとめるテーマ
        </label>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
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
            placeholder="例：営業、習慣"
            maxLength={LIMITS.theme}
            style={inp}
          />
          <button
            type="button"
            onClick={submitCustom}
            disabled={!canGenerate}
            style={canGenerate ? btnPrimary : btnPrimaryOff}
          >
            まとめる
          </button>
        </div>
        {costLine && !tokensOut && (
          <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
            {costLine}
          </p>
        )}
      </div>
    </div>
  );
}

// 🪙 トークンが 1 回分に足りない（プランの人）。相談の TokensOutCard と同じ形・同じ言い方（DESIGN §5「案内カード」）。
//   0 なら「今月のトークンは、ここまでです」、少し残っていれば「今月の残りは N トークンです」＋1 回の目安。
function TokensShortCard({ plan, available = 0, allowance, trialEndLabel = '', onAdd }) {
  const trial = plan === 'trial';
  const left = Math.max(0, Number(available) || 0);
  const nowrap = { whiteSpace: 'nowrap' };
  const sub = { margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 };
  return (
    <section aria-label="トークンが足りません" style={card}>
      <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
        {left > 0
          ? <>{trial ? '無料期間' : '今月'}の残りは <span style={nowrap}>{left.toLocaleString('ja-JP')} トークン</span>です</>
          : trial ? '無料期間のトークンは、ここまでです' : '今月のトークンは、ここまでです'}
      </p>
      {left > 0 && (
        <p style={sub}>テーマまとめは <span style={nowrap}>1 回 約 {TOKEN_COSTS.themeReport} トークン</span></p>
      )}
      {!trial ? (
        <p style={sub}>
          <span style={nowrap}>{nextResetLabelJa()}</span>に <span style={nowrap}>{(allowance ?? PAID_TOKENS).toLocaleString('ja-JP')} トークン</span>に戻ります
        </p>
      ) : trialEndLabel ? (
        <p style={sub}>
          無料期間が終わる<span style={nowrap}>{trialEndLabel}</span>から、<span style={nowrap}>毎月 {PAID_TOKENS.toLocaleString('ja-JP')} トークン使えます。</span>
        </p>
      ) : null}
      <button type="button" onClick={onAdd} style={{ ...uiBtnPrimary, marginTop: 'var(--space-3)' }}>
        トークンを追加
      </button>
    </section>
  );
}

// 右上の履歴の時計（テーマを選ぶ画面・まとめの画面で同じ位置・同じ名前）。
function HistoryButton({ count, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={iconBtn}
      aria-label={count > 0 ? `テーマまとめの履歴を見る（${count} 件）` : 'テーマまとめの履歴を見る'}
      title="履歴"
    >
      <History size={22} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

// 核心 — 持ち歩く「この1行」。読む文章（明朝 400）で、カード 1 枚に。
// 見出しは下の「繰り返す原則」「次の一歩」（MarkdownSections）の見出しと同じ 17/600/--text。
function CoreCard({ line }) {
  return (
    <div style={card}>
      <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-2)', lineHeight: 1.4 }}>核心</h3>
      {/* 文節の切れ目でだけ折り返す（「核心」の 1 行を語の途中で割らない・2026-09-30）。 */}
      <p style={{ ...readText, fontWeight: 400, margin: 0, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
        {typeof line === 'string' ? withPhraseBreaks(line) : line}
      </p>
    </div>
  );
}

// 行動の鏡 — 宣言/完了/放置 を実データで表示し、学びが行動に変わっているかを
// 示す（本田哲学の「実践してこそ」）。数値は AI ではなく actions の集計。
function ActionMirror({ stats, memoTotal, onOpenActions }) {
  const { declared = 0, completed = 0, idle = 0, blindSpot = false, openSteps = [] } = stats || {};
  // 数字が 1 以上 かつ 行動タブへの導線がある時だけタップ可能にする
  // （数字を見る→中身を確かめる、を 1 タップで。0 件で空タブへ飛ばさない）。
  const statBox = (n, k, color) => {
    const base = { flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 'var(--space-2) 0', textAlign: 'center', borderRadius: 'var(--radius)' };
    const inner = (
      <>
        <span style={{ display: 'block', fontSize: 'var(--text-heading)', fontWeight: 600, lineHeight: 1.3, color, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
        <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)', marginTop: 'var(--space-1)' }}>{k}{onOpenActions && n > 0 && k === '決めた行動' ? ' ›' : ''}</span>
      </>
    );
    // 押せるのは「決めた行動」だけ（行動タブの先頭に着く＝約束どおり）。完了・まだは数字だけ。
    if (!onOpenActions || n <= 0 || k !== '決めた行動') return <div style={base}>{inner}</div>;
    return (
      <button
        type="button"
        onClick={() => onOpenActions()}
        aria-label="決めた行動を振り返りの行動で見る"
        style={{ ...base, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}
      >
        {inner}
      </button>
    );
  };
  const nudge = { margin: 'var(--space-3) 0 0', background: 'var(--fill)', borderRadius: 'var(--radius)', padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sub)', lineHeight: 1.5, color: 'var(--text)' };
  return (
    <section style={card} aria-labelledby="theme-mirror">
      <h3 id="theme-mirror" style={{ fontSize: 'var(--text-body)', fontWeight: 600, margin: '0 0 var(--space-2)', color: 'var(--text)', lineHeight: 1.3 }}>
        行動できてる？
      </h3>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {statBox(declared, '決めた行動', 'var(--text)')}
        {statBox(completed, '完了', completed > 0 ? 'var(--success)' : 'var(--text)')}
        {statBox(idle, 'まだ', 'var(--text)')}
      </div>
      {declared === 0 ? (
        <p style={nudge}>
          このテーマに紐づく行動が<strong style={{ fontWeight: 600 }}>まだ 0 件</strong>。学びを、まず1つだけ行動に落としましょう。
        </p>
      ) : blindSpot ? (
        <p style={nudge}>
          メモは <strong style={{ fontWeight: 600 }}>{memoTotal} 件</strong> あるのに、完了した行動は <strong style={{ fontWeight: 600 }}>0 件</strong>。下の「次の一歩」から1つ始めてみましょう。
        </p>
      ) : null}

      {/* やり残しの一歩を名指しで示す（本田: 宣言した一歩がどうなったか） */}
      {openSteps.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--separator)' }}>
          <p style={{ ...groupTitle }}>まだやれていない一歩</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {openSteps.map((s, i) => (
              <li key={i} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', fontSize: 'var(--text-sub)', lineHeight: 1.5, color: 'var(--text)' }}>
                {/* 押せない一覧なので、チェックボックスに見える丸ではなく小さな点（MarkdownSections の箇条書きと同じ） */}
                <span aria-hidden="true" style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 'var(--radius-full)', background: 'var(--text-3)', marginTop: 'calc(0.75em - 3px)' }} />
                {/* 長い一歩は 2 行で止める（一覧の役目は「まだやれていない」を思い出すこと。全文は行動リストで見る） */}
                <span title={stripInlineMd(s)} style={{ minWidth: 0, overflowWrap: 'anywhere', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>{stripInlineMd(s)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// 想起ループ接続 — 核心を「振り返り・通知」に乗せる副ボタン。
function RecallButton({ busy, done, onSet }) {
  return (
    <button
      type="button"
      onClick={onSet}
      disabled={busy || done}
      aria-label={done ? '思い出しカードに追加済み' : '核心を思い出しカードに加える'}
      style={busy ? uiBtnGhostOff : {
        ...btnGhost,
        cursor: done ? 'default' : 'pointer',
        color: done ? 'var(--text-2)' : 'var(--text)',
        opacity: 1,
      }}
    >
      {done ? (
        <><CheckCircle2 size={18} aria-hidden="true" style={{ color: 'var(--success)' }} />思い出しカードに追加済み</>
      ) : busy ? 'セット中…' : (
        <><BookmarkPlus size={18} aria-hidden="true" />思い出しカードに加える</>
      )}
    </button>
  );
}
