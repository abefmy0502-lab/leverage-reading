import { createClient } from '@supabase/supabase-js';
import { createDemoClient } from '../demo/demoClient';

// 環境変数は前後の空白・改行・引用符を落として読む（2026-10-22 本番の VITE_SUPABASE_URL が
// 「Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL」で起動が落ちた＝値の形の違いで全員が真っ暗になった）。
// 形が URL でなければ「設定が未完了」の画面に落とし、createClient で例外を投げさせない。
export function cleanEnv(v) {
  return String(v ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim();
}
export function isHttpUrl(v) {
  try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}
const supabaseUrlRaw = cleanEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseUrl = isHttpUrl(supabaseUrlRaw) ? supabaseUrlRaw.replace(/\/+$/, '') : '';
const supabaseAnonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
// 値はあるのに形が違うとき（設定の画面で理由を出す）。
export const supabaseConfigProblem = supabaseUrlRaw && !supabaseUrl ? 'VITE_SUPABASE_URL が URL の形ではありません（https://〜.supabase.co・引用符や空白なし）。' : '';

// 🧪 お試しモード（`npm run demo`）: サンプルデータ入りの偽クライアントで動かす。
// import.meta.env.DEV は本番ビルドで false に置き換わるため、この分岐と
// src/demo/ は production バンドルに含まれない（tree-shake）。
export const isDemo = import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true';
// お試しモードのシナリオ（?demo=new / auth / paywall / webgate）。本番では常に null。
export const demoScenario = isDemo && typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('demo')
  : null;

export const isSupabaseConfigured = isDemo || Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isDemo
  ? createDemoClient()
  : isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
