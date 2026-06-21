import { createClient } from '@supabase/supabase-js';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const MAX_TOKENS_DEFAULT = 4096;
const MAX_TOKENS_HARD_CAP = 8192;

// ───────────────────────────────────────────────────────────────────
// 🤖 月次 AI 利用量メータリング（KGI 原価ガード）
//
// 既存の「メモリ内 10 回/分」レート制限の上に、永続的な「月次累積上限」を
// 重ねる。狙いは "暴走（連打）を止めるランナウェイガード" であって、通常利用は
// 一切妨げないこと。
//
// 上限値の根拠:
//   使用モデル claude-sonnet-4-20250514 は $3 / 1M 入力・$15 / 1M 出力（≈¥150/$）。
//   最も重いコール = 🧠 マイ読書脳（最大 ~80 メモを RAG コンテキストに同梱、
//   出力上限 2048 tok）。worst-case で 入力 ~30K tok + 出力 2K tok ≈ $0.12 ≈ ¥18。
//   典型コールはこれよりずっと小さい（¥2〜6）。
//   経理ガードレールは ≤45 円/人・月、ハード床は 234 円/人・月。
//   通常ユーザーの AI 利用は月に数回程度（大半の操作はメモ/本管理）なので、
//   120 回/月は normal user がまず到達しない水準。worst-case を全コール最重で
//   見積もっても月 ¥18×120≈¥2160 まで振れうるが、それは「連打し続けた異常系」
//   であり、その異常系を止めるのがこの上限の役目。現実的な mixed 利用なら
//   120 回でも数百円規模に収まり、ハード床 234 円の超過は連打ユーザーに限定。
//   ローンチ後に実データで AI_MONTHLY_CALL_LIMIT を調整する前提（env で可変）。
// ───────────────────────────────────────────────────────────────────
const AI_MONTHLY_CALL_LIMIT = (() => {
  const raw = Number(process.env.AI_MONTHLY_CALL_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 120;
})();

// 'YYYY-MM'（UTC 基準の当月）。月をまたぐと別キーになり自動でリセット。
function currentPeriodMonth() {
  return new Date().toISOString().slice(0, 7);
}

// In-memory rate limit (per serverless instance — sufficient for low volume).
const rateLimitStore = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const arr = rateLimitStore.get(userId) || [];
  const recent = arr.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(
      1,
      Math.ceil((RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 1000)
    );
    return { ok: false, retryAfter };
  }
  recent.push(now);
  rateLimitStore.set(userId, recent);
  return { ok: true };
}

let supabaseClient = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  supabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

// service_role キーで作る Supabase クライアント。RLS をバイパスして ai_usage
// に書き込めるのはこのサーバーだけ。api/stripe-webhook.js の getServiceSupabase()
// と同一流儀。SUPABASE_SERVICE_ROLE_KEY はサーバー専用、クライアント露出厳禁。
let serviceClient = null;
function getServiceSupabase() {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

// 当月の利用回数が上限に達しているか判定する。
// 堅牢性最優先 — fail-open: service_role 未設定 / テーブル未適用（schema error）/
// インフラエラーのいずれでも、ブロックせず { exceeded: false } を返す。
// メータリング基盤の障害で AI 全体が止まることを避ける。ログだけ残す。
async function checkMonthlyUsage(userId) {
  const supabase = getServiceSupabase();
  if (!supabase) return { exceeded: false }; // schema-fallback: 集計不能なら通す
  try {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('calls')
      .eq('user_id', userId)
      .eq('period_month', currentPeriodMonth())
      .maybeSingle();
    if (error) {
      // テーブル未適用（does not exist）含め、取得エラーは fail-open。
      console.warn('[ai-usage] check failed (fail-open):', error.message);
      return { exceeded: false };
    }
    const calls = data?.calls || 0;
    return { exceeded: calls >= AI_MONTHLY_CALL_LIMIT, calls };
  } catch (e) {
    console.warn('[ai-usage] check threw (fail-open):', e?.message);
    return { exceeded: false };
  }
}

// 成功したコールの後に当月カウントを原子的に +1 する。
// fire-and-forget で呼んでよい（失敗してもユーザー応答には影響させない）。
// RPC が無い古い DB / service_role 未設定 / インフラエラーは握り潰す（fail-open）。
async function incrementMonthlyUsage(userId) {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: userId,
      p_period_month: currentPeriodMonth(),
    });
    if (error) {
      console.warn('[ai-usage] increment failed (ignored):', error.message);
    }
  } catch (e) {
    console.warn('[ai-usage] increment threw (ignored):', e?.message);
  }
}

function getBearerToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('Bearer ')) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase server credentials not configured' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
  const userId = userData.user.id;

  const rl = checkRateLimit(userId);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too Many Requests', retry_after: rl.retryAfter });
  }

  // 月次累積上限（KGI 原価ガード）。超過なら 429 で明確なメッセージ。
  // checkMonthlyUsage は fail-open（基盤障害 / 未適用テーブルなら通す）。
  const usage = await checkMonthlyUsage(userId);
  if (usage.exceeded) {
    return res.status(429).json({
      error: { message: '今月の AI 利用上限に達しました。来月またご利用いただけます。' },
      error_code: 'monthly_limit_exceeded',
    });
  }

  try {
    const body = req.body || {};
    const requestedTokens = Number.isFinite(body.max_tokens)
      ? Math.max(1, Math.floor(body.max_tokens))
      : MAX_TOKENS_DEFAULT;
    const maxTokens = Math.min(requestedTokens, MAX_TOKENS_HARD_CAP);
    const wantsStream = body.stream === true;

    const payload = { ...body, max_tokens: maxTokens };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    // Streaming pass-through: forward Anthropic's SSE body verbatim to the
    // browser so the first token reaches the client without buffering the
    // entire response. Upstream errors arrive as JSON, not SSE — detect by
    // content-type and short-circuit so the client still sees a normal
    // error body.
    if (wantsStream && response.ok && response.body) {
      const upstreamType = response.headers.get('content-type') || '';
      if (upstreamType.includes('text/event-stream')) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        // Vercel-specific: tell the edge layer not to buffer.
        res.setHeader('X-Accel-Buffering', 'no');
        res.status(response.status);
        // flushHeaders fires the response headers immediately so the
        // browser knows to start reading; without it some proxies hold the
        // first chunk back.
        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        const reader = response.body.getReader();
        try {
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            const { done, value } = await reader.read();
            if (done) break;
            if (value) res.write(Buffer.from(value));
          }
        } catch (streamErr) {
          console.error('Claude stream relay error:', streamErr);
        } finally {
          try { res.end(); } catch { /* socket may already be closed */ }
        }
        // ストリームが正常に開始 = 成功コールとして当月カウントを +1。
        // fire-and-forget（失敗してもユーザー応答には影響させない）。
        incrementMonthlyUsage(userId);
        return;
      }
    }

    const data = await response.json();
    // 上流が 2xx の成功レスポンスの時だけ当月カウントを +1。失敗（4xx/5xx）は
    // 課金されないコールが多いので quota を消費させない。fire-and-forget。
    if (response.ok) incrementMonthlyUsage(userId);
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Claude API error:', error);
    return res.status(500).json({ error: 'API request failed' });
  }
}
