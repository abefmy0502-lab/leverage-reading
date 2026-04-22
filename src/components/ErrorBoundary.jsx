import React from 'react';

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
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 40,
            fontFamily: "'Noto Serif JP', Georgia, serif",
            color: '#3d362c',
            background: '#f5f0e8',
            minHeight: '100vh',
            boxSizing: 'border-box',
          }}
        >
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>エラーが発生しました</h1>
          <p style={{ fontSize: 14, color: '#8a7e6b', lineHeight: 1.7 }}>
            アプリケーションで予期せぬエラーが発生しました。<br />
            再読み込みをお試しください。問題が続く場合は、アプリを一度閉じてから再度開いてください。
          </p>
          <pre
            style={{
              fontSize: 11,
              color: '#b75050',
              marginTop: 16,
              padding: 12,
              background: '#faf6f0',
              border: '1px solid #e4ddd0',
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {String(this.state.error)}
          </pre>
          <button
            onClick={this.handleReload}
            style={{
              marginTop: 16,
              padding: '10px 20px',
              background: '#5c5043',
              color: '#faf6f0',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          >
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
