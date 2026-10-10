// 📷 写真で共有の写真を受け取る（2026-10-11）。
//   - iPhone のアプリ（Capacitor）に Camera のプラグイン（@capacitor/camera）が入っていれば、それでカメラ／フォトライブラリを
//     直接開く。<input type="file"> だと iOS が「写真を撮る／フォトライブラリ」のメニューをもう一度出し、選ぶシートと二重になるため。
//     プラグインが入っていないビルド（要 Mac で `npm i && npx cap sync ios`）・Web は今までどおり隠した input を使う。
//     Info.plist に NSCameraUsageDescription / NSPhotoLibraryUsageDescription が要る（無いと開いた瞬間に落ちる）。
//   - 受け取った写真は、共有のシートを開く前に形と大きさを確かめる（checkSharePhoto・HEIC は大きさだけ）。
//   写真はこの端末の中だけで使う（アップロードしない）。
import { Capacitor } from '@capacitor/core';
import { validateImageFile, MAX_IMAGE_BYTES } from './limits';

// HEIC は端末（iOS の Safari）が JPEG に直して渡すことが多いが、そのまま来たときも読めれば使う。
// 戻り値: null＝使える／'no-file'＝写真が無い（やめた）／それ以外＝利用者に見せる理由。
export const SHARE_PHOTO_TYPE_MESSAGE = 'この写真は使えません。JPEG・PNG・WebP の写真を選んでください。';
export const SHARE_PHOTO_SIZE_MESSAGE = 'この写真は大きすぎます。10 MB 以下の写真を選んでください。';
export function checkSharePhoto(file) {
  if (!file) return 'no-file';
  const heic = /image\/hei[cf]/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
  if (heic) return file.size > MAX_IMAGE_BYTES ? SHARE_PHOTO_SIZE_MESSAGE : null;
  if (!validateImageFile(file)) return null;
  // 共有の写真のための言い方に（「選び直す」と一緒に出す・2026-10-11）。
  return typeof file.size === 'number' && file.size > MAX_IMAGE_BYTES ? SHARE_PHOTO_SIZE_MESSAGE : SHARE_PHOTO_TYPE_MESSAGE;
}

// ネイティブのカメラのプラグインを使えるか（同期で決める＝使えなければ、押した指の中で input を開く必要があるため）。
export function canUseNativePhoto() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Camera');
  } catch {
    return false;
  }
}

// プラグインの失敗を 3 つに分ける: やめた（cancel）／許可が無い（denied）／そのほか（error）。
export function classifyNativePhotoError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (/cancel/.test(msg)) return 'cancel';
  if (/denied|not authorized|permission/i.test(msg)) return 'denied';
  return 'error';
}

// 許可が無いときの知らせ（どこで許可するか）。どちらか聞いた（prompt）ときは、拒まれたのがカメラか写真かを文から見る。
export function nativePhotoDeniedMessage(source, err) {
  let which = source;
  if (source === 'prompt') {
    const msg = String(err?.message || err || '').toLowerCase();
    which = /camera/.test(msg) ? 'camera' : /photo|librar|gallery|album/.test(msg) ? 'album' : null;
  }
  if (which === 'camera') return 'カメラを使えません。設定 → Orime → 「カメラ」をオンにしてください。';
  if (which === 'album') return '写真を使えません。設定 → Orime → 「写真」で許可してください。';
  return 'カメラか写真を使えません。設定 → Orime で許可してください。';
}

// カメラ（source='camera'）かフォトライブラリ（'album'）、どちらか聞く（'prompt'＝シートの「写真」のチップ）を開き、File を返す。やめたら null。
// 許可が無い・読めないときは Error（.kind = 'denied' | 'error'・.message は利用者に見せられる文）を投げる。
export async function pickNativePhoto(source) {
  let photo;
  try {
    const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera');
    photo = await Camera.getPhoto({
      source: source === 'camera' ? CameraSource.Camera : source === 'prompt' ? CameraSource.Prompt : CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 90,
      correctOrientation: true,
      saveToGallery: false,
    });
  } catch (err) {
    const kind = classifyNativePhotoError(err);
    if (kind === 'cancel') return null;
    const e = new Error(kind === 'denied' ? nativePhotoDeniedMessage(source, err) : 'この写真は読み込めませんでした。');
    e.kind = kind;
    throw e;
  }
  if (!photo?.webPath) return null;
  try {
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    const fmt = String(photo.format || 'jpeg').toLowerCase();
    const ext = fmt === 'jpg' ? 'jpeg' : fmt;
    const type = blob.type || `image/${ext}`;
    return new File([blob], `photo.${ext === 'jpeg' ? 'jpg' : ext}`, { type });
  } catch {
    const e = new Error('この写真は読み込めませんでした。');
    e.kind = 'error';
    throw e;
  }
}

// 写真を受け取れなかったときに見せる文。pickNativePhoto が投げた失敗（.kind つき）は、その文をそのまま
// （許可が無いのにオフラインの文にすり替わらないように・2026-10-11）。それ以外は null＝呼ぶ側の toMessage に任せる。
export function photoPickErrorText(err) {
  return err && err.kind && err.message ? String(err.message) : null;
}

// 失敗の知らせに付ける操作（2026-10-11）: 許可が無い（.kind === 'denied'）ときは「設定を開く」＝iPhone のアプリの設定を
// 直接開く（@capacitor/app-launcher の openUrl('app-settings:')・プラグインの無いビルドと Web は開けないので「選び直す」）。
// それ以外の失敗は「選び直す」。操作つきの知らせは 8 秒出す。
export const PHOTO_FAIL_TOAST_MS = 8000;
export function canOpenAppSettings() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AppLauncher');
  } catch {
    return false;
  }
}
export function photoFailActionKind(err, { canSettings = canOpenAppSettings() } = {}) {
  return err && err.kind === 'denied' && canSettings ? 'settings' : 'reselect';
}
export async function openAppSettings() {
  try {
    const { AppLauncher } = await import('@capacitor/app-launcher');
    await AppLauncher.openUrl({ url: 'app-settings:' });
    return true;
  } catch {
    return false;
  }
}
// 知らせの操作 { label, onClick } を作る。onReselect＝同じ入口でもう一度選ぶ。
export function photoFailAction(err, onReselect, opts) {
  return photoFailActionKind(err, opts) === 'settings'
    ? { label: '設定を開く', onClick: () => { openAppSettings(); } }
    : { label: '選び直す', onClick: onReselect };
}
