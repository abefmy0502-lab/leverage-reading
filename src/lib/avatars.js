// 🙂 自分のアイコン（2026-11-21 オーナー「右上のボタンは設定マークではなく自分のアイコンに・10 種類くらいから選べるように」）。
//   選べるのは決まった 10 個だけ（画像を上げさせない＝人の写真や好ましくない絵が入らない・App 審査 1.2）。
//   色は代用表紙と同じ --cover-*（明暗で変えない・白い絵が 4.5:1 以上で読める暗さ）。栗色のアクセントと紛れないよう、
//   茶色の組（1・5・6）は 1 つまで（青・緑・紫を主に・2026-11-21 ui-critic）。
//   保存はプロフィール（profiles.avatar・lib/profile.js）。選んでいなければ、ニックネームの最初の 1 字か人の形。

export const AVATARS = [
  { id: 'book', label: '本', icon: 'BookOpen', color: 3 },
  { id: 'coffee', label: 'コーヒー', icon: 'Coffee', color: 6 },
  { id: 'leaf', label: '葉', icon: 'Leaf', color: 4 },
  { id: 'moon', label: '月', icon: 'Moon', color: 2 },
  { id: 'sun', label: '太陽', icon: 'Sun', color: 4 },
  { id: 'feather', label: '羽根', icon: 'Feather', color: 2 },
  { id: 'mountain', label: '山', icon: 'Mountain', color: 4 },
  { id: 'waves', label: '波', icon: 'Waves', color: 3 },
  { id: 'cat', label: 'ねこ', icon: 'Cat', color: 2 },
  { id: 'bird', label: '鳥', icon: 'Bird', color: 3 },
];

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

/** 決まった id だけ通す（それ以外は ''）。 */
export function cleanAvatarId(id) {
  const s = String(id || '').trim();
  return BY_ID.has(s) ? s : '';
}

export function avatarById(id) {
  return BY_ID.get(cleanAvatarId(id)) || null;
}

/** 背景の色（代用表紙と同じ 2 色の重なり）。 */
export function avatarBackground(avatar) {
  if (!avatar) return 'var(--fill)';
  return `linear-gradient(160deg, var(--cover-${avatar.color}a), var(--cover-${avatar.color}b))`;
}

/** アイコンを選んでいないときの 1 字（ニックネームの最初の字・無ければ ''）。 */
export function avatarInitial(nickname) {
  const ch = Array.from(String(nickname || '').trim())[0] || '';
  return /[\s\p{P}\p{S}]/u.test(ch) ? '' : ch.toUpperCase();
}
