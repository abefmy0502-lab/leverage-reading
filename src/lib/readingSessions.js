// ⏱📚 読書の時間の記録（集中モード・2026-10-09）。
//
// 保存先は reading_sessions（supabase_reading_sessions.sql・RLS で本人だけ）。
// 表がまだ無い DB・つながらないときは、端末の localStorage（orime.readingSessions.v1）に控える
// （ほかの端末には出ない・その端末の合計には入る）。読むときは、表の行と端末の控えを合わせて数える。
// 同じ画面のどこからでも同じ一覧を見られるよう、読み込みは 1 回だけ（subscribe で知らせる）。
//
// 🛡 2026-10-10 監査:
//   - 端末の控えは利用者 id ごとの鍵（orime.readingSessions.v1:<id>）。同じ端末で別のアカウントに替えても、
//     前の人の読書の時間を数えない・送らない。前の版の鍵（利用者なし）の控えは、次に読み込んだ利用者のものとして
//     1 回だけ移す（移したら前の鍵は消す）。
//   - 利用者が替わったら、表の行（serverRows）と読み込みの途中（loading）も空にする。
//   - 表に入らない行（その本がもう無い 23503・本人の本でない 42501・値が決まりに合わない 23514・空の値 23502）は
//     控えから外す。ほかの理由で入らない行も、続けて MAX_SYNC_TRIES 回入らなければ外す（いつまでも送り続けない）。
import { isSchemaError } from './errors';
import { readFocusState, saveFocusState, sessionRow } from './readingTime';

// 前の版の鍵（利用者なし）。ログインしていない・設定の無い環境の控えにも使う。
export const LOCAL_SESSIONS_KEY = 'orime.readingSessions.v1';
export const LOCAL_SESSIONS_MOVED_KEY = 'orime.readingSessions.v1.moved';
export const localSessionsKey = (userId) => (userId ? `${LOCAL_SESSIONS_KEY}:${userId}` : LOCAL_SESSIONS_KEY);
export const MAX_SYNC_TRIES = 5;
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
// 送っても入らない行（その本がもう無い・本人の本でない＝RLS・値が決まりに合わない・空の値）。
const DROP_CODES = new Set(['23503', '42501', '23514', '23502', '22P02']);
const isUnsendable = (e) => DROP_CODES.has(String(e?.code || ''));
// サーバーが答えた失敗か（コードがある）。コードが無い失敗はつながらない＝数えない。
const hasCode = (e) => !!String(e?.code || '').trim();

export function createReadingSessionStore({ getClient = () => null, storage = defaultStorage } = {}) {
  let serverRows = [];
  let currentUser; // いまの利用者（替わったら表の行と読み込みの途中を空にする）
  let loadedFor = null; // 読み込めた利用者の id（読み込みに失敗したら入れない＝次に頼まれたとき・つながったときにもう一度）
  let triedFor = null; // 読み込みを試した利用者の id（失敗も含む・画面の「読み込み済み」）
  let tableMissing = false;
  let loading = null;
  let syncing = null;
  let loadTok = null; // いまの読み込み・送信の印（利用者が替わったら外す＝前の人の途中を待たない）
  let syncTok = null;
  const subs = new Set();

  // 前の版の鍵（利用者なし）の控えを、この利用者のものとして 1 回だけ移す。
  const moveLegacy = (userId) => {
    if (!userId) return;
    try {
      const st = storage();
      if (!st || st.getItem(LOCAL_SESSIONS_MOVED_KEY)) return;
      const raw = st.getItem(LOCAL_SESSIONS_KEY);
      st.setItem(LOCAL_SESSIONS_MOVED_KEY, '1');
      if (!raw) return;
      const legacy = JSON.parse(raw);
      st.removeItem(LOCAL_SESSIONS_KEY);
      if (!Array.isArray(legacy) || legacy.length === 0) return;
      const mine = JSON.parse(st.getItem(localSessionsKey(userId)) || '[]');
      const ids = new Set((Array.isArray(mine) ? mine : []).map((r) => r?.id));
      const merged = [...(Array.isArray(mine) ? mine : []), ...legacy.filter((r) => r && !ids.has(r.id))];
      st.setItem(localSessionsKey(userId), JSON.stringify(merged.slice(-LOCAL_MAX)));
    } catch { /* 移せなければ前の鍵のまま（数えない） */ }
  };
  const readLocal = (userId = currentUser) => {
    if (userId === undefined) return []; // まだだれの分か決まっていない（最初の読み込みの前）
    try {
      const list = JSON.parse(storage()?.getItem(localSessionsKey(userId)) || '[]');
      return Array.isArray(list) ? list.filter((r) => r && r.book_id && Number.isFinite(Number(r.seconds))) : [];
    } catch {
      return [];
    }
  };
  const writeLocal = (list, userId = currentUser) => {
    try {
      if (list.length === 0) storage()?.removeItem(localSessionsKey(userId));
      else storage()?.setItem(localSessionsKey(userId), JSON.stringify(list.slice(-LOCAL_MAX)));
    } catch { /* 入らなければ控えない */ }
  };
  // 利用者が替わったら、前の人の表の行・読み込みの途中を空にする。
  const switchUser = (userId) => {
    const id = userId || null;
    if (currentUser === id) return;
    currentUser = id;
    serverRows = [];
    loadedFor = null;
    triedFor = null;
    tableMissing = false;
    loading = null;
    syncing = null;
    loadTok = null;
    syncTok = null;
    moveLegacy(id);
    notify();
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
    if (!client || !userId || userId !== currentUser || tableMissing || loadedFor !== userId) return;
    if (syncing) return syncing;
    const tok = {};
    syncTok = tok;
    const run = (async () => {
      try {
        // 前の版の控え（id が uuid でない）は、送る前に uuid を付け直して控えにも書き戻す（送り直しても二重にしない）。
        let local = readLocal(userId);
        if (local.length === 0) return;
        if (local.some((r) => !UUID_RE.test(String(r.id || '')))) {
          local = local.map((r) => (UUID_RE.test(String(r.id || '')) ? r : { ...r, id: newSessionId() }));
          writeLocal(local, userId);
        }
        const toRow = (r) => ({
          id: r.id, user_id: userId, book_id: r.book_id, started_at: r.started_at, ended_at: r.ended_at,
          seconds: Math.round(Number(r.seconds) || 0), mode: r.mode === 'count' ? 'count' : 'timer',
        });
        const done = new Set();
        const failed = new Set();
        const sent = [];
        const { error } = await client.from('reading_sessions').upsert(local.map(toRow), { onConflict: 'id', ignoreDuplicates: true });
        if (!error) {
          local.forEach((r) => { done.add(r.id); sent.push(toRow(r)); });
        } else if (isSchemaError(error)) {
          tableMissing = true;
          return;
        } else if (!hasCode(error)) {
          return; // つながらない: 次につながったときにもう一度（数えない）
        } else {
          // まとめて入らなかった（消えた本・決まりに合わない行が混じっている等）→ 1 行ずつ。
          for (const r of local) {
            // eslint-disable-next-line no-await-in-loop
            const res = await client.from('reading_sessions').upsert([toRow(r)], { onConflict: 'id', ignoreDuplicates: true });
            if (!res.error) { done.add(r.id); sent.push(toRow(r)); } else if (isUnsendable(res.error)) done.add(r.id);
            else if (hasCode(res.error)) failed.add(r.id);
            else break; // 途中でつながらなくなった
          }
        }
        if (currentUser !== userId) return; // 途中で利用者が替わった
        if (done.size === 0 && failed.size === 0) return;
        // 入った行・入らない行は控えから外す。ほかの理由で入らなかった行は回数を数え、上限で外す。
        writeLocal(readLocal(userId).flatMap((r) => {
          if (done.has(r.id)) return [];
          if (!failed.has(r.id)) return [r];
          const tries = (Number(r.tries) || 0) + 1;
          return tries >= MAX_SYNC_TRIES ? [] : [{ ...r, tries }];
        }), userId);
        const ids = new Set(serverRows.map((r) => r.id));
        serverRows = [...sent.filter((r) => !ids.has(r.id)), ...serverRows];
        notify();
      } catch (e) {
        console.warn('端末に控えた読書の時間を送れませんでした:', e?.message || e);
      } finally {
        if (syncTok === tok) { syncTok = null; syncing = null; }
      }
    })();
    if (syncTok === tok) syncing = run;
    return run;
  }

  async function load(userId, { force = false } = {}) {
    switchUser(userId);
    const client = getClient();
    if (!client || !userId) { loadedFor = userId || null; triedFor = loadedFor; notify(); return rows(); }
    if (!force && loadedFor === userId) return rows();
    if (loading) return loading;
    let ok = false;
    const tok = {};
    loadTok = tok;
    const run = (async () => {
      try {
        const { data, error } = await client
          .from('reading_sessions')
          .select(SELECT)
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(5000);
        if (error) throw error;
        if (currentUser !== userId) return rows(); // 読んでいる間に利用者が替わった＝捨てる
        serverRows = Array.isArray(data) ? data : [];
        tableMissing = false;
        loadedFor = userId;
        ok = true;
      } catch (e) {
        if (currentUser !== userId) return rows();
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
        if (currentUser === userId) triedFor = userId;
        if (loadTok === tok) { loadTok = null; loading = null; }
        notify();
      }
      if (ok) await syncLocal(userId);
      return rows();
    })();
    if (loadTok === tok) loading = run;
    return run;
  }

  // 1 回分を残す。表に入らなければ端末に控える（同じ id）。戻り値: { ok, local, row }
  async function save(userId, row) {
    if (!row || !row.book_id) return { ok: false, local: false, row: null };
    switchUser(userId);
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
        if (currentUser === userId) serverRows = [saved, ...serverRows.filter((r) => r.id !== saved.id)];
        notify();
        return { ok: true, local: false, row: saved };
      } catch (e) {
        // 本がもう無い・本人の本でない・決まりに合わない行は、控えても入らない（控えない）
        if (isUnsendable(e)) {
          console.warn('reading_sessions に入らない行でした:', e?.code);
          return { ok: false, local: false, row: null };
        }
        if (!isSchemaError(e)) console.warn('reading_sessions に保存できず端末に控えます:', e?.message || e);
      }
    }
    const local = { ...withId, created_at: new Date().toISOString(), local: true };
    writeLocal([...readLocal(userId).filter((r) => r.id !== local.id), local], userId);
    notify();
    return { ok: true, local: true, row: local };
  }

  function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }

  // データの初期化・退会のあと（いまの利用者の端末の控えと、前の版の鍵の控えも消す）。
  function clearLocal() {
    try { storage()?.removeItem(localSessionsKey(currentUser)); } catch { /* ignore */ }
    try { storage()?.removeItem(LOCAL_SESSIONS_KEY); } catch { /* ignore */ }
    serverRows = [];
    loadedFor = null;
    triedFor = null;
    notify();
  }

  // ログアウトの前（まだ表に書けるうちに）: 途中の集中モードを 1 回分として残してから、途中の状態を消す。
  // 30 秒に満たない・本の分からない回は残さない。残せなくても（端末に控えられなくても）途中の状態は消す
  // （次にログインした別の人の画面で再開しない）。
  async function flushBeforeSignOut(userId, { now = Date.now(), focusStore } = {}) {
    try {
      const st = focusStore === undefined ? readFocusState() : readFocusState(focusStore);
      const row = st ? sessionRow(st, now) : null;
      if (row && userId) await save(userId, row);
    } catch { /* 残せなくてもログアウトは止めない */ }
    if (focusStore === undefined) saveFocusState(null); else saveFocusState(null, focusStore);
    switchUser(null);
  }

  return {
    load, save, rows, subscribe, clearLocal, syncLocal, flushBeforeSignOut,
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
