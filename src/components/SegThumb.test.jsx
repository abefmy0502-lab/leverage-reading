// 滑る面（SegThumb・2026-10-28）: 面の位置と大きさの計算と、描く印。DOM の無いテスト（この project は node 環境）。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SegThumb, { thumbBox } from './SegThumb';

const btn = { offsetLeft: 104, offsetTop: 2, offsetWidth: 100, offsetHeight: 40 };

describe('SegThumb', () => {
  it('面は選んでいるボタンの位置と大きさそのもの', () => {
    expect(thumbBox(btn)).toEqual({ x: 104, y: 2, width: 100, height: 40 });
    expect(thumbBox(btn, 'face-strong')).toEqual({ x: 104, y: 2, width: 100, height: 40 });
  });

  it('下線は高さ 2 でボタンの下端に', () => {
    expect(thumbBox({ offsetLeft: 0, offsetTop: 0, offsetWidth: 80, offsetHeight: 44 }, 'underline')).toEqual({ x: 0, y: 42, width: 80, height: 2 });
  });

  it('押せない飾りで、最初は動かさずに置く（data-ready=0）', () => {
    const html = renderToStaticMarkup(<SegThumb activeKey="a" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="seg-thumb seg-thumb--face"');
    expect(html).toContain('data-ready="0"');
    expect(renderToStaticMarkup(<SegThumb activeKey="a" variant="underline" />)).toContain('seg-thumb--underline');
  });
});
