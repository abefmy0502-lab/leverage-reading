// 🔍 本を検索して追加するモーダル（タイトル/著者/ISBN の 3 入力・詳細検索）。
// App.jsx から切り出した自己完結コンポーネント（props のみ・App の state に非依存）。

import { useEffect, useMemo, useState } from 'react';
import { toMessage } from '../lib/errors';
import { Search as IcSearch, Plus as IcPlus, Lightbulb as IcBulb, X as IcClose } from 'lucide-react';
import { searchBooksAdvanced as searchBooksAPIAdvanced, pickSuggestions } from '../lib/bookSearch';
import { ensureHttps } from '../lib/url';
import { LIMITS } from '../lib/limits';
import { inp, btnS, Dots } from './formPrimitives';
import ErrorMessage from './ErrorMessage';

const closeBtn = { background: 'none', border: 'none', fontSize: 20, color: 'var(--color-tertiary)', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 10 };

function BookResultCard({ book, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(book)}
      aria-label={`『${book.title}』を選択`}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--c-hairline)',
        background: 'var(--c-card)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        width: '100%',
      }}
    >
      {book.cover ? (
        <img
          src={ensureHttps(book.cover)}
          alt=""
          style={{ width: 44, height: 60, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--c-hairline-strong)' }}
        />
      ) : (
        <div style={{ width: 44, height: 60, background: '#e8e2d6', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📕</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', lineHeight: 1.4, marginBottom: 2 }}>{book.title}</div>
        {book.author && <div style={{ fontSize: 11, color: 'var(--c-ink-2)' }}>✍️ {book.author}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {book.publisher && <span style={{ fontSize: 10, color: 'var(--c-ink-2)' }}>🏢 {book.publisher}</span>}
          {book.pubYear && <span style={{ fontSize: 10, color: 'var(--c-ink-2)' }}>📅 {book.pubYear}</span>}
        </div>
        {book.isbn && <div style={{ fontSize: 10, color: 'var(--c-ink-3)', marginTop: 3 }}>🔢 ISBN: {book.isbn}</div>}
      </div>
      <span style={{ fontSize: 11, color: 'var(--c-brand)', alignSelf: 'center', whiteSpace: 'nowrap', padding: '4px 8px', border: '1px solid var(--c-hairline-strong)', borderRadius: 6 }}>
        <IcPlus size={12} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />これを追加
      </span>
    </button>
  );
}

export default function BookSearchModal({ onSelect, onClose, initialQuery = '', initialAuthor = '', initialIsbn = '' }) {
  // 3 inputs always visible. Phase 5: 簡素化方針により simple/advanced
  // タブを廃止し、最初から詳細検索 (title + author + isbn) を 1 画面で。
  const [advTitle, setAdvTitle] = useState(initialQuery);
  const [advAuthor, setAdvAuthor] = useState(initialAuthor);
  const [advIsbn, setAdvIsbn] = useState(initialIsbn);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);
  const [lastQuery, setLastQuery] = useState('');
  const [cached, setCached] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');

  const runSearch = async (override) => {
    const t = (override?.title ?? advTitle).trim();
    const a = (override?.author ?? advAuthor).trim();
    const i = (override?.isbn ?? advIsbn).trim();
    if (!t && !a && !i) {
      setError('タイトル・著者・ISBN のいずれかを入力してください。');
      return;
    }
    setSearching(true); setNotFound(false); setError(null); setResults([]); setCached(false);
    setLastQuery([t, a, i].filter(Boolean).join(' / '));
    const res = await searchBooksAPIAdvanced({ title: t, author: a, isbn: i });
    if (!res.ok) {
      // 生のエラー文字列を将来混入させない — AddBookModal と同じく humanize して表示。
      setError(toMessage(res.error, '検索でエラーが発生しました。少し時間をおいて再度お試しください。'));
    } else if (res.results.length === 0) {
      setNotFound(true);
    } else {
      setResults(res.results);
      if (res.cached) setCached(true);
    }
    setSearching(false);
  };

  // Auto-search if seeded from AddBookModal (any of title / author / isbn).
  useEffect(() => {
    if (initialQuery?.trim() || initialAuthor?.trim() || initialIsbn?.trim()) {
      runSearch({ title: initialQuery, author: initialAuthor, isbn: initialIsbn });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => runSearch();
  const hasAnyInput = advTitle.trim() || advAuthor.trim() || advIsbn.trim();

  // Apply sort over a stable copy. Empty pubYear sorts to the bottom.
  const sortedResults = useMemo(() => {
    if (!results.length) return results;
    const arr = [...results];
    if (sortBy === 'year-desc') {
      arr.sort((a, b) => {
        const ay = parseInt(a.pubYear || '0', 10);
        const by = parseInt(b.pubYear || '0', 10);
        return by - ay;
      });
    } else if (sortBy === 'title') {
      arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
    }
    return arr;
  }, [results, sortBy]);

  const suggestions = useMemo(() => {
    // Only surface the suggest section if there's enough noise to wade
    // through. Below that, the regular list already serves as the answer.
    if (results.length < 5) return [];
    return pickSuggestions(results, 3);
  }, [results]);

  const tooMany = results.length >= 20;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--c-ink)' }}>
          <IcSearch size={16} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
          本を検索
        </h3>
        <button onClick={onClose} style={closeBtn} aria-label="閉じる"><IcClose size={20} aria-hidden="true" /></button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label htmlFor="adv-title" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-secondary)', display: 'block', marginBottom: 4 }}>タイトル</label>
          <input
            id="adv-title"
            value={advTitle}
            onChange={(e) => setAdvTitle(e.target.value)}
            placeholder="例：レバレッジ・リーディング"
            style={inp}
            maxLength={LIMITS.bookTitle}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); runSearch(); } }}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="adv-author" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-secondary)', display: 'block', marginBottom: 4 }}>
            著者 <span style={{ fontWeight: 400, color: 'var(--color-tertiary)' }}>（任意）</span>
          </label>
          <input
            id="adv-author"
            value={advAuthor}
            onChange={(e) => setAdvAuthor(e.target.value)}
            placeholder="例：山田 太郎"
            style={inp}
            maxLength={LIMITS.bookAuthor}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); runSearch(); } }}
          />
        </div>
        <div>
          <label htmlFor="adv-isbn" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-secondary)', display: 'block', marginBottom: 4 }}>
            ISBN <span style={{ fontWeight: 400, color: 'var(--color-tertiary)' }}>（任意）</span>
          </label>
          <input
            id="adv-isbn"
            value={advIsbn}
            onChange={(e) => setAdvIsbn(e.target.value)}
            placeholder="978-4-7631-9742-3"
            style={inp}
            inputMode="numeric"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); runSearch(); } }}
          />
        </div>
        <button
          type="button"
          onClick={() => runSearch()}
          disabled={searching || !hasAnyInput}
          style={{
            ...btnS,
            padding: '12px 14px',
            fontSize: 14,
            minHeight: 44,
            opacity: searching || !hasAnyInput ? 0.5 : 1,
          }}
        >
          🔍 検索
        </button>
      </div>

      {searching && <Dots />}

      {error && !searching && (
        <ErrorMessage
          icon="⚠️"
          title="検索でエラーが発生しました"
          description={error}
          actions={[{ label: '↻ もう一度試す', onClick: retry, variant: 'primary' }]}
          hint="ネット接続が不安定な時は、少し時間をおいてからお試しください 🙏"
        />
      )}

      {notFound && !searching && (
        <div style={{ textAlign: 'center', padding: 18 }}>
          <p style={{ fontSize: 13, color: 'var(--color-secondary)', margin: 0, lineHeight: 1.7 }}>
            「{lastQuery}」に一致する本が見つかりません
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: '6px 0 0' }}>
            別のキーワードでお試しください
          </p>
        </div>
      )}

      {results.length > 0 && cached && (
        <p style={{ fontSize: 10, color: 'var(--color-tertiary)', margin: '0 2px', fontStyle: 'italic' }}>
          ⚡ キャッシュから即時表示
        </p>
      )}

      {tooMany && !searching && (
        <p style={{ fontSize: 11, color: 'var(--color-tertiary)', margin: 0, padding: '0 4px' }}>
          💡 結果 {results.length} 件 — 著者や ISBN を入れると絞り込めます
        </p>
      )}

      {suggestions.length > 0 && !searching && (
        <div style={{ background: 'var(--c-soft)', border: '1px solid var(--c-hairline)', borderRadius: 10, padding: '10px 12px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-brand)', margin: '0 0 6px' }}>
            <IcBulb size={12} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
            もしかしてこの本？
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {suggestions.map((b, i) => (
              <BookResultCard key={`sug-${i}`} book={b} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: 0 }}>{results.length} 件ヒット</p>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ ...inp, width: 'auto', padding: '6px 8px' }}
              aria-label="並び順"
            >
              <option value="relevance">関連度順</option>
              <option value="year-desc">出版年が新しい順</option>
              <option value="title">タイトル順</option>
            </select>
          </div>
          <div className="list-item-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {sortedResults.map((b, i) => (
              <div key={`r-${i}`} className="list-item-enter">
                <BookResultCard book={b} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
