// 🎯 行動の知らせの文（行動タブ・本の詳細で共通）。

// 完了の知らせ（「元に戻す」つき）の文。繰り返しの行動は、次回がいつ出るかもここで伝える
// （以前は完了の知らせと中央の「完了 ✓ 次週の予定を自動で組みました。」が同時に 2 つ出ていた・2026-10-04）。
// 「元に戻す」と並んで 390 幅で 1 行に収まる短さにする（DESIGN §5 トースト）。
export function completedActionMessage(a) {
  if (a?.recurrence === 'weekly') return '完了。次回は来週';
  if (a?.recurrence === 'monthly') return '完了。次回は来月';
  return '行動を完了しました';
}
