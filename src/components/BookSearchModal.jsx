// 本の検索（1 つの検索欄）と、その部品。
//
// App Store / Apple ブックの検索と同じく、入力欄は 1 つだけ。書名・著者・ISBN の
// どれを入れても探せるよう、中で次の順に振り分ける:
//   1. ISBN（10 桁 / 13 桁。ハイフン・空白・全角数字も可）→ ISBN 検索（その本だけ）
//   2. サーバーの本の検索（/api/cover?search=・楽天の売上順 → Google → NDL・よく読まれている本・
//      書名がよく合う本が先・表紙つき・2026-10-02・docs/book-search.md）
//   3. サーバーが失敗したときだけ、端末だけの詳細検索（searchBooksAdvanced・NDL）: 書名として検索 →
//      0 件なら著者として → 語が 2 つ以上なら「書名 著者」「著者 書名」の組み合わせ。結果はサーバーと
//      同じ並べ方（rankLocalResults）に並べ直す（NDL は読みの辞書順で返すため）。
//
// ここにある部品（useBookQuerySearch / BookSearchField / BookResultList /
// BookResultSkeleton）は AddBookModal（本を追加）でも使う。AddBookModal は遅延読み込み
// なので、共通部品は常に読み込まれているこのファイル側に置く。
//
// 既定の export（BookSearchModal）は本の編集画面（WantPhase）の「検索して追加」から
// App.jsx の Modal の中に出す検索ダイアログ。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X, Check, ChevronRight, SearchX } from 'lucide-react';
import { toMessage } from '../lib/errors';
import { searchBooksAdvanced, searchBooksOnServer, rankLocalResults } from '../lib/bookSearch';
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

  // サーバーの検索（失敗・0 件のときだけ下の端末だけの検索へ）。
  const server = await searchBooksOnServer(q, { signal });
  if (server.ok && server.results.length > 0) return { ok: true, results: server.results };

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
    if (merged.length > 0) return { ok: true, results: rankLocalResults(q, merged) };
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
  const [query, setQuery] = useState('');
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
    setQuery(normalizeBookQuery(raw));

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

  return { status, results, error, query, run };
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
          <X size={18} aria-hidden="true" />
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
// 検索結果の副題（書名に続けて・著者より弱く）。初日クイックスタートの行も同じ。
export const subtitleStyle = { fontWeight: 400, fontSize: 'var(--text-sub)', color: 'var(--text-3)' };

// 行の読み上げ: 書名＋副題・著者・出版社と年（見えているものをすべて）。追加済みの本も同じ形に状態を足す。
export function rowLabel(book, statusLabel = null) {
  const fullTitle = [book.title, book.subtitle].filter(Boolean).join(' ');
  const desc = [book.author, book.publisher, book.pubYear].filter(Boolean).join('、');
  const head = `『${fullTitle}』${desc ? `（${desc}）` : ''}`;
  return statusLabel ? `${head}追加済み（${statusLabel}）。開く` : `${head}を追加`;
}

function ResultRow({ book, existing, onPick, divider }) {
  const statusLabel = existing ? (existing.statusLabel || '本棚') : '';
  const meta = [book.publisher, book.pubYear].filter(Boolean).join(' · ');
  return (
    <li style={divider ? { borderTop: '1px solid var(--separator)' } : undefined}>
      <button
        type="button"
        onClick={() => onPick(book, existing ? { isExisting: true, existing: existing.book } : {})}
        aria-label={rowLabel(book, existing ? statusLabel : null)}
        style={rowStyle}
      >
        {/* 追加済みの本は本棚の表紙（取り直し・手動の表紙を含む）をそのまま出し、本棚と見た目をそろえる。 */}
        <MiniCover
          book={existing?.book
            ? { id: existing.book.id, title: existing.book.title || book.title, cover: existing.book.cover }
            : { id: bookKey(book), title: book.title, cover: book.cover }}
          width={44}
        />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span
            style={{
              fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3, color: 'var(--text)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {book.title}
            {/* 副題は同じ 2 行の中に、著者より弱く（小さく・細く・薄く。同じ書名の本を見分ける・2026-10-02） */}
            {book.subtitle && (
              <span style={subtitleStyle}>{` ${book.subtitle}`}</span>
            )}
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
// 多いときの案内（語が 1 つで 10 冊以上・ISBN でないとき）。
const NARROW_HINT_MIN = 10;
export function narrowHintFor(query, count) {
  const q = normalizeBookQuery(query);
  if (!q || isbnFromQuery(q) || q.includes(' ')) return '';
  return count >= NARROW_HINT_MIN ? '著者名も入れると絞り込めます' : '';
}

export function BookResultList({ results, onPick, getExisting, query = '' }) {
  const hint = narrowHintFor(query, results.length);
  const [count, setCount] = useState(INITIAL_DISPLAY);
  useEffect(() => { setCount(INITIAL_DISPLAY); }, [results]);

  const limit = Math.min(results.length, MAX_DISPLAY);
  const visible = results.slice(0, Math.min(count, limit));
  const remaining = limit - visible.length;

  return (
    <section aria-label="検索結果" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>
        {results.length} 冊
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
      {/* 絞り込みの案内は、一覧を最後まで見たあとだけ（件数の行には足さない・2026-10-02 ui-critic）。 */}
      {remaining === 0 && (hint || results.length > MAX_DISPLAY) && (
        <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)', textAlign: 'center' }}>
          著者名も入れると絞り込めます
        </p>
      )}
    </section>
  );
}

const skeletonInline = { display: 'inline-block', verticalAlign: 'middle' };
// 和文の行の高さ（和文の書体の上下の幅）を本物の行とそろえるための、見えない全角スペース 1 字。
const CJK_STRUT = <span style={{ visibility: 'hidden', marginInlineEnd: '-1em' }}>{'\u3000'}</span>;
// 読み込み中: 結果の一覧と同じ形のスケルトン（「N 冊」の行＋結果 1 行ぶん）。
// 1 行だけにするのは、結果が 1 件のときに下の「手動で入力する」が
// 押し下げられてから引き戻される（跳ねる）のを防ぐため（2026-09-29）。
export function BookResultSkeleton({ rows = 1 }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'transparent' }}>
        <SkeletonBlock width={40} height={12} radius="var(--radius-full)" style={skeletonInline} />
      </p>
      <BookResultSkeletonRows rows={rows} />
    </div>
  );
}
function BookResultSkeletonRows({ rows }) {
  return (
    <div style={listStyle}>
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
          {/* 文字の行は結果の行（ResultRow＝button の中なので行間は normal）と同じ大きさ・行間の箱に棒を置く（行の高さを本物とそろえる）。 */}
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', lineHeight: 'normal' }}>
            <span style={{ fontSize: 'var(--text-body)', lineHeight: 1.3 }}><SkeletonBlock width="80%" height={16} radius="var(--radius-full)" style={skeletonInline} />{CJK_STRUT}</span>
            <span style={{ fontSize: 'var(--text-sub)' }}><SkeletonBlock width="45%" height={12} radius="var(--radius-full)" style={skeletonInline} />{CJK_STRUT}</span>
            <span style={{ fontSize: 'var(--text-meta)' }}><SkeletonBlock width="30%" height={12} radius="var(--radius-full)" style={skeletonInline} />{CJK_STRUT}</span>
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
          actions={onManual ? [] : [{ label: 'もう一度', onClick: onRetry, variant: 'secondary' }]}
        />
      )}

      {/* 下の「手動で入力する」との間を詰める（空状態の下の大きな余白を取らない・2026-09-29）。 */}
      {status === 'notfound' && (
        <div className="empty-state--flush-bottom">
          <EmptyState
            icon={<SearchX size={28} aria-hidden="true" />}
            title="見つかりませんでした"
            description="書名を短くするか、ISBN で探してください"
            actions={[]}
          />
        </div>
      )}

      {status === 'results' && (
        <BookResultList results={results} onPick={onPick} getExisting={getExisting} query={search.query} />
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
