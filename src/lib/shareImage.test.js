import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./iap', () => ({ isNative: false }));

import { saveImage, isAppleTouchWeb } from './shareImage.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

const blob = new Blob(['x'], { type: 'image/jpeg' });

describe('isAppleTouchWeb', () => {
  it('iPhone と、Mac と名乗る iPad を見分ける', () => {
    expect(isAppleTouchWeb({ userAgent: IPHONE })).toBe(true);
    expect(isAppleTouchWeb({ userAgent: IPAD, maxTouchPoints: 5 })).toBe(true);
    expect(isAppleTouchWeb({ userAgent: IPAD, maxTouchPoints: 0 })).toBe(false);
    expect(isAppleTouchWeb({ userAgent: ANDROID })).toBe(false);
  });
});

describe('saveImage（画像を保存）', () => {
  let clicked;
  beforeEach(() => {
    clicked = 0;
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
    // テストは DOM なしで動くので、ダウンロードに使う a 要素だけ用意する。
    globalThis.document = {
      createElement: () => ({ click: () => { clicked += 1; }, remove: () => {} }),
      body: { appendChild: () => {} },
    };
  });

  it('iPhone のブラウザは、ダウンロードせず画像だけを共有シートに渡す', async () => {
    const share = vi.fn(async () => {});
    const nav = { userAgent: IPHONE, share, canShare: () => true };
    await expect(saveImage({ blob, filename: 'a.jpg', nav })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0];
    expect(arg.files).toHaveLength(1);
    expect(arg.text).toBeUndefined();
    expect(clicked).toBe(0);
  });

  it('共有シートを閉じただけなら cancelled（ダウンロードしない）', async () => {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    const nav = { userAgent: IPHONE, share: vi.fn(async () => { throw abort; }), canShare: () => true };
    await expect(saveImage({ blob, filename: 'a.jpg', nav })).resolves.toBe('cancelled');
    expect(clicked).toBe(0);
  });

  it('共有できない iPhone（古い版）はダウンロードに回す', async () => {
    const nav = { userAgent: IPHONE, share: vi.fn(), canShare: () => false };
    await expect(saveImage({ blob, filename: 'a.jpg', nav })).resolves.toBe('saved');
    expect(nav.share).not.toHaveBeenCalled();
    expect(clicked).toBe(1);
  });

  it('Android・パソコンは今までどおりダウンロード', async () => {
    const nav = { userAgent: ANDROID, share: vi.fn(), canShare: () => true };
    await expect(saveImage({ blob, filename: 'a.jpg', nav })).resolves.toBe('saved');
    expect(nav.share).not.toHaveBeenCalled();
    expect(clicked).toBe(1);
  });
});
