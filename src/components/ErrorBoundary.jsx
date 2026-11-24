import React from 'react';
import { captureError } from '../lib/sentry';
import { SUPPORT_EMAIL } from '../lib/contact';
import { btnPrimary, btnGhost, btnLink } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';

// あとから読む JS（lazy の import）が取れなかったときの文（ブラウザごと）。
export function isChunkLoadError(err) {
  const m = String(err?.message || err || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|Loading CSS chunk/i.test(m);
}

// 同じ URL で 1 回だけ（端末に残せないときは読み直さない＝無限に回さない）。
const RELOAD_KEY = 'orime.reloadOnce';
export function reloadOnce(storage = (typeof window !== 'undefined' ? window.sessionStorage : null), href = (typeof window !== 'undefined' ? window.location.href : '')) {
  try {
    if (!storage) return false;
    if (storage.getItem(RELOAD_KEY) === href) return false;
    storage.setItem(RELOAD_KEY, href);
    return true;
  } catch { return false; }
}

// 1 回読み直しても部品が取れないとき（新しい版に切り替わる途中は、古い画面の元がしばらく返る・2026-11-21 Chrome の点検で約 1 分）、
//   間をあけて自動で読み直す: 5・10・20・30 秒（合わせて約 1 分）。同じ URL で 5 分以内の続きだけ数える。尽きたら null＝ふつうのエラーの画面。
export const CHUNK_RETRY_DELAYS_MS = [5000, 10000, 20000, 30000];
const CHUNK_RETRY_KEY = 'orime.chunkRetry';
export function nextChunkRetry(storage = (typeof window !== 'undefined' ? window.sessionStorage : null), href = (typeof window !== 'undefined' ? window.location.href : ''), now = Date.now()) {
  try {
    if (!storage) return null;
    let rec = null;
    try { rec = JSON.parse(storage.getItem(CHUNK_RETRY_KEY) || 'null'); } catch { rec = null; }
    const fresh = rec && rec.href === href && now - (rec.at || 0) < 5 * 60 * 1000;
    const n = fresh ? (rec.n || 0) : 0;
    if (n >= CHUNK_RETRY_DELAYS_MS.length) return null;
    storage.setItem(CHUNK_RETRY_KEY, JSON.stringify({ href, n: n + 1, at: now }));
    return CHUNK_RETRY_DELAYS_MS[n];
  } catch { return null; }
}

// エラーの画面と「新しい版に切り替えています」で同じ組み方（DESIGN §5「アプリ全体のエラーの画面」）。
const ERROR_PAGE = {
  minHeight: '100vh',
  boxSizing: 'border-box',
  padding: 'calc(var(--space-16) + env(safe-area-inset-top, 0px)) max(env(safe-area-inset-right, 0px), var(--space-4)) max(env(safe-area-inset-bottom, 0px), var(--space-4)) max(env(safe-area-inset-left, 0px), var(--space-4))',
  fontFamily: 'var(--font-ui)',
  color: 'var(--text)',
  background: 'var(--bg)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};
const ERROR_BODY = { width: '100%', maxWidth: 400, textAlign: 'center' };
const ERROR_TITLE = { fontSize: 'var(--text-heading)', fontWeight: 600, lineHeight: 1.3, color: 'var(--text)', margin: '0 0 var(--space-3)', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const ERROR_LEAD = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 var(--space-6)', wordBreak: 'keep-all', overflowWrap: 'anywhere' };

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, retrying: false };
  }

  componentWillUnmount() {
    clearTimeout(this.retryTimer);
    if (this.onOnline) window.removeEventListener('online', this.onOnline);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
    // Sentry が初期化されていれば送信、無ければ no-op。
    captureError(error, { componentStack: info?.componentStack });
    // 🔁 画面の部品（あとから読む JS）が読めなかっただけなら、1 回だけ読み込み直す（2026-10-22・LP で「予期せぬエラー」）。
    //   新しい版を出した直後に古い HTML が残っていたとき・通信が途中で切れたときに起きる。中身の誤りではないので
    //   利用者に見せず、同じ URL で 1 回だけ自動で読み直す（2 回目は見せる＝無限に読み直さない）。
    if (isChunkLoadError(error)) {
      // つながっていないときは「新しい版」ではない: つながったら 1 回だけ読み直す（回数を使い切らない・2026-11-21 ui-critic）。
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.setState({ retrying: 'offline' });
        this.onOnline = () => window.location.reload();
        window.addEventListener('online', this.onOnline, { once: true });
        return;
      }
      if (reloadOnce()) { window.location.reload(); return; }
      const wait = nextChunkRetry();
      if (wait != null) {
        this.setState({ retrying: 'update' });
        this.retryTimer = setTimeout(() => window.location.reload(), wait);
      }
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    // ホームに戻る = 状態をリセットして / にナビゲート
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // 本番ではスタックや内部状態を露出させない (ユーザーには無価値で
      // セキュリティ上もリスク)。開発時のみ詳細を出す。
      const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
      const errorTextForReport = encodeURIComponent(String(this.state.error || '').slice(0, 500));
      const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('【orime】エラー報告')}&body=${encodeURIComponent('発生した操作: ＿＿＿＿＿＿\n\n参考エラー (任意):\n')}${errorTextForReport}`;

      // 見た目はトークンと ui.js の部品だけ（DESIGN §5 空・エラー・2026-10-04）。以前は 72px の絵文字・
      // 丸いピルのボタン・12〜14px の文字・説明の重ねがけ（「申し訳ありません」「ご不便を…」）が残っていた。
      // 題 1 つ＋次の操作の一言＋主ボタン 1 つ（ホームに戻る）・副ボタン（再読み込み）・文字ボタン（報告）。
      // 新しい版に切り替わる途中: 謝らず・待てば開くことと、いま読み直す操作だけ（自動で読み直す）。
      if (this.state.retrying) {
        const offline = this.state.retrying === 'offline';
        return (
          <div role="status" style={ERROR_PAGE}>
            <div style={ERROR_BODY}>
              <h1 style={ERROR_TITLE}>{withPhraseBreaks(offline ? 'オフラインです' : '新しい版に切り替えています')}</h1>
              <p style={ERROR_LEAD}>{withPhraseBreaks(offline ? 'つながったら、自動で開き直します。' : '1 分ほどで、自動で開き直します。')}</p>
              <button type="button" onClick={this.handleReload} style={btnGhost}>いま読み込み直す</button>
            </div>
          </div>
        );
      }
      return (
        <div role="alert" style={ERROR_PAGE}>
          <div style={ERROR_BODY}>
            <h1 style={ERROR_TITLE}>
              {withPhraseBreaks('画面を表示できませんでした')}
            </h1>
            <p style={ERROR_LEAD}>
              {withPhraseBreaks('ホームに戻るか、読み込み直してください。')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <button type="button" onClick={this.handleHome} style={btnPrimary}>ホームに戻る</button>
              <button type="button" onClick={this.handleReload} style={btnGhost}>読み込み直す</button>
            </div>
            <a href={mailto} style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 'var(--space-3)', textDecoration: 'none' }}>
              このエラーを報告する
            </a>
            {/* 英語のエラーの文（URL つき）は画面に出さず、報告のメールの本文にだけ入れる（2026-11-23・前は 12/400 で画面の下に出ていた）。 */}
            {isDev && (
              <pre
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--error)',
                  marginTop: 'var(--space-8)',
                  padding: 'var(--space-3)',
                  background: 'var(--surface)',
                  border: '1px solid var(--separator)',
                  borderRadius: 'var(--radius)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  textAlign: 'left',
                }}
              >
                {String(this.state.error)}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
