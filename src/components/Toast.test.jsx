// 知らせ（Toast.jsx）: 読み上げの入れ物はエラー用といつもの用に分けて、いつもある（2026-10-11）。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToastProvider } from './Toast';

describe('ToastProvider の読み上げの入れ物', () => {
  it('いつもの用（status・polite）とエラー用（alert・assertive）が最初からある', () => {
    const html = renderToStaticMarkup(<ToastProvider><p>x</p></ToastProvider>);
    expect(html).toMatch(/role="alert" aria-live="assertive"/);
    expect((html.match(/role="status" aria-live="polite"/g) || []).length).toBeGreaterThanOrEqual(2); // ✓ の HUD と下のバー
  });
});
