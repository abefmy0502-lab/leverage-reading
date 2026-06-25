import React from 'react';
import { captureError } from '../lib/sentry';

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
      const mailto = `mailto:leverage.book0502@gmail.com?subject=${encodeURIComponent('【Orime】エラー報告')}&body=${encodeURIComponent('発生した操作: ＿＿＿＿＿＿\n\n参考エラー (任意):\n')}${errorTextForReport}`;

      return (
        <div
          style={{
            padding: '48px 24px',
            fontFamily: "'Noto Serif JP', Georgia, serif",
            color: '#3d362c',
            background: '#f5f0e8',
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
          <p style={{ fontSize: 14, color: '#5c5548', lineHeight: 1.8, margin: '0 0 8px', maxWidth: 360 }}>
            予期せぬエラーが発生しました。
          </p>
          <p style={{ fontSize: 13, color: '#6b5f4d', lineHeight: 1.8, margin: '0 0 28px', maxWidth: 360 }}>
            ご不便をおかけして申し訳ございません。<br />
            お手数ですが、ホームに戻る か 再読み込み をお試しください。
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleHome}
              style={{
                padding: '12px 24px',
                background: '#5c5043',
                color: '#faf6f0',
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
                color: '#5c5043',
                border: '1px solid #d4ccbe',
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
              color: '#6b5f4d',
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
                background: '#faf6f0',
                border: '1px solid #e4ddd0',
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
