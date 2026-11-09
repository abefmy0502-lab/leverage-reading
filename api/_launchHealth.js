// 🚀 公開の準備（売上までの関門）— 「設定されているか」を真偽で返す（2026-10-22・2026-11-08 に MCP の ops_dashboard へ移した）。
//
// 決まり:
//   - 鍵の中身・URL・利用者の情報は返さない（真偽だけ）。それでも設定の形が分かるので、管理者（app_admins）にだけ返す。
//   - SQL は「表が読める・列がある・関数がある」を service_role で確かめる。行は書かない（関数は失敗する引数で呼ぶ）。
//   - 一覧は api/_launchHealthKeys.js。
import { HEALTH_ENV, HEALTH_ENV_FLAGS, HEALTH_SQL } from './_launchHealthKeys.js';

export function envHealth(env = process.env) {
  const out = {};
  for (const [k, vars] of Object.entries(HEALTH_ENV)) out[k] = vars.every((v) => Boolean(String(env[v] || '').trim()));
  for (const [k, fn] of Object.entries(HEALTH_ENV_FLAGS)) out[k] = Boolean(fn(env));
  return out;
}

const MISSING_RELATION = new Set(['42P01', 'PGRST205']);
const MISSING_COLUMN = new Set(['42703', 'PGRST204']);
const MISSING_FUNCTION = new Set(['42883', 'PGRST202']);
// 文で見分けるときは、何が無いのかまで見る（2026-11-09: 「column subscriptions.id does not exist」を表が無いと読んで、
// id 列の無い表＝subscriptions / app_admins / book_field_cache / ai_cache_warm が公開の準備で「ない」になっていた）。
const RELATION_RE = /relation .* does not exist|could not find the table|could not find a relationship/i;
const COLUMN_RE = /column .* does not exist|could not find the .* column/i;
const FUNCTION_RE = /function .* does not exist|could not find the function/i;
function isMissing(error, sets) {
  if (!error) return false;
  if (sets.has(error.code)) return true;
  const msg = error.message || '';
  if (sets === MISSING_RELATION) return RELATION_RE.test(msg);
  if (sets === MISSING_COLUMN) return COLUMN_RE.test(msg);
  if (sets === MISSING_FUNCTION) return FUNCTION_RE.test(msg);
  return false;
}

// 1 つの SQL の有無を確かめる。失敗は false（無いか、確かめられない）。
export async function probeSql(client, spec) {
  try {
    if (spec.rpc) {
      const { error } = await client.rpc(spec.rpc, spec.args || {});
      if (!error) return true;
      return !isMissing(error, MISSING_FUNCTION);
    }
    const col = spec.column || 'id';
    const { error } = await client.from(spec.table).select(col).limit(0);
    if (!error) return true;
    // 列が無いという答えは「表はある」（確かめたい列なら「ない」・id を仮に選んだだけなら「ある」）。表の有無より先に見る。
    if (isMissing(error, MISSING_COLUMN)) return !spec.column;
    if (isMissing(error, MISSING_RELATION)) return false;
    // ほかの失敗（権限など）は、確かめたい列が無いときだけ「ない」とみなす。
    return !spec.column;
  } catch {
    return false;
  }
}

export async function sqlHealth(client) {
  const out = {};
  await Promise.all(Object.entries(HEALTH_SQL).map(async ([k, spec]) => { out[k] = client ? await probeSql(client, spec) : false; }));
  return out;
}

// ops_dashboard に添える形。失敗しても数字は止めない。
export async function launchGates(client) {
  try {
    const [env, sql] = await Promise.all([Promise.resolve(envHealth()), sqlHealth(client)]);
    return { env, sql, checkedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}
