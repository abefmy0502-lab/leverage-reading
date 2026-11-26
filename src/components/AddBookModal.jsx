// AddBookModal — 全画面の「本を追加」。検索欄 1 つ＋結果＋バーコード＋手動入力を 1 画面で完結。
//
// 検索欄・結果一覧・検索の振り分け（書名 / 著者 / ISBN）は BookSearchModal.jsx の共通部品を使う
// （このファイルは遅延読み込みなので、共通部品は常に読み込まれている側に置いてある）。
//
// 状態（useBookQuerySearch）:
//   'idle'      : 初期。検索欄＋バーコード＋手動入力
//   'searching' : 検索中（結果の形のスケルトン）
//   'results'   : 結果あり（本棚にある本は「追加済み」・押すとその本を開く）
//   'notfound'  : 0 件（手動入力へ）
//   'error'     : 検索エラー（もう一度試す / 手動入力）

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanBarcode, Library } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import BarcodeScanner, { BARCODE_SUPPORTED, preloadBarcodeEngine } from './BarcodeScanner';
import { useToast } from './Toast';
import { withPhraseBreaks } from './TightBubble';

// アイコン＋言葉を 1 つのまとまりに（文字を大きくして 2 行になっても、アイコンは 1 行目の頭に付いたまま・
// 言葉は文節で折り返す＝「本棚の写真からま／とめて」と割らない・2026-11-23 点検）。
function IconLabel({ icon: Icon, size = '1.2em', children }) {
  // アイコンと言葉のあいだは U+2060（折り返さない印）でつなぐ＝アイコンだけが 1 行目に残らない。
  return (
    <span style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
      <Icon size={size} aria-hidden="true" style={{ verticalAlign: '-0.2em', marginRight: 'var(--space-2)' }} />{'\u2060'}{withPhraseBreaks(children)}
    </span>
  );
}
import { findDuplicateBook, STATUS_LABEL } from '../lib/checkDuplicate';
import { btnPrimary, btnGhost, btnLink } from '../styles/ui';
import {
  BookSearchField,
  BookSearchStatus,
  SearchButton,
  manualSeedFromQuery,
  normalizeBookQuery,
  useBookQuerySearch,
} from './BookSearchModal';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: 'var(--bg)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'var(--font-ui)',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  // iOS の全画面モーダルと同じく下からせり上がる（閉じるときは下へ・2026-09-29）。
  animation: 'leverage-sheet-up var(--duration-base) var(--ease-out) backwards',
};
const overlayClosingAnim = 'leverage-sheet-down var(--duration-fast) var(--ease-in-out) forwards';

// 文字の大きさの設定が大きいとき（ルート 22px 以上）。
const isLargeRoot = () => { try { return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 22; } catch { return false; } };

const headerStyle = {
  display: 'grid',
  // 右の「キャンセル」は割らない（文字最大で「キャン／セル」と割れていた・2026-11-18）。題は真ん中の列で縮む。
  gridTemplateColumns: 'minmax(0, 1fr) auto minmax(max-content, 1fr)',
  columnGap: 'var(--space-3)',
  alignItems: 'center',
  minHeight: 'var(--tap-min)',
  padding: 'var(--space-1) var(--space-4)',
  borderBottom: '1px solid var(--separator)',
};

const bodyStyle = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  overscrollBehavior: 'contain',
  padding: 'var(--space-4) var(--space-4) var(--space-8)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
};

// ---------------------------------------------------------------------------
// 📷 バーコード読み取り
// ---------------------------------------------------------------------------

// 読み取りの本体は components/BarcodeScanner.jsx（2026-11-26 作り直し＝速く・カメラのまま続けて入れられる）。

// ---------------------------------------------------------------------------
// 本を追加
// ---------------------------------------------------------------------------

// forPhoto: 初回ガイドの「本のページを撮る」から開いたとき（題を「本を選ぶ」・上に「まず本を選びます」の 1 行・2026-10-09）。
// onShelfScan: 📚 本棚の写真から追加（2026-11-22・ボタンの名前は 2026-11-23 にシートの題とそろえた）を開く。無ければボタンを出さない。
export default function AddBookModal({ onClose, onSelect, onManual, existingBooks = [], onOpenExisting, initialQuery = '', forPhoto = false, onShelfScan = null, onImport = null, onQuickAdd = null, onUndoQuickAdd = null }) {
  // 本の追加フォームの「‹ 検索」で戻ってきたときは、さっきの言葉と結果をそのまま出す。
  const [query, setQuery] = useState(initialQuery);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef(null);
  const search = useBookQuerySearch();
  // バーコードスキャナ（入れ子ダイアログ）を開いている間は、そちらのトラップに
  // 譲るため本体のトラップを無効化する。
  const trapRef = useFocusTrap(!scanning);

  const hasQuery = !!normalizeBookQuery(query);
  const isSearching = search.status === 'searching';

  // 「キャンセル」は下へ滑らせてから閉じる（入りだけ動いて出が瞬間に消える、の非対称をなくす）。
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(closeTimerRef.current), []);
  const closeAnimated = () => {
    if (closing) return;
    setClosing(true);
    let ms = 200;
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ms = 0;
      else {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--duration-fast').trim();
        const n = parseFloat(v);
        if (Number.isFinite(n)) ms = /ms$/.test(v) ? n : n * 1000;
      }
    } catch { /* ignore */ }
    closeTimerRef.current = setTimeout(() => onClose?.(), ms);
  };

  // 開いたらすぐ打てるように検索欄へ（フォーカストラップが先頭のボタンへ当てた後に上書き）。
  useEffect(() => {
    try { inputRef.current?.focus(); } catch { /* ignore */ }
    if (normalizeBookQuery(initialQuery)) search.run(initialQuery);
    // 開いたときに 1 回だけ（initialQuery は開き直すまで変わらない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = (q = query) => search.run(q);
  const openManual = () => onManual(manualSeedFromQuery(query), query);

  // 📷 バーコードで続けて入れる（BarcodeScanner.jsx）。閉じたら入れた冊数を 1 行で知らせる。
  const toast = useToast();
  const closeScanner = useCallback((added = 0) => {
    setScanning(false);
    if (added > 0) toast.success(`${added}\u00a0冊を本棚に入れました`);
  }, [toast]);
  // 🔥 バーコードの読み取りの部品を先に読み込む（押してからカメラが立ち上がるまでを短く・2026-11-26）
  useEffect(() => {
    if (!BARCODE_SUPPORTED) return undefined;
    const t = setTimeout(() => { try { preloadBarcodeEngine()?.catch(() => {}); } catch { /* ignore */ } }, 300);
    return () => clearTimeout(t);
  }, []);
  const focusQuery = useCallback(() => {
    setTimeout(() => { try { inputRef.current?.focus(); } catch { /* ignore */ } }, 180);
  }, []);

  const getExisting = (book) => {
    const existing = findDuplicateBook(existingBooks, book);
    return existing ? { book: existing, statusLabel: STATUS_LABEL[existing.status] || '本棚' } : null;
  };

  const handlePick = (book, opts = {}) => {
    // 既に本棚にある本は追加せず、その本を開く。
    if (opts.isExisting && opts.existing) {
      onOpenExisting?.(opts.existing, query);
      return;
    }
    onSelect?.(book, query);
  };

  // 手動入力の入口は、どの状態でも下の文字ボタン 1 か所だけ。
  const showManualLink = true;

  const largeHeader = isLargeRoot();
  return (
    <div ref={trapRef} style={closing ? { ...overlayStyle, animation: overlayClosingAnim } : overlayStyle} role="dialog" aria-modal="true" aria-labelledby="add-book-title">
      {scanning && (
        <BarcodeScanner
          existingBooks={existingBooks}
          onAdd={onQuickAdd}
          onUndo={onUndoQuickAdd}
          // くわしく入れる＝今までの流れ（本を追加の画面へ・ISBN を検索欄に）
          onPick={(book) => { setScanning(false); setQuery(book.isbn || ''); onSelect?.(book, book.isbn || ''); }}
          onManualIsbn={(isbn) => { setScanning(false); setQuery(isbn); onManual(manualSeedFromQuery(isbn), isbn); }}
          onTypeIsbn={focusQuery}
          onClose={closeScanner}
        />
      )}

      {/* 文字が大きいときは題を左に寄せる（中央に置くと、右の「キャンセル」の幅で題がどこにもそろわなかった・2026-11-18） */}
      <div style={largeHeader ? { ...headerStyle, gridTemplateColumns: 'minmax(0, 1fr) auto' } : headerStyle}>
        {!largeHeader && <span />}
        <h2 id="add-book-title" style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3, color: 'var(--text)' }}>
          {forPhoto ? '本を選ぶ' : '本を追加'}
        </h2>
        {/* 「キャンセル」は右上（ほかのシート・画面の「キャンセル」「完了」と同じ場所にそろえる・2026-10-09。以前はここだけ左上）。
            検索中でも閉じられる（応答が返らなくても閉じ込めない。中断はフック側が行う）。 */}
        <button
          type="button"
          onClick={closeAnimated}
          style={{
            justifySelf: 'end',
            whiteSpace: 'nowrap',
            minWidth: 'var(--tap-min)',
            minHeight: 'var(--tap-min)',
            padding: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 'var(--text-body)',
            fontWeight: 400,
            lineHeight: 1.3,
            // DESIGN §5: シートの「キャンセル」は脇役（--text-2・17/400）。
            color: 'var(--text-2)',
          }}
        >
          キャンセル
        </button>
      </div>

      <div style={bodyStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* 📷 本のページを撮るから来た人に、いま何をする画面か（撮る前に本を選ぶ）を 1 行だけ。 */}
          {forPhoto && (
            // 説明と検索欄の間は 16（列の間 12 ＋ 4）。
            <p style={{ margin: '0 0 var(--space-1)', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {withPhraseBreaks('本を選んでから、ページを撮ります。')}
            </p>
          )}
          <BookSearchField
            id="add-book-query"
            value={query}
            onChange={setQuery}
            onSubmit={() => runSearch()}
            inputRef={inputRef}
          />
          {/* 「検索」は書いてから出す（空のうちから塗りの大きなボタンがあると、最初の画面の主役がずれた・2026-10-16 ui-critic）。
              キーボードの「検索」でも探せる。 */}
          {(hasQuery || isSearching) && <SearchButton
            empty={!hasQuery}
            searching={isSearching}
            onSearch={() => runSearch()}
            onEmpty={() => inputRef.current?.focus()}
          />}
          {/* カメラが使える環境だけ（使えない環境ではボタン自体を出さない）。 */}
          {BARCODE_SUPPORTED && (
            <button type="button" onClick={() => setScanning(true)} style={btnGhost}>
              <IconLabel icon={ScanBarcode}>バーコードで入れる</IconLabel>
            </button>
          )}
          {/* 📚 家の本棚を撮って、まとめて入れる（検索を書き始めたら引っ込める・本のページを撮る道では出さない）。 */}
          {onShelfScan && !forPhoto && !hasQuery && !isSearching && (
            <button type="button" onClick={onShelfScan} style={btnGhost}>
              <IconLabel icon={Library}>本棚の写真から追加</IconLabel>
            </button>
          )}
        </div>

        {/* 0 件・エラーのときは、説明と「手動で入力する」を 1 まとまりに（次の操作が離れて浮かないように）。 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: (search.status === 'notfound' || search.status === 'error') ? 'var(--space-3)' : 'var(--space-6)' }}>
          <BookSearchStatus
            search={search}
            onRetry={() => runSearch()}
            onManual={openManual}
            onPick={handlePick}
            getExisting={getExisting}
          />

          {showManualLink && (
            // 何も打っていない間は「ほかのアプリから取り込む」も同じ行に（まとめて持ってきたい人が最初に開くのは「＋」・2026-11-26 全体の UX 監査）。
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 'var(--space-6)' }}>
              <button type="button" onClick={openManual} style={btnLink}>
                手動で入力する
              </button>
              {onImport && !forPhoto && !hasQuery && !isSearching && (
                <button type="button" onClick={onImport} style={btnLink}>
                  ほかのアプリから取り込む
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
