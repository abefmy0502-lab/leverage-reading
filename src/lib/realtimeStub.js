// ⚡ Supabase Realtime の代わりの空の部品（vite.config.js の resolve.alias で差し替え・2026-09-29）。
//
// Orime は Realtime（supabase.channel() / 変更の購読 / Presence）を使っていない。
// それでも supabase-js は起動時に RealtimeClient を必ず作るため、使わない WebSocket の部品
// （@supabase/realtime-js + @supabase/phoenix・約 14KB gzip）が全員の起動時に読まれていた。
// supabase-js が起動時に呼ぶのは constructor と setAuth だけ（どちらも通信しない）なので、同じ形の空の部品で置き換える。
//
// ⚠️ Realtime を使い始めるときは、vite.config.js の alias（'@supabase/realtime-js'）を消すこと。
// 消し忘れても気づけるよう、channel() は分かりやすいエラーを投げる。
export class RealtimeClient {
  constructor(endPoint, options = {}) {
    this.endPoint = endPoint;
    this.options = options;
    this.channels = [];
  }

  // 本物も async（Promise を返す）。supabase-js はログイン・ログアウト・トークン更新のたびに呼ぶ。
  async setAuth() {}

  channel() {
    throw new Error('Supabase Realtime is disabled in this build (see vite.config.js alias for @supabase/realtime-js).');
  }

  getChannels() {
    return this.channels;
  }

  async removeChannel() {
    return 'ok';
  }

  async removeAllChannels() {
    return [];
  }

  connect() {}

  disconnect() {}
}
