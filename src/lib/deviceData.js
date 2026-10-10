// 🧹 データの初期化・退会のときに消す、端末の中だけの控え（2026-10-10）。
// 表に入らなかった読書の時間・途中の集中モード・この本で学べることの控え・相談から足した行動の印・
// 視点の地図の設定・写真で共有の選び方など。消すのはこの一覧と接頭辞に当たるものだけ（ほかのアプリの設定は残す）。
export const DEVICE_DATA_KEYS = [
  'brain-cleared-at', 'brain-weekly-q', 'brain-weekly-dismissed', 'leverage-memo-snap',
  'orime.readingSessions.v1', 'orime.focus.v1', 'orime.consult.actionAdded.v1',
];
export const DEVICE_DATA_PREFIXES = ['orime.bookBrief.v1:', 'orime.viewmap:', 'orime.share.'];

function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

// 戻り値: 消したキーの数。
export function clearDeviceData(store = defaultStorage()) {
  if (!store) return 0;
  let n = 0;
  try {
    const keys = [];
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (k && (DEVICE_DATA_KEYS.includes(k) || DEVICE_DATA_PREFIXES.some((p) => k.startsWith(p)))) keys.push(k);
    }
    DEVICE_DATA_KEYS.forEach((k) => { if (!keys.includes(k)) keys.push(k); });
    keys.forEach((k) => { try { if (store.getItem(k) != null) n += 1; store.removeItem(k); } catch { /* ignore */ } });
  } catch { /* ignore */ }
  return n;
}
