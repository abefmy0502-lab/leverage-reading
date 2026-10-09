// 🧭 AI の用途ごとに、どの会社のどのモデルで答えるかを決める（2026-10-01 オーナー裁定・原価を下げる）。
// api/claude.js から使う純粋関数（env と「今」は引数で受け取り、テストできるようにする）。
// 決めた理由・単価・出典は docs/ai-routing.md。
//
// 決まり:
//   - 💬 相談（consult）は Anthropic の Claude だけ（一番の価値＝メモを根拠にした答え・著者の語り口）。
//     無料プランの相談も同じ。ほかの会社への差し替え（AI_ROUTE_CONSULT=openai:… など）は受け付けない。
//   - 🔍 AI 選書の推薦（book_advisor）も Claude だけ（存在しない本を挙げる事故を増やさないため）。
//   - ほかの用途は、十分な品質で一番安いモデルへ（下の ROUTES）。
//   - 鍵（OPENAI_API_KEY / GEMINI_API_KEY）が無い・提供終了の日を過ぎた・その会社が答える前に失敗した
//     ときは、その用途の Claude（claude）で答える（api/claude.js が 1 回だけ切り替える）。
//   - 用途（purpose）が無い呼び出し（出し直す前の iOS アプリ）は、今までどおりアプリが指定した Claude のモデル。
//
// env で用途ごとに差し替えられる: AI_ROUTE_<用途を大文字で>=<会社>:<モデル>
//   例) AI_ROUTE_SETUP_SHEET=anthropic:claude-haiku-4-5（読書計画シートを Claude に戻す）
//       AI_ROUTE_OCR=openai:gpt-5.4-mini
//   モデルは api/_aiCost.js の PRICES にあるものだけ（単価が分からないモデルで原価を数え違えないため）。
//   AI_ROUTING=off で、すべて今までどおり Claude（緊急時のスイッチ）。
//
// 文を書かない判断（Jev・TypeSafe AI）の用途は、この下の JEV_ROUTES（2026-10-02・docs/jev-plan.md）。

import { PRICES } from './_aiCost.js';

export const PROVIDERS = ['anthropic', 'openai', 'gemini'];

const H = 'claude-haiku-4-5';
const GPT_MINI = 'gpt-5-mini';
const FLASH_LITE = 'gemini-3.1-flash-lite';

// 用途 → { primary: '会社:モデル', claude: 失敗したときの Claude, claudeOnly: Claude 以外に差し替えない }
export const ROUTES = {
  consult: { primary: `anthropic:${H}`, claude: H, claudeOnly: true },
  book_advisor: { primary: 'anthropic:claude-sonnet-5-5', claude: 'claude-sonnet-5', claudeOnly: true },
  // 2026-10-01（2 回目）: AI 選書の聞き返し・読書計画シートは Gemini Flash-Lite に（gpt-5-mini は 12/11 で終わるので、
  // いまから長く使える行き先にそろえる・いちばん安い）。読書計画シートの「関連書籍」は、アプリが書誌で実在を
  // 確かめ、見つからない本を消してから保存する（lib/planRelatedBooks.js）。戻すときは AI_ROUTE_SETUP_SHEET=openai:gpt-5-mini など。
  advisor_interview: { primary: `gemini:${FLASH_LITE}`, claude: H },
  setup_sheet: { primary: `gemini:${FLASH_LITE}`, claude: H },
  setup_sheet_edit: { primary: `gemini:${FLASH_LITE}`, claude: H },
  // 📖 この本で学べること（2026-10-08）: 公開の紹介文と目次から、概要・学べること・仮説の例（読書計画シートと同じ行き先）。
  //   無料プランでも使える（相談と同じ無料のトークンから・api/_aiAccess.js の FREE_PURPOSES）。freeRouted＝無料プランでも
  //   この表の行き先で答える（相談のように Claude に固定しない・1 回 約 1〜2 トークン）。
  book_brief: { primary: `gemini:${FLASH_LITE}`, claude: H, freeRouted: true },
  ops_advise: { primary: `openai:${GPT_MINI}`, claude: H },
  condense: { primary: `gemini:${FLASH_LITE}`, claude: H },
  cards_to_summary: { primary: `gemini:${FLASH_LITE}`, claude: H },
  ocr: { primary: `gemini:${FLASH_LITE}`, claude: H },
};
export const PURPOSES = Object.keys(ROUTES);

// 提供が終わるモデル（この時刻を過ぎたら呼ばずに Claude へ）。gpt-5-mini は 2026-12-11 に終了（OpenAI の Deprecations）。
// 日本時間の 12/11 0 時から止める。
export const RETIRES_AT = {
  'gpt-5-mini': '2026-12-10T15:00:00Z',
};
// 提供が終わったモデルの代わり（その会社の鍵があり、代わりも終わっていなければ。無ければ Claude）。
// gpt-5-mini の後継は OpenAI の推奨では gpt-5.4-mini だが、単価が Haiku とほぼ同じなので Gemini Flash-Lite へ。
export const RETIRE_SUCCESSOR = {
  'gpt-5-mini': `gemini:${FLASH_LITE}`,
};

// Anthropic で使ってよいモデル（api/claude.js の許可リストと同じ）。
export const ANTHROPIC_MODELS = new Set(['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-sonnet-4-6']);

// 会社ごとに、単価の分かるモデルだけ。
function knownModel(provider, model) {
  if (typeof model !== 'string' || !model) return false;
  if (provider === 'anthropic') return ANTHROPIC_MODELS.has(model);
  if (!PRICES[model]) return false;
  if (provider === 'openai') return /^gpt-/.test(model);
  if (provider === 'gemini') return /^gemini-/.test(model);
  return false;
}

// '会社:モデル' を読む。読めない・許されないものは null。
export function parseRouteSpec(spec) {
  if (typeof spec !== 'string') return null;
  const i = spec.indexOf(':');
  if (i <= 0) return null;
  const provider = spec.slice(0, i).trim().toLowerCase();
  const model = spec.slice(i + 1).trim();
  if (!PROVIDERS.includes(provider) || !knownModel(provider, model)) return null;
  return { provider, model };
}

export function routeEnvName(purpose) {
  return `AI_ROUTE_${String(purpose).toUpperCase()}`;
}

function keyFor(provider, env) {
  if (provider === 'openai') return env.OPENAI_API_KEY;
  if (provider === 'gemini') return env.GEMINI_API_KEY;
  return env.ANTHROPIC_API_KEY;
}

export function isRetired(model, now = Date.now()) {
  const t = Date.parse(RETIRES_AT[model] || '');
  return Number.isFinite(t) && now >= t;
}

// この 1 回の行き先を決める。
//   purpose: body.purpose（アプリが送る用途。無ければ今までどおり）
//   requestedModel: アプリが指定した Claude のモデル（許可リストで矯正済みのもの）
//   free: 無料プランの呼び出しか（相談は常にいちばん安い Claude・freeRouted の用途は表の行き先）
//   freeModel: 無料プランのモデル
// 戻り値: { provider, model, claudeModel, purpose, reason }
//   claudeModel … provider が Claude 以外のとき、失敗したら 1 回だけ切り替える Claude のモデル
//   reason … 'route' | 'legacy' | 'free' | 'off' | 'no_key' | 'retired' | 'successor'（ログ用・内容は含めない）
export function resolveRoute({ purpose, requestedModel, free = false, freeModel = H, env = process.env, now = Date.now() } = {}) {
  const fallbackModel = ANTHROPIC_MODELS.has(requestedModel) ? requestedModel : H;
  const claude = (model, reason, p = null) => ({ provider: 'anthropic', model, claudeModel: model, purpose: p, reason });
  const route = typeof purpose === 'string' && Object.prototype.hasOwnProperty.call(ROUTES, purpose) ? ROUTES[purpose] : null;
  // 無料プランの AI は、相談ならいちばん安い Claude に固定。freeRouted の用途（この本で学べること）だけは表の行き先で。
  if (free && !route?.freeRouted) return claude(freeModel, 'free', 'consult');
  if (!route) return claude(fallbackModel, 'legacy');

  // 💬 相談は、今までどおり AI_CONSULT_MODEL（Claude だけ）→ AI_ROUTE_CONSULT（Claude だけ）→ アプリの指定。
  if (purpose === 'consult') {
    const fromConsultEnv = ANTHROPIC_MODELS.has(env.AI_CONSULT_MODEL) ? env.AI_CONSULT_MODEL : null;
    const spec = parseRouteSpec(env[routeEnvName(purpose)]);
    if (env[routeEnvName(purpose)] && (!spec || spec.provider !== 'anthropic')) {
      console.warn(`[ai-route] ${routeEnvName(purpose)} ignored: consult stays on Claude`);
    }
    const fromRoute = spec?.provider === 'anthropic' ? spec.model : null;
    return claude(fromConsultEnv || fromRoute || fallbackModel, 'route', purpose);
  }

  if (String(env.AI_ROUTING || '').toLowerCase() === 'off') return claude(route.claude, 'off', purpose);

  let target = parseRouteSpec(route.primary);
  const raw = env[routeEnvName(purpose)];
  if (raw) {
    const spec = parseRouteSpec(raw);
    if (!spec || (route.claudeOnly && spec.provider !== 'anthropic')) {
      console.warn(`[ai-route] ${routeEnvName(purpose)} ignored (unknown model or not allowed for this purpose)`);
    } else {
      target = spec;
    }
  }
  if (target.provider === 'anthropic') return claude(target.model, 'route', purpose);
  if (isRetired(target.model, now)) {
    const next = parseRouteSpec(RETIRE_SUCCESSOR[target.model]);
    if (!next || next.provider === 'anthropic' || isRetired(next.model, now) || !keyFor(next.provider, env)) {
      return claude(next?.provider === 'anthropic' ? next.model : route.claude, 'retired', purpose);
    }
    return { provider: next.provider, model: next.model, claudeModel: route.claude, purpose, reason: 'successor' };
  }
  if (!keyFor(target.provider, env)) return claude(route.claude, 'no_key', purpose);
  return { provider: target.provider, model: target.model, claudeModel: route.claude, purpose, reason: 'route' };
}

// ───────────────────────────────────────────────────────────────────
// 🧭 Jev（TypeSafe AI の判断のモデル・文を書かず、選ぶ・はい/いいえ・点数と確率だけを返す）の用途（2026-10-02）。
// 文を書く用途（ROUTES）とは別の表。Claude に切り替えることはなく、失敗・未設定のときはアプリが
// これまでの決め方（語の重なり・端末の中の計算）で続ける。中継は api/_jevRelay.js・呼び出しは api/_jev.js。
//   tiers: この用途を使えるプラン（無料プランの AI は相談だけ。いまの用途はどちらも相談の中の判断なので全員）
//   feature: 同意のシート（src/lib/aiProcessors.js）のどの機能の送り先に TypeSafe AI を足すか
// 用途ごとのスイッチは env JEV_TASK_<用途を大文字で>=on（全体のスイッチ JEV_ENABLED と鍵 JEV_API_KEY も要る）。
// 用途を足したら aiProcessors.js の JEV_PURPOSE_FEATURE にも足して、同意の版（JEV_CONSENT_VERSION）を上げる。
// ───────────────────────────────────────────────────────────────────
export const JEV_PROVIDER = 'typesafe';
export const JEV_MODEL = 'jev-1.13';
export const JEV_ROUTES = {
  memo_relevance: { primary: `${JEV_PROVIDER}:${JEV_MODEL}`, tiers: ['free', 'trial', 'paid', 'admin'], feature: 'consult' },
  intent: { primary: `${JEV_PROVIDER}:${JEV_MODEL}`, tiers: ['free', 'trial', 'paid', 'admin'], feature: 'consult' },
  // memo_filing（合いそうなタグ）は中継しない: 保存からシートが閉じ終わる 320ms に往復が間に合わないことが多く、使えない答えのために
  // メモの文を送ることになるため（2026-10-02・docs/jev-plan.md §3-3）。問いの組み立て（api/_jevTasks.js）と評価（scripts/jev-eval.mjs）だけ残す。
};
export const JEV_PURPOSES = Object.keys(JEV_ROUTES);
// Jev に送ってよい同意の版（これより古い同意・同意の版の無い呼び出しは送らない）。
// アプリの VITE_AI_JEV=on のときの AI_CONSENT_VERSION と同じ（src/lib/aiProcessors.test.js で確かめる）。
export const JEV_CONSENT_VERSION = 2;

export function isJevPurpose(purpose) {
  return typeof purpose === 'string' && Object.prototype.hasOwnProperty.call(JEV_ROUTES, purpose);
}
export function jevTaskEnvName(purpose) {
  return `JEV_TASK_${String(purpose).toUpperCase()}`;
}

// この 1 回を Jev に送るか。戻り値 { ok: true } | { ok: false, reason }（reason はログ・アプリへの返事に使う・中身は含めない）
//   tier: 'free' | 'trial' | 'paid' | 'admin'（api/_aiAccess.js の decideAiAccess と同じ）
//   consentVersion: アプリが付けた同意の版（X-Orime-Ai-Consent）
export function resolveJevRoute({ purpose, tier, consentVersion, env = process.env } = {}) {
  if (!isJevPurpose(purpose)) return { ok: false, reason: 'unknown' };
  const on = (v) => /^(1|true|on|yes)$/i.test(String(v ?? '').trim());
  if (!on(env.JEV_ENABLED) || !String(env.JEV_API_KEY || '').trim()) return { ok: false, reason: 'off' };
  if (!on(env[jevTaskEnvName(purpose)])) return { ok: false, reason: 'task_off' };
  if (!JEV_ROUTES[purpose].tiers.includes(tier)) return { ok: false, reason: 'plan' };
  if (!(Number(consentVersion) >= JEV_CONSENT_VERSION)) return { ok: false, reason: 'consent' };
  return { ok: true };
}
