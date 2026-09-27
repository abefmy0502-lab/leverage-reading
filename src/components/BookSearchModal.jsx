// 本の検索（1 つの検索欄）と、その部品。
//
// App Store / Apple ブックの検索と同じく、入力欄は 1 つだけ。書名・著者・ISBN の
// どれを入れても探せるよう、中で次の順に既存の詳細検索（searchBooksAdvanced）へ振り分ける:
//   1. ISBN（10 桁 / 13 桁。ハイフン・空白・全角数字も可）→ ISBN 検索
//   2. 書名として検索 → 0 件なら著者として検索
//   3. それでも 0 件で語が 2 つ以上なら「書名 著者」「著者 書名」の組み合わせで検索
// 見つかった時点で止めるので、よくある書名検索は 1 回の問い合わせで済む。
//
// ここにある部品（useBookQuerySearch / BookSearchField / BookResultList /
// BookResultSkeleton）は AddBookModal（本を追加）でも使う。AddBookModal は遅延読み込み
// なので、共通部品は常に読み込まれているこのファイル側に置く。
//
// 既定の export（BookSearchModal）は本の編集画面（WantPhase）の「検索して追加」から
// App.jsx の Modal の中に出す検索ダイアログ。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, CircleX, Check, ChevronRight, SearchX } from 'lucide-react';
import { toMessage } from '../lib/errors';
import { searchBooksAdvanced } from '../lib/bookSearch';
import { LIMITS } from '../lib/limits';
import { btnPrimary, btnGhost, input } from '../styles/ui';
import { MiniCover } from './BookCards';
import { SkeletonBlock } from './Skeleton';
import EmptyState from './EmptyState';
import ErrorMessage from './ErrorMessage';

// 表示件数: 最初は 20、「さらに表示」で +10、50 で打ち止め（API 負荷と見やすさの釣り合い）。
const INITIAL_DISPLAY = 20;
const DISPLAY_STEP = 10;
const MAX_DISPLAY = 50;

const SEARCH_FALLBACK_ERROR = '通信環境を確認して、もう一度お試しください。';

// ---------------------------------------------------------------------------
// 検索の振り分け
// ---------------------------------------------------------------------------

// 全角→半角・前後の空白を整える。
export function normalizeBookQuery(raw) {
  return String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

// ISBN として読めるなら、ハイフン・空白を除いた ISBN を返す（読めなければ ''）。
export function isbnFromQuery(raw) {
  const compact = normalizeBookQuery(raw).replace(/[-\s]/g, '').toUpperCase();
  return /^(\d{13}|\d{9}[\dX])$/.test(compact) ? compact : '';
}

// 手動入力へ引き継ぐ値（ISBN なら ISBN 欄、それ以外は書名欄へ）。
export function manualSeedFromQuery(raw) {
  const isbn = isbnFromQuery(raw);
  if (isbn) return { title: '', author: '', isbn };
  return { title: normalizeBookQuery(raw), author: '', isbn: '' };
}

const bookKey = (b) => (b.isbn ? `i:${b.isbn}` : `t:${b.title}|${b.author || ''}`);

function mergeResults(lists) {
  const seen = new Set();
  const out = [];
  lists.forEach((list) => {
    (list || []).forEach((b) => {
      const k = bookKey(b);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(b);
    });
  });
  return out;
}

// 1 つの検索語で本を探す。戻り値は searchBooksAdvanced と同じ { ok, results, error }。
// AbortError はそのまま投げる（呼び出し側で「新しい検索に置き換わった」と判断する）。
export async function searchBooksByQuery(raw, { signal } = {}) {
  const q = normalizeBookQuery(raw);
  if (!q) return { ok: true, results: [] };

  const isbn = isbnFromQuery(q);
  if (isbn) return searchBooksAdvanced({ isbn }, { signal });

  const words = q.split(' ');
  const steps = [[{ title: q }], [{ author: q }]];
  if (words.length >= 2) {
    steps.push([
      { title: words.slice(0, -1).join(' '), author: words[words.length - 1] },
      { title: words.slice(1).join(' '), author: words[0] },
    ]);
  }

  let failed = null;
  for (const step of steps) {
    // eslint-disable-next-line no-await-in-loop
    const responses = await Promise.all(step.map((p) => searchBooksAdvanced(p, { signal })));
    const merged = mergeResults(responses.map((r) => (r.ok ? r.results : [])));
    if (merged.length > 0) return { ok: true, results: merged };
    failed = failed || responses.find((r) => !r.ok) || null;
  }
  // 途中で失敗した問い合わせがあるなら「0 件」とは言い切れないのでエラーとして返す。
  return failed || { ok: true, results: [] };
}

// 生のエラー文から、見出しと重なる前置き・先頭の絵文字を外す。
const errorDetail = (msg) =>
  String(msg || '')
    .replace(/^[\p{Extended_Pictographic}️\s]+/u, '')
    .replace(/^検索(でエラーが発生しました|エラーが発生しました|できませんでした)。?\s*/, '')
    .trim() || SEARCH_FALLBACK_ERROR;

// 検索の状態（'idle' | 'searching' | 'results' | 'notfound' | 'error'）を持つフック。
// 連続で検索したとき、古い問い合わせは中断して後着の結果で上書きしない。
export function useBookQuerySearch() {
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  useEffect(() => () => { try { abortRef.current?.abort(); } catch { /* ignore */ } }, []);

  const run = useCallback(async (raw) => {
    if (!normalizeBookQuery(raw)) return;
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus('searching');
    setError('');
    setResults([]);

    let res;
    try {
      res = await searchBooksByQuery(raw, { signal: ctrl.signal });
    } catch (e) {
      if (e?.name === 'AbortError' || ctrl.signal.aborted) return;
      setError(errorDetail(toMessage(e, SEARCH_FALLBACK_ERROR)));
      setStatus('error');
      return;
    }
    if (ctrl.signal.aborted) return;
    if (!res.ok) {
      setError(errorDetail(toMessage(res.error, SEARCH_FALLBACK_ERROR)));
      setStatus('error');
      return;
    }
    if (!res.results || res.results.length === 0) {
      setStatus('notfound');
      return;
    }
    setResults(res.results);
    setStatus('results');
  }, []);

  return { status, results, error, run };
}

// ---------------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------------

// 検索欄（虫めがね＋入力＋消すボタン）。Enter は変換中を除いて onSubmit。
// 案内文（placeholder）は全体の ::placeholder（--text-3・4.5:1）のまま薄めない。
export function BookSearchField({ id, value, onChange, onSubmit, inputRef, autoFocus = false }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <Search
        size={20}
        aria-hidden="true"
        style={{ position: 'absolute', left: 'var(--space-4)', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}
      />
      <input
        id={id}
        ref={inputRef}
        type="text"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="書名・著者・ISBN"
        placeholder="書名・著者・ISBN"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
        }}
        maxLength={LIMITS.bookTitle}
        autoFocus={autoFocus}
        style={{
          ...input,
          outline: 'none',
          paddingLeft: 'var(--space-12)',
          paddingRight: value ? 'var(--space-12)' : 'var(--space-4)',
          // DESIGN §5: 入力中の枠はアクセント
          // border の一括指定と borderColor を混ぜると React が警告するので、枠は丸ごと差し替える
          ...(focused ? { border: '1px solid var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' } : {}),
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            inputRef?.current?.focus();
          }}
          aria-label="入力を消す"
          style={{
            position: 'absolute', top: 0, right: 0, width: 48, height: 48,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: 'var(--text-3)',
          }}
        >
          <CircleX size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// 検索ボタン（1 画面 1 つの主ボタン）。見た目は常に主ボタンのまま（DESIGN §7 の「相談する」と
// 同じ作法）: 空欄で押したら検索欄へ戻し、検索中は「検索中…」にして二重に走らせない。
export function SearchButton({ empty, searching, onSearch, onEmpty }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (searching) return;
        if (empty) onEmpty?.();
        else onSearch();
      }}
      aria-busy={searching || undefined}
      style={{ ...btnPrimary, ...(searching ? { cursor: 'progress' } : {}) }}
    >
      {searching ? '検索中…' : '検索'}
    </button>
  );
}

const listStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  width: '100%',
  minHeight: 44,
  padding: 'var(--space-3) var(--space-4)',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  fontFamily: 'inherit',
  color: 'var(--text)',
  cursor: 'pointer',
};

const oneLine = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function ResultRow({ book, existing, onPick, divider }) {
  const statusLabel = existing ? (existing.statusLabel || '本棚') : '';
  const meta = [book.publisher, book.pubYear].filter(Boolean).join('・');
  return (
    <li style={divider ? { borderTop: '1px solid var(--separator)' } : undefined}>
      <button
        type="button"
        onClick={() => onPick(book, existing ? { isExisting: true, existing: existing.book } : {})}
        aria-label={existing ? `『${book.title}』追加済み（${statusLabel}）。開く` : `『${book.title}』を追加`}
        style={rowStyle}
      >
        <MiniCover book={{ id: bookKey(book), title: book.title, cover: book.cover }} width={44} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span
            style={{
              fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3, color: 'var(--text)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {book.title}
          </span>
          {book.author && (
            <span style={{ ...oneLine, fontSize: 'var(--text-sub)', color: 'var(--text-2)' }}>{book.author}</span>
          )}
          {existing ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>
              <Check size={14} aria-hidden="true" />
              追加済み・{statusLabel}
            </span>
          ) : meta ? (
            <span style={{ ...oneLine, fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>{meta}</span>
          ) : null}
        </span>
        <ChevronRight size={20} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-3)' }} />
      </button>
    </li>
  );
}

// 検索結果の一覧（1 枚のカードに行を並べる・行の間は区切り線）。
// getExisting(book) が { book, statusLabel } を返すと「追加済み」として表示し、
// 押すと onPick(book, { isExisting: true, existing }) を呼ぶ。
export function BookResultList({ results, onPick, getExisting }) {
  const [count, setCount] = useState(INITIAL_DISPLAY);
  useEffect(() => { setCount(INITIAL_DISPLAY); }, [results]);

  const limit = Math.min(results.length, MAX_DISPLAY);
  const visible = results.slice(0, Math.min(count, limit));
  const remaining = limit - visible.length;

  return (
    <section aria-label="検索結果" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>
        {results.length} 件
      </p>
      <ul className="list-item-stagger" style={listStyle}>
        {visible.map((b, i) => (
          <ResultRow
            key={`${bookKey(b)}-${i}`}
            book={b}
            existing={getExisting ? getExisting(b) : null}
            onPick={onPick}
            divider={i > 0}
          />
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setCount((n) => Math.min(n + DISPLAY_STEP, limit))}
          style={btnGhost}
        >
          さらに表示
        </button>
      )}
      {remaining === 0 && results.length > MAX_DISPLAY && (
        <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)', textAlign: 'center' }}>
          語を足すと絞り込めます
        </p>
      )}
    </section>
  );
}

// 読み込み中: 結果の行と同じ形のスケルトン。
export function BookResultSkeleton({ rows = 3 }) {
  return (
    <div aria-hidden="true" style={listStyle}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            ...rowStyle,
            cursor: 'default',
            borderTop: i > 0 ? '1px solid var(--separator)' : 'none',
          }}
        >
          <SkeletonBlock width={44} height={62} radius={4} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <SkeletonBlock width="80%" height={16} radius="var(--radius-full)" />
            <SkeletonBlock width="45%" height={12} radius="var(--radius-full)" />
            <SkeletonBlock width="30%" height={12} radius="var(--radius-full)" />
          </span>
        </div>
      ))}
    </div>
  );
}

// 検索の結果エリア（読み込み中・エラー・0 件・結果）。
export function BookSearchStatus({ search, onRetry, onManual, onPick, getExisting }) {
  const { status, results, error } = search;
  return (
    // 何も無いとき（idle）は読み上げ用の領域だけ残し、並びの隙間（gap）に数えられないようにする。
    <div
      aria-live="polite"
      aria-busy={status === 'searching'}
      style={status === 'idle' ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden' } : undefined}
    >
      {status === 'searching' && <BookResultSkeleton />}

      {status === 'error' && (
        <ErrorMessage
          title="検索できませんでした"
          description={error}
          // やり直しは上の「検索」、手動入力は下の「手動で入力する」で 1 か所ずつ（同じ操作を 2 か所に出さない）。
          actions={onManual ? [] : [{ label: 'もう一度試す', onClick: onRetry, variant: 'secondary' }]}
        />
      )}

      {status === 'notfound' && (
        <EmptyState
          icon={<SearchX size={28} aria-hidden="true" />}
          title="見つかりませんでした"
          description="書名を短くするか、ISBN で探してください"
          actions={[]}
        />
      )}

      {status === 'results' && (
        <BookResultList results={results} onPick={onPick} getExisting={getExisting} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 本の編集画面から開く検索ダイアログ
// ---------------------------------------------------------------------------

export default function BookSearchModal({ onSelect, onClose, initialQuery = '', initialAuthor = '', initialIsbn = '' }) {
  const [query, setQuery] = useState(() => (
    (initialIsbn || '').trim() || [initialQuery, initialAuthor].map((s) => (s || '').trim()).filter(Boolean).join(' ')
  ));
  const inputRef = useRef(null);
  // シートのフォーカストラップ（親）は子より後に動いて「キャンセル」へ移すので、その後で検索欄へ戻す。
  useEffect(() => {
    const t = setTimeout(() => { try { inputRef.current?.focus(); } catch { /* ignore */ } }, 0);
    return () => clearTimeout(t);
  }, []);
  const search = useBookQuerySearch();
  const hasQuery = !!normalizeBookQuery(query);

  // 編集画面の書名などが入っていれば、開いた時点で検索する。
  useEffect(() => {
    if (hasQuery) search.run(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>本を検索</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', padding: 0, minWidth: 44, minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-body)', color: 'var(--text-2)' }}
          >
            キャンセル
          </button>
        </div>
        <BookSearchField
          id="book-search-query"
          value={query}
          onChange={setQuery}
          onSubmit={() => search.run(query)}
          inputRef={inputRef}
          autoFocus
        />
        <SearchButton
          empty={!hasQuery}
          searching={search.status === 'searching'}
          onSearch={() => search.run(query)}
          onEmpty={() => inputRef.current?.focus()}
        />
      </div>

      <BookSearchStatus
        search={search}
        onRetry={() => search.run(query)}
        onPick={(book) => onSelect(book)}
      />
    </div>
  );
}
