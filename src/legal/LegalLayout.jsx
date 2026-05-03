// 📜 法的ページ共通レイアウト — /legal/terms · /legal/privacy · /legal/sct
//
// LP と同じ html.lp-active 仕組みでメインアプリの overflow:hidden + 100dvh
// レイアウトを解除する。タイトル / description は <head> に注入。
// 戻り先は document.referrer が同一オリジン LP なら戻る、無ければ /lp。

import { useEffect } from 'react';
import '../pages/landing.css';
import '../pages/legal.css';

const setMeta = (name, content, attr = 'name') => {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
};

export default function LegalLayout({ title, description, children }) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = `${title} | レバレッジ読書ログ`;
    const tags = description ? [setMeta('description', description)] : [];

    const root = document.getElementById('root');
    document.documentElement.classList.add('lp-active');
    document.body.classList.add('lp-active');
    if (root) root.classList.add('lp-active');
    const prev = {
      htmlOverflow: document.documentElement.style.overflow,
      htmlHeight: document.documentElement.style.height,
      bodyOverflow: document.body.style.overflow,
      bodyHeight: document.body.style.height,
      rootOverflow: root?.style.overflow ?? '',
      rootHeight: root?.style.height ?? '',
      rootDisplay: root?.style.display ?? '',
    };
    document.documentElement.style.overflow = 'auto';
    document.documentElement.style.height = 'auto';
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    if (root) {
      root.style.overflow = 'visible';
      root.style.height = 'auto';
      root.style.display = 'block';
    }
    window.scrollTo(0, 0);

    return () => {
      document.title = prevTitle;
      tags.forEach((el) => el && el.parentElement && el.parentElement.removeChild(el));
      document.documentElement.classList.remove('lp-active');
      document.body.classList.remove('lp-active');
      if (root) root.classList.remove('lp-active');
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.documentElement.style.height = prev.htmlHeight;
      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.height = prev.bodyHeight;
      if (root) {
        root.style.overflow = prev.rootOverflow;
        root.style.height = prev.rootHeight;
        root.style.display = prev.rootDisplay;
      }
    };
  }, [title, description]);

  return (
    <div className="lp-root">
      <div className="legal-page">
        <header className="legal-header">
          <a href="/lp" className="back-to-lp">← トップに戻る</a>
          <h1>{title}</h1>
        </header>

        <main className="legal-content">
          {children}
        </main>

        <footer className="legal-footer">
          <div className="legal-footer-links">
            <a href="/legal/terms">利用規約</a>
            <a href="/legal/privacy">プライバシーポリシー</a>
            <a href="/legal/sct">特定商取引法に基づく表記</a>
            <a href="mailto:leverage.book0502@gmail.com">お問い合わせ</a>
          </div>
          <p className="legal-copyright">© 2026 レバレッジ読書ログ</p>
        </footer>
      </div>
    </div>
  );
}
