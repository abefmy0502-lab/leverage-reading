import { describe, it, expect } from 'vitest';
import { nativePhotoDeniedShort, deniedWhich, photoFailActionKind, photoFailAction, PHOTO_FAIL_TOAST_MS, canOpenAppSettings, checkSharePhoto, classifyNativePhotoError, nativePhotoDeniedMessage, canUseNativePhoto, photoPickErrorText, SHARE_PHOTO_TYPE_MESSAGE, SHARE_PHOTO_SIZE_MESSAGE } from './sharePhotoPick';

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
    expect(nativePhotoDeniedMessage('camera')).toContain('設定 → Orime で、カメラをオンに');
    expect(nativePhotoDeniedMessage('album')).toContain('設定 → Orime で、写真へのアクセスを許可');
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
    expect(nativePhotoDeniedMessage('prompt', new Error('User denied access to camera'))).toContain('設定 → Orime で、カメラをオンに');
    expect(nativePhotoDeniedMessage('prompt', new Error('User denied access to photos'))).toContain('設定 → Orime で、写真へのアクセスを許可');
    expect(nativePhotoDeniedMessage('prompt', new Error('denied'))).toBe('カメラか写真を使えません。設定 → Orime で許可してください。');
  });
  it('受け取れなかった失敗の文はそのまま（オフラインの文にすり替えない）', () => {
    const e = new Error(nativePhotoDeniedMessage('camera'));
    e.kind = 'denied';
    expect(photoPickErrorText(e)).toBe('カメラを使えません。設定 → Orime で、カメラをオンにしてください。');
    expect(photoPickErrorText(new Error('Failed to fetch'))).toBe(null);
    expect(photoPickErrorText(null)).toBe(null);
  });
});

describe('失敗の知らせの操作', () => {
  it('許可が無く設定を開けるときだけ「設定を開く」', () => {
    expect(photoFailActionKind({ kind: 'denied' }, { canSettings: true })).toBe('settings');
    expect(photoFailActionKind({ kind: 'denied' }, { canSettings: false })).toBe('reselect');
    expect(photoFailActionKind({ kind: 'error' }, { canSettings: true })).toBe('reselect');
    expect(photoFailActionKind(null, { canSettings: true })).toBe('reselect');
  });
  it('Web では設定を開けない＝許可なしでも「選び直す」', () => {
    expect(canOpenAppSettings()).toBe(false);
    expect(photoFailActionKind({ kind: 'denied' })).toBe('reselect');
  });
  it('操作の名前と、選び直すの呼び出し', () => {
    let called = 0;
    const a = photoFailAction({ kind: 'error' }, () => { called += 1; });
    expect(a.label).toBe('選び直す');
    a.onClick();
    expect(called).toBe(1);
    expect(photoFailAction({ kind: 'denied', which: 'camera' }, () => {}, { canSettings: true }).label).toBe('設定を開く');
    expect(PHOTO_FAIL_TOAST_MS).toBe(8000);
  });
});

describe('許可なしの知らせ（2026-10-11 の 5 回目）', () => {
  const denied = (which) => ({ kind: 'denied', which, message: nativePhotoDeniedMessage(which || 'prompt') });
  it('設定を開けるときは短い文＋「設定を開く」', () => {
    const a = photoFailAction(denied('camera'), () => {}, { canSettings: true });
    expect(a.message).toBe('カメラの使用が許可されていません。');
    expect(a.label).toBe('設定を開く');
    expect(photoFailAction(denied('album'), () => {}, { canSettings: true }).message).toBe('写真の使用が許可されていません。');
    expect(photoFailAction(denied(null), () => {}, { canSettings: true }).message).toBe('カメラか写真の使用が許可されていません。');
  });
  it('設定を開けないときは道順の文だけ・操作なし', () => {
    const a = photoFailAction(denied('camera'), () => {}, { canSettings: false });
    expect(a.label).toBe(null);
    expect(a.onClick).toBe(null);
    expect(a.message).toBe('カメラを使えません。設定 → Orime で、カメラをオンにしてください。');
  });
  it('ほかの失敗は文を差し替えず「選び直す」', () => {
    const a = photoFailAction({ kind: 'error', message: 'x' }, () => {}, { canSettings: true });
    expect(a.message).toBe(null);
    expect(a.label).toBe('選び直す');
  });
  it('道順の文に括弧を使わない（折り返しの行頭に来ないように）', () => {
    for (const w of ['camera', 'album', 'prompt']) expect(nativePhotoDeniedMessage(w)).not.toMatch(/[「『（]/);
  });
  it('短い文は 2 行に収まる長さ', () => {
    for (const w of ['camera', 'album', null]) expect(nativePhotoDeniedShort(w).length).toBeLessThanOrEqual(20);
  });
  it('拒まれた方', () => {
    expect(deniedWhich('camera')).toBe('camera');
    expect(deniedWhich('album')).toBe('album');
    expect(deniedWhich('prompt', new Error('denied'))).toBe(null);
  });
});
