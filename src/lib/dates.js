// 📅 日付の小道具（端末の現地時刻で扱う）。
//
// `new Date().toISOString().slice(0, 10)` は UTC の日付なので、日本時間の朝 9 時前は
// 前日になる（読了日・開始日が 1 日ずれ、月別の読了数も狂う）。日付だけの文字列を
// 作るときは必ず todayLocal / toLocalYmd を使う。

export function toLocalYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const todayLocal = () => toLocalYmd(new Date());

// 明日（端末の日付）。相談の答えから入れる行動の既定の期限。
export function tomorrowLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalYmd(d);
}

// 'YYYY-MM-DD'（または ISO）を画面用に。今年なら「9/29」、違う年なら「2025/9/29」。
export function fmtDateJa(value) {
  if (!value) return '';
  const s = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}/${md}`;
}

// 繰り返しの行動の「次回分」（表示開始日 scheduledFor がまだ先）かどうか。
// 行動タブ（useAllActions）と同じ基準で、まだ見せない＝先取りで完了させない。
export function isScheduledLater(action, now = new Date()) {
  if (!action?.scheduledFor) return false;
  const t = new Date(action.scheduledFor).getTime();
  return Number.isFinite(t) && t > now.getTime();
}
