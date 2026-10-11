// ⌨️ タブの並び（role="tablist"）の矢印キー（2026-10-11・WAI-ARIA の Tabs の形）。
//   ←→ で となりのタブへ・Home / End で端へ。移った先をすぐ選ぶ（自動で切り替える形）。
//   選んでいるタブだけ tabIndex 0（Tab キーでは並びに 1 回だけ止まる）＝tabIndexFor。
export function onTabListKeyDown(e) {
  const key = e.key;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;
  if (e.nativeEvent?.isComposing) return;
  const list = e.currentTarget;
  const tabs = Array.from(list.querySelectorAll('[role="tab"]')).filter((t) => !t.disabled);
  const n = tabs.length;
  if (!n) return;
  const cur = tabs.indexOf(typeof document !== 'undefined' ? document.activeElement : null);
  if (cur < 0) return;
  let next = cur;
  if (key === 'ArrowRight') next = (cur + 1) % n;
  else if (key === 'ArrowLeft') next = (cur - 1 + n) % n;
  else if (key === 'Home') next = 0;
  else if (key === 'End') next = n - 1;
  e.preventDefault();
  if (next === cur) return;
  tabs[next].focus();
  tabs[next].click();
}

export const tabIndexFor = (selected) => (selected ? 0 : -1);
