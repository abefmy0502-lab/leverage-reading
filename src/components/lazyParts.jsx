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
import { MemoListSkeleton } from './Skeleton';
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
      <Suspense fallback={fallback}>
        <Impl {...props} />
      </Suspense>
    );
  }
  return LazyPart;
}

// 本の詳細のメモ一覧（＋メモカード・一文をシェア・シェア画像づくり）。待つ間は一覧と同じ骨組み。
export const BookMemoList = withSuspense(loaders.bookMemoList, <MemoListSkeleton />);
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
export const MarkdownSections = memo(withSuspense(loaders.markdownSections, null));

// 本の追加・編集画面の各段階（読みたい／積読／読書中／読了）と、下に固定する保存ボタン。
const phase = (name) => withSuspense(() => loaders.bookPhases().then((m) => ({ default: m[name] })), null);
export const WantPhase = phase('WantPhase');
export const BeforePhase = phase('BeforePhase');
export const ReadingPhase = phase('ReadingPhase');
export const DonePhase = phase('DonePhase');
export const EditSaveBar = phase('EditSaveBar');
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
