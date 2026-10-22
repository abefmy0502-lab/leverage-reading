// 🚀 公開の準備（api/launch-health.js）が返すキーの一覧。src/lib/launchGates.js の一覧と一致することをテストで確かめる。
// 値は「設定されているか」の真偽だけ。鍵の中身・URL・利用者の情報は返さない。

// env: 名前 → 必要な環境変数（全部そろって true）。VITE_* もサーバーの関数から読める（Vercel は全部渡す）。
export const HEALTH_ENV = {
  supabase_service_role: ['SUPABASE_SERVICE_ROLE_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  revenuecat_webhook_auth: ['REVENUECAT_WEBHOOK_AUTH'],
  revenuecat_secret: ['REVENUECAT_SECRET_API_KEY'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  apns: ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY', 'APNS_BUNDLE_ID'],
  vapid: ['VITE_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
  cron_secret: ['CRON_SECRET'],
  rakuten: ['RAKUTEN_APPLICATION_ID', 'RAKUTEN_ACCESS_KEY', 'RAKUTEN_APP_URL'],
  google_books: ['GOOGLE_BOOKS_API_KEY'],
  app_store_url: ['VITE_APP_STORE_URL'],
  app_store_pt: ['VITE_APP_STORE_PT'],
  sentry: ['VITE_SENTRY_DSN'],
  release_notes_since: ['VITE_RELEASE_NOTES_SINCE'],
  referral_code: ['VITE_REFERRAL_CODE'],
};
// 値が決まった形のときだけ true にするもの（空でない、だけでは足りない）。
export const HEALTH_ENV_FLAGS = {
  native_push_flag: () => process.env.VITE_NATIVE_PUSH === 'on',
  founding_offer: () => process.env.VITE_FOUNDING_OFFER === 'on' && /^\d{4}-\d{2}-\d{2}$/.test(process.env.VITE_FOUNDING_OFFER_END || ''),
};
export const HEALTH_ENV_KEYS = [...Object.keys(HEALTH_ENV), ...Object.keys(HEALTH_ENV_FLAGS)];

// sql: 名前 → 確かめ方。table＝その表が読める（無ければ 42P01）・column＝その列がある（無ければ 42703）・rpc＝その関数がある（無ければ PGRST202 / 42883）。
export const HEALTH_SQL = {
  subscriptions: { table: 'subscriptions' },
  subscription_events: { table: 'subscription_events' },
  ai_usage: { table: 'ai_usage', column: 'cost_mjpy' },
  ai_token_lots: { table: 'ai_token_lots' },
  push_subscriptions_platform: { table: 'push_subscriptions', column: 'platform' },
  reading_sessions: { table: 'reading_sessions' },
  analytics_events: { table: 'analytics_events' },
  lp_events: { table: 'lp_events' },
  book_field_cache: { table: 'book_field_cache' },
  ai_cache_warm: { table: 'ai_cache_warm' },
  app_admins: { table: 'app_admins' },
  // user_id を null にすると not-null で止まる＝行を書かずに関数の有無だけ分かる。
  reserve_ai_cost: { rpc: 'reserve_ai_cost', args: { p_user_id: null, p_period_month: 'probe', p_amount: 0, p_budget: 0 } },
  admin_profit: { rpc: 'admin_profit', args: { p_month: null } },
  admin_goal_plan: { rpc: 'admin_goal_plan', args: {} },
  admin_launch_kpis: { rpc: 'admin_launch_kpis', args: { p_weeks: 1 } },
};
export const HEALTH_SQL_KEYS = Object.keys(HEALTH_SQL);
