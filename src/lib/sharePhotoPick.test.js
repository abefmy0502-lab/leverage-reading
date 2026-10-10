import { describe, it, expect } from 'vitest';
import { checkSharePhoto, classifyNativePhotoError, nativePhotoDeniedMessage, canUseNativePhoto, photoPickErrorText, SHARE_PHOTO_TYPE_MESSAGE, SHARE_PHOTO_SIZE_MESSAGE } from './sharePhotoPick';

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

describe('写真で共有の言い方（2026-10-11）', () => {
  it('形式違い・大きすぎは共有の写真の言い方で', () => {
    expect(checkSharePhoto(file('a.pdf', 'application/pdf'))).toBe(SHARE_PHOTO_TYPE_MESSAGE);
    expect(SHARE_PHOTO_TYPE_MESSAGE).toBe('この写真は使えません。JPEG・PNG・WebP の写真を選んでください。');
    expect(checkSharePhoto(file('a.jpg', 'image/jpeg', 11 * 1024 * 1024))).toBe(SHARE_PHOTO_SIZE_MESSAGE);
    expect(checkSharePhoto(file('a.heic', 'image/heic', 11 * 1024 * 1024))).toBe(SHARE_PHOTO_SIZE_MESSAGE);
    expect(SHARE_PHOTO_SIZE_MESSAGE).toBe('この写真は大きすぎます。10 MB 以下の写真を選んでください。');
  });
  it('access だけでは許可なしにしない', () => {
    expect(classifyNativePhotoError(new Error('Unable to access the file'))).toBe('error');
    expect(classifyNativePhotoError(new Error('User has not authorized'))).toBe('denied');
    expect(classifyNativePhotoError(new Error('PERMISSION missing'))).toBe('denied');
  });
  it('どちらか聞いたときは、拒まれた方で分ける', () => {
    expect(nativePhotoDeniedMessage('prompt', new Error('User denied access to camera'))).toContain('設定 → Orime → カメラ');
    expect(nativePhotoDeniedMessage('prompt', new Error('User denied access to photos'))).toContain('設定 → Orime → 写真');
    expect(nativePhotoDeniedMessage('prompt', new Error('denied'))).toBe('カメラか写真を使えません。設定 → Orime で許可してください。');
  });
  it('受け取れなかった失敗の文はそのまま（オフラインの文にすり替えない）', () => {
    const e = new Error(nativePhotoDeniedMessage('camera'));
    e.kind = 'denied';
    expect(photoPickErrorText(e)).toBe('カメラを使えません。設定 → Orime → カメラ をオンにしてください。');
    expect(photoPickErrorText(new Error('Failed to fetch'))).toBe(null);
    expect(photoPickErrorText(null)).toBe(null);
  });
});
