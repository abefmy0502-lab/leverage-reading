import { describe, it, expect } from 'vitest';
import { checkSharePhoto, classifyNativePhotoError, nativePhotoDeniedMessage, canUseNativePhoto } from './sharePhotoPick';

const file = (name, type, size = 1000) => ({ name, type, size });

describe('checkSharePhoto', () => {
  it('写真が無ければ no-file', () => {
    expect(checkSharePhoto(null)).toBe('no-file');
  });
  it('JPEG・PNG・WebP は使える', () => {
    expect(checkSharePhoto(file('a.jpg', 'image/jpeg'))).toBe(null);
    expect(checkSharePhoto(file('a.png', 'image/png'))).toBe(null);
    expect(checkSharePhoto(file('a.webp', 'image/webp'))).toBe(null);
  });
  it('HEIC は大きさだけ確かめる', () => {
    expect(checkSharePhoto(file('a.heic', 'image/heic'))).toBe(null);
    expect(checkSharePhoto(file('a.heic', 'image/heic', 11 * 1024 * 1024))).toMatch(/大きすぎ/);
  });
  it('画像でないものと大きすぎるものは理由を返す', () => {
    expect(checkSharePhoto(file('a.pdf', 'application/pdf'))).toMatch(/JPEG/);
    expect(checkSharePhoto(file('a.jpg', 'image/jpeg', 11 * 1024 * 1024))).toMatch(/大きすぎ/);
  });
});

describe('ネイティブの写真', () => {
  it('Web ではプラグインを使わない', () => {
    expect(canUseNativePhoto()).toBe(false);
  });
  it('失敗を やめた／許可なし／そのほか に分ける', () => {
    expect(classifyNativePhotoError(new Error('User cancelled photos app'))).toBe('cancel');
    expect(classifyNativePhotoError(new Error('User denied access to camera'))).toBe('denied');
    expect(classifyNativePhotoError(new Error('Permission to access photos was denied'))).toBe('denied');
    expect(classifyNativePhotoError(new Error('boom'))).toBe('error');
  });
  it('許可の場所を案内する', () => {
    expect(nativePhotoDeniedMessage('camera')).toContain('設定 → Orime → カメラ');
    expect(nativePhotoDeniedMessage('album')).toContain('設定 → Orime → 写真');
  });
});
