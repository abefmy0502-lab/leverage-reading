// ⏱📚 読書の時間の記録（集中モード・2026-10-09）。
//
// 保存先は reading_sessions（supabase_reading_sessions.sql・RLS で本人だけ）。
// 表がまだ無い DB・つながらないときは、端末の localStorage（orime.readingSessions.v1）に控える
// （ほかの端末には出ない・その端末の合計には入る）。読むときは、表の行と端末の控えを合わせて数える。
// 同じ画面のどこからでも同じ一覧を見られるよう、読み込みは 1 回だけ（subscribe で知らせる）。
import { isSchemaError } from './errors';

export const LOCAL_SESSIONS_KEY = 'orime.readingSessions.v1';
const LOCAL_MAX = 500;
const SELECT = 'id, book_id, started_at, ended_at, seconds, mode, created_at';

function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

// 行の id は端末で決める（表に入れるときも、端末に控えるときも同じ id＝あとで表に送っても二重に数えない）。
export function newSessionId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* 下の作り方へ */ }
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 外部キーの違反（その本がもう無い）＝送っても入らない行。
const isForeignKeyError = (e) => e?.code === '23503';

export function createReadingSessionStore({ getClient = () => null, storage = defaultStorage } = {}) {
  let serverRows = [];
  let loadedFor = null; // 読み込めた利用者の id（読み込みに失敗したら入れない＝次に頼まれたとき・つながったときにもう一度）
  let triedFor = null; // 読み込みを試した利用者の id（失敗も含む・画面の「読み込み済み」）
  let tableMissing = false;
  let loading = null;
  let syncing = null;
  const subs = new Set();

  const readLocal = () => {
    try {
      const list = JSON.parse(storage()?.getItem(LOCAL_SESSIONS_KEY) || '[]');
      return Array.isArray(list) ? list.filter((r) => r && r.book_id && Number.isFinite(Number(r.seconds))) : [];
    } catch {
      return [];
    }
  };
  const writeLocal = (list) => {
    try {
      if (list.length === 0) storage()?.removeItem(LOCAL_SESSIONS_KEY);
      else storage()?.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(list.slice(-LOCAL_MAX)));
    } catch { /* 入らなければ控えない */ }
  };
  const notify = () => subs.forEach((fn) => { try { fn(); } catch { /* ignore */ } });

  // 表の行＋端末の控え（同じ id は表を優先）。
  const rows = () => {
    const ids = new Set(serverRows.map((r) => r.id));
    return [...serverRows, ...readLocal().filter((r) => !ids.has(r.id))];
  };

  // 端末の控えを表に送る（表が読めたときだけ）。入った行・その本がもう無い行は控えから消す。
  async function syncLocal(userId) {
    const client = getClient();
    if (!client || !userId || tableMissing || loadedFor !== userId) return;
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        // 前の版の控え（id が uuid でない）は、送る前に uuid を付け直して控えにも書き戻す（送り直しても二重にしない）。
        let local = readLocal();
        if (local.length === 0) return;
        if (local.some((r) => !UUID_RE.test(String(r.id || '')))) {
          local = local.map((r) => (UUID_RE.test(String(r.id || '')) ? r : { ...r, id: newSessionId() }));
          writeLocal(local);
        }
        const toRow = (r) => ({
          id: r.id, user_id: userId, book_id: r.book_id, started_at: r.started_at, ended_at: r.ended_at,
          seconds: Math.round(Number(r.seconds) || 0), mode: r.mode === 'count' ? 'count' : 'timer',
        });
        const done = new Set();
        const sent = [];
        const { error } = await client.from('reading_sessions').upsert(local.map(toRow), { onConflict: 'id', ignoreDuplicates: true });
        if (!error) {
          local.forEach((r) => { done.add(r.id); sent.push(toRow(r)); });
        } else if (isSchemaError(error)) {
          tableMissing = true;
          return;
        } else {
          // まとめて入らなかった（消えた本の行が混じっている等）→ 1 行ずつ。
          for (const r of local) {
            // eslint-disable-next-line no-await-in-loop
            const res = await client.from('reading_sessions').upsert([toRow(r)], { onConflict: 'id', ignoreDuplicates: true });
            if (!res.error) { done.add(r.id); sent.push(toRow(r)); } else if (isForeignKeyError(res.error)) done.add(r.id);
          }
        }
        if (done.size === 0) return;
        writeLocal(readLocal().filter((r) => !done.has(r.id)));
        const ids = new Set(serverRows.map((r) => r.id));
        serverRows = [...sent.filter((r) => !ids.has(r.id)), ...serverRows];
        notify();
      } catch (e) {
        console.warn('端末に控えた読書の時間を送れませんでした:', e?.message || e);
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }

  async function load(userId, { force = false } = {}) {
    const client = getClient();
    if (!client || !userId) { loadedFor = userId || null; triedFor = loadedFor; notify(); return rows(); }
    if (!force && loadedFor === userId) return rows();
    if (loading) return loading;
    let ok = false;
    loading = (async () => {
      try {
        const { data, error } = await client
          .from('reading_sessions')
          .select(SELECT)
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(5000);
        if (error) throw error;
        serverRows = Array.isArray(data) ? data : [];
        tableMissing = false;
        loadedFor = userId;
        ok = true;
      } catch (e) {
        if (isSchemaError(e)) {
          // 表が無い（未適用）: 端末の控えだけで数える（壊さない・もう一度読みにいかない）。
          tableMissing = true;
          serverRows = [];
          loadedFor = userId;
        } else {
          // つながらない: 読めた分はそのまま・次に頼まれたとき（つながったとき・画面に戻ったとき）にもう一度。
          console.warn('reading_sessions の読み込みに失敗:', e?.message || e);
          if (loadedFor !== userId) serverRows = [];
        }
      } finally {
        triedFor = userId;
        loading = null;
        notify();
      }
      if (ok) await syncLocal(userId);
      return rows();
    })();
    return loading;
  }

  // 1 回分を残す。表に入らなければ端末に控える（同じ id）。戻り値: { ok, local, row }
  async function save(userId, row) {
    if (!row || !row.book_id) return { ok: false, local: false, row: null };
    const withId = { ...row, id: row.id || newSessionId() };
    const client = getClient();
    if (client && userId) {
      try {
        const { data, error } = await client
          .from('reading_sessions')
          .insert([{ ...withId, user_id: userId }])
          .select(SELECT)
          .single();
        if (error) throw error;
        const saved = data || withId;
        serverRows = [saved, ...serverRows.filter((r) => r.id !== saved.id)];
        notify();
        return { ok: true, local: false, row: saved };
      } catch (e) {
        if (!isSchemaError(e)) console.warn('reading_sessions に保存できず端末に控えます:', e?.message || e);
      }
    }
    const local = { ...withId, created_at: new Date().toISOString(), local: true };
    writeLocal([...readLocal().filter((r) => r.id !== local.id), local]);
    notify();
    return { ok: true, local: true, row: local };
  }

  function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }

  // データの初期化・退会のあと（端末の控えも消す）。
  function clearLocal() {
    try { storage()?.removeItem(LOCAL_SESSIONS_KEY); } catch { /* ignore */ }
    serverRows = [];
    loadedFor = null;
    triedFor = null;
    notify();
  }

  return {
    load, save, rows, subscribe, clearLocal, syncLocal,
    hasLocal: () => readLocal().length > 0,
    isLoaded: (userId) => loadedFor === (userId || null) || triedFor === (userId || null),
  };
}

// ---------------------------------------------------------------- 本の削除の「元に戻す」（2026-10-09 ui-critic）
// 本を消すと reading_sessions も一緒に消える（ON DELETE CASCADE）。消す前にその本の行を控え、
// 「元に戻す」で本を入れ直したあとに同じ行（同じ id）を入れ直す。表が無い DB は控えない（空）。

const SNAPSHOT_COLS = 'id, user_id, book_id, started_at, ended_at, seconds, mode, created_at';

export async function captureBookReadingSessions(client, userId, bookId) {
  if (!client || !userId || !bookId) return [];
  try {
    const { data, error } = await client
      .from('reading_sessions')
      .select(SNAPSHOT_COLS)
      .eq('user_id', userId)
      .eq('book_id', bookId);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (!isSchemaError(e)) console.warn('読書の時間を控えられませんでした:', e?.message || e);
    return [];
  }
}

// 戻り値: true＝入れ直せた（または入れ直す行が無い・表が無い）／false＝失敗（呼び出し側が「読書の時間」を失敗に数える）。
export async function restoreBookReadingSessions(client, rows) {
  const list = (rows || []).filter((r) => r && r.book_id);
  if (!client || list.length === 0) return true;
  try {
    const { error } = await client.from('reading_sessions').insert(list.map((r) => ({ ...r })));
    if (error) throw error;
    return true;
  } catch (e) {
    if (isSchemaError(e)) return true;
    console.error('読書の時間の復元の一部失敗:', e);
    return false;
  }
}
