// 🛡 送信の二重押しを止める小さな見張り（相談の ask・2026-10-04）。
// React の state（busy）は次の描画まで変わらないので、送信を素早く 2 回押すと、
// メモを探す・AI への同意を待つ・保存する、のあいだに 2 回目も通り抜けていた。
// 同期の印で「いま送っている途中」を持ち、終わったら（失敗しても）外す。
export function createSendGuard() {
  let running = false;
  return {
    get busy() { return running; },
    // 送っている途中なら fn を呼ばずに undefined を返す。
    async run(fn) {
      if (running) return undefined;
      running = true;
      try {
        return await fn();
      } finally {
        running = false;
      }
    },
  };
}
