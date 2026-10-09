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

const localId = () => `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createReadingSessionStore({ getClient = () => null, storage = defaultStorage } = {}) {
  let serverRows = [];
  let loadedFor = null; // 読み込んだ利用者の id
  let loading = null;
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
    try { storage()?.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(list.slice(-LOCAL_MAX))); } catch { /* 入らなければ控えない */ }
  };
  const notify = () => subs.forEach((fn) => { try { fn(); } catch { /* ignore */ } });

  // 表の行＋端末の控え（同じ id は表を優先）。
  const rows = () => {
    const ids = new Set(serverRows.map((r) => r.id));
    return [...serverRows, ...readLocal().filter((r) => !ids.has(r.id))];
  };

  async function load(userId, { force = false } = {}) {
    const client = getClient();
    if (!client || !userId) { loadedFor = userId || null; notify(); return rows(); }
    if (!force && loadedFor === userId) return rows();
    if (loading) return loading;
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
      } catch (e) {
        // 表が無い（未適用）・つながらない: 端末の控えだけで数える（壊さない）。
        if (!isSchemaError(e)) console.warn('reading_sessions の読み込みに失敗:', e?.message || e);
        serverRows = [];
      } finally {
        loadedFor = userId;
        loading = null;
        notify();
      }
      return rows();
    })();
    return loading;
  }

  // 1 回分を残す。表に入らなければ端末に控える。戻り値: { ok, local, row }
  async function save(userId, row) {
    if (!row || !row.book_id) return { ok: false, local: false, row: null };
    const client = getClient();
    if (client && userId) {
      try {
        const { data, error } = await client
          .from('reading_sessions')
          .insert([{ ...row, user_id: userId }])
          .select(SELECT)
          .single();
        if (error) throw error;
        const saved = data || { ...row, id: localId() };
        serverRows = [saved, ...serverRows.filter((r) => r.id !== saved.id)];
        notify();
        return { ok: true, local: false, row: saved };
      } catch (e) {
        if (!isSchemaError(e)) console.warn('reading_sessions に保存できず端末に控えます:', e?.message || e);
      }
    }
    const local = { ...row, id: localId(), created_at: new Date().toISOString(), local: true };
    writeLocal([...readLocal(), local]);
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
    notify();
  }

  return { load, save, rows, subscribe, clearLocal, isLoaded: (userId) => loadedFor === (userId || null) };
}
