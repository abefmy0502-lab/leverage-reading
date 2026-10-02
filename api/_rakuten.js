// 🅁 楽天ブックス API の呼び出し（表紙探し api/cover.js と本の検索 api/_bookSearch.js で共有）。
//
// 認証は applicationId + accessKey + Referer（2026 の楽天 API 刷新・どれか欠けると 400/403）。
// Vercel の fetch(undici) は Referer を禁止ヘッダーとして剥がすため、Node の https で直接送る。
// ファイル名が _ で始まるので Vercel のルートにはならない。

import https from 'node:https';

export const RAKUTEN_TIMEOUT_MS = 4000;

// 鍵と Referer（無ければ configured: false・呼び出し側は静かに飛ばす）。
export function rakutenCreds(env = process.env) {
  const appId = (env.RAKUTEN_APPLICATION_ID || '').trim();
  const accessKey = (env.RAKUTEN_ACCESS_KEY || '').trim();
  const referer = (env.RAKUTEN_APP_URL || '').trim();
  return { appId, accessKey, referer, configured: !!(appId && accessKey) };
}

// GET して { status, body } を返す（本文は 1MB まで）。通信の失敗は reject。
export function rakutenGet(urlStr, referer, timeoutMs = RAKUTEN_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { reject(e); return; }
    const headers = { Accept: 'application/json' };
    if (referer) { headers.Referer = referer; headers.Origin = referer; }
    const req = https.request(
      { hostname: u.hostname, path: `${u.pathname}${u.search}`, method: 'GET', headers },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          data += c;
          if (data.length > 1_000_000) {
            data = data.slice(0, 1_000_000);
            resolve({ status: res.statusCode || 200, body: data });
            req.destroy();
          }
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

// 楽天の API の URL（apiPath は 'BooksBook/Search' / 'BooksTotal/Search'）。
export function rakutenUrl(apiPath, params) {
  return `https://openapi.rakuten.co.jp/services/api/${apiPath}/20170404?${new URLSearchParams(params).toString()}`;
}

// 応答の Items を平らな配列に（{ Item: {...} } と {...} のどちらの形でも）。
export function rakutenItems(data) {
  return (Array.isArray(data?.Items) ? data.Items : [])
    .map((raw) => (raw && raw.Item ? raw.Item : raw))
    .filter((it) => it && typeof it === 'object');
}

const toHttps = (u) => (u ? String(u).replace(/^http:/i, 'https:') : '');
// 楽天のサムネ URL の _ex サイズ指定を拡大（既定は 120x120 程度で粗い）。
export function rakutenUpscale(url) {
  if (!url) return '';
  return toHttps(String(url)).replace(/_ex=\d+x\d+/, '_ex=420x420');
}
// 楽天は表紙の無い本に「noimage」の画像を返す → 表紙なしとして扱う。
export function rakutenRealImage(u) {
  return u && !/noimage/i.test(String(u)) ? u : '';
}
