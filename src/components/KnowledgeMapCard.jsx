// 🗺 知識の地図（2026-11-26・振り返り › 記録・lib/knowledgeMap.js）。
// 点＝本の表紙（円の上）・線＝似たことを書いたメモ・同じメモのタグでつながる本どうし（太さ＝つながりの数）。
// 本を押すとその本の線が濃くなり、下に「〈本〉と重なる本」が並ぶ。各行に 2 つのメモと「重ねて考える」（重なりのシート）。
// AI は使わない（端末の中の計算・トークンを使わない・無料プランも）。数・%・順位は出さない。
import { useMemo, useState } from 'react';
import { MiniCover } from './BookCards';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { useAuth } from '../hooks/useAuth';
import { useAllMemoRows } from '../hooks/useAllMemoRows';
import { buildKnowledgeMap, ringPositions, edgeWidth } from '../lib/knowledgeMap';
import { openOverlap } from '../lib/overlap';
import { track } from '../lib/analytics';
import { btnLink, card } from '../styles/ui';

const COVER_W = 36; // 点の表紙の幅（押せる範囲は外側のボタンで 44 以上）
const titleOf = (b) => String(b?.title || '').trim();
const quote = {
  margin: 0, fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)',
  display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
  wordBreak: 'normal', lineBreak: 'strict', overflowWrap: 'anywhere',
};
const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 };

// likely: 地図が出そうか（読んでいる・読んだ本が 3 冊以上）。メモを読み込んでいる間だけ形を出すかどうかに使う。
export default function KnowledgeMapCard({ books = [], likely = false }) {
  const { user } = useAuth();
  const { rows, status } = useAllMemoRows({ userId: user?.id || null, books, active: !!user?.id });
  const map = useMemo(() => (status === 'ready' && rows ? buildKnowledgeMap({ rows, books }) : null), [status, rows, books]);
  const [picked, setPicked] = useState(null);

  if (!map) {
    if (status === 'error' || !likely) return null;
    return <SkeletonBlock height={360} radius="var(--radius)" aria-label="知識の地図を読み込み中" />;
  }
  if (!map.nodes.length) return null;

  const selected = map.nodes.some((n) => String(n.book.id) === picked) ? picked : String(map.nodes[0].book.id);
  const pos = ringPositions(map.nodes.length);
  const at = new Map(map.nodes.map((n, i) => [String(n.book.id), pos[i]]));
  const bookById = new Map(map.nodes.map((n) => [String(n.book.id), n.book]));
  const mine = map.edges
    .filter((e) => e.a === selected || e.b === selected)
    .map((e) => {
      const flip = e.a !== selected;
      return { other: bookById.get(flip ? e.a : e.b), count: e.count, tags: e.tags, my: flip ? e.best.to : e.best.from, their: flip ? e.best.from : e.best.to };
    });
  const selBook = bookById.get(selected);
  const pick = (id) => { setPicked(id); track('knowledge_map_pick', {}); };

  return (
    <section data-knowledge-map="" aria-labelledby="knowledge-map-title" style={{ ...card, padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 'var(--space-3)' }}>
        <h3 id="knowledge-map-title" style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>知識の地図</h3>
        <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{`つながる本 ${map.nodes.length} 冊`}</span>
      </div>

      {/* 地図: 線は SVG（読み上げには出さない＝下の一覧が同じ中身）・点は表紙のボタン */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 360, aspectRatio: '1 / 1', margin: 'var(--space-3) auto 0' }}>
        <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          {map.edges.map((e) => {
            const p = at.get(e.a); const q = at.get(e.b);
            const on = e.a === selected || e.b === selected;
            return (
              <line
                key={`${e.a}|${e.b}`}
                x1={p.x * 100} y1={p.y * 100} x2={q.x * 100} y2={q.y * 100}
                stroke={on ? 'var(--accent)' : 'var(--border)'}
                strokeWidth={edgeWidth(e.count, e.tags.length)}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ transition: 'stroke var(--duration-fast) var(--ease-out)' }}
              />
            );
          })}
        </svg>
        {map.nodes.map((n) => {
          const id = String(n.book.id);
          const p = at.get(id);
          const on = id === selected;
          return (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              aria-pressed={on}
              aria-label={`『${titleOf(n.book)}』とつながる本を見る`}
              style={{
                position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%, -50%)',
                minWidth: 'var(--tap-min)', minHeight: 'var(--tap-min)', padding: 'var(--space-1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius)',
              }}
            >
              <span style={{ display: 'block', borderRadius: 4, boxShadow: on ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : 'none', transition: 'box-shadow var(--duration-fast) var(--ease-out)' }}>
                <MiniCover book={n.book} width={COVER_W} />
              </span>
            </button>
          );
        })}
      </div>

      {/* 選んだ本と重なる本（線の中身）。押すと、その 2 つのメモで「重ねて考える」 */}
      <h4 style={{ margin: 'var(--space-4) 0 0', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks(`『${titleOf(selBook)}』と重なる本`, { scriptBreaks: true })}
      </h4>
      <ul style={{ listStyle: 'none', margin: 'var(--space-2) 0 0', padding: 0 }}>
        {mine.map((r, i) => (
          <li key={String(r.other.id)} style={{ padding: 'var(--space-3) 0', borderTop: i ? '1px solid var(--separator)' : 'none' }}>
            <button
              type="button"
              onClick={() => pick(String(r.other.id))}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 'var(--tap-min)', padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
              aria-label={`『${titleOf(r.other)}』を地図の中心に`}
            >
              <MiniCover book={r.other} width={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(titleOf(r.other), { scriptBreaks: true })}</span>
                <span style={meta}>{[r.count ? `似たメモ ${r.count}\u00a0組` : '', r.tags.length ? `同じタグ「${r.tags[0]}」${r.tags.length > 1 ? `\u00a0ほか\u00a0${r.tags.length - 1}` : ''}` : ''].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)', paddingLeft: 'var(--space-3)', borderLeft: '2px solid var(--separator)' }}>
              <p style={quote}>{r.my.text}</p>
              <p style={quote}>{r.their.text}</p>
            </div>
            <button
              type="button"
              onClick={() => { track('knowledge_map_overlap', {}); openOverlap({ id: r.my.id, text: r.my.text, bookId: r.my.bookId }, r.their.id); }}
              style={{ ...btnLink, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))', marginBottom: 'calc(-1 * var(--space-2))' }}
            >
              重ねて考える
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
