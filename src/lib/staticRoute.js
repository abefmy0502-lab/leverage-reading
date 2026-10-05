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

// 🚀 `/`（正規の URL・共有されるのはこちら）を開いた「はじめての人」には、アプリ本体（約 155KB）と
// 認証の確認・起動のスプラッシュを待たずに LP を出す（2026-10-05・LP の CRO 点検 P1-1）。
// 確実に「ログインしていない・アプリを入れていない・アプリの用事で来ていない」と言えるときだけ true。
// 迷ったら false（＝今までどおりアプリ本体を読み、App.jsx の shouldShowMarketingLanding が LP かログイン画面かを決める）。
//   - パスが `/` だけ
//   - URL の ? は LP の計測・確認用のものだけ（utm_*・hero・ref・fbclid・gclid・rev・開発中の founding / motion）
//     ＝?auth=・?checkout=・?tab=・?code= などアプリの用事は false
//   - # にログインの戻り（access_token= / error= など「=」を含むもの）が無い
//   - ホーム画面に追加した PWA（standalone）・iOS アプリ（Capacitor）ではない
//   - 端末に「一度ログイン画面まで来た人」（orime-returning）・Supabase のログインの記録（sb-…-auth-token）が無い
//   - お試しモード（npm run demo）ではない（お試しはアプリを見る場所）
// env: いま見ている window（テストで差し替える）
const LP_PARAMS = /^(utm_[a-z]+|hero|ref|fbclid|gclid|rev|founding|motion)$/;
export function landingAtRoot(env = (typeof window !== 'undefined' ? window : null), { demo = false } = {}) {
  if (!env || demo) return false;
  try {
    const { location, localStorage: ls, navigator: nav } = env;
    if (!/^https?:$/.test(location.protocol)) return false; // capacitor:// など
    if (env.Capacitor?.isNativePlatform?.()) return false;
    const raw = location.pathname || '/';
    const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
    if (path !== '/') return false;
    const sp = new URLSearchParams(location.search || '');
    for (const key of sp.keys()) if (!LP_PARAMS.test(key)) return false;
    if (String(location.hash || '').includes('=')) return false;
    const standalone = (env.matchMedia && env.matchMedia('(display-mode: standalone)').matches) || nav?.standalone === true;
    if (standalone) return false;
    if (!ls) return false;
    if (ls.getItem('orime-returning') === 'true') return false;
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i) || '';
      if (/^sb-.*-auth-token$/.test(k)) return false;
    }
    return true;
  } catch {
    return false; // 読めないときは今までどおり（アプリ本体が決める）
  }
}

// main.jsx と mainStatic.jsx が使う入口の判定（静的ページ ＋ `/` のはじめての人の LP）。
export function entryRoute(opts) {
  return staticPageRoute() || (landingAtRoot(undefined, opts) ? 'lp' : null);
}
