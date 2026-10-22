// 🚀 公開の準備（売上までの関門）— 運営ダッシュボードのカードと api/launch-health.js が同じ一覧を使う（2026-10-22）。
//
// 「売上が出る」までにオーナーが外でやる作業（App Store Connect・RevenueCat・Vercel の env・Supabase の SQL・Mac）は
// リポジトリの中からは見えない。そこでサーバーが「設定されているか」を真偽だけで返し（値は返さない）、
// この一覧に照らして「まだ」を並べる。手順は docs/revenue-gates.md（オーナーの順番）と各 runbook。
//
// health の形（api/launch-health.js が返す）: { env: { [key]: boolean }, sql: { [key]: boolean }, admin: boolean, checkedAt }
// 1 つの関門は env か sql の 1 つ以上のキーで決まる（all = 全部 true のときだけ ✓）。

export const GATE_GROUPS = [
  { id: 'sell', title: '売るために必須', note: 'ここが全部そろうと、App 内課金と AI が本番で回ります。' },
  { id: 'ios', title: 'iPhone の 1.0 に必須', note: '審査に出す前にそろえるもの。' },
  { id: 'measure', title: '数字が見えるために', note: '運営ダッシュボードと LP の計測。' },
  { id: 'boost', title: 'あると効く', note: '無くても売れるが、入れると伸びる。' },
];

// where: どの手順書のどこを見るか（画面にそのまま出す・短く）。
export const GATES = [
  // ── 売るために必須
  { id: 'sql_subscriptions', group: 'sell', label: '契約の表（subscriptions）', sql: ['subscriptions'], where: 'docs/sql-runbook.md（supabase_all_in_order.sql を流す）' },
  { id: 'sql_ai_cost', group: 'sell', label: 'AI の原価を数える表と関数', sql: ['ai_usage', 'reserve_ai_cost'], where: '同上' },
  { id: 'env_service_role', group: 'sell', label: 'サーバーの Supabase の鍵', env: ['supabase_service_role'], where: 'Vercel の env（launch-readiness-runbook §3）' },
  { id: 'env_anthropic', group: 'sell', label: 'Claude の鍵（相談・AI 選書）', env: ['anthropic'], where: 'Vercel の env' },
  { id: 'env_revenuecat', group: 'sell', label: 'RevenueCat の Webhook の合言葉と Secret key', env: ['revenuecat_webhook_auth', 'revenuecat_secret'], where: 'docs/iap-setup-runbook.md §F・§G' },
  { id: 'env_app_store_url', group: 'sell', label: 'App Store の URL（LP・レビュー依頼・Smart Banner）', env: ['app_store_url'], where: '公開後に Vercel の VITE_APP_STORE_URL' },
  // ── iPhone の 1.0 に必須
  { id: 'env_apns', group: 'ios', label: 'iPhone の通知（APNs の鍵 4 つ）', env: ['apns'], where: 'company/app-store-submission.md §12' },
  { id: 'sql_push_native', group: 'ios', label: '通知の表に iPhone の列', sql: ['push_subscriptions_platform'], where: 'docs/sql-runbook.md' },
  { id: 'env_native_push', group: 'ios', label: 'ビルドに通知のスイッチ（VITE_NATIVE_PUSH=on）', env: ['native_push_flag'], where: 'company/app-store-submission.md §12' },
  { id: 'env_cron', group: 'ios', label: '通知と DB の見張りの合言葉（CRON_SECRET）', env: ['cron_secret'], where: 'Vercel の env（CLAUDE.md の CRON_SECRET）' },
  { id: 'env_release_since', group: 'ios', label: '1.0 の公開日（新しくなったことの出し始め）', env: ['release_notes_since'], where: 'company/app-store-submission.md §4' },
  // ── 数字が見えるために
  { id: 'sql_admin', group: 'measure', label: '運営ダッシュボードの表と関数（自分が管理者）', sql: ['app_admins', 'admin_profit', 'admin_goal_plan', 'admin_launch_kpis'], adminRequired: true, where: 'docs/sql-runbook.md → app_admins に自分を入れる' },
  { id: 'sql_events', group: 'measure', label: '契約の履歴・利用状況・LP の記録の表', sql: ['subscription_events', 'analytics_events', 'lp_events'], where: 'docs/sql-runbook.md' },
  { id: 'env_app_store_pt', group: 'measure', label: 'App Store のキャンペーンの印（ct= で入手数を見る）', env: ['app_store_pt'], where: 'CLAUDE.md の VITE_APP_STORE_PT' },
  { id: 'env_sentry', group: 'measure', label: 'クラッシュの記録（Sentry）', env: ['sentry'], where: 'CLAUDE.md の VITE_SENTRY_DSN' },
  // ── あると効く
  { id: 'env_gemini', group: 'boost', label: 'Gemini の鍵（相談以外の AI を安く）', env: ['gemini'], where: 'docs/ai-routing.md' },
  { id: 'env_rakuten', group: 'boost', label: '楽天ブックス（表紙・検索・分野）', env: ['rakuten'], where: 'CLAUDE.md の RAKUTEN_*' },
  { id: 'sql_fields_cache', group: 'boost', label: '本の分野の覚え書きの表', sql: ['book_field_cache'], where: 'docs/sql-runbook.md' },
  { id: 'sql_cache_warm', group: 'boost', label: '相談のキャッシュを温め直す表', sql: ['ai_cache_warm'], where: 'docs/sql-runbook.md' },
  { id: 'env_founding', group: 'boost', label: '創業メンバー価格（公開から 30 日）', env: ['founding_offer'], where: 'company/launch-founding-offer.md' },
  { id: 'env_referral', group: 'boost', label: '友だちに紹介する（オファーコード）', env: ['referral_code'], where: 'CLAUDE.md の VITE_REFERRAL_CODE' },
  { id: 'env_vapid', group: 'boost', label: 'Web の通知（VAPID）', env: ['vapid'], where: 'CLAUDE.md の VAPID_*' },
];

// health を一覧に照らす → [{ ...gate, ok: true|false|null }]（null＝サーバーが答えていない）。
export function evaluateGates(health, gates = GATES) {
  const env = health?.env || null;
  const sql = health?.sql || null;
  return gates.map((g) => {
    const keys = [...(g.env || []).map((k) => ['env', k]), ...(g.sql || []).map((k) => ['sql', k])];
    let ok = true;
    for (const [kind, k] of keys) {
      const src = kind === 'env' ? env : sql;
      if (!src || typeof src[k] !== 'boolean') { ok = null; break; }
      if (!src[k]) ok = false;
    }
    if (ok === true && g.adminRequired && health?.admin !== true) ok = false;
    return { ...g, ok };
  });
}

// グループごとにまとめ、「まだ」の数を数える。
export function groupGates(rows) {
  return GATE_GROUPS.map((grp) => {
    const items = rows.filter((r) => r.group === grp.id);
    return { ...grp, items, pending: items.filter((r) => r.ok === false).length, unknown: items.filter((r) => r.ok === null).length };
  });
}

// 1 行の見出し。「売るために必須」が全部そろえば「売れる状態です」。
export function gateHeadline(rows) {
  const sell = rows.filter((r) => r.group === 'sell');
  if (sell.length === 0 || sell.some((r) => r.ok === null)) return '確かめられませんでした';
  const pending = sell.filter((r) => r.ok === false).length;
  return pending === 0 ? '売れる状態です' : `売るまでに あと ${pending} つ`;
}
