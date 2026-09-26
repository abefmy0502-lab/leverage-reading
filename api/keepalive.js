// 🫀 Supabase keepalive — 無料プランの自動一時停止（7日間アクセス無しで pause）を防ぐ。
//
// 経緯: 開発を約2ヶ月止めていた間に Supabase プロジェクトが自動で一時停止され、
// 本番アプリがログインできなくなった（DNS 解決不可＝ERR_NAME_NOT_RESOLVED）。
// 週1の push-cron は「通知機能が未設定なら DB に触れずに終わる」作りのため、
// 生存確認の役に立っていなかった。本エンドポイントは Vercel Cron から毎日呼ばれ、
// DB に極小の読み取りを 1 回だけ行う。
//
// 本番公開後に実ユーザーがいるなら、根本対策は Supabase Pro への移行（自動停止が
// 無くなり、日次バックアップも付く）。これは無料プラン期間の保険。
//
// 認証: Vercel Cron が付与する Authorization: Bearer <CRON_SECRET>（push-cron と同一）。
// 未設定・不一致は 401（fail-closed）。レスポンスに内部情報は含めない。

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';

function getBearerToken(req) {
  const raw = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (typeof raw !== 'string' || !raw.startsWith('Bearer ')) return null;
  return raw.slice(7).trim() || null;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return cryptoTimingSafeEqual(bufA, bufB);
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = getBearerToken(req);
  return Boolean(token) && safeEqual(token, secret);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ ok: false, error: 'not-configured' });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 実際に Postgres まで届く最小のクエリ（1行・1列）。
  const { error } = await supabase.from('books').select('id').limit(1);
  if (error) {
    console.error('[keepalive] query failed:', error.message);
    return res.status(502).json({ ok: false });
  }
  return res.status(200).json({ ok: true });
}
