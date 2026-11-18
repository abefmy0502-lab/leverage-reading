// 📤 画像を端末の共有シートに渡す／保存する。
//
// 1. ブラウザ・iOS の WebView で navigator.share がファイルを受け取れる → そのまま共有シート
// 2. iOS アプリ（Capacitor）でファイル共有が無い → @capacitor/filesystem でキャッシュに書き、
//    @capacitor/share でそのファイルを共有（dynamic import なので Web のバンドルには入らない。
//    パッケージを足したら `npx cap sync ios` が必要）
// 3. どちらも無い → 画像をダウンロード（a[download]）
//
// 戻り値: 'shared' | 'saved' | 'cancelled'
// navigator.share はタップの直後に呼ぶ必要がある（ユーザー操作の有効期間）。画像は先に作っておき、
// ここに来るまでに await を挟まない。

import { isNative } from './iap';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error || new Error('画像を読み込めませんでした。'));
    r.readAsDataURL(blob);
  });
}

async function shareNative(blob, filename, text) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  try {
    await Share.share({ files: [written.uri], ...(text ? { text } : {}), dialogTitle: '画像をシェア' });
  } catch (e) {
    // 共有シートを閉じただけ（iOS は「Share canceled」を投げる）は失敗にしない。
    if (/cancel/i.test(String(e?.message || e))) return 'cancelled';
    throw e;
  }
  return 'shared';
}

const isAbort = (e) => e?.name === 'AbortError' || /abort|cancel/i.test(String(e?.message || ''));

// text は共有シートで画像と一緒に渡す文（アプリによっては使われない）。
// 画像の種類は blob のまま（写真は JPEG・ほかは PNG＝shareCardLayout の shareImageType）。
export async function shareImage({ blob, filename, text = '' }) {
  const file = new File([blob], filename, { type: blob?.type || 'image/png' });
  let canShareFiles = false;
  try { canShareFiles = !!navigator.canShare?.({ files: [file] }); } catch { canShareFiles = false; }
  if (canShareFiles && navigator.share) {
    try {
      await navigator.share({ files: [file], ...(text ? { text } : {}) });
      return 'shared';
    } catch (e) {
      if (isAbort(e)) return 'cancelled';
      if (!isNative) throw e;
      // iOS の WebView が拒んだときは、下のネイティブの共有に回す。
    }
  }
  if (isNative) return shareNative(blob, filename, text);
  downloadBlob(blob, filename);
  return 'saved';
}

// iPhone・iPad のブラウザ（ホーム画面に置いた Orime も）。iPadOS は Mac と名乗るので触れる点で見分ける。
export function isAppleTouchWeb(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false;
  const ua = String(nav.userAgent || '');
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && Number(nav.maxTouchPoints || 0) > 1;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('画像を読み込めませんでした。'));
    r.readAsDataURL(blob);
  });
}

const isPhotoDenied = (e) => /denied|not authori[sz]ed|permission|access/i.test(String(e?.message || e || ''));

// 「画像を保存」（2026-11-18 オーナー「画像を保存を押したらファイルの画面になる・そのまま保存に」）:
//   - iPhone のアプリ: 写真にそのまま保存（@capacitor-community/media・要 Mac で `npx cap sync ios`）。
//     プラグインの無いビルドは、今までどおり共有シート（「画像を保存」が並ぶ）。
//   - iPhone・iPad のブラウザ: a[download] はファイルの画面（プレビューで開く）になって写真に入らないので、
//     画像だけを共有シートに渡す（いちばん上に「画像を保存」が出る）。await を挟まずに呼ぶ。
//   - ほか（Android・パソコン）: ダウンロード。
// 戻り値: 'photos'（写真に保存した）| 'saved'（ダウンロードした）| 'shared'（共有シートを開いた）| 'cancelled'
export async function saveImage({ blob, filename, nav = typeof navigator !== 'undefined' ? navigator : null }) {
  if (isNative) {
    try {
      const { Media } = await import('@capacitor-community/media');
      await Media.savePhoto({ path: await blobToDataUrl(blob) });
      return 'photos';
    } catch (e) {
      if (isPhotoDenied(e)) {
        throw new Error('写真への保存が許可されていません。設定アプリの「Orime」→「写真」で許可してください。');
      }
      // プラグインが入っていないビルド・保存に失敗したとき: 共有シートから保存できるようにする。
      return shareImage({ blob, filename });
    }
  }
  if (isAppleTouchWeb(nav) && nav?.share) {
    const file = new File([blob], filename, { type: blob?.type || 'image/png' });
    let ok = false;
    try { ok = !!nav.canShare?.({ files: [file] }); } catch { ok = false; }
    if (ok) {
      try {
        await nav.share({ files: [file] });
        return 'shared';
      } catch (e) {
        if (isAbort(e)) return 'cancelled';
        // 共有シートを開けなかったときだけ、下のダウンロードに回す。
      }
    }
  }
  downloadBlob(blob, filename);
  return 'saved';
}
