// 🕒 時刻の欄（2026-10-10・読むの「時刻まで」）: 端末の 12 時間／24 時間の設定に関係なく「15:15」で見せる。
//
// type=time の欄は、時刻の書き方を端末・ブラウザの言語で決める（12 時間の端末では「午後3:15」「03:15 PM」）。
// DateInput.jsx と同じく、欄そのもの（押すと端末の時刻の選び方が開く）はそのままにして、上に「15:15」を重ねる。
// 日付の欄と違い、押している間も重ねた文字を出したまま（端末の書き方を一度も見せない・矢印キーで変えても上の文字が変わる）。
// 形は呼ぶ側の input のスタイルのまま（components.css の .date-field・.time-field）。
import { Clock } from 'lucide-react';

export default function TimeInput({ value, onChange, style, className = '', ...rest }) {
  return (
    <div className="date-field time-field">
      <input
        type="time"
        lang="ja"
        step={60}
        value={value || ''}
        onChange={onChange}
        style={style}
        className={`date-field__input${className ? ` ${className}` : ''}`}
        {...rest}
      />
      <span aria-hidden="true" className="date-field__text">{value || '--:--'}</span>
      <span aria-hidden="true" className="date-field__icon"><Clock size="1.2em" /></span>
    </div>
  );
}
