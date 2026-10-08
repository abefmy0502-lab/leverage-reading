// 🕰 いまの日時（端末の日付）。月末・12 月だけの「写真で共有」の声かけと「今年」が使う（2026-10-08）。
//
// 本番はいつも new Date()。
// 🧪 お試しモード（開発専用）だけ &today=YYYY-MM-DD で日付を差し替えられる（時刻はいまのまま）。
//   例 &today=2026-11-29（月末の声かけ）・&today=2026-12-03（今年の読書）
// サンプルデータ（src/demo/seed.js）もこの日付から数えて作るので、差し替えた日付でも自然に見える。
// 本番は import.meta.env.DEV=false で読まない。

function readDemoToday() {
  try {
    if (!(import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true') || typeof window === 'undefined') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URLSearchParams(window.location.search).get('today') || '');
    return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
  } catch {
    return null;
  }
}

const DEMO_TODAY = readDemoToday();

export function appNow() {
  const d = new Date();
  if (DEMO_TODAY) d.setFullYear(DEMO_TODAY[0], DEMO_TODAY[1], DEMO_TODAY[2]);
  return d;
}
