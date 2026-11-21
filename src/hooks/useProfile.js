// 👤 プロフィールを画面のどこからでも同じ値で読む（設定・初回ガイド・相談・写真で共有）。
//   1 人ぶんを覚えておき、保存したら読んでいる画面すべてに知らせる。
import { useEffect, useState } from 'react';
import { loadProfile, saveProfile, EMPTY_PROFILE } from '../lib/profile';

let cache = { uid: null, profile: null, stored: 'none' };
const listeners = new Set();
const emit = () => listeners.forEach((fn) => { try { fn(cache); } catch { /* 画面の都合 */ } });

export function setProfileCache(uid, profile, stored) {
  cache = { uid, profile, stored };
  emit();
}

export async function saveProfileShared(uid, input) {
  const res = await saveProfile(uid, input);
  setProfileCache(uid, res.profile, res.stored);
  return res;
}

export function resetProfileCache() {
  cache = { uid: null, profile: null, stored: 'none' };
  emit();
}

/** { profile, stored, loading, error }。uid が無い間は空。 */
export function useProfile(uid) {
  const [state, setState] = useState(() => (cache.uid === uid && cache.profile ? { ...cache, loading: false, error: null } : { profile: { ...EMPTY_PROFILE }, stored: 'none', loading: !!uid, error: null }));
  useEffect(() => {
    const on = (c) => { if (c.uid === uid && c.profile) setState({ profile: c.profile, stored: c.stored, loading: false, error: null }); };
    listeners.add(on);
    if (!uid) { setState({ profile: { ...EMPTY_PROFILE }, stored: 'none', loading: false, error: null }); return () => listeners.delete(on); }
    if (cache.uid === uid && cache.profile) on(cache);
    else {
      let alive = true;
      loadProfile(uid).then((r) => { if (alive) setProfileCache(uid, r.profile, r.stored); })
        .catch((error) => { if (alive) setState((s) => ({ ...s, loading: false, error })); });
      return () => { alive = false; listeners.delete(on); };
    }
    return () => listeners.delete(on);
  }, [uid]);
  return state;
}
