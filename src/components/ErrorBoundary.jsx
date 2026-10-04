import React from 'react';
import { captureError } from '../lib/sentry';
import { SUPPORT_EMAIL } from '../lib/contact';
import { btnPrimary, btnGhost, btnLink } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
    // Sentry が初期化されていれば送信、無ければ no-op。
    captureError(error, { componentStack: info?.componentStack });
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
      const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('【Orime】エラー報告')}&body=${encodeURIComponent('発生した操作: ＿＿＿＿＿＿\n\n参考エラー (任意):\n')}${errorTextForReport}`;

      // 見た目はトークンと ui.js の部品だけ（DESIGN §5 空・エラー・2026-10-04）。以前は 72px の絵文字・
      // 丸いピルのボタン・12〜14px の文字・説明の重ねがけ（「申し訳ありません」「ご不便を…」）が残っていた。
      // 題 1 つ＋次の操作の一言＋主ボタン 1 つ（ホームに戻る）・副ボタン（再読み込み）・文字ボタン（報告）。
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            boxSizing: 'border-box',
            padding: 'calc(var(--space-16) + env(safe-area-inset-top, 0px)) max(env(safe-area-inset-right, 0px), var(--space-4)) max(env(safe-area-inset-bottom, 0px), var(--space-4)) max(env(safe-area-inset-left, 0px), var(--space-4))',
            fontFamily: 'var(--font-ui)',
            color: 'var(--text)',
            background: 'var(--bg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
            <h1 style={{ fontSize: 'var(--text-heading)', fontWeight: 600, lineHeight: 1.3, color: 'var(--text)', margin: '0 0 var(--space-3)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {withPhraseBreaks('予期せぬエラーが起きました')}
            </h1>
            <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 var(--space-6)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {withPhraseBreaks('ホームに戻るか、読み込み直してください。')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <button type="button" onClick={this.handleHome} style={btnPrimary}>ホームに戻る</button>
              <button type="button" onClick={this.handleReload} style={btnGhost}>読み込み直す</button>
            </div>
            <a href={mailto} style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 'var(--space-3)', textDecoration: 'none' }}>
              このエラーを報告する
            </a>
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
