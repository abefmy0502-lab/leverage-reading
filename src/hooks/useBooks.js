import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';
import { LIMITS, clamp } from '../lib/limits';
import { isSchemaError } from '../lib/errors';
import { invalidateKnowledgeCache } from '../lib/ai';
import { readLocalTarget, writeLocalTarget, cleanTarget } from '../lib/readTarget';
import { writeLocalBrief, readLocalBrief } from '../lib/bookBrief';
import { captureBookReadingSessions, restoreBookReadingSessions } from '../lib/readingSessions';
import { planTaxonomyChange } from '../lib/bookFieldsAuto';
import { toHalfWidthAlnum } from '../lib/halfWidth';

// 数字の幅しか違わないなら、データベースの表記のまま（そうでなければ半角にして保存）。
export function keepDbSpelling(value, dbValue) {
  const half = toHalfWidthAlnum(value);
  if (dbValue && dbValue !== half && toHalfWidthAlnum(dbValue) === half) return dbValue;
  return half;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toHttps = (url) => {
  if (!url || typeof url !== 'string') return url;
  return url.startsWith('http://') ? 'https://' + url.slice(7) : url;
};

// ページ番号を「整数 or null」に正規化。NaN / 負 / 非有限 / 非現実的な巨大値
// (10 万ページ超) を弾く。0 は「未設定」として null に倒す。
const normalizePage = (v) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null;
  return n;
};

// 行動 (actions) も DB は snake_case、フロントは camelCase。
// supabase_actions_full.sql 未適用の DB では新カラムは undefined のまま。
const transformAction = (a) => ({
  ...a,
  priority: a.priority || 'medium',
  recurrence: a.recurrence || null,
  sourceMemoId: a.source_memo_id || null,
  sourcePage: a.source_page || null,
  reflection: a.reflection || '',
  completedAt: a.completed_at || null,
  notifyAt: a.notify_at || null,
  // 繰り返しタスクの先取り完了を防ぐため、表示開始日時 (scheduled_for)
  // を超えるまでクライアントは非表示にする
  // (supabase_actions_scheduled.sql)。未適用 DB では undefined → null。
  scheduledFor: a.scheduled_for || null,
});

// 本のリレーション select。フォルダ（book_collections）は任意機能なので、
// テーブル未作成（マイグレーション未適用）の DB では relation エラーになる。
// その場合は withCollections=false の素の select に段階縮退する。
const BOOK_SELECT_FULL = '*, book_tags(tag_name), book_collections(collection_name), actions(*)';
const BOOK_SELECT_BASE = '*, book_tags(tag_name), actions(*)';
// 汎用の schema-error 判定は lib/errors.js の isSchemaError（唯一の真実）に委譲。
// 加えて 'book_collections' の名指しも拾う — embed 失敗のエラー文言がテーブル名
// しか含まないケースに備えた、この select 固有の保険。
const isMissingRelationError = (err) => {
  const m = (err?.message || '').toLowerCase();
  return isSchemaError(err) || m.includes('book_collections');
};

// source_memo_id は UUID 列。非 UUID（合成ノートの 'leverage_memo-...' 等）を弾く。
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

const transformBook = (book) => ({
  ...book,
  // 🔢 書名・著者の全角の英数字は半角で見せる（「７つの習慣」→「7つの習慣」・次に保存したときに半角で残る・2026-11-25）。
  title: toHalfWidthAlnum(book.title),
  author: toHalfWidthAlnum(book.author),
  // データベースの表記（全角の数字のまま入っている本）。数字の幅しか違わなければ、保存ではこの表記のまま書く
  //   （「７つの習慣」と「7つの習慣」の 2 冊がある人で、同じ書名になって保存できなくなるのを防ぐ・2026-11-26 点検）。
  dbTitle: book.title || '',
  dbAuthor: book.author || '',
  cover: toHttps(book.cover),
  tags: (book.book_tags || []).map((t) => t.tag_name),
  collections: (book.book_collections || []).map((c) => c.collection_name),
  actions: [...(book.actions || [])]
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    .map(transformAction),
  startDate: book.start_date,
  doneDate: book.done_date,
  currentPage: book.current_page,
  totalPages: book.total_pages,
  investPurpose: book.invest_purpose,
  aiAnalysis: book.ai_analysis,
  aiStrategy: book.ai_strategy,
  leverageMemo: book.leverage_memo,
  aiSummary: book.ai_summary,
  roiSummary: book.roi_summary,
  // Default to 'search' for legacy rows that pre-date the column.
  addedVia: book.added_via || 'search',
  // ISBN/ASIN power Amazon Associate links (lib/amazonLink.js). They're
  // optional — links fall back to a title search when missing.
  isbn: book.isbn || '',
  asin: book.asin || '',
  // Multi-ISBN cover resolver で実際に表紙が取れた ISBN を記録する任意
  // カラム (supabase_books_cover_isbn.sql)。マイグレーション未適用の DB
  // では undefined のまま。
  coverIsbn: book.cover_isbn || '',
  // AI 選書から本を追加した時の元クエリ (supabase_books_source_query.sql)。
  // 読書計画シートの投資目的にプレフィルする。マイグレーション未適用の
  // DB では undefined のまま空文字に縮退。
  sourceQuery: book.source_query || '',
  // AI 選書アドバイザーの会話を構造化要約してプレフィルした 3 フィールド
  // (supabase_books_setup_fields.sql)。マイグレーション未適用 DB では空。
  // bookReason は読み取り専用で、ユーザー編集不可。
  currentChallenge: book.current_challenge || '',
  hypothesis: book.hypothesis || '',
  bookReason: book.book_reason || '',
  // 📖 この本で学べること（supabase_books_brief.sql・2026-10-08）。列が無い DB では端末の控え（lib/bookBrief.js）。
  aiBrief: book.ai_brief || readLocalBrief(book.id) || '',
  // ⏳ 読む時間の目安（分・supabase_books_read_target.sql・2026-10-18）。0＝決めていない。列が無い DB では端末の控え。
  readTargetMin: cleanTarget(book.read_target_min) || readLocalTarget(book.id),
});

// ⚡ 本の一覧の端末の控え（2026-11-20 オーナー「起動してから画面表示されるまでが遅い」）。
//   次に開いたときは、まずこの控えでホームを描き、裏で読み直して差し替える（loading は読み直すまで true のまま
//   ＝自動で書く処理・案内は最新の一覧を待つ）。控えは本人の id ごと・ログアウトで消す（useAuth の signOut）。
//   大きすぎる一覧（端末の保存の上限に近い）は控えない。30 日より古い控えは使わない。
export const BOOKS_CACHE_PREFIX = 'orime.booksCache.v1:';
const BOOKS_CACHE_MAX_CHARS = 2_000_000;
const BOOKS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export function readBooksCache(uid, now = Date.now()) {
  if (!uid || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BOOKS_CACHE_PREFIX + uid);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || !Array.isArray(v.books) || v.books.length === 0) return null;
    if (!(Number(v.at) > 0) || now - Number(v.at) > BOOKS_CACHE_TTL_MS) return null;
    return v.books.filter((b) => b && typeof b === 'object' && b.id);
  } catch {
    return null;
  }
}
export function writeBooksCache(uid, books, now = Date.now()) {
  if (!uid || typeof localStorage === 'undefined') return;
  const key = BOOKS_CACHE_PREFIX + uid;
  try {
    if (!Array.isArray(books) || books.length === 0) { localStorage.removeItem(key); return; }
    const raw = JSON.stringify({ at: now, books });
    if (raw.length > BOOKS_CACHE_MAX_CHARS) { localStorage.removeItem(key); return; }
    localStorage.setItem(key, raw);
  } catch {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

// 分野・フォルダの 2 つの一覧が同じか（空き・重なり・順番は見ない）。
export function sameTaxList(x, y) {
  const norm = (arr) => [...new Set((arr || []).map((v) => String(v || '').trim()).filter(Boolean))].sort().join('\u0001');
  return norm(x) === norm(y);
}

export function useBooks() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  // 読み込みに失敗したか（画面は「本がない」ではなく「読み込めなかった」を出す）。
  const [loadError, setLoadError] = useState(false);
  const { user } = useAuth();
  // 🏷 世代トークン（useBookMemos と同じ流儀）。PTR・バックフィル完了・復元・
  // AI 面の onBooksMutated など発火源が多く、遅い旧リクエストが後着すると
  // setBooks の全置換が直近の楽観更新/保存結果を見た目上巻き戻すため、
  // 「自分が最新の fetch でなければ結果を捨てる」。
  const fetchGenRef = useRef(0);
  // 🧷 行動の「この端末が知っている id」（本ごと）。読み込み・保存に成功した時点のものだけを入れる。
  //   保存のときは、この中で今回の一覧に無いものだけを消す（ほかの端末で足した行動や、
  //   以前テーマまとめ（2026-09-30 廃止）から直接足した行動なども、知らないまま消さない・2026-09-27）。
  const knownActionIdsRef = useRef(new Map());
  const rememberActionIds = (book) => {
    if (!book?.id) return;
    knownActionIdsRef.current.set(book.id, new Set((book.actions || []).map((a) => a?.id).filter(Boolean)));
  };
  const lastFetchAtRef = useRef(0);
  // ⚡ 本ごとの「最後に確かめた分野・フォルダ」（読み込み・保存の結果）。保存で変わっていなければ書き直さない。
  //   collections が null＝フォルダの表が無い DB で読んだ（いつも書く側に倒す）。
  const persistedTaxRef = useRef(new Map());
  const rememberTax = (b, hasCollections = true) => {
    if (!b?.id) return;
    persistedTaxRef.current.set(b.id, { tags: [...(b.tags || [])], collections: hasCollections ? [...(b.collections || [])] : null });
  };
  // その人の最新の一覧を一度でも読めたか（控えを書くのは、読めたあとだけ）。
  const freshForRef = useRef(null);

  const fetchBooks = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setBooks([]);
      setLoading(false);
      return;
    }
    const gen = ++fetchGenRef.current;
    setLoading(true);
    try {
      let usedFull = true;
      let { data, error } = await supabase
        .from('books')
        .select(BOOK_SELECT_FULL)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      // フォルダ未適用 DB（book_collections なし）では base select に縮退。
      if (error && isMissingRelationError(error)) {
        usedFull = false;
        ({ data, error } = await supabase
          .from('books')
          .select(BOOK_SELECT_BASE)
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }));
      }
      if (error) throw error;
      if (gen !== fetchGenRef.current) return; // stale fetch — 後着の旧応答は捨てる
      const list = (data || []).map(transformBook);
      list.forEach(rememberActionIds);
      persistedTaxRef.current = new Map();
      list.forEach((b) => rememberTax(b, usedFull));
      lastFetchAtRef.current = Date.now();
      freshForRef.current = user.id;
      setBooks(list);
      setLoadError(false);
    } catch (error) {
      if (gen !== fetchGenRef.current) return;
      console.error('本の取得エラー:', error);
      // 手元の一覧は消さない（再読込の失敗で本棚が空に見えないように）。
      setLoadError(true);
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      // ⚡ まず端末の控えで描く（読み直すまで loading は true のまま）。
      if (freshForRef.current !== user.id) {
        const cached = readBooksCache(user.id);
        setBooks(cached ? cached.map((b) => ({ ...b })) : []);
      }
      fetchBooks();
    } else {
      freshForRef.current = null;
      setBooks([]);
      setLoading(false);
    }
  }, [user, fetchBooks]);

  // 一覧が変わったら（読み直し・保存・削除）、少し待って端末に控える。最新を読めたあとだけ。
  const userId = user?.id || null;
  useEffect(() => {
    if (!userId || loading || freshForRef.current !== userId) return undefined;
    const t = setTimeout(() => writeBooksCache(userId, books), 600);
    return () => clearTimeout(t);
  }, [userId, books, loading]);

  // アプリに戻ってきたとき（しばらく離れていたら）読み直す。ほかの端末での変更を取り込み、
  // 古い一覧のまま保存して上書きしないように。
  useEffect(() => {
    if (!user || typeof document === 'undefined') return undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchAtRef.current < 60 * 1000) return;
      fetchBooks();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, fetchBooks]);

  const saveBook = async (book) => {
    if (!user || !isSupabaseConfigured) return null;
    // 本の保存はまとめメモ/AIまとめ等（知識ベースの材料）を変えうる → キャッシュ無効化。
    invalidateKnowledgeCache();

    try {
      const bookData = {
        user_id: user.id,
        // 保存境界で長さを clamp（AI 自動追加経路は maxLength を通らないため、
        // ここで防御的に上限をかける）。
        title: clamp(keepDbSpelling((book.title || '').trim(), book.dbTitle), LIMITS.bookTitle),
        author: book.author ? clamp(keepDbSpelling(String(book.author).trim(), book.dbAuthor), LIMITS.bookAuthor) : null,
        cover: toHttps(book.cover) || null,
        status: book.status,
        rating: book.rating || 0,
        start_date: book.startDate || null,
        done_date: book.doneDate || null,
        // 読書進捗 (supabase_books_reading_progress.sql)。任意カラムなので
        // 未適用 DB では schema-error fallback で剥がす。値は整数 or null に正規化。
        current_page: normalizePage(book.currentPage),
        total_pages: normalizePage(book.totalPages),
        invest_purpose: book.investPurpose || null,
        ai_analysis: book.aiAnalysis || null,
        ai_strategy: book.aiStrategy || null,
        leverage_memo: typeof book.leverageMemo === 'string' ? book.leverageMemo : null,
        ai_summary: book.aiSummary ? clamp(book.aiSummary, LIMITS.memoText) : null,
        roi_summary: book.roiSummary || null,
        added_via: book.addedVia === 'manual' ? 'manual' : 'search',
        isbn: book.isbn ? String(book.isbn).replace(/[-\s]/g, '') : null,
        asin: book.asin ? String(book.asin).trim() : null,
      };
      // 任意カラム: マイグレーション未適用の DB だと UNDEFINED COLUMN エラーで
      // save が止まるため schema-error fallback で段階的に剥がす。
      //   1. cover_isbn         (supabase_books_cover_isbn.sql)
      //   2. source_query       (supabase_books_source_query.sql)
      //   3. setup fields       (supabase_books_setup_fields.sql) —
      //      current_challenge / hypothesis / book_reason をまとめて 1 グループ
      const coverIsbnValue = book.coverIsbn ? String(book.coverIsbn).replace(/[-\s]/g, '') : null;
      const includeSourceQuery = Object.prototype.hasOwnProperty.call(book, 'sourceQuery');
      const sourceQueryValue = includeSourceQuery ? (book.sourceQuery || null) : undefined;
      const includeSetupFields =
        Object.prototype.hasOwnProperty.call(book, 'currentChallenge')
        || Object.prototype.hasOwnProperty.call(book, 'hypothesis')
        || Object.prototype.hasOwnProperty.call(book, 'bookReason');
      const setupFields = includeSetupFields
        ? {
            current_challenge: book.currentChallenge || null,
            hypothesis: book.hypothesis || null,
            book_reason: book.bookReason || null,
          }
        : null;

      let savedBookId;
      const isUUID = UUID_RE.test(book.id || '');

      // schema-error フォールバック付きヘルパー: 任意カラム群を順に剥がして
      // 再試行する。エラーメッセージに当該列名 or 'column' が含まれたら
      // 該当グループを payload から落とす。
      const writeWithFallback = async (op) => {
        const fullPayload = { ...bookData };
        if (coverIsbnValue) fullPayload.cover_isbn = coverIsbnValue;
        if (includeSourceQuery) fullPayload.source_query = sourceQueryValue;
        if (includeSetupFields && setupFields) Object.assign(fullPayload, setupFields);

        // 任意グループを段階的に剥がしていく。これまでに「列が無い」と判明した
        // 任意列は常に落とした状態で再試行するため、剥がし対象を 1 つの Set に
        // 集約する。各ステップは Set にその列名を足して payload を作り直す。
        const stripped = new Set();
        const payloadWithout = () => {
          const p = { ...fullPayload };
          for (const col of stripped) delete p[col];
          return p;
        };

        let r = await op(fullPayload);
        if (!r.error) return r;
        let msg = String(r.error?.message || '');

        // 読書進捗 (current_page / total_pages) 列が無い → セットで剥がして再試行。
        // SELECT は '*' なので読み取りは未適用 DB でも壊れないが、INSERT/UPDATE の
        // payload はこの 2 列で UNDEFINED COLUMN になるためここで救済する。
        if (
          msg.includes('current_page')
          || msg.includes('total_pages')
          || msg.includes('column')
        ) {
          stripped.add('current_page');
          stripped.add('total_pages');
          r = await op(payloadWithout());
          if (!r.error) return r;
          msg = String(r.error?.message || '');
        }

        // setup fields のいずれか列が無い → セットで剥がして再試行
        if (
          msg.includes('current_challenge')
          || msg.includes('hypothesis')
          || msg.includes('book_reason')
          || (msg.includes('column') && includeSetupFields)
        ) {
          stripped.add('current_challenge');
          stripped.add('hypothesis');
          stripped.add('book_reason');
          r = await op(payloadWithout());
          if (!r.error) return r;
          msg = String(r.error?.message || '');
        }

        // source_query 列が無い → 落として再試行
        if (msg.includes('source_query') || (msg.includes('column') && includeSourceQuery)) {
          stripped.add('current_challenge');
          stripped.add('hypothesis');
          stripped.add('book_reason');
          stripped.add('source_query');
          r = await op(payloadWithout());
          if (!r.error) return r;
          msg = String(r.error?.message || '');
        }

        // cover_isbn 列が無い → cover_isbn も剥がして再試行
        if (msg.includes('cover_isbn') || (msg.includes('column') && coverIsbnValue)) {
          stripped.add('current_challenge');
          stripped.add('hypothesis');
          stripped.add('book_reason');
          stripped.add('source_query');
          stripped.add('cover_isbn');
          return op(payloadWithout());
        }
        return r;
      };

      if (isUUID) {
        const { error } = await writeWithFallback((payload) =>
          supabase.from('books').update(payload).eq('id', book.id),
        );
        if (error) throw error;
        savedBookId = book.id;
      } else {
        const { data, error } = await writeWithFallback((payload) =>
          supabase.from('books').insert([payload]).select().single(),
        );
        if (error) throw error;
        savedBookId = data.id;
      }

      // ⚡ 本の行を書いたあとの 3 つ（分野＝book_tags・フォルダ・行動）は互いに関係しないので、同時に送る
      //   （2026-11-20 オーナー「初歩的な快適度の向上」＝前は 1 つずつ順に待ち、最大 7 往復していた）。
      //   すでにある本で、分野・フォルダが「最後に保存・読み込みで確かめた中身」と同じなら書き直さない
      //   （行動を 1 つ足しただけ・状態を進めただけの保存を軽く）。画面の一覧（楽観の更新が先に入る）とは比べない。
      const persisted = isUUID ? persistedTaxRef.current.get(savedBookId) : null;
      const tagsUnchanged = !!persisted && sameTaxList(persisted.tags, book.tags);
      const collectionsUnchanged = !!persisted && Array.isArray(persisted.collections) && sameTaxList(persisted.collections, book.collections);

      const saveTags = async () => {
        if (tagsUnchanged) return;
        // Tags: delete + re-insert (no stable client-side ids)
        await supabase.from('book_tags').delete().eq('book_id', savedBookId);
        if (book.tags && book.tags.length > 0) {
          const tagInserts = book.tags.map((tag) => ({
            book_id: savedBookId,
            user_id: user.id,
            tag_name: tag,
          }));
          const { error } = await supabase.from('book_tags').insert(tagInserts);
          if (error) throw error;
        }
      };
      const saveCollections = async () => {
        if (collectionsUnchanged) return;
        // Collections (フォルダ): タグと同じ delete + re-insert パターン。任意機能
        // のため、テーブル未作成の DB では schema-error を握りつぶして保存を続行
        // （フォルダ未適用でも本の保存は壊さない）。
        if (book.collections !== undefined) {
          try {
            await supabase.from('book_collections').delete().eq('book_id', savedBookId);
            const cols = (book.collections || []).map((c) => (c || '').trim()).filter(Boolean);
            if (cols.length > 0) {
              const colInserts = cols.map((name) => ({
                book_id: savedBookId,
                user_id: user.id,
                collection_name: name,
              }));
              const { error } = await supabase.from('book_collections').insert(colInserts);
              if (error && !isMissingRelationError(error)) throw error;
            }
          } catch (e) {
            if (!isMissingRelationError(e)) throw e;
          }
        }
      };
      const saveActions = async () => {
        // Actions: upsert by id, then delete removed rows.
        // 完全重複（同じ文言・期限・完了状態・繰り返し）を保存前に畳む。繰り返し
        // タスクの多重 spawn などでできた重複行を、保存のたびに 1 件へ収束させて
        // DB を掃除する（id を持つ行を優先的に残し、残りは下の DELETE で消える）。
        const rawActions = (book.actions || []).filter((a) => a && typeof a.text === 'string' && a.text.trim());
        const dedupMap = new Map();
        let doneSeq = 0;
        for (const a of rawActions) {
          // ⚠️ 畳み込みは「未完了の増殖 spawn」対策に限定する。完了済み行は
          //   完了時期・振り返りが違う正当な履歴（同じ習慣を複数回完了した等）
          //   なので畳まない — 畳むと片方が差分 DELETE で静かに消える。
          // 畳むのは「繰り返し」の行動だけ（増殖の原因はそこ）。繰り返しでない同じ文の行動は、
          //   本人が 2 回入れたもの＝行動リストにも 2 件出ているので、黙って消さない。
          const key = (a.done || !a.recurrence)
            ? `keep#${a.id || `new-${doneSeq++}`}`
            : `${a.text.trim()}|${a.deadline || ''}|0|${a.recurrence || ''}`;
          const prev = dedupMap.get(key);
          // id を持つ行（永続済み）を優先的に残す。
          if (!prev || (!prev.id && a.id)) dedupMap.set(key, a);
        }
        const incoming = [...dedupMap.values()];
        const existingIds = incoming
          .map((a) => a.id)
          .filter((id) => typeof id === 'string' && UUID_RE.test(id));

        // 消すのは「この端末が知っていて、今回の一覧から外れた行動」だけ。
        const keep = new Set(existingIds);
        const toDelete = [...(knownActionIdsRef.current.get(savedBookId) || [])].filter((id) => !keep.has(id));
        if (toDelete.length > 0) {
          const { error: delErr } = await supabase
            .from('actions')
            .delete()
            .eq('book_id', savedBookId)
            .in('id', toDelete);
          if (delErr) throw delErr;
        }

        if (incoming.length > 0) {
          // supabase_actions_full.sql で追加した拡張列。マイグレーション未適用
          // DB では UNDEFINED COLUMN エラーになるので、エラー時は基本列のみで
          // 再試行する。
          //
          // id について: actions.id に DEFAULT gen_random_uuid() が無い環境では
          // INSERT 時に NULL 制約違反になる。クライアント側で常に UUID を
          // 生成しておく (DB の DEFAULT が無くても弾かれない)。生成した UUID
          // は次回保存以降は UPDATE 経路に乗る。
          const ensureId = (a) => {
            if (a.id && UUID_RE.test(a.id)) return a.id;
            try {
              if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
              }
            } catch { /* ignore */ }
            return null;
          };
          const buildPayload = (a, includeExtras) => {
            const base = {
              book_id: savedBookId,
              user_id: user.id,
              // 保存境界で clamp（本詳細インライン入力は maxLength を通らない経路があるため二重防御）。
              text: clamp(a.text || '', LIMITS.actionText),
              deadline: a.deadline || null,
              done: a.done || false,
            };
            if (includeExtras) {
              if ('priority' in a) base.priority = a.priority || 'medium';
              if ('recurrence' in a) base.recurrence = a.recurrence || null;
              // source_memo_id は UUID 列。振り返りの「まとめメモ/投資目的」等は
              // 合成ノートで id が 'leverage_memo-<uuid>' 等の非 UUID なので、
              // そのまま入れると DB が拒否し保存全体が失敗する。UUID 形式のときだけ入れる。
              if ('sourceMemoId' in a) {
                base.source_memo_id = isUuid(a.sourceMemoId) ? a.sourceMemoId : null;
              }
              if ('sourcePage' in a) base.source_page = a.sourcePage || null;
              if ('reflection' in a) base.reflection = a.reflection || null;
              if ('completedAt' in a) base.completed_at = a.completedAt || null;
              if ('notifyAt' in a) base.notify_at = a.notifyAt || null;
              if ('scheduledFor' in a) base.scheduled_for = a.scheduledFor || null;
            }
            const id = ensureId(a);
            return id ? { id, ...base } : base;
          };

          const fullPayload = incoming.map((a) => buildPayload(a, true));
          let res = await supabase.from('actions').upsert(fullPayload, { onConflict: 'id' });
          if (res.error) {
            const msg = String(res.error?.message || '').toLowerCase();
            // 新カラムが無い → 基本列のみで再試行
            if (
              msg.includes('priority')
              || msg.includes('recurrence')
              || msg.includes('source_memo_id')
              || msg.includes('source_page')
              || msg.includes('reflection')
              || msg.includes('completed_at')
              || msg.includes('notify_at')
              || msg.includes('scheduled_for')
              || msg.includes('column')
            ) {
              const minPayload = incoming.map((a) => buildPayload(a, false));
              res = await supabase.from('actions').upsert(minPayload, { onConflict: 'id' });
            }
          }
          if (res.error) throw res.error;
        }
      };
      await Promise.all([saveTags(), saveCollections(), saveActions()]);

      // Fetch fresh row with relations to return（フォルダ未適用 DB では縮退）
      let { data: freshRow, error: freshErr } = await supabase
        .from('books')
        .select(BOOK_SELECT_FULL)
        .eq('id', savedBookId)
        .single();
      let freshFull = true;
      if (freshErr && isMissingRelationError(freshErr)) {
        freshFull = false;
        ({ data: freshRow, error: freshErr } = await supabase
          .from('books')
          .select(BOOK_SELECT_BASE)
          .eq('id', savedBookId)
          .single());
      }
      if (freshErr) throw freshErr;

      const savedBook = transformBook(freshRow);
      rememberActionIds(savedBook);
      rememberTax(savedBook, freshFull);
      // 全件再フェッチ（setBooks 全置換）はしない。保存した本だけを差し替える。
      // 全置換は (a) 余計な 1 往復、(b) 並行して楽観更新中の「別の本」の
      // チェック表示を一時的に巻き戻す（消えて→再点灯のちらつき）ため。
      // freshRow は relations 込みで取得済みなので、これが完全な最新行。
      setBooks((prev) => {
        const exists = prev.some((b) => b.id === savedBook.id);
        return exists ? prev.map((b) => (b.id === savedBook.id ? savedBook : b)) : [...prev, savedBook];
      });
      return savedBook;
    } catch (error) {
      console.error('本の保存エラー:', error);
      throw error;
    }
  };

  // 🗑 消すと決めた本を、通信を待たずに一覧から外す（2026-11-21）。戻す関数を返す（消せなかったとき・控えを取れなかったとき）。
  //   前は控えを取る・消すの 2〜3 往復のあいだ、本が一覧に残ったままで、押せたのか分からなかった。
  const hideBook = (bookId) => {
    let removed = null;
    let at = -1;
    setBooks((prev) => {
      const i = prev.findIndex((b) => b.id === bookId);
      if (i < 0) return prev;
      removed = prev[i];
      at = i;
      return prev.filter((b) => b.id !== bookId);
    });
    return () => {
      if (!removed) return;
      const row = removed;
      setBooks((prev) => {
        if (prev.some((b) => b.id === row.id)) return prev;
        const next = prev.slice();
        next.splice(Math.min(Math.max(at, 0), next.length), 0, row);
        return next;
      });
    };
  };

  const deleteBook = async (bookId) => {
    if (!user || !isSupabaseConfigured) return;
    invalidateKnowledgeCache();
    try {
      const { error } = await supabase.from('books').delete().eq('id', bookId);
      if (error) throw error;
      // 全件再フェッチはしない（saveBook と同じ方針）。削除した 1 冊だけを
      // ローカル state から取り除く — 全置換は余計な 1 往復に加え、並行して
      // 楽観更新中の「別の本」の表示を一時的に巻き戻すちらつきの原因になる。
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    } catch (error) {
      console.error('本の削除エラー:', error);
      throw error;
    }
  };

  // Snapshot a book + all its related rows (tags / actions / memos) so we can
  // re-INSERT them after a true DB delete. Returns the raw rows; relation
  // arrays are nested under their relation name (book_tags, actions, book_memos).
  const captureBookSnapshot = async (bookId) => {
    if (!user || !isSupabaseConfigured || !bookId) return null;
    try {
      // フォルダ (book_collections) も含めて控える。未適用 DB では relation が
      // 無いので、その時だけ collections 抜きで取り直す（staged fallback）。
      let { data, error } = await supabase
        .from('books')
        .select('*, book_tags(*), actions(*), book_memos(*), book_collections(*)')
        .eq('id', bookId)
        .eq('user_id', user.id)
        .single();
      if (error && isMissingRelationError(error)) {
        ({ data, error } = await supabase
          .from('books')
          .select('*, book_tags(*), actions(*), book_memos(*)')
          .eq('id', bookId)
          .eq('user_id', user.id)
          .single());
      }
      if (error) throw error;
      // ⏱ 読書の時間も控える（本の削除で一緒に消えるため・表が無い DB は空）。
      const reading_sessions = await captureBookReadingSessions(supabase, user.id, bookId);
      return { ...data, reading_sessions };
    } catch (error) {
      console.error('本のスナップショット取得エラー:', error);
      return null;
    }
  };

  // Re-INSERT a book + its relations from a snapshot (used by Undo).
  // 本の削除→Undo 経路では Storage の写真ファイルは削除していない（消すのは
  // メモ単体削除のみ）。photo_path を null に落とすと実在ファイルへのリンク
  // だけ失う二重損失になるため、スナップショットの値をそのまま復元する。
  //
  // Returns a result object so the caller can tell the user the truth:
  //   { ok: true }                         — book + all relations restored
  //   { ok: true, failed: ['タグ', ...] }  — book restored but some attached
  //                                           data (tags/actions/memos) failed
  // If the book row itself can't be re-inserted, we throw (nothing was
  // restored — the caller surfaces a hard failure). 添付データの INSERT 失敗を
  // console.warn で握り潰すと「削除を取り消しました」と表示されたままタグ/
  // 行動/メモが消えるため、失敗を必ず呼び出し側へ返す。
  const restoreBookFromSnapshot = async (snapshot) => {
    if (!snapshot || !user || !isSupabaseConfigured) return { ok: false, failed: [] };
    const { book_tags = [], actions = [], book_memos = [], book_collections = [], reading_sessions = [], ...bookRow } = snapshot;
    if (bookRow.id) persistedTaxRef.current.delete(bookRow.id); // 元に戻したあとの保存は、分野・フォルダを書き直す側に倒す
    // 元の更新日時のまま戻す（元に戻したら、すべての本の並びも元どおり・2026-11-25 点検＝前は先頭へ動いていた）。
    const bookPayload = { ...bookRow, updated_at: bookRow.updated_at || new Date().toISOString() };

    const { error: bErr } = await supabase.from('books').insert([bookPayload]);
    if (bErr) throw bErr;

    const failed = [];

    if (book_tags.length > 0) {
      const tagRows = book_tags.map((t) => ({
        book_id: snapshot.id,
        user_id: user.id,
        tag_name: t.tag_name,
      }));
      const { error: tErr } = await supabase.from('book_tags').insert(tagRows);
      if (tErr) {
        console.error('タグ復元の一部失敗:', tErr);
        failed.push('タグ');
      }
    }

    if (actions.length > 0) {
      const actionRows = actions.map((a) => ({ ...a }));
      const { error: aErr } = await supabase.from('actions').insert(actionRows);
      if (!aErr) knownActionIdsRef.current.set(bookRow.id, new Set(actionRows.map((r) => r.id).filter(Boolean)));
      if (aErr) {
        console.error('行動リスト復元の一部失敗:', aErr);
        failed.push('行動');
      }
    }

    if (book_memos.length > 0) {
      const memoRows = book_memos.map((m) => ({ ...m }));
      const { error: mErr } = await supabase.from('book_memos').insert(memoRows);
      if (mErr) {
        console.error('メモ復元の一部失敗:', mErr);
        failed.push('メモ');
      }
    }

    if (book_collections.length > 0) {
      const colRows = book_collections.map((c) => ({
        book_id: snapshot.id,
        user_id: user.id,
        collection_name: c.collection_name,
      }));
      const { error: cErr } = await supabase.from('book_collections').insert(colRows);
      if (cErr && !isMissingRelationError(cErr)) {
        console.error('フォルダ復元の一部失敗:', cErr);
        failed.push('フォルダ');
      }
    }

    // ⏱ 読書の時間（本を入れ直したあと＝外部キーが通る）。
    if (!(await restoreBookReadingSessions(supabase, reading_sessions))) failed.push('読書の時間');

    await fetchBooks();
    return { ok: true, failed };
  };

  // 📖 この本で学べること（books.ai_brief）だけを保存する（2026-10-08）。本の保存（saveBook）は通さない＝タグ・行動を
  //   書き直さない・ほかの欄の書きかけを保存しない。列が無い DB（supabase_books_brief.sql 未適用）では端末に控える。
  //   戻り値 { ok: true, local: boolean }。保存に失敗したら投げる（列が無い以外）。
  const saveBookBrief = async (bookId, text) => {
    const value = String(text || '');
    const patchLocal = () => setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, aiBrief: value } : b)));
    if (!user || !isSupabaseConfigured || !UUID_RE.test(bookId || '')) {
      writeLocalBrief(bookId, value);
      patchLocal();
      return { ok: true, local: true };
    }
    let error = null;
    try {
      ({ error } = await supabase.from('books').update({ ai_brief: value || null }).eq('id', bookId).eq('user_id', user.id));
    } catch (e) {
      error = e || new Error('save failed');
    }
    if (error) {
      // 列が無い（未適用）ときも、つながらない等で入らなかったときも、作った中身は捨てずに端末に控えて見せる
      // （AI のトークンは使い終わっている・2026-10-10）。列が無いとき以外は、次に作り直したときに本へ入る。
      const msg = String(error.message || '').toLowerCase();
      const missing = isSchemaError(error) || msg.includes('ai_brief');
      if (!missing) console.warn('この本で学べることを本に保存できず端末に控えます:', error?.message || error);
      writeLocalBrief(bookId, value);
      patchLocal();
      return { ok: true, local: true, failed: !missing };
    }
    writeLocalBrief(bookId, ''); // 列に入ったら端末の控えは要らない
    patchLocal();
    return { ok: true, local: false };
  };

  // ⏳ 読む時間の目安（分）だけを書く（2026-10-18・lib/readTarget.js）。本の保存（saveBook）は通さない。
  //   列が無い・つながらないときは端末に控える（目安は本人の画面のための数なので止めない）。
  const saveReadTarget = async (bookId, minutes) => {
    const value = cleanTarget(minutes);
    setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, readTargetMin: value } : b)));
    if (!user || !isSupabaseConfigured || !UUID_RE.test(bookId || '')) { writeLocalTarget(bookId, value); return { ok: true, local: true }; }
    let error = null;
    try {
      ({ error } = await supabase.from('books').update({ read_target_min: value || null }).eq('id', bookId).eq('user_id', user.id));
    } catch (e) {
      error = e || new Error('save failed');
    }
    if (error) {
      const missing = isSchemaError(error) || String(error.message || '').toLowerCase().includes('read_target_min');
      if (!missing) console.warn('読む時間の目安を本に保存できず端末に控えます:', error?.message || error);
      writeLocalTarget(bookId, value);
      return { ok: true, local: true };
    }
    writeLocalTarget(bookId, 0);
    return { ok: true, local: false };
  };

  // 🏷 本の分野（book_tags）とフォルダ（book_collections）だけを書く（2026-10-11・lib/bookFields.js）。
  //   本の保存（saveBook）は通さない＝ほかの欄・行動を書き直さない。自動の仕分けと前の版のタグの移し替えで使う。
  //   消してから入れ直さず、差分だけ（入れる → 消す）＝途中で失敗しても、言葉が消えたままにならない。
  //   tags: 本のタグの全部（分野＋残すもの）/ base: 呼び出し側が見ていたタグ（tags を決めたもとの一覧）/
  //   addCollections: 足すフォルダ（今あるフォルダは消さない）
  //   🛡 2026-10-10 監査: 消す・足すは DB から読み直した行と base の差で決める（三方向の合わせ）＝呼び出し側が古い
  //     一覧を見ていても、その間に本人が足したタグを消さない・本人が外したタグを戻さない。
  //     消すのは「base にあって tags に無い、いま DB にあるタグ」、足すのは「base に無くて tags にある、DB に無いタグ」。
  //     base を渡さないときは今までどおり tags に合わせる。
  //   戻り値: { ok, foldersOk, tags, addedCollections }。foldersOk=false のときはフォルダに入れられなかった（表が無い・失敗）。
  const saveBookTaxonomy = async (bookId, { tags, base = null, addCollections = [] } = {}) => {
    if (!user || !isSupabaseConfigured || !UUID_RE.test(bookId || '')) return { ok: false, foldersOk: false };
    // 分野・フォルダを直接書くので、覚えていた中身は捨てる（次の本の保存は書き直す側に倒す）。
    persistedTaxRef.current.delete(bookId);
    const norm = (list) => [...new Set((list || []).map((t) => String(t || '').trim()).filter(Boolean))];
    const nextTags = norm(tags);
    const addCols = norm(addCollections);
    let foldersOk = true;
    let addedCols = [];
    let finalTags = nextTags;
    try {
      if (addCols.length) {
        try {
          const { data: haveCols, error: e1 } = await supabase.from('book_collections').select('collection_name').eq('book_id', bookId);
          if (e1) throw e1;
          const have = new Set((haveCols || []).map((r) => r.collection_name));
          addedCols = addCols.filter((c) => !have.has(c));
          if (addedCols.length) {
            const { error: e2 } = await supabase.from('book_collections').insert(addedCols.map((name) => ({ book_id: bookId, user_id: user.id, collection_name: name })));
            if (e2) throw e2;
          }
        } catch (e) {
          if (!isMissingRelationError(e)) console.warn('[book-fields] フォルダに入れられませんでした:', e?.message || e);
          foldersOk = false;
          addedCols = [];
        }
      }
      const { data: haveTags, error: e3 } = await supabase.from('book_tags').select('tag_name').eq('book_id', bookId);
      if (e3) throw e3;
      const haveList = (haveTags || []).map((r) => r.tag_name);
      const plan = planTaxonomyChange({ have: haveList, next: nextTags, base: Array.isArray(base) ? norm(base) : null });
      finalTags = plan.final;
      if (plan.toAdd.length) {
        const { error } = await supabase.from('book_tags').insert(plan.toAdd.map((tag) => ({ book_id: bookId, user_id: user.id, tag_name: tag })));
        if (error) throw error;
      }
      if (plan.toRemove.length) {
        const { error } = await supabase.from('book_tags').delete().eq('book_id', bookId).in('tag_name', plan.toRemove);
        if (error) throw error;
      }
    } catch (e) {
      console.warn('[book-fields] 本の分野を保存できませんでした:', e?.message || e);
      return { ok: false, foldersOk };
    }
    setBooks((prev) => prev.map((b) => (b.id === bookId
      ? { ...b, tags: finalTags, collections: addedCols.length ? [...(b.collections || []), ...addedCols] : b.collections }
      : b)));
    return { ok: true, foldersOk, tags: finalTags, addedCollections: addedCols };
  };

  // ローカル state のみを即時更新する（DB は触らない）。行動トグル等の
  // 楽観的 UI 用。確定値は直後の saveBook → fetchBooks が上書きする。
  const mutateBookLocal = (bookId, updater) => {
    setBooks((prev) => prev.map((b) => (b.id === bookId ? updater(b) : b)));
  };

  return {
    books,
    loading,
    loadError,
    saveBook,
    deleteBook,
    hideBook,
    mutateBookLocal,
    saveBookBrief,
    saveReadTarget,
    saveBookTaxonomy,
    captureBookSnapshot,
    restoreBookFromSnapshot,
    refreshBooks: fetchBooks,
  };
}
