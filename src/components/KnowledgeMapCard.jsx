// 🗺 知識の地図（2026-11-26・振り返り › 記録・lib/knowledgeMap.js）。
// 点＝読書中・読了の本の表紙（円の上・同じ分野の本を隣どうしに）。内側の小さな点＝分野（2 冊以上の分野・名前つき）から、その本へ細い点線。
//   本どうしの実線＝似たことを書いたメモ・同じメモのタグでつながる本（太さ＝つながりの数）。
// つながりが無くても、読んできた本の星座として出す（2026-11-26 オーナー「繋がるものがなくても何らか見えて感動するものにしたい」）。
//   メモの無い本の表紙は淡く。本を押すとその本の線が濃くなり、下に重なる本（2 つのメモと「重ねて考える」）・同じ分野の本、
//   重なりがまだ無い本は自分のいちばん新しいメモと「ほかの本と重ねて考える」（相手は重なりのシートが選ぶ）。
// AI は使わない（端末の中の計算・トークンを使わない・無料プランも）。%・順位は出さない。
import { useMemo, useRef, useState } from 'react';
import { MiniCover } from './BookCards';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { useAuth } from '../hooks/useAuth';
import { useAllMemoRows } from '../hooks/useAllMemoRows';
import { buildKnowledgeMap, ringPositions, hubPositions, edgeWidth } from '../lib/knowledgeMap';
import { openOverlap } from '../lib/overlap';
import { track } from '../lib/analytics';
import { btnLink, card } from '../styles/ui';

const COVER_W = 36; // 点の表紙の幅（押せる範囲は外側のボタンで 44 以上）
const FAINT = 0.7; // メモの無い本の表紙の濃さ（ほかにメモのある本があるときだけ）
const titleOf = (b) => String(b?.title || '').trim();
// 「・」を行の頭に出さない（記録の分野の行と同じ決まり）
const glueMiddot = (t) => String(t || '').replace(/(.)・/g, '$1\u2060・');
const quote = {
  margin: 0, fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)',
  display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
  wordBreak: 'normal', lineBreak: 'strict', overflowWrap: 'anywhere',
};
const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 };
const note = { ...meta, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
// 引用の出どころ（どちらの本のメモか・重なりのシートのカードと同じ 13/--text-3・2026-11-26 ui-critic）
const source = { display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 'var(--space-1)', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const quoteBox = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingLeft: 'var(--space-3)', borderLeft: '2px solid var(--separator)' };

// 凡例の線の見本（実線・点線）
function DotSample() {
  return (
    <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1="1" y1="4" x2="14" y2="4" stroke="var(--text-3)" strokeWidth="1" strokeDasharray="2 3" strokeLinecap="round" />
      <circle cx="16" cy="4" r="3" fill="var(--text-3)" />
    </svg>
  );
}
function LineSample({ dashed }) {
  return (
    <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true" style={{ flexShrink: 0 }}>
      {/* 見本は地図の選んでいない線と同じ色（栗色は選んだ本の線だけ・2026-11-26 ui-critic） */}
      <line x1="1" y1="4" x2="19" y2="4" stroke={dashed ? 'var(--text-3)' : 'var(--border)'} strokeWidth={dashed ? 1.5 : 2} strokeDasharray={dashed ? '3 3' : undefined} strokeLinecap="round" />
    </svg>
  );
}

// likely: 地図が出そうか（読書中・読了の本が 1 冊以上）。メモを読み込んでいる間だけ形を出すかどうかに使う。
// onWriteMemo(book): メモの無い本を選んだときの「この本のメモを書く」（メモを書くシートをその本で）
export default function KnowledgeMapCard({ books = [], likely = false, onWriteMemo = null }) {
  const { user } = useAuth();
  const { rows, status } = useAllMemoRows({ userId: user?.id || null, books, active: !!user?.id });
  const map = useMemo(() => (status === 'ready' && rows ? buildKnowledgeMap({ rows, books }) : null), [status, rows, books]);
  const [picked, setPicked] = useState(null);
  const sectionRef = useRef(null);

  if (!map) {
    if (status === 'error' || !likely) return null;
    return <SkeletonBlock height={360} radius="var(--radius)" aria-label="知識の地図を読み込み中" />;
  }
  if (!map.nodes.length) return null;

  // はじめに選ぶ本: いちばんつながる本 → いちばんメモの多い本
  const first = [...map.nodes].sort((x, y) => y.weight - x.weight || y.memoCount - x.memoCount)[0];
  const selected = map.nodes.some((n) => String(n.book.id) === picked) ? picked : String(first.book.id);
  const selNode = map.nodes.find((n) => String(n.book.id) === selected);
  // 同じ分野の本（選んだ本の分野ごと・2 つの分野まで）
  const sameField = selNode.fields
    .map((f) => ({ field: f, books: map.nodes.filter((n) => String(n.book.id) !== selected && n.fields.includes(f)).map((n) => n.book) }))
    .filter((g) => g.books.length > 0)
    .slice(0, 2);
  const pos = ringPositions(map.nodes.length);
  const at = new Map(map.nodes.map((n, i) => [String(n.book.id), pos[i]]));
  const hubAt = hubPositions(map.hubs, at);
  const anyMemo = map.nodes.some((n) => n.memoCount > 0);
  const bookById = new Map(map.nodes.map((n) => [String(n.book.id), n.book]));
  const mine = map.edges
    .filter((e) => e.a === selected || e.b === selected)
    .map((e) => {
      const flip = e.a !== selected;
      return { other: bookById.get(flip ? e.a : e.b), count: e.count, tags: e.tags, my: flip ? e.best.to : e.best.from, their: flip ? e.best.from : e.best.to };
    });
  const selBook = bookById.get(selected);
  const pick = (id) => { setPicked(id); track('knowledge_map_pick', {}); };
  // 一覧の行から選び直したら、地図の先頭まで送る（指の下で一覧がすり替わって見えないように・2026-11-26 ui-critic）。
  const pickFromList = (id) => {
    pick(id);
    const el = sectionRef.current;
    if (!el?.scrollIntoView) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }));
  };

  return (
    <section ref={sectionRef} data-knowledge-map="" aria-labelledby="knowledge-map-title" style={{ ...card, padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 'var(--space-3)' }}>
        <h3 id="knowledge-map-title" style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>知識の地図</h3>
        <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{`本 ${map.nodes.length} 冊`}</span>
      </div>

      {/* 地図: 線は SVG（読み上げには出さない＝下の一覧が同じ中身）・点は表紙のボタン */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 360, aspectRatio: '1 / 1', margin: 'var(--space-3) auto 0' }}>
        <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          {/* 分野の点からその本へ細い点線（選んだ本の線はアクセント）。開いたときに 1 回だけ、線が順に浮かぶ（.kmap-line） */}
          {map.hubs.flatMap((h, hi) => h.bookIds.map((id, k) => {
            const p = hubAt[hi]; const q = at.get(id);
            const on = id === selected;
            return (
              <line
                key={`h-${h.name}|${id}`}
                className="kmap-line"
                x1={p.x * 100} y1={p.y * 100} x2={q.x * 100} y2={q.y * 100}
                stroke={on ? 'var(--accent)' : 'var(--text-3)'}
                strokeWidth={on ? 1.5 : 1}
                strokeDasharray="2 3"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ transition: 'stroke var(--duration-fast) var(--ease-out)', animationDelay: `${Math.min(hi * 2 + k, 10) * 40}ms` }}
              />
            );
          }))}
          {map.hubs.map((h, hi) => {
            const p = hubAt[hi];
            const on = h.bookIds.includes(selected);
            return <circle key={`hd-${h.name}`} cx={p.x * 100} cy={p.y * 100} r={on ? 1.6 : 1.2} fill={on ? 'var(--accent)' : 'var(--text-3)'} style={{ transition: 'fill var(--duration-fast) var(--ease-out)' }} />;
          })}
          {map.edges.map((e, i) => {
            const p = at.get(e.a); const q = at.get(e.b);
            const on = e.a === selected || e.b === selected;
            return (
              <line
                key={`${e.a}|${e.b}`}
                className="kmap-line"
                x1={p.x * 100} y1={p.y * 100} x2={q.x * 100} y2={q.y * 100}
                stroke={on ? 'var(--accent)' : 'var(--border)'}
                strokeWidth={edgeWidth(e.count, e.tags.length)}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ transition: 'stroke var(--duration-fast) var(--ease-out)', animationDelay: `${Math.min(8 + i, 16) * 40}ms` }}
              />
            );
          })}
        </svg>
        {/* 分野の名前（点のすぐ下・12/--text 600）。押せない（下の「同じ分野」から本を選ぶ） */}
        {/* 名前は選んだ本の分野だけ（ほかの分野は点だけ＝名前どうしが重ならない・2026-11-26） */}
        {map.hubs.map((h, hi) => {
          const p = hubAt[hi];
          const on = h.bookIds.includes(selected);
          if (!on) return null;
          return (
            <span
              key={`hl-${h.name}`}
              aria-hidden="true"
              style={{
                // 下半分の点は名前を点の上に（下の表紙に触れない）
                position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: p.y > 0.5 ? 'translate(-50%, calc(-100% - 6px))' : 'translate(-50%, 6px)',
                maxWidth: '26%', textAlign: 'center', fontSize: 'var(--text-caption)', lineHeight: 1.3,
                color: on ? 'var(--text)' : 'var(--text-2)', fontWeight: on ? 600 : 400,
                // 板にせず文字の縁取りで線から浮かせる（板は線を途中で切って見せた・2026-11-26 ui-critic）
                textShadow: '0 0 2px var(--surface), 0 0 2px var(--surface), 0 0 4px var(--surface)', wordBreak: 'keep-all', overflowWrap: 'anywhere', pointerEvents: 'none',
              }}
            >
              {withPhraseBreaks(glueMiddot(h.name), { scriptBreaks: true })}
            </span>
          );
        })}
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
              aria-label={`『${titleOf(n.book)}』${n.memoCount ? `・メモ ${n.memoCount} 件` : '・メモなし'}・つながる本を見る`}
              style={{
                position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%, -50%)',
                minWidth: 'var(--tap-min)', minHeight: 'var(--tap-min)', padding: 'var(--space-1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius)',
              }}
            >
              <span style={{ display: 'block', borderRadius: 4, boxShadow: on ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : 'none', transition: 'box-shadow var(--duration-fast) var(--ease-out)' }}>
                {/* 淡い表紙の下に面を敷く（線が表紙に透けない） */}
                <span style={{ display: 'block', borderRadius: 'var(--radius-cover)', background: 'var(--surface)' }}>
                <span style={{ display: 'block', opacity: n.memoCount || on || !anyMemo ? 1 : FAINT, transition: 'opacity var(--duration-fast) var(--ease-out)' }}>
                  <MiniCover book={n.book} width={COVER_W} />
                </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 線の見方（ある線だけ・説明の文は置かない＝DESIGN §0 原則 6） */}
      {(map.edges.length > 0 || map.hubs.length > 0) && (
        <p style={{ ...meta, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 'var(--space-4)', rowGap: 'var(--space-1)', marginTop: 'var(--space-3)' }}>
          {map.edges.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}><LineSample />似たメモ・同じタグ</span>}
          {map.hubs.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}><DotSample />分野</span>}
        </p>
      )}

      {/* 選んだ本と重なる本（線の中身）。押すと、その 2 つのメモで「重ねて考える」 */}
      <h4 aria-live="polite" style={{ margin: 'var(--space-6) 0 0', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks(mine.length ? `『${titleOf(selBook)}』と重なる本` : `『${titleOf(selBook)}』`, { scriptBreaks: true })}
      </h4>
      {/* 重なりがまだ無い本: 自分のいちばん新しいメモと「ほかの本と重ねて考える」（相手は重なりのシートが選ぶ） */}
      {!mine.length && (
        selNode.latest ? (
          <div style={{ marginTop: 'var(--space-2)' }}>
            <p style={note}>{withPhraseBreaks('まだ、ほかの本と重なるメモはありません。')}</p>
            <div style={{ ...quoteBox, marginTop: 'var(--space-3)' }}>
              <div><span style={source}>{selNode.memoCount > 1 ? `いちばん新しいメモ（${selNode.memoCount}\u00a0件から）` : 'この本のメモ'}</span><p style={quote}>{selNode.latest.text}</p></div>
            </div>
            <button
              type="button"
              onClick={() => { track('knowledge_map_overlap', { alone: true }); openOverlap({ id: selNode.latest.id, text: selNode.latest.text, bookId: selNode.latest.bookId }); }}
              style={{ ...btnLink, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))', marginBottom: 'calc(-1 * var(--space-2))' }}
            >
              ほかの本と重ねて考える
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 'var(--space-2)' }}>
            <p style={note}>{withPhraseBreaks('この本のメモは、まだありません。')}</p>
            {onWriteMemo && (
              <button
                type="button"
                onClick={() => { track('knowledge_map_write', {}); onWriteMemo(selBook); }}
                style={{ ...btnLink, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))', marginBottom: 'calc(-1 * var(--space-2))' }}
              >
                この本のメモを書く
              </button>
            )}
          </div>
        )
      )}
      <ul style={{ listStyle: 'none', margin: mine.length ? 'var(--space-2) 0 0' : 0, padding: 0 }}>
        {mine.map((r, i) => (
          <li key={String(r.other.id)} style={{ padding: 'var(--space-3) 0', borderTop: i ? '1px solid var(--separator)' : 'none' }}>
            <button
              type="button"
              onClick={() => pickFromList(String(r.other.id))}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 'var(--tap-min)', padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
              aria-label={`『${titleOf(r.other)}』と重なる本を見る`}
            >
              <MiniCover book={r.other} width={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(titleOf(r.other), { scriptBreaks: true })}</span>
                <span style={meta}>{[r.count ? `似たメモ ${r.count}\u00a0組` : '', r.tags.length ? `同じタグ「${r.tags[0]}」${r.tags.length > 1 ? `\u00a0ほか\u00a0${r.tags.length - 1}` : ''}` : ''].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)', paddingLeft: 'var(--space-3)', borderLeft: '2px solid var(--separator)' }}>
              <div><span style={source}>{withPhraseBreaks(`『${titleOf(selBook)}』`, { scriptBreaks: true })}</span><p style={quote}>{r.my.text}</p></div>
              <div><span style={source}>{withPhraseBreaks(`『${titleOf(r.other)}』`, { scriptBreaks: true })}</span><p style={quote}>{r.their.text}</p></div>
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
      {/* 同じ分野の本（表紙を押すとその本を選ぶ） */}
      {sameField.map((g) => (
        <div key={g.field} style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--separator)' }}>
          <p style={note}>{`同じ分野「${g.field}」`}</p>
          <div role="group" aria-label={`同じ分野「${g.field}」の本`} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-2))' }}>
            {g.books.map((b) => (
              <button
                key={String(b.id)}
                type="button"
                onClick={() => pickFromList(String(b.id))}
                aria-label={`『${titleOf(b)}』とつながる本を見る`}
                style={{ minWidth: 'var(--tap-min)', minHeight: 'var(--tap-min)', padding: 'var(--space-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius)' }}
              >
                <MiniCover book={b} width={28} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
