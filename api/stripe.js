// 💳 Stripe の 2 つの入口を 1 つの関数に（2026-11-07）。Vercel の Hobby プランは関数が 12 本までで、
// api/mcp.js を足した 13 本目で公開が止まった。URL は vercel.json の rewrite でそのまま:
//   /api/stripe-checkout → /api/stripe?op=checkout（本体 api/_stripeCheckout.js）
//   /api/stripe-portal   → /api/stripe?op=portal（本体 api/_stripePortal.js）
// アプリ（src/lib/billing.js）は変えない。
import checkout from './_stripeCheckout.js';
import portal from './_stripePortal.js';

export default async function handler(req, res) {
  const op = req.query?.op;
  if (op === 'checkout') return checkout(req, res);
  if (op === 'portal') return portal(req, res);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).json({ error: 'Not found' });
}
