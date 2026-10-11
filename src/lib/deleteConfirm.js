// ⚠️ 退会（アカウント削除）の確認で入れてもらう言葉（2026-10-11 リリース前点検）。
//
// ふだんは自分のメールアドレス。Apple でサインインの人と、Apple の「メールを非公開」の人
// （…@privaterelay.appleid.com＝本人が覚えていない宛先）は、メールを打てないので「削除」と入れれば進める。
// メールが無いアカウントも「削除」。

export const DELETE_WORD = '削除';

export function isAppleAccount(user) {
  if (!user) return false;
  const meta = user.app_metadata || {};
  const providers = Array.isArray(meta.providers) ? meta.providers : [];
  const email = String(user.email || '').toLowerCase();
  return meta.provider === 'apple' || providers.includes('apple') || email.endsWith('@privaterelay.appleid.com');
}

// { byWord, expected }: byWord なら「削除」、そうでなければメールアドレス。
export function deleteConfirmTarget(user) {
  const email = String(user?.email || '').trim();
  if (!email || isAppleAccount(user)) return { byWord: true, expected: DELETE_WORD };
  return { byWord: false, expected: email };
}

// 入れた言葉が合っているか（前後の空白と大文字・小文字は区別しない）。
export function deleteConfirmMatches(text, target) {
  return String(text || '').trim().toLowerCase() === String(target?.expected || '').toLowerCase();
}
