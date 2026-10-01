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

import { PRICES } from './_aiCost.js';

export const PROVIDERS = ['anthropic', 'openai', 'gemini'];

const H = 'claude-haiku-4-5';
const GPT_MINI = 'gpt-5-mini';
const FLASH_LITE = 'gemini-3.1-flash-lite';

// 用途 → { primary: '会社:モデル', claude: 失敗したときの Claude, claudeOnly: Claude 以外に差し替えない }
export const ROUTES = {
  consult: { primary: `anthropic:${H}`, claude: H, claudeOnly: true },
  book_advisor: { primary: 'anthropic:claude-sonnet-5-5', claude: 'claude-sonnet-5', claudeOnly: true },
  advisor_interview: { primary: `openai:${GPT_MINI}`, claude: H },
  setup_sheet: { primary: `openai:${GPT_MINI}`, claude: H },
  setup_sheet_edit: { primary: `openai:${GPT_MINI}`, claude: H },
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
//   free: 無料プランの相談か（常にいちばん安い Claude）
//   freeModel: 無料プランのモデル
// 戻り値: { provider, model, claudeModel, purpose, reason }
//   claudeModel … provider が Claude 以外のとき、失敗したら 1 回だけ切り替える Claude のモデル
//   reason … 'route' | 'legacy' | 'free' | 'off' | 'no_key' | 'retired'（ログ用・内容は含めない）
export function resolveRoute({ purpose, requestedModel, free = false, freeModel = H, env = process.env, now = Date.now() } = {}) {
  const fallbackModel = ANTHROPIC_MODELS.has(requestedModel) ? requestedModel : H;
  const claude = (model, reason, p = null) => ({ provider: 'anthropic', model, claudeModel: model, purpose: p, reason });
  if (free) return claude(freeModel, 'free', 'consult');
  const route = typeof purpose === 'string' && Object.prototype.hasOwnProperty.call(ROUTES, purpose) ? ROUTES[purpose] : null;
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
  if (!keyFor(target.provider, env)) return claude(route.claude, 'no_key', purpose);
  if (isRetired(target.model, now)) return claude(route.claude, 'retired', purpose);
  return { provider: target.provider, model: target.model, claudeModel: route.claude, purpose, reason: 'route' };
}
