import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_cors.js';
import { monthlyBudgetJpy, trialBudgetJpy, estimateCost, costFromUsage, createUsageSniffer } from './_aiCost.js';
import {
  decideAiAccess, decideFreeReservation, freePeriodKey, nextMonthFirstLabel,
  planRequiredMessage, freeLimitMessage, trialLimitMessage,
} from './_aiAccess.js';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const MAX_TOKENS_DEFAULT = 4096;
const MAX_TOKENS_HARD_CAP = 4096; // アプリの最大要求（テーマまとめ等）と同じ。改造クライアントでの出力青天井を防ぐ

// リクエスト body の上限バイト数。vision（写真→AI 書き起こし / 表紙）は
// クライアントで長辺 1568px JPEG に縮小済み（src/lib/image.js）なので、正規利用
// では数百 KB に収まる。1.5MB を超える body は「異常 / 悪用（巨大画像・大量
// メッセージの注入）」とみなして 413 で弾く（upstream への過大トークン課金 +
// メモリ肥大の予防）。Vercel の bodyParser 既定上限とは別の、アプリ層のガード。
const MAX_BODY_BYTES = 1.5 * 1024 * 1024;
const MAX_TEXT_CHARS = 150_000;
// 🎁 無料プラン（契約なし）の相談 1 回の上限。相談の材料（約 9,000 字＋歩み・本ごとの答え方も）が入る大きさ。
const FREE_MAX_TEXT_CHARS = 30_000;
const FREE_MAX_TOKENS = 3000;
const FREE_MODEL = 'claude-haiku-4-5';

// system + messages に含まれる文字の総数（画像は数えない）。
function countTextChars(body) {
  let n = 0;
  const add = (v) => {
    if (typeof v === 'string') { n += v.length; return; }
    if (Array.isArray(v)) {
      for (const b of v) {
        if (typeof b === 'string') n += b.length;
        else if (b && typeof b.text === 'string') n += b.text.length;
        else if (b && Array.isArray(b.content)) add(b.content);
        else if (b && typeof b.content === 'string') n += b.content.length;
      }
    }
  };
  add(body?.system);
  if (Array.isArray(body?.messages)) add(body.messages);
  return n;
}
// 1 リクエストの最大メッセージ数。会話履歴（AI 選書 / マイ読書脳）でも通常 30
// 前後。汎用 LLM プロキシ悪用で巨大配列を投げられるのを防ぐ安全側の上限。
const MAX_MESSAGES = 60;

// 許可する Anthropic モデルの allowlist。クライアントは現状 1 モデルしか
// 使わない（src/lib/ai.js / streamClaude.js の DEFAULT_MODEL）。中継 API が
// body.model を verbatim で upstream に流すと、改ざんしたクライアントが Opus 等
// の高単価モデルを指定して原価を吊り上げられる（KGI ガードの穴）。allowlist 外
// は既定モデルに矯正する（拒否ではなく安全側に倒す＝正規利用を妨げない）。
// コスト最適化の 2 層ルーティング（src/lib/models.js と一致させる）:
//   2026-09-27 から: AI 選書の推薦だけ claude-sonnet-5（MODEL_ADVISOR）、ほかは claude-haiku-4-5。
//   旧 claude-sonnet-4-6 も後方互換で許可（未デプロイのクライアントからの要求を弾かない）。
//   許可外は DEFAULT_MODEL に矯正（拒否ではなく安全側）。
const ALLOWED_MODELS = new Set(['claude-sonnet-5', 'claude-haiku-4-5', 'claude-sonnet-4-6']);
// 指定なし・許可外はいちばん安い Haiku に寄せる（原価の安全側）。
const DEFAULT_MODEL = 'claude-haiku-4-5';
// 💬 相談（purpose: 'consult'）だけに使うモデル。env で差し替えられる（アプリの出し直し不要）。
//   未設定なら、アプリが指定したモデル（2026-09-27 から Haiku 4.5）のまま。品質を上げたいときに
//   'claude-sonnet-5' にすると、1 回あたりの原価が約 2 倍・相談できる回数は約半分になる。
const CONSULT_MODEL_OVERRIDE = ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-sonnet-4-6'].includes(process.env.AI_CONSULT_MODEL)
  ? process.env.AI_CONSULT_MODEL
  : null;
const pickModel = (b) => {
  if (b?.purpose === 'consult' && CONSULT_MODEL_OVERRIDE) return CONSULT_MODEL_OVERRIDE;
  return ALLOWED_MODELS.has(b?.model) ? b.model : DEFAULT_MODEL;
};
// 実績のある既知モデル。指定モデルが upstream に 404（model not found）で拒否された
// 時のフォールバック先。過去に廃止スナップショット ID の指定で全 AI が停止した事故が
// あったため、新モデル ID がアカウント未対応でも AI を止めないための保険。
const FALLBACK_MODEL = 'claude-sonnet-4-6';

// ───────────────────────────────────────────────────────────────────
// 🤖 月次 AI 利用量メータリング（KGI 原価ガード）
//
// 既存の「メモリ内 10 回/分」レート制限の上に、永続的な「月次累積上限」を
// 重ねる。狙いは "暴走（連打）を止めるランナウェイガード" であって、通常利用は
// 一切妨げないこと。
//
// 上限値の根拠:
//   使用モデル claude-sonnet-4-6 は $3 / 1M 入力・$15 / 1M 出力（≈¥150/$）。
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

// 🎁 7日間無料トライアル/導入価格期間中の AI 月次上限（原価ガード・トライアル悪用対策）。
//   トライアル中は収益ゼロで AI 原価だけが出るため、通常より低い上限で青天井を防ぐ。
//   subscriptions.period_type が 'trial'/'intro'（無料期間）の時だけ適用。'normal'/null
//   （有料）は必ず通常上限（有料ユーザーを絞らない）。env で可変。
//   既定 15 回＝無料期間の原価の上限 ¥50（AI_TRIAL_BUDGET_JPY）÷ 相談 1 回 約 ¥3。原価を数えられない
//   DB（supabase_ai_cost.sql 未適用）では、この回数が無料期間の実質の上限になる（2026-09-27 に 40 → 15）。
const AI_TRIAL_CALL_LIMIT = (() => {
  const raw = Number(process.env.AI_TRIAL_CALL_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15;
})();

// 🎁 無料プラン（フリーミアム・2026-09-27 オーナー裁定）。契約していない人も、AI の 💬 相談
// （purpose: 'consult'）だけは 1 か月に AI_FREE_CALL_LIMIT 回（既定 3 回）使える。ほかの AI 機能は
// 402 plan_required（判定は api/_aiAccess.js の decideAiAccess）。数えるのは ai_usage の
// period_month='free-YYYY-MM'（日本時間の月・有料の月の行とは別枠）。原価の青天井を防ぐため、
// この枠だけは fail-closed（数えられないときは使わせない）。0 で無料の相談をやめる。
// クライアントの表示用の既定（src/lib/freeTrial.js の FREE_AI_CALLS）と揃えること。
const AI_FREE_CALL_LIMIT = (() => {
  const raw = Number(process.env.AI_FREE_CALL_LIMIT);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 3;
})();

// 月の区切りは日本時間（2026-09-27）。以前は UTC で、1 日の 0〜9 時に「来月 1 日から」と
// 案内がずれていた。表示（nextResetLabel）・クライアント（freeTrial.js）と同じ区切りにする。
function currentPeriodMonth() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
}

// 🔐 構成チェック（H1 監視）。service_role が未設定だと entitlement（ペイウォール）
// と月次コスト上限が fail-open＝実質無効になる。本番で未設定なら error ログを出し、
// Vercel ログ/アラートで検知できるようにする（静かに無効化されるのを防ぐ）。
if (
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production')
) {
  console.error(
    '[SECURITY] SUPABASE_SERVICE_ROLE_KEY is NOT set in production — AI paywall and monthly cost cap are DISABLED (fail-open). Set it in the production environment immediately.',
  );
}

// RevenueCat の Secret key が無いと、購入直後（webhook 到着前）やテスト購入の人を
// サーバーが「未購読」と判定して AI を止める。審査の前に必ず設定する。
if (!process.env.REVENUECAT_SECRET_API_KEY && process.env.VERCEL_ENV === 'production') {
  console.error('[BILLING] REVENUECAT_SECRET_API_KEY is not set — just-purchased / sandbox users may get 402 until the webhook arrives.');
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
  // メモリリーク防止: warm インスタンスで userId キーが無限に増えないよう、
  // 肥大時に全キーを掃いてウィンドウ外だけになったキーを削除する。
  if (rateLimitStore.size > 5000) {
    for (const [k, v] of rateLimitStore) {
      const alive = v.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
      if (alive.length === 0) rateLimitStore.delete(k);
      else rateLimitStore.set(k, alive);
    }
  }
  return { ok: true };
}

// インスタンス横断の共有レート制限（H3 是正）。in-memory は lambda インスタンス
// ごとに独立しており実効上限が緩いため、service_role の check_ai_rate_limit RPC で
// 全インスタンス一貫の固定ウィンドウ判定を行う。RPC/テーブル未適用 / service_role
// 未設定 / 障害は fail-open（in-memory 側が一次防御として残る）。
async function checkSharedRateLimit(userId) {
  const supabase = getServiceSupabase();
  if (!supabase) return { ok: true };
  try {
    const { data, error } = await supabase.rpc('check_ai_rate_limit', {
      p_user: userId,
      p_max: RATE_LIMIT_MAX,
      p_window_seconds: Math.floor(RATE_LIMIT_WINDOW_MS / 1000),
    });
    if (error) {
      console.warn('[rate-limit] shared check failed (fail-open):', error.message);
      return { ok: true };
    }
    if (data === false) {
      return { ok: false, retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[rate-limit] shared check threw (fail-open):', e?.message);
    return { ok: true };
  }
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

// （旧 checkMonthlyUsage は reserveMonthlyUsage の原子的 check-and-increment に
//  置き換えたため削除。上限判定は reserve_ai_usage RPC が単一往復で原子的に行う。）

// 課金 entitlement のサーバー側ゲート。クライアントの PaywallGate は迂回可能
// （DevTools / 改造クライアント）なので、原価が発生する AI 中継ではサーバーでも
// subscriptions.status==='active' を確認する（useSubscription と同一判定）。
//
// fail-open の境界を厳密に分ける:
//   - service_role 未設定 / テーブル未適用（schema error）/ インフラエラー
//       → { allowed: true }（ロールアウト・移行中にユーザーを締め出さない）
//   - テーブルは引けたが status!=='active'（行が無い含む）
//       → { allowed: false }（明確な未課金＝無料プラン。相談だけ月 AI_FREE_CALL_LIMIT 回・ほかは 402）
// クライアントの useSubscription も「取得エラー時は active を潰さない」設計なので、
// 表示と挙動が食い違わない（行が無い＝クライアントでも無料プランの表示）。
// 🛰️ 管理者（app_admins）か判定。運営はペイウォール/課金なしで AI を使える
//    （運営ダッシュボードの AI ロードマップ等）。未適用/エラーは false（=通常判定へ）。
async function isAdminUser(userId) {
  const supabase = getServiceSupabase();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from('app_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

// 🧾 RevenueCat に直接たずねる（subscriptions に有効な行が無いときの確認）。
// ・App Review / TestFlight のサンドボックス購入（webhook は既定で書き込まない）
// ・購入直後で webhook がまだ届いていない
// ・webhook が匿名 ID で届き、行を作れなかった
// のいずれでも、課金済みの人を 402 で止めない。env REVENUECAT_SECRET_API_KEY（RevenueCat の
// Secret API key・sk_...）が無ければ何もしない。結果は 10 分だけ覚えて、呼び出しを増やさない。
const RC_CACHE_MS = 10 * 60 * 1000;
// 「未購読」は 30 秒だけ覚える（買った直後の人を 10 分止めないため・審査でも起きやすい）
const RC_NEGATIVE_CACHE_MS = 30 * 1000;
const rcCache = new Map();
async function checkRevenueCat(userId) {
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) return null;
  const hit = rcCache.get(userId);
  if (hit && Date.now() - hit.at < (hit.value?.allowed ? RC_CACHE_MS : RC_NEGATIVE_CACHE_MS)) return hit.value;
  let value = null;
  try {
    const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) {
      const d = await r.json();
      const sub = d?.subscriber || {};
      const now = Date.now();
      const active = Object.values(sub.entitlements || {}).find((e) => !e?.expires_date || Date.parse(e.expires_date) > now);
      if (active) {
        const product = sub.subscriptions?.[active.product_identifier] || {};
        value = {
          allowed: true,
          trial: product.period_type === 'trial' || product.period_type === 'intro',
          periodEnd: active.expires_date || product.expires_date || null,
        };
      } else {
        value = { allowed: false };
      }
    }
  } catch (e) {
    console.warn('[entitlement] revenuecat check failed:', e?.message);
    return null; // 分からないときは覚えない
  }
  if (rcCache.size > 5000) rcCache.clear();
  rcCache.set(userId, { at: Date.now(), value });
  return value;
}

// 期限切れの猶予（webhook の遅れを吸収する）
const PERIOD_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

async function checkEntitlement(userId) {
  const supabase = getServiceSupabase();
  if (!supabase) return { allowed: true }; // 判定不能なら通す（fail-open）
  try {
    // ⚡ 管理者判定（app_admins）と課金判定（subscriptions）は互いに独立した読み取り
    // なので直列 await せず並列化する（AI コールの TTFT からサーバー往復を 1 回削る）。
    // isAdminUser は内部で try/catch し false を返すため Promise.all を reject しない。
    const [admin, subResult] = await Promise.all([
      isAdminUser(userId),
      (async () => {
        // period_type は supabase_admin_members_tasks.sql で追加された列。未適用 DB では
        // 選択が失敗するので、schema-error 時は status のみで再取得し従来挙動へ degrade。
        let { data, error } = await supabase
          .from('subscriptions')
          .select('status, period_type, current_period_end')
          .eq('user_id', userId)
          .maybeSingle();
        if (error && /period_type/.test(error.message || '')) {
          ({ data, error } = await supabase
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('user_id', userId)
            .maybeSingle());
        }
        return { data, error };
      })(),
    ]);
    // 管理者（運営）は課金不要で通す（原価の上限も掛けない）。
    if (admin) return { allowed: true, admin: true };
    const { data, error } = subResult;
    if (error) {
      // テーブル未適用（does not exist）含め、取得エラーは fail-open。
      console.warn('[entitlement] check failed (fail-open):', error.message);
      return { allowed: true };
    }
    // active でも、期限（current_period_end）を猶予 3 日以上過ぎていれば有効とみなさない
    // （EXPIRATION の取りこぼし・遅れて届いた古いイベントで active が残る事故の防止）。
    const end = data?.current_period_end ? Date.parse(data.current_period_end) : NaN;
    const expired = Number.isFinite(end) && end < Date.now() - PERIOD_GRACE_MS;
    const allowed = data?.status === 'active' && !expired;
    // 無料期間（trial/intro）中だけ低い AI 上限を適用。有料（normal/null）は通常上限。
    const pt = data?.period_type;
    const limit = (pt === 'trial' || pt === 'intro') ? AI_TRIAL_CALL_LIMIT : AI_MONTHLY_CALL_LIMIT;
    if (allowed) return { allowed, limit, trial: pt === 'trial' || pt === 'intro', periodEnd: data?.current_period_end || null };
    // 行が無い・有効でないときは、RevenueCat に直接確認（審査のサンドボックス購入・webhook の遅れ）。
    const rc = await checkRevenueCat(userId);
    if (rc?.allowed) return { allowed: true, limit: rc.trial ? AI_TRIAL_CALL_LIMIT : AI_MONTHLY_CALL_LIMIT, trial: !!rc.trial, periodEnd: rc.periodEnd || null };
    return { allowed: false, limit };
  } catch (e) {
    console.warn('[entitlement] check threw (fail-open):', e?.message);
    return { allowed: true };
  }
}

// 成功したコールの後に当月カウントを原子的に +1 する。
// fire-and-forget で呼んでよい（失敗してもユーザー応答には影響させない）。
// RPC が無い古い DB / service_role 未設定 / インフラエラーは握り潰す（fail-open）。
async function incrementMonthlyUsage(userId, periodKey = currentPeriodMonth()) {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc('increment_ai_usage', {
      p_user_id: userId,
      p_period_month: periodKey,
    });
    if (error) {
      console.warn('[ai-usage] increment failed (ignored):', error.message);
    }
  } catch (e) {
    console.warn('[ai-usage] increment threw (ignored):', e?.message);
  }
}

// 予約済みカウントの払い戻し（upstream 失敗時）。reserve は upstream 呼び出し前に
// +1 するため、Anthropic が 4xx/5xx を返した（=課金されないコールが多い）時に
// そのままだと quota だけ消費される。release_ai_usage RPC で原子的に -1 する。
// RPC 未適用/障害は握り潰す（fail-open・従来挙動のまま）。fire-and-forget 可。
async function releaseMonthlyUsage(userId, periodKey = currentPeriodMonth()) {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc('release_ai_usage', {
      p_user_id: userId,
      p_period_month: periodKey,
    });
    if (error) console.warn('[ai-usage] release failed (ignored):', error.message);
  } catch (e) {
    console.warn('[ai-usage] release threw (ignored):', e?.message);
  }
}

// 💴 円の原価の予約と精算（supabase_ai_cost.sql）。
// 戻り値 { metered, allowed }:
//   metered=false … RPC が無い・障害 → 呼び出し側は回数の上限（AI_FALLBACK_CALL_LIMIT）で守る
//   allowed=false … 予約すると今月の上限を超える → 呼ばない
async function reserveCost(userId, periodKey, amountMjpy, budgetJpy) {
  const supabase = getServiceSupabase();
  if (!supabase) return { metered: false, allowed: true };
  try {
    const { data, error } = await supabase.rpc('reserve_ai_cost', {
      p_user_id: userId,
      p_period_month: periodKey,
      p_amount: amountMjpy,
      p_budget: Math.floor(budgetJpy * 1000),
    });
    if (error) {
      console.warn('[ai-cost] reserve failed (fallback to call limit):', error.message);
      return { metered: false, allowed: true };
    }
    const v = typeof data === 'number' ? data : Number(Array.isArray(data) ? data[0] : data);
    if (!Number.isFinite(v)) return { metered: false, allowed: true };
    return { metered: true, allowed: v !== -1 };
  } catch (e) {
    console.warn('[ai-cost] reserve threw (fallback to call limit):', e?.message);
    return { metered: false, allowed: true };
  }
}
async function adjustCost(userId, periodKey, deltaMjpy) {
  if (!deltaMjpy) return;
  const supabase = getServiceSupabase();
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc('adjust_ai_cost', {
      p_user_id: userId, p_period_month: periodKey, p_delta: Math.round(deltaMjpy),
    });
    if (error) console.warn('[ai-cost] adjust failed:', error.message);
  } catch (e) {
    console.warn('[ai-cost] adjust threw:', e?.message);
  }
}

// 原価を数えられない DB（supabase_ai_cost.sql 未適用）での、1 か月の回数の上限。
// 相談 1 回 ≈ ¥3（Haiku 4.5・2026-09-27）、重い機能（テーマまとめ等）でも ¥5 前後なので、
// 上限 ¥243 を超えにくい回数にしておく。
const AI_FALLBACK_CALL_LIMIT = (() => {
  const raw = Number(process.env.AI_FALLBACK_CALL_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 45;
})();

// 「来月 1 日」（上限に達したときの案内用・日本時間）。
// 案内文の中では noBreak=true で、見えない結合文字（U+2060 WORD JOINER）を挟み、
// 「10月」と「1日」の間などで改行されないようにする（どの画面が表示しても崩れない）。
function nextResetLabel(noBreak = false) {
  return nextMonthFirstLabel(Date.now(), noBreak);
}

// 原子的な「予約」= check-and-increment を 1 往復で行う（TOCTOU 是正）。
// 戻り値:
//   { allowed: true,  reserved: true  } — 上限内で +1 済み（後段の increment は不要）
//   { allowed: false, reserved: true  } — 上限到達（加算されていない・拒否する）
//   { allowed: true,  reserved: false } — RPC 未適用/未設定/障害 → fail-open。
//                                          呼び出し側は従来どおり成功後 increment に委ねる。
async function reserveMonthlyUsage(userId, limit, periodKey = currentPeriodMonth()) {
  const supabase = getServiceSupabase();
  if (!supabase) return { allowed: true, reserved: false }; // fail-open
  // entitlement 由来の上限（トライアルは低め）を優先。未指定/不正は通常上限に倒す。
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : AI_MONTHLY_CALL_LIMIT;
  try {
    const { data, error } = await supabase.rpc('reserve_ai_usage', {
      p_user_id: userId,
      p_period_month: periodKey,
      p_limit: effectiveLimit,
    });
    if (error) {
      // reserve_ai_usage 未適用（does not exist）含めて fail-open。旧 increment に委ねる。
      console.warn('[ai-usage] reserve failed (fail-open):', error.message);
      return { allowed: true, reserved: false };
    }
    const calls = typeof data === 'number' ? data : (Array.isArray(data) ? data[0] : null);
    if (calls === -1) return { allowed: false, reserved: true };
    // 想定外の戻り形状（数値でない）は「予約できていない」とみなし fail-open。
    // reserved:true で返すと RPC が実際には +1 していないのに成功後 increment を
    // スキップして取りこぼす恐れがあるため、reserved:false で従来の increment に委ねる。
    if (typeof calls !== 'number') return { allowed: true, reserved: false };
    return { allowed: true, reserved: true };
  } catch (e) {
    console.warn('[ai-usage] reserve threw (fail-open):', e?.message);
    return { allowed: true, reserved: false };
  }
}

// body.system が配列（プロンプトキャッシュ用の content-block 形式）のときの
// allowlist バリデータ。最大 4 ブロック（Anthropic の cache breakpoint 上限と
// 揃える）、各要素は { type: 'text', text: string, cache_control?: { type: 'ephemeral' } }
// のみ許可。1 つでも形が崩れていれば null を返し、呼び出し側が system 無しに倒す。
function sanitizeCachedSystemBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0 || blocks.length > 4) return null;
  const out = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object' || typeof b.text !== 'string') return null;
    const block = { type: 'text', text: b.text };
    if (b.cache_control && b.cache_control.type === 'ephemeral') {
      block.cache_control = { type: 'ephemeral' };
    }
    out.push(block);
  }
  return out;
}

function getBearerToken(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('Bearer ')) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

export default async function handler(req, res) {
  // iOS アプリ（capacitor://localhost）からの呼び出しを許可（プリフライト込み）。
  if (applyCors(req, res, 'POST, OPTIONS')) return undefined;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 内部 env 変数名はクライアントに出さない（構成情報の漏洩防止）。詳細はログのみ。
    console.error('[claude] ANTHROPIC_API_KEY not configured');
    return res.status(500).json({ error: 'AI機能が一時的に利用できません。' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error('[claude] Supabase server credentials not configured');
    return res.status(500).json({ error: 'AI機能が一時的に利用できません。' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
  const userId = userData.user.id;

  const rl = checkRateLimit(userId);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: { message: '短い時間にたくさん送られました。少し待ってから、もう一度お試しください。' }, error_code: 'rate_limited', retry_after: rl.retryAfter });
  }

  // 以下 3 チェックはいずれも userId だけを入力に取る独立クエリ（互いの結果に
  // 依存しない）。直列 await すると 1 リクエストあたり Supabase 往復が 3 回
  // 積み上がり、全 AI コールの TTFT を無駄に押し上げる。Promise.all で同時実行し、
  // 判定の優先順位（レート制限 → entitlement → 月次上限）は逐次チェック時と
  // 完全に同一に保つ（各チェックの合否は他のチェックの実行順に依存しないため、
  // 並列化しても外部から見えるレスポンスは変わらない）。
  const [rlShared, ent] = await Promise.all([
    checkSharedRateLimit(userId),
    checkEntitlement(userId),
  ]);

  // インスタンス横断の共有レート制限（H3）。in-memory を通過しても、全インスタンス
  // 合算の上限を超えていれば 429。未適用 DB は fail-open（in-memory が一次防御）。
  if (!rlShared.ok) {
    res.setHeader('Retry-After', String(rlShared.retryAfter));
    return res.status(429).json({ error: { message: '短い時間にたくさん送られました。少し待ってから、もう一度お試しください。' }, error_code: 'rate_limited', retry_after: rlShared.retryAfter });
  }

  // 課金 entitlement（サーバー側ゲート）。fail-open（未設定 / 未適用 / 障害は通す）。
  // 🎁 無料プラン（契約なし）は 💬 相談だけ・月 AI_FREE_CALL_LIMIT 回（'free-YYYY-MM' の行で数える）。
  //    相談以外の AI 機能は 402 plan_required（アプリは有料プランの画面を重ねて開く）。
  const monthKey = currentPeriodMonth(); // この 1 回の間は同じ月で数える（月末の日付またぎでずれない）
  let periodKey = monthKey;
  const access = decideAiAccess({ entitlement: ent, purpose: req.body?.purpose, freeLimit: AI_FREE_CALL_LIMIT });
  if (!access.allow) {
    return res.status(access.status).json({
      error: { message: access.errorCode === 'free_limit_reached' ? freeLimitMessage(AI_FREE_CALL_LIMIT) : planRequiredMessage() },
      error_code: access.errorCode,
    });
  }
  const freeCall = access.tier === 'free';
  if (freeCall) periodKey = freePeriodKey(monthKey);

  // body の大きさの上限（過大トークン課金 / メモリ肥大の予防）。月次枠を予約する前に弾く
  // （弾かれたリクエストで今月の回数を減らさない）。
  // ① JSON のバイト長（画像込み）② 文字の総量（画像を除く system + messages の文字数）。
  //    ②はアプリの最大（相談の根拠ブロック 約 6 万字）の 2 倍強。改造クライアントで
  //    1 回に何十万字も送って入力トークン課金を膨らませるのを防ぐ。
  {
    const body = req.body || {};
    let bodyBytes = 0;
    try {
      bodyBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
    } catch {
      bodyBytes = 0; // 文字列化不能（循環参照等）は 0 扱いで先へ（実質起きない）
    }
    // 🎁 無料プランの相談は原価の予約をしないので、1 回の大きさをここで小さく抑える
    //    （改ざんしたアプリから大きな文章を送って原価を膨らませるのを防ぐ）。
    const textCap = freeCall ? FREE_MAX_TEXT_CHARS : MAX_TEXT_CHARS;
    if (bodyBytes > MAX_BODY_BYTES || countTextChars(body) > textCap) {
      return res.status(413).json({
        error: { message: 'リクエストが大きすぎます。画像のサイズを小さくして再度お試しください。' },
        error_code: 'payload_too_large',
      });
    }
  }

  // 月次累積上限（KGI 原価ガード）。原子的な reserve で check-and-increment を行い
  // TOCTOU（並行リクエストが同じ pre-increment 値を読んで全通過）を封じる。
  // entitlement 通過後にだけ予約する（未課金の予約を作らない）。fail-open（RPC 未適用/
  // 障害）の時は reserved=false になり、従来どおり成功後に increment する。
  // 💴 原価の上限（有料・無料期間の人。管理者と無料プランの相談は対象外＝回数と大きさで守る）。この 1 回の最大の原価を
  //    先に予約し、足りなければ呼ばない。数えられない DB では回数の上限で守る。
  let costReserved = 0; // 予約した額（mjpy）。精算で実際の額との差を戻す
  let costOutputPart = 0; // 予約のうち出力の分（途中で切れたときの精算に使う）
  let costMetered = false;
  let callLimit = freeCall ? AI_FREE_CALL_LIMIT : ent.limit;
  if (!freeCall && !ent.admin) {
    const b = req.body || {};
    const estModel = pickModel(b);
    const estMax = Math.min(
      Number.isFinite(b.max_tokens) ? Math.max(1, Math.floor(b.max_tokens)) : MAX_TOKENS_DEFAULT,
      MAX_TOKENS_HARD_CAP,
    );
    const images = Array.isArray(b.messages)
      ? b.messages.reduce((n, m) => n + (Array.isArray(m?.content) ? m.content.filter((c) => c?.type === 'image').length : 0), 0)
      : 0;
    const est = estimateCost(estModel, { textChars: countTextChars(b), images, maxTokens: estMax });
    const budget = ent.trial ? trialBudgetJpy() : monthlyBudgetJpy();
    const rc = await reserveCost(userId, monthKey, est.total, budget);
    if (rc.metered && !rc.allowed) {
      // 無料期間中は「期間が終われば使える」と案内する（来月 1 日ではない）。
      return res.status(429).json({
        error: { message: ent.trial ? trialLimitMessage(ent.periodEnd) : `今月の AI の利用上限に達しました。${nextResetLabel(true)}からまた使えます。` },
        error_code: 'monthly_budget_exceeded',
        ...(ent.trial ? { trial: true } : { reset_label: nextResetLabel() }),
      });
    }
    costMetered = rc.metered;
    if (costMetered) { costReserved = est.total; costOutputPart = est.output; }
    // 原価を数えられない DB では回数で守る（無料期間は AI_TRIAL_CALL_LIMIT＝既定 15 回がそのまま効く）。
    else callLimit = Math.min(callLimit || AI_MONTHLY_CALL_LIMIT, AI_FALLBACK_CALL_LIMIT);
  }
  // 精算: 実際の原価（mjpy）が分かったら差額を戻す。null＝AI が答えていない → 予約をまるごと戻す。
  let costSettled = false;
  const settleCost = (actualMjpy) => {
    if (!costMetered || costSettled) return;
    costSettled = true;
    adjustCost(userId, monthKey, (actualMjpy == null ? 0 : actualMjpy) - costReserved);
  };

  // 管理者は回数も数えない（上限なし）。
  const usage = ent.admin ? { allowed: true, reserved: true } : await reserveMonthlyUsage(userId, callLimit, periodKey);
  if (freeCall) {
    // 無料の相談は数えられないとき（RPC 未適用・障害）も通さない（fail-closed）。
    const fr = decideFreeReservation(usage);
    if (!fr.allow) {
      return res.status(fr.status).json({
        error: { message: fr.errorCode === 'free_limit_reached' ? freeLimitMessage(AI_FREE_CALL_LIMIT) : planRequiredMessage() },
        error_code: fr.errorCode,
      });
    }
  }
  if (!usage.allowed) {
    settleCost(null); // 回数の上限で止めたので、原価の予約も戻す
    return res.status(429).json({
      error: { message: ent.trial ? trialLimitMessage(ent.periodEnd) : `今月の AI の利用上限に達しました。${nextResetLabel(true)}からまた使えます。` },
      error_code: 'monthly_limit_exceeded',
      ...(ent.trial ? { trial: true } : null),
    });
  }
  const usageReserved = usage.reserved;

  try {
    const body = req.body || {};

    const requestedTokens = Number.isFinite(body.max_tokens)
      ? Math.max(1, Math.floor(body.max_tokens))
      : MAX_TOKENS_DEFAULT;
    const maxTokens = Math.min(requestedTokens, freeCall ? FREE_MAX_TOKENS : MAX_TOKENS_HARD_CAP);
    const wantsStream = body.stream === true;

    // モデルを allowlist で矯正（高単価モデルへの差し替え悪用を封じる）。
    // 無料プランの相談は、いちばん安いモデルに固定する（AI_CONSULT_MODEL の差し替えも効かせない）。
    const model = freeCall ? FREE_MODEL : pickModel(body);

    // ★ 想定キーだけを allowlist で再構築する（client body の丸ごと転送をやめる）。
    // これまでは `{ ...body }` で tools / tool_choice / metadata / stop_sequences /
    // top_p 等を含む任意のフィールドを Anthropic へ素通ししており、認証済みユーザー
    // が改ざんクライアントで本 API を「汎用 LLM プロキシ」として悪用できた。
    // app が実際に使うのは system / messages / max_tokens / model / stream のみ
    // （src/lib/streamClaude.js / ai.js）。temperature は下記の理由で転送しない。
    // それ以外は破棄する。
    const payload = { model, max_tokens: maxTokens };
    // ⚠️ claude-sonnet-5 は `thinking` 省略時に adaptive thinking が既定 ON
    // （sonnet-4-6 以前は省略 = OFF）。thinking トークンは max_tokens（総出力上限）
    // から消費されるため、本アプリの小さめの max_tokens（320〜4096）では本文が
    // 途中で切れ、かつ出力単価で課金だけ増える。旧世代と同じ挙動（thinking なし）
    // をサーバー側で明示して、切り詰め・コスト増・応答遅延を防ぐ。
    // （disabled は Sonnet 5 で合法。haiku-4-5 / sonnet-4-6 は省略 = OFF なので不要）
    if (model === 'claude-sonnet-5') payload.thinking = { type: 'disabled' };
    if (wantsStream) payload.stream = true;
    if (typeof body.system === 'string') {
      payload.system = body.system;
    } else {
      // プロンプトキャッシュ（Anthropic prompt caching、claude-sonnet-4-6 は
      // GA・追加ヘッダー不要）対応。クライアントが「固定文言のシステムプロンプト」
      // を content-block 配列 + cache_control で送ってきた場合のみ受理する。
      // ここでも `{ ...body }` 式の丸ごと転送はせず、type/text/cache_control の
      // 3 フィールドだけを allowlist で再構築する（任意フィールド注入の防止は
      // 上の messages 処理と同じ方針）。不正な形なら黙って system 無しにする
      // （strict にエラーを返すと将来のクライアント側バグで AI が丸ごと止まる
      // リスクがあるため、ここは fail-open）。
      const blocks = sanitizeCachedSystemBlocks(body.system);
      if (blocks) payload.system = blocks;
    }
    if (Array.isArray(body.messages)) {
      // 上限超過時は「最新」を残す（slice(0,N) は最古を残し、直前のユーザー発言を
      // 捨ててしまう＝長い会話で直近の質問が無視される）。先頭が assistant に
      // なったら Anthropic の user-first 要件に合わせて刈る。
      let msgs = body.messages.slice(-MAX_MESSAGES);
      while (msgs.length > 0 && msgs[0]?.role === 'assistant') msgs = msgs.slice(1);
      // 🛡 要素の中身も allowlist で再構築する。role は user/assistant のみ、
      //    content は string か {type:'text'} / {type:'image', source:{type:'base64'}}
      //    ブロックのみ許可。改造クライアントが document ブロックや URL ソース画像を
      //    注入して中継を本来と異なる用途（任意 URL の取得等）に使うのを防ぐ
      //    （sanitizeCachedSystemBlocks と同じ流儀）。不正要素は静かに除去。
      const cleanMsgs = [];
      for (const m of msgs) {
        const role = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null;
        if (!role) continue;
        const c = m.content;
        if (typeof c === 'string') { cleanMsgs.push({ role, content: c }); continue; }
        if (Array.isArray(c)) {
          const blocks = [];
          for (const b of c) {
            if (!b || typeof b !== 'object') continue;
            if (b.type === 'text' && typeof b.text === 'string') {
              const blk = { type: 'text', text: b.text };
              if (b.cache_control?.type === 'ephemeral') blk.cache_control = { type: 'ephemeral' };
              blocks.push(blk);
            } else if (
              b.type === 'image'
              && b.source?.type === 'base64'
              && typeof b.source.media_type === 'string'
              && typeof b.source.data === 'string'
            ) {
              blocks.push({ type: 'image', source: { type: 'base64', media_type: b.source.media_type, data: b.source.data } });
            }
          }
          if (blocks.length > 0) cleanMsgs.push({ role, content: blocks });
        }
      }
      // 除去の結果 assistant 先頭になったら user-first を再適用。
      let finalMsgs = cleanMsgs;
      while (finalMsgs.length > 0 && finalMsgs[0].role === 'assistant') finalMsgs = finalMsgs.slice(1);
      payload.messages = finalMsgs;
    }
    // ⚠️ temperature は Anthropic へ転送しない（サーバー側の最終防波堤）。
    // claude-sonnet-5 / haiku-4-5 世代（Opus 4.7 以降と同系）は sampling params
    // （temperature / top_p / top_k）を受け付けず 400 を返す
    // （「`temperature` is deprecated for this model.」）。クライアントが後方互換で
    // temperature を送ってきても、ここで破棄して全 AI 機能が止まらないようにする。
    // 振る舞いの制御はプロンプト側で行う方針。

    // クライアント切断時に Anthropic への upstream fetch も打ち切るための
    // AbortController。これが無いと、ユーザーが「中止」して fetch を切っても
    // サーバーは upstream を最後まで読み続け、トークン課金が満額発生する
    // （KGI 原価ガードの穴）。クライアント切断（'close' / 'aborted'）を検知して
    // controller.abort() を呼ぶことで、upstream の生成も停止させる。
    //
    // upstreamDone は「reader ループが正常終了（done）した／ハンドラが正常完了
    // した」ことを表すフラグ。正常終了後の遅延 'close' イベントで二重 abort
    // しないためのガード（abort 由来の例外と正常終了の競合回避）。
    const upstreamController = new AbortController();
    let upstreamDone = false;
    const abortUpstream = () => {
      if (upstreamDone) return; // 正常終了済みなら abort しない（二重 abort 回避）
      upstreamDone = true;
      try { upstreamController.abort(); } catch { /* already aborted */ }
    };
    // クライアントが接続を切ったら upstream も止める。req / res 双方の 'close'
    // を購読（ランタイムによってどちらが先に発火するか差があるため両取り）。
    // abortUpstream は idempotent なので重複発火しても安全。
    try { req.on?.('close', abortUpstream); } catch { /* no-op */ }
    try { res.on?.('close', abortUpstream); } catch { /* no-op */ }

    const anthropicFetch = () => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
      signal: upstreamController.signal,
    });

    let response;
    try {
      response = await anthropicFetch();
      // 🛡️ モデル未提供フォールバック: 指定モデルが 404（model not found）で拒否
      // されたら、実績のある FALLBACK_MODEL で 1 回だけ再試行する。ストリーム開始前
      // （response.ok 判定より前）なので安全に差し替えられる。これで新モデル ID が
      // アカウント未対応でも全 AI 停止を回避する（過去の同種事故の恒久対策）。
      if (response && response.status === 404 && payload.model !== FALLBACK_MODEL) {
        console.warn('[claude] model not found, falling back:', payload.model, '→', FALLBACK_MODEL);
        // 404 の本文は読まないので閉じておく（接続を握ったままにしない）
        try { await response.body?.cancel(); } catch { /* no-op */ }
        payload.model = FALLBACK_MODEL;
        // sonnet-4-6 は thinking 省略 = OFF（既定）。sonnet-5 向けに付けた明示
        // disabled は 4.6 では非対応の可能性があるため外す（挙動は同じ OFF）。
        delete payload.thinking;
        response = await anthropicFetch();
      }
    } catch (fetchErr) {
      // クライアントが接続前/接続待ち中に切断 → AbortError。これは正常な
      // ユーザー操作なのでエラーログを出さず静かに終了する。
      if (fetchErr?.name === 'AbortError' || upstreamController.signal.aborted) {
        upstreamDone = true;
        // レスポンス到達前の切断 = upstream 課金は発生していない。予約分を払い戻す。
        if (usageReserved && !ent.admin) releaseMonthlyUsage(userId, periodKey);
        settleCost(null);
        try { res.end(); } catch { /* socket may already be closed */ }
        return;
      }
      throw fetchErr;
    }

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
        const sniffer = createUsageSniffer(); // 流しながら usage（トークン数）を拾う
        try {
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              res.write(Buffer.from(value));
              try { sniffer.push(value); } catch { /* 数えられなくても応答は止めない */ }
            }
          }
          // 正常に message_stop まで読み切った。以後の遅延 'close' で abort
          // しないようフラグを立てる（二重 abort / 余計な例外を避ける）。
          upstreamDone = true;
        } catch (streamErr) {
          // クライアント切断由来の abort（AbortError）は正常なユーザー操作。
          // エラーログを出さず静かに終了する。それ以外の relay エラーのみログ。
          if (streamErr?.name === 'AbortError' || upstreamController.signal.aborted) {
            // abortUpstream() 経由で upstreamDone は既に true。何もしない。
          } else {
            console.error('Claude stream relay error:', streamErr);
          }
        } finally {
          upstreamDone = true; // どの経路でも以降の abort を抑止
          try { res.end(); } catch { /* socket may already be closed */ }
          // 💴 精算。入力が分かれば入力は実額、出力は最後まで届いたら実額・途中で切れたら
          //    予約した出力の分（上振れ側）。何も分からなければ予約をそのまま残す。
          const u = sniffer.usage;
          if (u.seenStart) {
            const inputOnly = costFromUsage(payload.model, { ...u, output_tokens: 0 });
            settleCost(u.seenDelta ? costFromUsage(payload.model, u) : inputOnly + costOutputPart);
          } else {
            settleCost(costReserved);
          }
        }
        // ストリームが開始 = 成功コールとして当月カウントを +1。
        // fire-and-forget（失敗してもユーザー応答には影響させない）。
        // 注: 途中で中断（クライアント切断）してもストリームは開始済みであり、
        // upstream への課金コールは発生しているため、1 カウントは妥当。
        // reserve 済み（原子的 RPC が加算済み）の時は二重加算しない。
        if (!usageReserved) incrementMonthlyUsage(userId, periodKey);
        return;
      }
    }

    // 非ストリーミング経路。response.json() は upstream の body を読み切るので、
    // 読込中にクライアントが切断すると signal が発火し AbortError で reject する。
    let data;
    try {
      data = await response.json();
    } catch (jsonErr) {
      // クライアント切断由来の abort は正常操作 → 静かに終了（ログ無し・課金は
      // upstream 完了前なら発生しないため increment しない）。
      if (jsonErr?.name === 'AbortError' || upstreamController.signal.aborted) {
        upstreamDone = true;
        settleCost(costReserved); // 生成は進んでいたかもしれないので予約は残す（安全側）
        try { res.end(); } catch { /* socket may already be closed */ }
        return;
      }
      throw jsonErr;
    }
    upstreamDone = true; // 正常完了。以降の遅延 'close' で abort しない。
    // 上流が 2xx の成功レスポンスの時だけ当月カウントを +1。失敗（4xx/5xx）は
    // 課金されないコールが多いので quota を消費させない。fire-and-forget。
    // reserve 済み（原子的 RPC が加算済み）の時は二重加算しない。
    if (response.ok && !usageReserved) incrementMonthlyUsage(userId, periodKey);
    // reserve 済みで upstream が失敗した時は予約分を払い戻す（非 reserve 経路の
    // 「2xx のときだけ increment」と対称にする）。
    if (!response.ok && usageReserved && !ent.admin) releaseMonthlyUsage(userId, periodKey);
    // 💴 精算（成功は usage の実額・失敗は予約を戻す）
    settleCost(response.ok ? (data?.usage ? costFromUsage(payload.model, data.usage) : costReserved) : null);
    if (!response.ok) {
      // 上流（Anthropic）の生エラー JSON（英語の内部メッセージ・request-id 等）を
      // クライアントへ verbatim 転送しない — 内部構成のヒントになる上、postClaude が
      // 「エラー: <英語文>」としてユーザーに見せてしまう。既知 status を和文へ正規化し、
      // 生ボディはサーバーログのみに残す。
      console.error('Claude upstream error:', response.status, JSON.stringify(data)?.slice(0, 500));
      const message =
        response.status === 429
          ? 'AI へのリクエストが混み合っています。少し時間をおいて再試行してください。'
          : response.status >= 500 || response.status === 529
            ? 'AI サービスが一時的に不安定です。少し時間をおいて再試行してください。'
            : 'AI リクエストに失敗しました。時間をおいて再試行してください。';
      return res.status(response.status).json({ error: { message } });
    }
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Claude API error:', error);
    // upstream に到達できずに失敗（ネットワーク等）。reserve 済みの予約分を払い戻す。
    if (usageReserved && !ent.admin) releaseMonthlyUsage(userId, periodKey);
    settleCost(null);
    return res.status(500).json({ error: { message: 'AI につながりませんでした。通信の状態を確かめて、もう一度お試しください。' } });
  }
}
