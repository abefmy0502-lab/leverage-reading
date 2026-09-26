import React from 'react';
import { captureError } from '../lib/sentry';
import { SUPPORT_EMAIL } from '../lib/contact';

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

      return (
        <div
          style={{
            padding: '48px 24px',
            fontFamily: "var(--font-app)",
            color: 'var(--c-ink)',
            background: 'var(--color-bg)',
            minHeight: '100vh',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 72, marginBottom: 20, lineHeight: 1 }} aria-hidden="true">😔</div>
          <h1 style={{ fontSize: 22, margin: '0 0 12px', fontWeight: 700 }}>
            申し訳ありません
          </h1>
          <p style={{ fontSize: 14, color: 'var(--c-ink-soft)', lineHeight: 1.8, margin: '0 0 8px', maxWidth: 360 }}>
            予期せぬエラーが発生しました。
          </p>
          <p style={{ fontSize: 13, color: 'var(--c-ink-2)', lineHeight: 1.8, margin: '0 0 28px', maxWidth: 360 }}>
            ご不便をおかけして申し訳ございません。<br />
            お手数ですが、ホームに戻る か 再読み込み をお試しください。
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleHome}
              style={{
                padding: '12px 24px',
                background: 'var(--c-brand)',
                color: 'var(--accent-ink)',
                border: 'none',
                borderRadius: 999,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                minHeight: 44,
              }}
            >
              ホームに戻る
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                color: 'var(--c-brand)',
                border: '1px solid var(--c-hairline-strong)',
                borderRadius: 999,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 500,
                minHeight: 44,
              }}
            >
              再読み込み
            </button>
          </div>
          <a
            href={mailto}
            style={{
              marginTop: 24,
              fontSize: 12,
              color: 'var(--c-ink-2)',
              textDecoration: 'underline',
            }}
          >
            このエラーを報告する
          </a>
          {isDev && (
            <pre
              style={{
                fontSize: 11,
                color: '#b75050',
                marginTop: 32,
                padding: 12,
                background: 'var(--c-card)',
                border: '1px solid var(--c-hairline)',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                textAlign: 'left',
                maxWidth: 520,
                width: '100%',
              }}
            >
              {String(this.state.error)}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
