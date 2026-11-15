// 📚 「相談する相手は、選べます。」の図（2026-11-15 オーナー「1 冊でも、本棚ぜんぶでも、をわかりやすくデザインで」）。
// アプリの「相談相手」（1 冊／選んだ数冊／すべての本）を、線の絵 3 つで横に並べる。押せる形（枠・塗り）にしない。
// 本の数が増えていく見え方（1 冊 → 重なった本 → 本棚）で「広げられる」ことを伝える。強調は本棚の線だけ栗色。
import { Book, BookCopy, LibraryBig } from 'lucide-react';

const PARTNERS = [
  { Icon: Book, title: '1 冊', sub: ['その本の', '考え方で'] },
  { Icon: BookCopy, title: '何冊か', sub: ['選んだ本を', '比べて'] },
  { Icon: LibraryBig, title: '本棚ぜんぶ', sub: ['読んだ本', 'すべてから'] },
];

export default function LpPartnerDiagram() {
  return (
    <ul className="lp-partner-diagram" aria-label="相談する相手: 1 冊、何冊か、本棚ぜんぶ">
      {PARTNERS.map(({ Icon, title, sub }, i) => (
        <li key={title} className={`lp-partner-item${i === PARTNERS.length - 1 ? ' is-last' : ''}`}>
          <Icon className="lp-partner-icon" size="1em" strokeWidth={1.5} aria-hidden="true" />
          <span className="lp-partner-title">{title}</span>
          <span className="lp-partner-sub">{sub.map((t) => <span key={t}>{t}</span>)}</span>
        </li>
      ))}
    </ul>
  );
}
