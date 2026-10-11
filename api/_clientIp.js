// 🌐 リクエストを送ってきた IP（2026-10-11 リリース前点検 低13・api の取り方をそろえた）。
//   Vercel は x-real-ip を実際の IP に上書きする（送り手が偽れない）。x-forwarded-for の先頭は送り手が
//   自由に足せるので、x-real-ip が無いとき（開発中など）だけ使う。IP は回数を数えるためだけに使い、保存しない。
import { createHmac } from 'node:crypto';

export function clientIp(req) {
  const h = req?.headers || {};
  const realIp = typeof h['x-real-ip'] === 'string' ? h['x-real-ip'].trim() : '';
  const fwd = typeof h['x-forwarded-for'] === 'string' ? h['x-forwarded-for'].split(',')[0].trim() : '';
  return (realIp || fwd || req?.socket?.remoteAddress || 'unknown').trim() || 'unknown';
}

// DB で回数を数えるときに IP の代わりに入れる値。サーバーの秘密の鍵と日付で作るので、
// 表を見ても IP に戻せず、日が変わると別の値になる（同じ人を日をまたいで追えない）。
export function ipHash(ip, day, secret) {
  const key = String(secret || '');
  if (!key) return null;
  return createHmac('sha256', key).update(`${day}|${ip}`).digest('hex').slice(0, 32);
}
