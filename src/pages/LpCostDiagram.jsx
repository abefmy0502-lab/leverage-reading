// 💴 料金の帯の図（2026-11-15 オーナー「安く感じるようなイラスト図を」）。
// 「本 1 冊」と「Orime の 1 か月」がほぼ同じ値段 → 左は読めるのがその 1 冊・右は読んだ本すべてに相談できる、を線の絵で並べる。
// 値段の数字は出さない（本の値段は本ごとに違う・比べる値段は書かない決まり）。強調は右の本棚の線だけ栗色。
import { Book, LibraryBig } from 'lucide-react';

export default function LpCostDiagram({ talks }) {
  return (
    <figure className="lp-cost-diagram" aria-label={`本 1 冊とほぼ同じ値段で、Orime なら 1 か月、読んだ本すべてに毎月 ${talks}相談できる`}>
      <div className="lp-cost-side">
        <Book className="lp-cost-icon" size="1em" strokeWidth={1.5} aria-hidden="true" />
        <p className="lp-cost-name">本 1 冊</p>
        <p className="lp-cost-what">読めるのは、<br />その 1 冊</p>
      </div>
      <p className="lp-cost-eq" aria-hidden="true">≒</p>
      <div className="lp-cost-side is-orime">
        <LibraryBig className="lp-cost-icon" size="1em" strokeWidth={1.5} aria-hidden="true" />
        <p className="lp-cost-name">Orime の 1 か月</p>
        <p className="lp-cost-what">読んだ本すべてに、<br />毎月 {talks}相談</p>
      </div>
    </figure>
  );
}
