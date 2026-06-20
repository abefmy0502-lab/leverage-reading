// 📚 AddBookModal — 全画面シート式の本追加 UI（検索 + 結果 + 手動入力切替を 1 画面で完結）。
//
// シンプル化第 2 弾: 旧フローは AddBookModal → 「検索」ボタン → 別の
// BookSearchModal に遷移、という 2 段階だった。今回はそれを撤廃し、
// 同じモーダル内に 3 入力欄・検索ボタン・結果リスト・手動入力リンク
// すべてを収めて、画面遷移なしで完結させる。
//
// 状態マシン:
//   'idle'      : 初期。フォームのみ + 手動入力リンク
//   'searching' : 検索中（フォーム disabled、下にスピナー）
//   'results'   : 結果あり
//   'notfound'  : 結果 0 件
//   'error'     : 検索エラー（リトライ可能）

import { useEffect, useRef, useState } from 'react';
import { findDuplicateBook, STATUS_LABEL } from '../lib/checkDuplicate';
import { searchBooksAdvanced } from '../lib/bookSearch';
import { ensureHttps } from '../lib/url';
import { LIMITS } from '../lib/limits';

// 表示件数のページング基準。最初は 20、「もっと見る」で +10 ずつ増やし、
// API 負荷とユーザビリティの観点から 50 で打ち止め。
const INITIAL_DISPLAY = 20;
const DISPLAY_STEP = 10;
const MAX_DISPLAY = 50;

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: 'var(--color-bg, #f5f0e8)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'Noto Serif JP', Georgia, serif",
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

const headerStyle = {
  padding: 'var(--space-3) var(--space-4)',
  borderBottom: '1px solid var(--color-separator)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  background: 'var(--color-surface)',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const closeBtn = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: 'var(--color-secondary)',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
};

const bodyStyle = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: 'var(--space-5) var(--space-4) var(--space-8)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-secondary)',
  display: 'block',
  marginBottom: 6,
};

const inpStyle = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 16,
  border: '1px solid var(--color-separator)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  outline: 'none',
  color: 'var(--color-label)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const searchBtnStyle = {
  width: '100%',
  padding: '14px 0',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--color-accent-strong)',
  color: 'var(--color-text-inverse)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: 0.5,
  minHeight: 48,
};

const dividerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  color: 'var(--color-tertiary)',
  fontSize: 11,
  margin: 'var(--space-4) 0 var(--space-2)',
};
const dividerLine = { flex: 1, height: 1, background: 'var(--color-separator)' };

const manualBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '12px 16px',
  border: '1px solid var(--color-separator)',
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  color: 'var(--color-secondary)',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
  minHeight: 44,
};

const resultCardStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-separator)',
  background: 'var(--color-surface)',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  width: '100%',
};

function ResultCard({ book, onPick, existing, statusLabel }) {
  // 既に本棚にある本は「✅ 追加済み」バッジを表示し、タップで既存本へ遷移する
  // ように onPick(existing, { isExisting: true }) を呼ぶ。
  const isExisting = !!existing;
  return (
    <button
      type="button"
      onClick={() => onPick(book, { isExisting, existing })}
      aria-label={isExisting ? `『${book.title}』 (既に本棚にあり、開く)` : `『${book.title}』を選択`}
      style={{
        ...resultCardStyle,
        ...(isExisting ? { background: '#f0ebe2', borderColor: '#b9d4a3' } : {}),
      }}
    >
      {book.cover ? (
        <img
          src={ensureHttps(book.cover)}
          alt=""
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ width: 44, height: 60, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--color-separator)', opacity: isExisting ? 0.7 : 1 }}
        />
      ) : (
        <div style={{ width: 44, height: 60, background: 'var(--color-bg-hover)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📕</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-label)', lineHeight: 1.4, marginBottom: 2 }}>{book.title}</div>
        {book.author && <div style={{ fontSize: 11, color: 'var(--color-secondary)' }}>✍️ {book.author}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {book.publisher && <span style={{ fontSize: 10, color: 'var(--color-tertiary)' }}>🏢 {book.publisher}</span>}
          {book.pubYear && <span style={{ fontSize: 10, color: 'var(--color-tertiary)' }}>📅 {book.pubYear}</span>}
        </div>
        {book.isbn && <div style={{ fontSize: 10, color: 'var(--color-tertiary)', marginTop: 3 }}>🔢 {book.isbn}</div>}
        {isExisting && (
          <div
            style={{
              marginTop: 6,
              display: 'inline-block',
              padding: '3px 8px',
              borderRadius: 999,
              background: '#eaf5e3',
              border: '1px solid #b9d4a3',
              color: '#4a6e3a',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            ✅ 追加済み（{statusLabel || '本棚'}）— タップで開く
          </div>
        )}
      </div>
    </button>
  );
}

function Spinner({ message = '検索中…' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 0', color: 'var(--color-tertiary)' }}>
      <div
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          border: '2px solid var(--color-separator)',
          borderTopColor: 'var(--color-accent-strong)',
          borderRadius: '50%',
          animation: 'lvg-ptr-spin 0.8s linear infinite',
        }}
      />
      <span style={{ fontSize: 12 }}>{message}</span>
    </div>
  );
}

export default function AddBookModal({ onClose, onSelect, onManual, existingBooks = [], onOpenExisting }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [state, setState] = useState('idle'); // 'idle' | 'searching' | 'results' | 'notfound' | 'error'
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY);
  // 直近の検索 AbortController を保持。新しい検索 / モーダル close 時に
  // 既存リクエストを中断して、後着の応答が state を上書きする race を防ぐ。
  const abortRef = useRef(null);
  useEffect(() => () => { try { abortRef.current?.abort(); } catch { /* ignore */ } }, []);

  const hasInput = !!(title.trim() || author.trim() || isbn.trim());
  const isSearching = state === 'searching';

  // 検索中でも閉じられるように、close 時は進行中の検索を中断してから閉じる
  // (× が disabled で逃げ場が無い問題の解消)。
  const handleClose = () => {
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    onClose?.();
  };

  const runSearch = async () => {
    if (!hasInput) return;
    // 直前の検索があれば中断 — 連続検索で後着の結果が state を上書きして
    // 「画面が固まる」現象を起こすのを防ぐ最大の対策。
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState('searching');
    setError(null);
    setResults([]);
    setDisplayCount(INITIAL_DISPLAY);

    let res;
    try {
      res = await searchBooksAdvanced(
        { title: title.trim(), author: author.trim(), isbn: isbn.trim() },
        { signal: ctrl.signal },
      );
    } catch (e) {
      // abort で投げられた AbortError は最新の検索が支配しているので、
      // 古いハンドラはここで早期 return する。state は触らない。
      if (e?.name === 'AbortError' || ctrl.signal.aborted) return;
      setError('検索でエラーが発生しました。');
      setState('error');
      return;
    }

    // 自分が aborted されている = 後続の検索が始まっている = state を上書きしない
    if (ctrl.signal.aborted) return;

    if (!res.ok) {
      setError(res.error || '検索でエラーが発生しました。');
      setState('error');
      return;
    }
    if (!res.results || res.results.length === 0) {
      setState('notfound');
      return;
    }
    setResults(res.results);
    setState('results');
  };

  const onEnter = (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      runSearch();
    }
  };

  const handlePick = (book, opts = {}) => {
    // 既に本棚にある本は追加せず、親に既存本を開かせる。
    if (opts.isExisting && opts.existing) {
      onOpenExisting?.(opts.existing);
      return;
    }
    onSelect?.(book);
  };

  // 表示件数 = min(displayCount, results.length, MAX_DISPLAY)
  const visibleCount = Math.min(displayCount, results.length, MAX_DISPLAY);
  const visibleResults = results.slice(0, visibleCount);
  // 「もっと見る」が押せるのは: ロード済み結果が残っていて、かつ 50 上限未満。
  const canShowMore = visibleCount < Math.min(results.length, MAX_DISPLAY);
  const tooMany = results.length >= 20;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={headerStyle}>
        <h2 style={{ fontSize: 16, color: 'var(--color-label)', margin: 0, fontWeight: 600, flex: 1 }}>📚 本を追加</h2>
        <button type="button" onClick={handleClose} style={closeBtn} aria-label="閉じる">×</button>
      </div>

      <div style={bodyStyle}>
        <p style={{ fontSize: 12, color: 'var(--color-secondary)', margin: 0, lineHeight: 1.7 }}>
          ISBN（本の裏のバーコード番号）・書名・著者で検索できます
        </p>
        {/* === Form (常に上部に表示) === */}
        <div>
          <label htmlFor="add-book-title" style={labelStyle}>タイトル</label>
          <input
            id="add-book-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onEnter}
            placeholder="例：レバレッジ・リーディング"
            style={inpStyle}
            maxLength={LIMITS.bookTitle}
            disabled={isSearching}
          />
        </div>
        <div>
          <label htmlFor="add-book-author" style={labelStyle}>
            著者 <span style={{ fontWeight: 400, color: 'var(--color-tertiary)' }}>（任意）</span>
          </label>
          <input
            id="add-book-author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            onKeyDown={onEnter}
            placeholder="例：本田 直之"
            style={inpStyle}
            maxLength={LIMITS.bookAuthor}
            disabled={isSearching}
          />
        </div>
        <div>
          <label htmlFor="add-book-isbn" style={labelStyle}>
            ISBN <span style={{ fontWeight: 400, color: 'var(--color-tertiary)' }}>（任意）</span>
          </label>
          <input
            id="add-book-isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            onKeyDown={onEnter}
            placeholder="978-4-7631-9742-3"
            style={inpStyle}
            inputMode="numeric"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={isSearching}
          />
        </div>

        <button
          type="button"
          onClick={runSearch}
          disabled={!hasInput || isSearching}
          style={{ ...searchBtnStyle, opacity: !hasInput || isSearching ? 0.5 : 1 }}
        >
          {isSearching ? '検索中…' : '🔍 検索'}
        </button>

        {/* === 結果エリア (状態に応じて切替) === */}

        {state === 'idle' && (
          <>
            <div style={dividerStyle}>
              <div style={dividerLine} />
              <span>または</span>
              <div style={dividerLine} />
            </div>
            <button type="button" onClick={onManual} style={manualBtnStyle}>
              📝 検索でヒットしない場合は手動入力
            </button>
          </>
        )}

        {isSearching && <Spinner />}

        {state === 'error' && (
          <div style={{ background: 'var(--color-error-soft)', border: '1px solid var(--color-error)', borderLeft: '4px solid var(--color-error)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <p style={{ fontSize: 14, color: 'var(--color-label)', margin: 0, fontWeight: 600 }}>⚠️ 検索でエラーが発生しました</p>
            <p style={{ fontSize: 12, color: 'var(--color-secondary)', margin: '6px 0 10px', lineHeight: 1.7 }}>{error}</p>
            <button
              type="button"
              onClick={runSearch}
              style={{
                padding: '8px 14px', borderRadius: 'var(--radius-md)', border: 'none',
                background: 'var(--color-accent-strong)', color: 'var(--color-text-inverse)',
                fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
              }}
            >
              ↻ もう一度試す
            </button>
          </div>
        )}

        {state === 'notfound' && (
          <div style={{ textAlign: 'center', padding: 'var(--space-5)' }}>
            <p style={{ fontSize: 13, color: 'var(--color-secondary)', margin: 0, lineHeight: 1.7 }}>
              見つかりませんでした
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: '6px 0 14px', lineHeight: 1.7 }}>
              書名を変えて再検索するか、ISBN（本の裏のバーコード番号）で検索してみてください。
            </p>
            <button type="button" onClick={onManual} style={manualBtnStyle}>
              📝 このまま手動で追加する
            </button>
          </div>
        )}

        {state === 'results' && (
          <>
            <p style={{ fontSize: 12, color: 'var(--color-secondary)', margin: 0, fontWeight: 500 }}>
              {results.length} 件中 {visibleCount} 件を表示
            </p>
            {tooMany && (
              <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: 0 }}>
                💡 著者や ISBN を追加で絞り込めます
              </p>
            )}
            <div className="list-item-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibleResults.map((b, i) => {
                // ISBN がある時は ISBN ベース、無い時は title+index で衝突回避。
                // 連続検索後に key が前回と被ると React の reconcile が崩れるバグを防ぐ。
                const existing = findDuplicateBook(existingBooks, b);
                const statusLabel = existing ? (STATUS_LABEL[existing.status] || '本棚') : null;
                return (
                  <div key={`r-${b.isbn || `${b.title}-${i}`}`} className="list-item-enter">
                    <ResultCard book={b} onPick={handlePick} existing={existing} statusLabel={statusLabel} />
                  </div>
                );
              })}
            </div>
            {canShowMore && (
              <button
                type="button"
                onClick={() => setDisplayCount((n) => Math.min(n + DISPLAY_STEP, MAX_DISPLAY, results.length))}
                aria-label={`さらに ${Math.min(DISPLAY_STEP, results.length - visibleCount, MAX_DISPLAY - visibleCount)} 件表示`}
                style={{
                  ...manualBtnStyle,
                  background: 'var(--color-accent-soft)',
                  border: '1px solid var(--color-separator)',
                  color: 'var(--color-accent-strong)',
                  fontWeight: 600,
                }}
              >
                ↓ もっと見る（あと {Math.min(DISPLAY_STEP, results.length - visibleCount, MAX_DISPLAY - visibleCount)} 件）
              </button>
            )}
            {!canShowMore && results.length > MAX_DISPLAY && (
              <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: 0, textAlign: 'center' }}>
                これ以上は表示しません。著者や ISBN を追加して絞り込めます。
              </p>
            )}
            <button
              type="button"
              onClick={onManual}
              style={{ ...manualBtnStyle, marginTop: 'var(--space-3)' }}
            >
              📝 該当が無ければ手動入力
            </button>
          </>
        )}
      </div>
    </div>
  );
}
