import { createClient } from '@supabase/supabase-js';
import { createDemoClient } from '../demo/demoClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
