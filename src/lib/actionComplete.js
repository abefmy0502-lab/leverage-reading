// 🎯 行動の完了の楽観的 UI（ActionList.jsx の complete）。
//   見た目（✓ と取り消し線）はすぐ変え、保存の結果を待ってから:
//   - 保存できた → onSaved（完了の知らせ「元に戻す」つき）
//   - 保存できなかった（false を返した・例外）→ onFail（見た目を未完了に戻す・知らせは出さない）
//   オフラインで完了を押すと、失敗しても完了の見た目と成功の知らせが残っていた（2026-10-11）。
//   保存の関数が何も返さない（古い呼び出し・お試し）ときは、できたものとして扱う。
export async function completeWithRollback({ save, onSaved, onFail }) {
  let ok;
  try {
    ok = await save?.();
  } catch {
    ok = false;
  }
  if (ok === false) {
    onFail?.();
    return false;
  }
  onSaved?.();
  return true;
}
