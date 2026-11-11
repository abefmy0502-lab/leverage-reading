// 📈 なぜ会話すると残るのか（2026-11-11 オーナー「本と会話することで通常の読書の効果よりどれくらいアップするのかを簡単に論理的に示したい・月 ¥1,480 が安く感じるように」）。
//   図: 思い出せる量の時間の線（読むだけ＝薄れていく／会話する＝相談のたびに戻る）＝忘却曲線と分散学習のイメージ（参考）
//   研究 3 つは 3 つの言葉＋1 文＋出典 1 行（数字は出さない）→ 月 ¥1,480 の意味。
//   法務（company/brand-messaging.md・seo-articles-batch1.md）: 「○倍になる」「○円損している」の断定は書かない。数字は引用した研究の結果で、
//   Orime の効果を測ったものではないと添える。
import { WHY } from './lpCopy';

const S = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' };

// 思い出せる量の線（イメージ）。横＝時間（読んだ日 → 1 週間 → 1 か月）・縦＝思い出せる量。
function RetentionChart() {
  return (
    <figure className="lp-why-chart">
      <svg viewBox="0 0 360 150" role="img" aria-label={WHY.chartLabel}>
        {/* 軸 */}
        <path d="M28 18 V 140 H 344" stroke="var(--separator)" strokeWidth="1" {...S} />
        {/* 読むだけ: 下がったまま */}
        <path d="M28 30 C 70 70, 110 110, 160 122 S 300 134, 344 136" stroke="var(--text-3)" strokeWidth="1.75" strokeDasharray="4 5" {...S} />
        {/* 会話する: 相談のたびに戻って、落ち方がゆるくなる */}
        <path d="M28 30 C 60 56, 90 74, 118 84 L 128 36 C 170 54, 200 66, 222 74 L 232 32 C 280 44, 318 50, 344 54" stroke="var(--accent)" strokeWidth="2" {...S} />
        {/* 相談の印 */}
        <circle cx="128" cy="36" r="4.5" fill="var(--accent)" />
        <circle cx="232" cy="32" r="4.5" fill="var(--accent)" />
        <circle cx="28" cy="30" r="4.5" fill="var(--accent)" />
      </svg>
      {/* 文字は SVG に入れない（スマホで縮むと 12 を切る・DESIGN §2）。軸と凡例は HTML で */}
      <p className="lp-why-axis" aria-hidden="true"><span>読んだ日</span><span>1 週間</span><span>1 か月</span></p>
      <p className="lp-why-legend" aria-hidden="true"><span className="is-talk">相談する（点は相談）</span><span className="is-read">読むだけ</span></p>
      <figcaption>{WHY.chartCaption}</figcaption>
    </figure>
  );
}

export default function LpWhy() {
  return (
    <div className="lp-why">
      {/* 本と自分の輪（DialogueLoop）は「著者には聞けない」の 3 枚と重なるのでやめた（2026-11-11 オーナー「情報が錯綜」） */}
      <RetentionChart />
      {/* 研究 3 つは 1 段に（2026-11-11 オーナー「ここまで細かくなくて良い」）: 3 つの言葉 → 1 文 → 出典 1 行 */}
      <div className="lp-why-keys">
        <p className="lp-why-keys-row">{WHY.keys.map((k) => <span key={k}>{k}</span>)}</p>
        <p className="lp-why-summary">{WHY.summary}</p>
        <p className="lp-why-sources">{WHY.sources}</p>
      </div>
      {/* 「月 ¥1,480 は、本 1 冊分。」の帯は料金の頭へ（ui-critic 2026-11-11） */}
    </div>
  );
}
