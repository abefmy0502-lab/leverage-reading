// 📅 日付の欄（2026-10-09）: 端末・ブラウザの言語に関係なく「2026年10月9日」／空なら「日付を選ぶ」で見せる。
//
// type=date の欄は、日付の書き方をブラウザの言語で決める（lang="ja" を付けても Chrome は従わない）。英語の環境では
// 空の読書開始日に「mm/dd/yyyy」と出ていた。欄そのもの（押すと端末の日付の選び方が開く）はそのままにして、
// 押していない間だけ、上に日本の書き方の文字を重ねる（押している間は端末の表示）。
// 形は呼ぶ側の input のスタイルのまま（components.css の .date-field）。空の欄の iOS の案内（data-empty）は使わない（二重になる）。
import { DATE_HINT } from '../lib/dateHint';

export function formatDateFieldJa(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return '';
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

export default function DateInput({ value, onChange, style, className = '', ...rest }) {
  const text = formatDateFieldJa(value);
  return (
    <div className={`date-field${text ? '' : ' date-field--empty'}`}>
      <input
        type="date"
        lang="ja"
        value={value || ''}
        onChange={onChange}
        style={style}
        className={`date-field__input${className ? ` ${className}` : ''}`}
        {...rest}
      />
      <span aria-hidden="true" className="date-field__text">{text || DATE_HINT}</span>
    </div>
  );
}
