// 🌐 iOS アプリ（Capacitor）から自前 API を呼ぶための CORS。
//
// アプリは capacitor://localhost で動くので、https://orime.vercel.app/api/* は別オリジン扱い。
// Authorization ヘッダー付きの POST はプリフライト（OPTIONS）が先に飛ぶため、許可する
// オリジンのときだけ Access-Control-* を返す。Web（同じオリジン）には何も足さない。
// ファイル名が _ で始まるので Vercel のルート（/api/_cors）にはならない。
const NATIVE_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost',
]);

// 戻り値 true = OPTIONS に応答済み（呼び出し側はそのまま return する）
export function applyCors(req, res, methods = 'GET, POST, OPTIONS') {
  const origin = req.headers?.origin;
  if (origin && NATIVE_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
