// ⚡ 起動を軽くするための「あとから読む部品」（2026-09-29）。
//
// 最初の画面（ホーム）に要らない重い部品を、使うときに読み込む。App.jsx は import 先を
// ここに替えるだけで、使い方（props）はそのまま。各部品は自分の Suspense を持つので、
// 読み込み中に画面全体が消えることはない（その場所だけ控えめな待ち表示）。
//
// さらに、ログイン済みの人（とネイティブアプリ）には、最初の描画が落ち着いたあと
// 手が空いたときに先読みしておく（タブや本の詳細を開いた瞬間に待たせない）。
import { lazy, memo, Suspense } from 'react';
import Spinner from './Spinner';
import { BookMemoListFallback, SkeletonBlock } from './Skeleton';
import { btnPrimaryOff } from '../styles/ui';
import { isNative } from '../lib/iap';
import { isDemo } from '../lib/supabase';

const loaders = {
  bookMemoList: () => import('./BookMemoList'),
  bookMemoEditor: () => import('./BookMemoEditor'),
  bookSearchModal: () => import('./BookSearchModal'),
  actionList: () => import('./ActionList'),
  authScreen: () => import('./auth/AuthScreen'),
  authCallback: () => import('./auth/AuthCallback'),
  markdownSections: () => import('./MarkdownSections'),
  authorThankYou: () => import('./AuthorThankYou'),
  bookPhases: () => import('./BookPhases').then((m) => { bookPhasesMod = m; return m; }),
};
let bookPhasesMod = null;

function withSuspense(load, fallback) {
  const Impl = lazy(load);
  function LazyPart(props) {
    return (
      <Suspense fallback={typeof fallback === 'function' ? fallback(props) : fallback}>
        <Impl {...props} />
      </Suspense>
    );
  }
  return LazyPart;
}

// 重ねて開く部品（シート・設定・ヘルプ・本を追加）を読み込んでいる間の待ち表示（2026-09-29）。
// 何も出さない（null）と押しても反応が無いように感じ、Spinner を置くと画面の流れの中に出て下が跳ねる。
// 本物と同じ背景（--backdrop）だけを先に重ねて「押せた」ことを伝える（本物が出たら入れ替わる）。
export function OverlayFallback({ solid = false }) {
  return (
    <div
      aria-busy="true"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-popover)',
        background: solid ? 'var(--bg)' : 'var(--backdrop)',
        animation: 'lvg-fade-in var(--duration-fast) var(--ease-out) both',
      }}
    />
  );
}

// 本の詳細のメモ一覧（＋メモカード・一文をシェア・シェア画像づくり）。待つ間は一覧と同じ骨組み。
export const BookMemoList = withSuspense(loaders.bookMemoList, (p) => <BookMemoListFallback afterList={p.afterList} withSummary={!!p.onSaveSummary} />);
// 全画面のメモ編集（画面の上に重ねて開くので、待つ間は何も出さない）。
export const BookMemoEditor = withSuspense(loaders.bookMemoEditor, null);
// 本を検索するシート（シートの中に待ち表示）。
export const BookSearchModal = withSuspense(loaders.bookSearchModal, <Spinner />);
// 振り返り › 行動（となりのサブタブと同じ待ち表示）。
export const ActionList = withSuspense(loaders.actionList, <Spinner />);
// ログイン画面・ログインのリンクから戻ったとき（ログイン済みの人には要らない）。
export const AuthScreen = withSuspense(loaders.authScreen, null);
export const AuthCallback = withSuspense(loaders.authCallback, <Spinner />);
// ロゴ長押しのお礼（隠し機能）。
export const AuthorThankYou = withSuspense(loaders.authorThankYou, null);
// AI の読書計画・解析などの Markdown 表示（本の詳細）。元が memo なので包みも memo のまま。
// 待つ間は文の行の骨組み 3 行（何も出さずに後から押し下げない）。
const markdownFallback = (
  <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
    <SkeletonBlock width="100%" height={16} />
    <SkeletonBlock width="92%" height={16} />
    <SkeletonBlock width="60%" height={16} />
  </div>
);
export const MarkdownSections = memo(withSuspense(loaders.markdownSections, markdownFallback));

// 本の追加・編集画面の各段階（読みたい／積読／読書中／読了）と、下に固定する保存ボタン。
// 待つ間は欄の形の骨組み（小さな見出し 12 ＋ 入力欄 48 を 3 組・組の間 24＝Field と同じ）。
const phaseFallback = (
  <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <SkeletonBlock width={80} height={12} />
        <SkeletonBlock width="100%" height={48} radius="var(--radius)" />
      </div>
    ))}
  </div>
);
// 保存の欄は BookPhases の EditSaveBar と同じ形・同じ高さで、押せない主ボタンを置いておく。
const saveBarFallback = (
  <div style={{ flexShrink: 0, borderTop: '1px solid var(--separator)', background: 'var(--bg)', padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px))' }}>
    <button type="button" disabled aria-busy="true" style={btnPrimaryOff}>保存</button>
  </div>
);
const phase = (name, fallback = phaseFallback) => withSuspense(() => loaders.bookPhases().then((m) => ({ default: m[name] })), fallback);
export const WantPhase = phase('WantPhase');
export const BeforePhase = phase('BeforePhase');
export const ReadingPhase = phase('ReadingPhase');
export const DonePhase = phase('DonePhase');
export const EditSaveBar = phase('EditSaveBar', saveBarFallback);
// 保存ボタンの文言。BookPhases を読み終えていればその場で文字を返す。まだなら、
// 読み終えたら同じ関数で文字を出す小さな部品を返す（EditSaveBar はボタンの中に {label} を置くだけなので、
// 文字でも部品でも同じ見た目になる）。
const SaveLabel = lazy(() => loaders.bookPhases().then((m) => ({
  default: ({ form, savedAsBefore }) => m.saveLabelFor(form, savedAsBefore),
})));
export function saveLabelFor(form, savedAsBefore) {
  if (bookPhasesMod) return bookPhasesMod.saveLabelFor(form, savedAsBefore);
  return <SaveLabel form={form} savedAsBefore={savedAsBefore} />;
}

// 手が空いたときに先読みする（ログイン済み・ネイティブだけ。LP を見に来た人の通信は増やさない）。
function looksSignedIn() {
  try {
    if (isNative || isDemo) return true;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i) || '';
      if (k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch { /* storage が使えないときは先読みしない */ }
  return false;
}

const idle = (fn, timeout) => (
  typeof window.requestIdleCallback === 'function'
    ? window.requestIdleCallback(fn, { timeout })
    : window.setTimeout(fn, 1)
);

// 振り返り › メモ・相談は App.jsx 側ですでに lazy。同じモジュールを先に温めておくだけ。
export function prefetchAppParts() {
  if (typeof window === 'undefined' || !looksSignedIn()) return;
  // オフラインでは先読みしない（読めないと main.jsx の vite:preloadError で再読み込みになるため）。
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const queue = [
    loaders.actionList,
    () => import('./MyBookBrain'),
    () => import('./Review'),
    loaders.bookMemoList,
    loaders.markdownSections,
    loaders.bookPhases,
    loaders.bookMemoEditor,
    loaders.bookSearchModal,
    // 押したら重ねて開く部品（待つ間は何も出さない＝null なので、読めていないと押しても
    // しばらく何も起きないように感じる・2026-09-29）。よく押す順に温めておく。
    () => import('./HomeQuickMemo'),
    () => import('./QuickMemoSheet'),
    () => import('./AddBookModal'),
    () => import('./ShareSheet'),
    () => import('./AccountSettings'),
    () => import('./TokenSheet'),
    () => import('./Paywall'),
  ];
  const next = () => {
    const load = queue.shift();
    if (!load || navigator.onLine === false) return;
    load().catch(() => { /* 先読みの失敗は無視（使うときにもう一度読む） */ }).finally(() => idle(next, 2000));
  };
  // 最初の描画が落ち着いてから（load のあと・さらに手が空いたとき）。
  const start = () => window.setTimeout(() => idle(next, 3000), 1500);
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
