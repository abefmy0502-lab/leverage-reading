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
export function checkSharePhoto(file) {
  if (!file) return 'no-file';
  const heic = /image\/hei[cf]/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
  if (heic) return file.size > MAX_IMAGE_BYTES ? '画像が大きすぎます。1 枚あたり 10 MB 以下にしてください。' : null;
  return validateImageFile(file);
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
  if (/denied|permission|not authorized|access/.test(msg)) return 'denied';
  return 'error';
}

// 許可が無いときの知らせ（どこで許可するか）。
export function nativePhotoDeniedMessage(source) {
  return source === 'camera'
    ? 'カメラを使えません。設定 → Orime → カメラ をオンにしてください。'
    : '写真を使えません。設定 → Orime → 写真 で許可してください。';
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
    const e = new Error(kind === 'denied' ? nativePhotoDeniedMessage(source) : 'この写真は読み込めませんでした。');
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
