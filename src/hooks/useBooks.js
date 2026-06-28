import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';
import { LIMITS, clamp } from '../lib/limits';

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
const isMissingRelationError = (err) => {
  const m = (err?.message || '').toLowerCase();
  return m.includes('book_collections') || m.includes('does not exist') || m.includes('relationship') || err?.code === '42P01' || err?.code === 'PGRST200';
};

const transformBook = (book) => ({
  ...book,
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
});

export function useBooks() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchBooks = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setBooks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let { data, error } = await supabase
        .from('books')
        .select(BOOK_SELECT_FULL)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      // フォルダ未適用 DB（book_collections なし）では base select に縮退。
      if (error && isMissingRelationError(error)) {
        ({ data, error } = await supabase
          .from('books')
          .select(BOOK_SELECT_BASE)
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }));
      }
      if (error) throw error;
      setBooks((data || []).map(transformBook));
    } catch (error) {
      console.error('本の取得エラー:', error);
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchBooks();
    } else {
      setBooks([]);
      setLoading(false);
    }
  }, [user, fetchBooks]);

  const saveBook = async (book) => {
    if (!user || !isSupabaseConfigured) return null;

    try {
      const bookData = {
        user_id: user.id,
        // 保存境界で長さを clamp（AI 自動追加経路は maxLength を通らないため、
        // ここで防御的に上限をかける）。
        title: clamp((book.title || '').trim(), LIMITS.bookTitle),
        author: book.author ? clamp(String(book.author).trim(), LIMITS.bookAuthor) : null,
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

      // Actions: upsert by id, then delete removed rows.
      // 完全重複（同じ文言・期限・完了状態・繰り返し）を保存前に畳む。繰り返し
      // タスクの多重 spawn などでできた重複行を、保存のたびに 1 件へ収束させて
      // DB を掃除する（id を持つ行を優先的に残し、残りは下の DELETE で消える）。
      const rawActions = (book.actions || []).filter((a) => a && typeof a.text === 'string' && a.text.trim());
      const dedupMap = new Map();
      for (const a of rawActions) {
        const key = `${a.text.trim()}|${a.deadline || ''}|${a.done ? 1 : 0}|${a.recurrence || ''}`;
        const prev = dedupMap.get(key);
        // id を持つ行（永続済み）を優先的に残す。
        if (!prev || (!prev.id && a.id)) dedupMap.set(key, a);
      }
      const incoming = [...dedupMap.values()];
      const existingIds = incoming
        .map((a) => a.id)
        .filter((id) => typeof id === 'string' && UUID_RE.test(id));

      if (existingIds.length === 0) {
        const { error: delErr } = await supabase
          .from('actions')
          .delete()
          .eq('book_id', savedBookId);
        if (delErr) throw delErr;
      } else {
        const { error: delErr } = await supabase
          .from('actions')
          .delete()
          .eq('book_id', savedBookId)
          .not('id', 'in', `(${existingIds.join(',')})`);
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
            if ('sourceMemoId' in a) base.source_memo_id = a.sourceMemoId || null;
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

      // Fetch fresh row with relations to return（フォルダ未適用 DB では縮退）
      let { data: freshRow, error: freshErr } = await supabase
        .from('books')
        .select(BOOK_SELECT_FULL)
        .eq('id', savedBookId)
        .single();
      if (freshErr && isMissingRelationError(freshErr)) {
        ({ data: freshRow, error: freshErr } = await supabase
          .from('books')
          .select(BOOK_SELECT_BASE)
          .eq('id', savedBookId)
          .single());
      }
      if (freshErr) throw freshErr;

      const savedBook = transformBook(freshRow);
      await fetchBooks();
      return savedBook;
    } catch (error) {
      console.error('本の保存エラー:', error);
      throw error;
    }
  };

  const deleteBook = async (bookId) => {
    if (!user || !isSupabaseConfigured) return;
    try {
      const { error } = await supabase.from('books').delete().eq('id', bookId);
      if (error) throw error;
      await fetchBooks();
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
      const { data, error } = await supabase
        .from('books')
        .select('*, book_tags(*), actions(*), book_memos(*)')
        .eq('id', bookId)
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('本のスナップショット取得エラー:', error);
      return null;
    }
  };

  // Re-INSERT a book + its relations from a snapshot (used by Undo).
  // Photos in book_memos are gone (Storage delete is non-undoable), so memos
  // are restored with photo_path: null. Caller is expected to surface that.
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
    const { book_tags = [], actions = [], book_memos = [], ...bookRow } = snapshot;
    // Reset updated_at so the restored row floats to the top of "更新順".
    const bookPayload = { ...bookRow, updated_at: new Date().toISOString() };

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
      if (aErr) {
        console.error('行動リスト復元の一部失敗:', aErr);
        failed.push('行動リスト');
      }
    }

    if (book_memos.length > 0) {
      const memoRows = book_memos.map((m) => ({ ...m, photo_path: null }));
      const { error: mErr } = await supabase.from('book_memos').insert(memoRows);
      if (mErr) {
        console.error('メモ復元の一部失敗:', mErr);
        failed.push('メモ');
      }
    }

    await fetchBooks();
    return { ok: true, failed };
  };

  return {
    books,
    loading,
    saveBook,
    deleteBook,
    captureBookSnapshot,
    restoreBookFromSnapshot,
    refreshBooks: fetchBooks,
  };
}
