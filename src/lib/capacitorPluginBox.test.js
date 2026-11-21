// Capacitor の部品（registerPlugin の Proxy）を async 関数からそのまま返すと、Promise が「then」を探して
// proxy.then(…) を呼び、返事の来ない待ちに入る（2026-11-21・Apple でサインインが「サインイン中…」のまま止まった原因）。
// ① その待ちが本当に起きることを、同じ形の Proxy で確かめる ② 部品を読み込む関数が箱 { plugin } で返すことを確かめる。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// @capacitor/core の registerPlugin と同じ形: どんな名前にも関数を返し、無い操作は「実装が無い」で reject するだけ。
function fakePluginProxy() {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === '$$typeof') return undefined;
      return () => Promise.reject(new Error(`${String(prop)}() is not implemented`));
    },
  });
}

const settlesWithin = (p, ms) => Promise.race([
  p.then(() => 'settled', () => 'settled'),
  new Promise((r) => setTimeout(() => r('hung'), ms)),
]);

describe('Capacitor の部品を Promise で返すと止まる', () => {
  it('そのまま返すと終わらない', async () => {
    const proxy = fakePluginProxy();
    const load = async () => proxy;
    // 待ち（then を呼ばれても resolve/reject を呼ばない）の後ろで reject が 1 つ残るので、拾っておく
    const onUnhandled = () => {};
    process.on('unhandledRejection', onUnhandled);
    try {
      expect(await settlesWithin(load(), 50)).toBe('hung');
    } finally {
      await new Promise((r) => setTimeout(r, 10));
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('箱に入れて返せば終わる', async () => {
    const proxy = fakePluginProxy();
    const load = async () => ({ plugin: proxy });
    expect(await settlesWithin(load(), 50)).toBe('settled');
    const { plugin } = await load();
    expect(plugin).toBe(proxy);
  });
});

describe('部品を読み込む関数は箱 { plugin } で返す', () => {
  const files = {
    'appleAuth.js': ['loadPlugin', '@capacitor-community/apple-sign-in'],
    'iap.js': ['loadPurchases', '@revenuecat/purchases-capacitor'],
    'nativePush.js': ['loadPN', '@capacitor/push-notifications'],
  };
  for (const [file, [fn, pkg]] of Object.entries(files)) {
    it(`${file} の ${fn}`, () => {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(src).toContain(`import('${pkg}')`);
      const body = src.slice(src.indexOf(`async function ${fn}(`), src.indexOf(`async function ${fn}(`) + 600);
      // return は全部 { plugin: … } の形（部品をそのまま返す return が無い）
      const returns = [...body.slice(0, body.indexOf('\n}\n') + 1).matchAll(/return ([^;]+);/g)].map((m) => m[1].trim());
      expect(returns.length).toBeGreaterThan(0);
      for (const r of returns) expect(r).toMatch(/^\{ plugin/);
      // 使う側は取り出して使う
      expect(src).not.toMatch(new RegExp(`(const|let|var)\\s+\\w+\\s*=\\s*await ${fn}\\(\\)`));
    });
  }
});
