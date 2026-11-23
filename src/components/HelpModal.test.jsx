// 📖 ヘルプの「開く ›」（2026-11-23）: 開いた場所が扱える画面（openTargets）の項目にだけ出す。渡されなければ出さない。
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HelpModal from './HelpModal';

vi.mock('../hooks/useFocusTrap', () => ({ useFocusTrap: () => ({ current: null }) }));

const openButtons = (html) => [...html.matchAll(/aria-label="([^"]+)を開く"/g)].map((m) => m[1]);

describe('HelpModal の「開く ›」', () => {
  it('onOpen が無ければ出さない', () => {
    const html = renderToStaticMarkup(<HelpModal helpKey="bookList" onClose={() => {}} />);
    expect(openButtons(html)).toEqual([]);
  });

  it('扱える画面の項目にだけ出す', () => {
    const html = renderToStaticMarkup(
      <HelpModal helpKey="bookList" onClose={() => {}} openTargets={['profile']} onOpen={() => {}} />,
    );
    expect(openButtons(html)).toEqual(['プロフィール']);
  });
});
