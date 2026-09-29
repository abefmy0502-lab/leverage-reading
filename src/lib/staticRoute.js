// 🧭 LP・法的ページ（アプリの外の静的なページ）かどうかを、アプリ本体を読む前に決める。
// main.jsx が使う: 静的ページならアプリ本体（App.jsx 一式）を読まずに、そのページだけを読む。
// 判定は App.jsx の useLpRoute と同じ（変えるときは両方そろえる）。
// 返り値は 'lp' | 'terms' | 'privacy' | 'sct' | null（null = アプリ）。
export function staticPageRoute() {
  if (typeof window === 'undefined') return null;
  const raw = window.location.pathname;
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  if (path === '/legal/terms' || path === '/lp/terms') return 'terms';
  if (path === '/legal/privacy' || path === '/lp/privacy') return 'privacy';
  if (path === '/legal/sct' || path === '/lp/contact') return 'sct';
  if (path === '/lp' || path.startsWith('/lp/')) return 'lp';
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('view') === 'lp') return 'lp';
  } catch { /* ignore */ }
  return null;
}
