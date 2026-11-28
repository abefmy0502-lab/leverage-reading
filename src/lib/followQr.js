// 🔳 QR コードでフォロー（2026-11-28 オーナー「インスタグラムのように QR コードでアカウント交換できるようにしたい」）。
//   自分の QR＝フォローのリンク（SITE_URL/?follow=<public_id>）。相手がアプリの「QR コードを読み取る」で読むと、
//   その場でフォローの確かめの画面が開く。スマホのカメラで読んだときも同じリンク（Web のフォローの画面）が開く。
//   画像は端末の中で作る（qrcode-generator）。読んだ映像はどこにも送らない。
import qrcode from 'qrcode-generator';
import { SITE_URL } from './legalLinks';
import { publicIdFrom } from './social';

/** フォローのリンク（QR に入れる文字）。ID が無ければ ''。 */
export function followLink(publicId) {
  const id = publicIdFrom(publicId);
  return id ? `${SITE_URL}/?follow=${id}` : '';
}

/**
 * QR の黒いマスを 1 本の SVG の道（path の d）にする。size はマスの数（周りの余白は呼ぶ側で足す）。
 * 誤り訂正は M（15%）＝真ん中に小さな印を重ねても読める。文字が無ければ null。
 */
export function qrPath(text, ecl = 'M') {
  const s = String(text || '');
  if (!s) return null;
  const qr = qrcode(0, ecl);
  qr.addData(s);
  qr.make();
  const size = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < size; r += 1) {
    // 横に続く黒いマスは 1 本の長方形にまとめる（道の文字数を減らす）。
    let c = 0;
    while (c < size) {
      if (!qr.isDark(r, c)) { c += 1; continue; }
      let run = 1;
      while (c + run < size && qr.isDark(r, c + run)) run += 1;
      d += `M${c} ${r}h${run}v1h-${run}z`;
      c += run;
    }
  }
  return { size, d };
}

/**
 * 読んだ QR の文字を分ける。
 *   { kind: 'follow', id } … orime のフォローのリンク・公開のページ・ID
 *   { kind: 'self' }       … 自分の QR
 *   { kind: 'other' }      … orime のものではない
 */
export function scanResult(text, myPublicId = '') {
  const raw = String(text || '').trim();
  if (!raw) return { kind: 'other' };
  // ID だけの文字（10 字の英小文字と数字）は、ほかの QR と取り違えやすいので、リンクの形のときだけ受け取る。
  const looksLikeLink = /^https?:\/\//i.test(raw) || raw.startsWith('/');
  if (!looksLikeLink) return { kind: 'other' };
  const id = publicIdFrom(raw);
  if (!id) return { kind: 'other' };
  if (myPublicId && id === String(myPublicId).toLowerCase()) return { kind: 'self' };
  return { kind: 'follow', id };
}
