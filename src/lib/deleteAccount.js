// 🗑 退会をサーバーで終える（2026-11-21・api/_deleteAccount.js・App 審査 5.1.1(v)）。
//   アプリが本・メモ・写真などを消し、削除の依頼を残したあとに呼ぶ。Apple でサインインした人は、先に Apple の画面で
//   確かめて受け取った authorizationCode を渡す（サーバーが Apple の許可を取り消す）。
//   戻り値 true＝アカウントまで消えた／false＝サーバーで終えられなかった（依頼の行が残るので運営が 7 日以内に終える）。
import { supabase, isSupabaseConfigured, isDemo } from './supabase';
import { apiUrl } from './apiUrl';
import { appleCodeForDeletion } from './appleAuth';

export const isAppleAccount = (user) => (user?.identities || []).some((i) => i?.provider === 'apple') || user?.app_metadata?.provider === 'apple';

export async function finishAccountDeletion(user, { fetchImpl = fetch, getCode = appleCodeForDeletion } = {}) {
  if (isDemo || !isSupabaseConfigured || !user?.id) return false;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return false;
    const appleCode = isAppleAccount(user) ? await getCode() : '';
    const res = await fetchImpl(apiUrl('/api/claude'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ op: 'delete_account', appleCode }),
    });
    if (!res.ok) return false;
    const j = await res.json().catch(() => null);
    return !!j?.ok;
  } catch {
    return false;
  }
}
