// 🗺 知識の地図（2026-11-26・振り返り › 記録・lib/knowledgeMap.js）。
// 2026-11-26 作り直し（オーナー「知識の地図の UI/UX のレベルを圧倒的に上げて・感動的に面白く・そして実用的に」）:
//   ・夜空の地（--kmap-*・集中モードと同じ暗く温かい地＝明暗で変えない）に、読んできた本の表紙を星座のように。
//     表紙の大きさ＝メモの多さ（数は出さない）。内側の小さな星＝分野（2 冊以上）、本どうしの線＝似たメモ・同じメモのタグ。
//   ・見えたときに 1 回だけ、本が育った順（読み始め・読み終えた日の古い順）に浮かぶ。いくつかの星はゆっくり瞬く。
//   ・はじめは「いちばん重なっている 2 冊」を光らせ、線の上を光の粒が行き来する＝開いた瞬間に、何をすればいいかが分かる
//     （2 つのメモ・「重ねて考える」・「この 2 冊に相談する」）。下の「ほかの重なり」から、ほかの 2 冊へ。
//   ・本を押すと、その本とつながる線だけが光り、ほかは沈む。下に重なる本（2 つのメモと「重ねて考える」）・同じ分野の本・「本を開く」。
//   ・「育った順に見る」で、本が 1 冊ずつ空に増えていくのを、日付と書名つきで見直せる（いつでも止められる）。
// AI は使わない（端末の中の計算・トークンを使わない・無料プランも）。%・順位は出さない。動きを減らす設定では動かさない。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, ChevronRight } from 'lucide-react';
import { MiniCover } from './BookCards';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { useAuth } from '../hooks/useAuth';
import { useAllMemoRows } from '../hooks/useAllMemoRows';
import {
  buildKnowledgeMap, ringPositions, hubPositions, edgeWidth,
  nodeCoverWidth, growthOrder, strongestEdge, linkedIds, starField, growthLabel, pairConsultQuestion,
} from '../lib/knowledgeMap';
import { openOverlap } from '../lib/overlap';
import { track } from '../lib/analytics';
import { btnLink, btnLinkQuiet, card } from '../styles/ui';

const STEP_MS = 650;    // 育った順に見る: 1 冊ずつの間
const HOLD_MS = 1600;   // 最後の 1 冊のあと、いまの地図に戻るまで
const MAX_SPARKS = 4;   // 光の粒を走らせる線の数
const STARS = starField(26, 11);
const titleOf = (b) => String(b?.title || '').trim();
const pairKey = (e) => `${e.a}|${e.b}`;
// 「・」を行の頭に出さない（記録の分野の行と同じ決まり）
const glueMiddot = (t) => String(t || '').replace(/(.)・/g, '$1⁠・');
const quote = {
  margin: 0, fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)',
  display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden',
  wordBreak: 'normal', lineBreak: 'strict', overflowWrap: 'anywhere',
};
const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 };
const note = { ...meta, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
// 引用の出どころ（どちらの本のメモか・重なりのシートのカードと同じ 13/--text-3）
const source = { display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 'var(--space-1)', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const quoteBox = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingLeft: 'var(--space-3)', borderLeft: '2px solid var(--separator)' };
const subHead = { margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const linkTight = { ...btnLink, marginLeft: 'calc(-1 * var(--space-1))' };
const edgeMeta = (count, tags) => [
  count ? `似たメモ ${count} 組` : '',
  tags.length ? `同じタグ「${tags[0]}」${tags.length > 1 ? ` ほか ${tags.length - 1}` : ''}` : '',
].filter(Boolean).join(' · ');

function useReducedMotion() {
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
    if (!mq?.addEventListener) return undefined;
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

// 凡例の線の見本（実線・点線・大きさ）
function LineSample() {
  return (
    <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1="1" y1="4" x2="19" y2="4" stroke="var(--text-3)" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
function DotSample() {
  return (
    <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1="1" y1="4" x2="14" y2="4" stroke="var(--text-3)" strokeWidth="1" strokeDasharray="2 3" strokeLinecap="round" />
      <circle cx="16" cy="4" r="3" fill="var(--text-3)" />
    </svg>
  );
}

// 2 冊の表紙を、光る線でつないで並べる（いちばん重なっている 2 冊・ほかの重なり）
function PairCovers({ a, b, size = 36 }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <MiniCover book={a} width={size} />
      <span style={{ position: 'relative', width: 'var(--space-6)', height: 2, background: 'var(--accent)', borderRadius: 'var(--radius-full)' }}>
        <span style={{ position: 'absolute', left: '50%', top: '50%', width: 'var(--space-2)', height: 'var(--space-2)', transform: 'translate(-50%, -50%)', borderRadius: 'var(--radius-full)', background: 'var(--accent)' }} />
      </span>
      <MiniCover book={b} width={size} />
    </span>
  );
}

// likely: 地図が出そうか（読書中・読了の本が 1 冊以上）。メモを読み込んでいる間だけ形を出すかどうかに使う。
// onWriteMemo(book): メモの無い本を選んだときの「この本のメモを書く」
// onOpenBook(book): 選んだ本の「本を開く」・onConsultBooks(question, bookIds): 「この 2 冊に相談する」（下書きを入れるだけ・送らない）
export default function KnowledgeMapCard({ books = [], likely = false, onWriteMemo = null, onOpenBook = null, onConsultBooks = null }) {
  const { user } = useAuth();
  const { rows, status } = useAllMemoRows({ userId: user?.id || null, books, active: !!user?.id });
  const map = useMemo(() => (status === 'ready' && rows ? buildKnowledgeMap({ rows, books }) : null), [status, rows, books]);
  // 選んでいるもの: { kind: 'pair', key } ＝2 冊の重なり／{ kind: 'book', id } ＝1 冊／null＝はじめ（いちばん強い重なり）
  const [focus, setFocus] = useState(null);
  const [replay, setReplay] = useState(null); // 育った順に見ている間の、出ている本の数
  const [shown, setShown] = useState(false);  // 地図が画面に入ったか（入ったときに 1 回だけ浮かぶ）
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const panelRef = useRef(null);
  const reduce = useReducedMotion();

  const order = useMemo(() => (map ? growthOrder(map.nodes) : []), [map]);

  // 画面に入ったら 1 回だけ浮かべる（下のほうにあるので、開いた瞬間ではなく見えたときに）
  useEffect(() => {
    if (shown || !map) return undefined;
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return undefined; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [map, shown]);

  // 育った順に見る: 1 冊ずつ増やし、最後の 1 冊のあと少し置いて、いまの地図に戻る
  useEffect(() => {
    if (replay == null) return undefined;
    const t = setTimeout(() => setReplay((r) => (r == null ? null : r < order.length ? r + 1 : null)), replay < order.length ? STEP_MS : HOLD_MS);
    return () => clearTimeout(t);
  }, [replay, order.length]);

  if (!map) {
    if (status === 'error' || !likely) return null;
    // 出来上がりと同じ形（カードの中に題の行と正方形の夜空）で待つ
    return (
      <div data-knowledge-map-loading="" role="status" aria-label="知識の地図を読み込み中" style={{ ...card, padding: 'var(--space-4)' }}>
        <SkeletonBlock width="40%" height={20} radius="var(--radius)" />
        <div style={{ width: '100%', maxWidth: 360, aspectRatio: '1 / 1', margin: 'var(--space-3) auto 0' }}>
          <SkeletonBlock width="100%" height="100%" radius="var(--radius)" />
        </div>
      </div>
    );
  }
  if (!map.nodes.length) return null;

  const bookById = new Map(map.nodes.map((n) => [String(n.book.id), n.book]));
  const nodeById = new Map(map.nodes.map((n) => [String(n.book.id), n]));
  const strong = strongestEdge(map.edges);
  const firstBook = [...map.nodes].sort((x, y) => y.weight - x.weight || y.memoCount - x.memoCount)[0];
  // いまの選び: 選んだものが地図から消えていたら、はじめの形に戻す
  const pairOf = (key) => map.edges.find((e) => pairKey(e) === key) || null;
  let mode = focus;
  if (mode?.kind === 'pair' && !pairOf(mode.key)) mode = null;
  if (mode?.kind === 'book' && !nodeById.has(mode.id)) mode = null;
  if (!mode) mode = strong ? { kind: 'pair', key: pairKey(strong) } : { kind: 'book', id: String(firstBook.book.id) };
  const pair = mode.kind === 'pair' ? pairOf(mode.key) : null;
  const selId = mode.kind === 'book' ? mode.id : null;
  const selNode = selId ? nodeById.get(selId) : null;
  const linked = selId ? linkedIds(map.edges, selId) : new Set();
  const sameFieldIds = new Set(selNode ? map.nodes.filter((n) => String(n.book.id) !== selId && n.fields.some((f) => selNode.fields.includes(f))).map((n) => String(n.book.id)) : []);

  // 育った順に見ている間に出ている本
  const replaying = replay != null;
  const visible = replaying ? new Set(order.slice(0, replay)) : null;
  const isVisible = (id) => !visible || visible.has(id);
  const lastShownId = replaying && replay > 0 ? order[Math.min(replay, order.length) - 1] : null;

  // 光らせる本・線（選びに合わせて）
  // 沈め方は 1 つの意味（いま見ているものに関係しない）だけ・明るさで沈める＝透けない・押せる本だと分かる程度に残す。
  //   メモの無い本は淡くせず、表紙の大きさ（いちばん小さい）で表す（2026-11-26 ui-critic）。
  const litNode = (id) => {
    if (replaying) return 1;
    if (pair) return id === pair.a || id === pair.b ? 1 : 0.62;
    if (id === selId || linked.has(id)) return 1;
    // つながる本がまだ無い本を選んでいるときは、星座ぜんたいを沈めすぎない（同じ分野の本は明るいまま）
    if (sameFieldIds.has(id)) return linked.size ? 0.82 : 1;
    return linked.size ? 0.62 : 0.85;
  };
  const edgeOn = (e) => !replaying && (pair ? pairKey(e) === pairKey(pair) : e.a === selId || e.b === selId);

  // 表紙の大きさに差があるときだけ大きさで分ける（どの本もメモが同じくらい＝ぜんぶ小さく見えるより、そろえて見やすく・凡例も出さない）
  const sizeVaries = new Set(map.nodes.map((n) => nodeCoverWidth(n.memoCount))).size > 1;
  const pos = ringPositions(map.nodes.length);
  const at = new Map(map.nodes.map((n, i) => [String(n.book.id), pos[i]]));
  const hubAt = hubPositions(map.hubs, at);
  const growthIndex = new Map(order.map((id, i) => [id, i]));
  const sparkEdges = reduce || replaying ? [] : map.edges.filter(edgeOn).slice(0, MAX_SPARKS);

  const choosePair = (e, from) => { setFocus({ kind: 'pair', key: pairKey(e) }); track('knowledge_map_pair', { from }); };
  const chooseBook = (id) => { setFocus({ kind: 'book', id }); track('knowledge_map_pick', {}); };
  // 一覧から選び直したら、夜空の先頭まで送る（指の下で一覧がすり替わって見えないように）
  const toTop = () => {
    const el = sectionRef.current;
    if (!el?.scrollIntoView) return;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }));
  };
  // 夜空の下の 1 行から、下の中身（2 つのメモ）へ送る
  const toPanel = () => {
    const el = panelRef.current;
    if (!el?.scrollIntoView) return;
    track('knowledge_map_to_panel', {});
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }));
  };
  const startReplay = () => {
    if (replaying) { setReplay(null); return; }
    track('knowledge_map_replay', { books: order.length });
    setReplay(reduce ? order.length : 1);
  };

  // 夜空の下の 1 行（育った順に見ている間は日付と書名・ふだんは押し方の 1 行＝はじめての人にも）
  const lastNode = lastShownId ? nodeById.get(lastShownId) : null;
  const caption = replaying
    ? (replay >= order.length && replay > 0
      ? `いまの地図 · 本 ${order.length} 冊`
      : lastNode ? `${growthLabel(lastNode.at) ? `${growthLabel(lastNode.at)} ` : ''}『${titleOf(lastNode.book)}』` : '')
    : null;

  // 選んだ本とつながる本（線の中身）
  const mine = selId ? map.edges
    .filter((e) => e.a === selId || e.b === selId)
    .map((e) => {
      const flip = e.a !== selId;
      return { e, other: bookById.get(flip ? e.a : e.b), count: e.count, tags: e.tags, my: flip ? e.best.to : e.best.from, their: flip ? e.best.from : e.best.to };
    }) : [];
  const sameField = selNode ? selNode.fields
    .map((f) => ({ field: f, books: map.nodes.filter((n) => String(n.book.id) !== selId && n.fields.includes(f)).map((n) => n.book) }))
    .filter((g) => g.books.length > 0)
    .slice(0, 2) : [];
  // ほかの重なり（いま見ている 2 冊のほか・重い順に 5 つまで）
  const otherPairs = [...map.edges].sort((x, y) => y.weight - x.weight).filter((e) => !pair || pairKey(e) !== pairKey(pair)).slice(0, 5);

  return (
    <section ref={sectionRef} data-knowledge-map="" aria-labelledby="knowledge-map-title" style={{ ...card, padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 'var(--space-3)' }}>
        <h3 id="knowledge-map-title" style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>知識の地図</h3>
        {/* 育った順に見る（本が 2 冊以上のとき） */}
        {order.length > 1 && (
          <button type="button" onClick={startReplay} aria-pressed={replaying} style={{ ...btnLinkQuiet, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginRight: 'calc(-1 * var(--space-1))' }}>
            {replaying ? <Square size="0.8em" fill="currentColor" aria-hidden="true" /> : <Play size="0.9em" fill="currentColor" aria-hidden="true" />}
            {replaying ? '止める' : '育った順に見る'}
          </button>
        )}
      </div>

      {/* 夜空（線は SVG・読み上げには出さない＝下の一覧が同じ中身・点は表紙のボタン）。何もない所を押すと、はじめの形に戻る */}
      <div
        ref={stageRef}
        className="kmap-stage"
        data-knowledge-map-stage=""
        onClick={(ev) => { if (!ev.target.closest?.('button')) setFocus(null); }}
        style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', maxHeight: 400, margin: 'var(--space-3) auto 0', borderRadius: 'var(--radius)', overflow: 'hidden' }}
      >
        <div style={{ position: 'absolute', inset: 0, margin: '0 auto', maxWidth: 400 }}>
          <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            {/* 星（飾り・いくつかだけゆっくり瞬く） */}
            {STARS.map((s, i) => (
              <circle key={`s${i}`} className={i % 5 === 0 ? 'kmap-twinkle' : undefined} cx={s.x} cy={s.y} r={s.r} fill="var(--kmap-star)" opacity={s.o} style={i % 5 === 0 ? { animationDelay: `${(i * 370) % 3600}ms` } : undefined} />
            ))}
            {shown && (
              <>
                {/* 分野の星からその本へ細い点線 */}
                {map.hubs.flatMap((h, hi) => h.bookIds.map((id, k) => {
                  const p = hubAt[hi]; const q = at.get(id);
                  const on = !replaying && id === selId;
                  const show = isVisible(id) && (!visible || h.bookIds.filter((x) => visible.has(x)).length >= 2);
                  return (
                    <g key={`h-${h.name}|${id}`} style={{ opacity: show ? 1 : 0, transition: 'opacity var(--duration-base) var(--ease-out)' }}>
                    <line
                      className="kmap-line"
                      x1={p.x * 100} y1={p.y * 100} x2={q.x * 100} y2={q.y * 100}
                      stroke={on ? 'var(--kmap-line-on)' : 'var(--kmap-line)'}
                      strokeWidth={on ? 1.5 : 1}
                      strokeDasharray="2 3"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      style={{ transition: 'stroke var(--duration-fast) var(--ease-out)', animationDelay: `${(order.length + Math.min(hi * 2 + k, 10)) * 45}ms` }}
                    />
                    </g>
                  );
                }))}
                {map.hubs.map((h, hi) => {
                  const p = hubAt[hi];
                  const on = !replaying && !!selId && h.bookIds.includes(selId);
                  const show = !visible || h.bookIds.filter((x) => visible.has(x)).length >= 2;
                  return (
                    <g key={`hd-${h.name}`} style={{ opacity: show ? 1 : 0, transition: 'opacity var(--duration-base) var(--ease-out)' }}>
                      <circle cx={p.x * 100} cy={p.y * 100} r={on ? 3 : 2} fill="var(--kmap-glow)" opacity={on ? 0.45 : 0.14} />
                      <circle cx={p.x * 100} cy={p.y * 100} r={on ? 1.4 : 1} fill={on ? 'var(--kmap-line-on)' : 'var(--kmap-hub)'} />
                    </g>
                  );
                })}
                {/* 本どうしの線（似たメモ・同じタグ）。選んだつながりは金茶で太く・ほかは沈む */}
                {map.edges.map((e, i) => {
                  const p = at.get(e.a); const q = at.get(e.b);
                  const on = edgeOn(e);
                  const show = isVisible(e.a) && isVisible(e.b);
                  const dim = !replaying && !on && (pair || selId);
                  return (
                    <g key={pairKey(e)} style={{ opacity: show ? (dim ? 0.45 : 1) : 0, transition: 'opacity var(--duration-base) var(--ease-out)' }}>
                    <line
                      className="kmap-line"
                      x1={p.x * 100} y1={p.y * 100} x2={q.x * 100} y2={q.y * 100}
                      stroke={on ? 'var(--kmap-line-on)' : 'var(--kmap-line)'}
                      strokeWidth={edgeWidth(e.count, e.tags.length) + (on ? 0.5 : 0)}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      style={{ transition: 'stroke var(--duration-fast) var(--ease-out)', animationDelay: `${(order.length + 4 + Math.min(i, 12)) * 45}ms` }}
                    />
                    </g>
                  );
                })}
                {/* 光の粒: 選んだつながりの上を、本から本へゆっくり行き来する */}
                {sparkEdges.map((e, i) => {
                  const p = at.get(e.a); const q = at.get(e.b);
                  const fromSel = selId && e.b === selId;
                  const [x1, y1, x2, y2] = fromSel ? [q.x, q.y, p.x, p.y] : [p.x, p.y, q.x, q.y];
                  const path = `M ${x1 * 100} ${y1 * 100} L ${x2 * 100} ${y2 * 100}`;
                  return (
                    <g key={`sp-${pairKey(e)}`}>
                      <circle r="2.2" fill="var(--kmap-glow)" opacity="0.6">
                        <animateMotion dur="2.6s" begin={`${i * 0.45}s`} repeatCount="indefinite" path={path} keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
                      </circle>
                      <circle r="0.9" fill="var(--kmap-spark)">
                        <animateMotion dur="2.6s" begin={`${i * 0.45}s`} repeatCount="indefinite" path={path} keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
                      </circle>
                    </g>
                  );
                })}
              </>
            )}
          </svg>
          {/* 選んだ本の分野の名前（ほかの分野は星だけ＝名前どうしが重ならない） */}
          {shown && !replaying && selId && map.hubs.map((h, hi) => {
            if (!h.bookIds.includes(selId)) return null;
            const p = hubAt[hi];
            return (
              <span
                key={`hl-${h.name}`}
                aria-hidden="true"
                style={{
                  position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: p.y > 0.5 ? 'translate(-50%, calc(-100% - 8px))' : 'translate(-50%, 8px)',
                  maxWidth: '28%', textAlign: 'center', fontSize: 'var(--text-caption)', lineHeight: 1.3, fontWeight: 600,
                  color: 'var(--focus-ink)', textShadow: '0 0 3px var(--focus-bg), 0 0 3px var(--focus-bg), 0 0 6px var(--focus-bg)',
                  wordBreak: 'keep-all', overflowWrap: 'anywhere', pointerEvents: 'none',
                }}
              >
                {withPhraseBreaks(glueMiddot(h.name), { scriptBreaks: true })}
              </span>
            );
          })}
          {/* 本（表紙）。メモの多い本ほど少し大きい・選んだ本と光った本は淡い光の輪 */}
          {shown && map.nodes.map((n) => {
            const id = String(n.book.id);
            const p = at.get(id);
            const on = id === selId || (pair && (id === pair.a || id === pair.b));
            const show = isVisible(id);
            const justIn = replaying && id === lastShownId;
            const w = sizeVaries ? nodeCoverWidth(n.memoCount) : 36;
            return (
              <button
                key={id}
                type="button"
                className="kmap-node"
                onClick={(ev) => { ev.stopPropagation(); chooseBook(id); }}
                aria-pressed={id === selId}
                aria-label={`『${titleOf(n.book)}』${n.memoCount ? `・メモ ${n.memoCount} 件` : '・メモなし'}・つながる本を見る`}
                tabIndex={show ? 0 : -1}
                style={{
                  position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%, -50%)',
                  minWidth: 'var(--tap-min)', minHeight: 'var(--tap-min)', padding: 'var(--space-1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius)',
                  animationDelay: `${(growthIndex.get(id) || 0) * 45}ms`,
                  pointerEvents: show ? 'auto' : 'none',
                }}
              >
                {/* 濃さ・出し入れは内側に（外側は浮かぶ動き＝animation の opacity が inline を上書きするため） */}
                <span style={{
                  display: 'block', borderRadius: 'var(--radius-cover)', background: 'var(--focus-bg)',
                  opacity: show ? 1 : 0, transform: show ? 'scale(1)' : 'scale(0.6)',
                  transition: 'opacity var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-spring), box-shadow var(--duration-fast) var(--ease-out)',
                  boxShadow: (on && !replaying) || justIn ? '0 0 0 2px var(--focus-bg), 0 0 0 3px var(--kmap-line-on), 0 0 18px 4px var(--kmap-glow)' : '0 0 10px 0 var(--kmap-shadow)',
                }}>
                  {/* 沈めるのは明るさで（透かさない＝線や星が表紙の上に見えない） */}
                  <span style={{ display: 'block', filter: litNode(id) < 1 ? `brightness(${litNode(id)}) saturate(0.75)` : 'none', transition: 'filter var(--duration-base) var(--ease-out)' }}>
                    <MiniCover book={n.book} width={w} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 夜空の下の 1 行: いま見ているもの（育った順に見ている間は日付と書名）と、線の見方 */}
      {/* 夜空のすぐ下: 育った順に見ている間は日付と書名、ふだんは「いま光っているもの」へ送る 1 行（説明の文は置かない・
          押すと下の 2 つのメモまで送る＝役に立つ中身が最初の画面から分かる・2026-11-26 ui-critic） */}
      <div aria-live="polite" style={{ marginTop: 'var(--space-2)', minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center' }}>
        {replaying ? (
          <p style={{ ...note, color: 'var(--text)', fontWeight: 600 }}>{withPhraseBreaks(caption, { scriptBreaks: true })}</p>
        ) : (
          <button
            type="button"
            // メモの無い本は、下へ送らずにその本でメモを書くシートを開く（見るメモが無いのに「見る」と誘わない・2026-11-26 ui-critic）
            onClick={!pair && selNode && !selNode.memoCount && onWriteMemo ? () => { track('knowledge_map_write', { from: 'caption' }); onWriteMemo(selNode.book); } : toPanel}
            style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', textAlign: 'left', marginLeft: 'calc(-1 * var(--space-1))', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
          >
            <span>{withPhraseBreaks(pair
              ? `『${titleOf(bookById.get(pair.a))}』と『${titleOf(bookById.get(pair.b))}』が重なっています`
              : mine.length ? `『${titleOf(selNode?.book)}』と重なる本を見る`
                : selNode?.memoCount || !onWriteMemo ? `『${titleOf(selNode?.book)}』のメモを見る` : `『${titleOf(selNode?.book)}』のメモを書く`, { scriptBreaks: true })}</span>
            <ChevronRight size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
          </button>
        )}
      </div>
      {(map.edges.length > 0 || map.hubs.length > 0) && (
        <p style={{ ...meta, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 'var(--space-4)', rowGap: 'var(--space-1)', marginTop: 'var(--space-1)', color: 'var(--text-3)' }}>
          {map.edges.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}><LineSample />似たメモ・同じタグ</span>}
          {map.hubs.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}><DotSample />分野</span>}
          {sizeVaries && <span>大きい表紙＝メモが多い本</span>}
        </p>
      )}

      {/* ── 2 冊の重なり（はじめは、いちばん重なっている 2 冊） ── */}
      {pair && (() => {
        const A = bookById.get(pair.a); const B = bookById.get(pair.b);
        const isTop = strong && pairKey(strong) === pairKey(pair);
        return (
          <div ref={panelRef} style={{ marginTop: 'var(--space-6)', scrollMarginTop: 'var(--space-4)' }}>
            <h4 style={{ ...subHead, color: 'var(--text-2)', fontWeight: 600 }}>{isTop ? 'いちばん重なっている 2 冊' : '重なっている 2 冊'}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <PairCovers a={A} b={B} />
              <span style={{ ...meta, flex: 1, minWidth: 0 }}>{edgeMeta(pair.count, pair.tags)}</span>
            </div>
            <div style={{ ...quoteBox, marginTop: 'var(--space-3)' }}>
              <div><span style={source}>{withPhraseBreaks(`『${titleOf(A)}』`, { scriptBreaks: true })}</span><p style={quote}>{pair.best.from.text}</p></div>
              <div><span style={source}>{withPhraseBreaks(`『${titleOf(B)}』`, { scriptBreaks: true })}</span><p style={quote}>{pair.best.to.text}</p></div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-4)', marginTop: 'var(--space-1)', marginBottom: 'calc(-1 * var(--space-2))' }}>
              <button type="button" style={linkTight} onClick={() => { track('knowledge_map_overlap', { pair: true }); openOverlap({ id: pair.best.from.id, text: pair.best.from.text, bookId: pair.best.from.bookId }, pair.best.to.id); }}>
                重ねて考える
              </button>
              {onConsultBooks && (
                <button type="button" style={{ ...linkTight, color: 'var(--text-2)' }} onClick={() => { track('knowledge_map_consult', {}); onConsultBooks(pairConsultQuestion(A, B), [pair.a, pair.b]); }}>
                  この 2 冊に相談する
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── 1 冊（本を押したとき） ── */}
      {selNode && (
        <div ref={panelRef} style={{ marginTop: 'var(--space-6)', scrollMarginTop: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
            <h4 style={{ ...subHead, color: 'var(--text-2)' }}>{withPhraseBreaks(mine.length ? `『${titleOf(selNode.book)}』と重なる本` : `『${titleOf(selNode.book)}』`, { scriptBreaks: true })}</h4>
            {onOpenBook && (
              <button type="button" onClick={() => onOpenBook(selNode.book)} style={{ ...btnLinkQuiet, flexShrink: 0, display: 'inline-flex', alignItems: 'center', marginRight: 'calc(-1 * var(--space-1))' }}>
                本を開く<ChevronRight size="1em" aria-hidden="true" />
              </button>
            )}
          </div>
          {!mine.length && (
            selNode.latest ? (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <p style={note}>{withPhraseBreaks('まだ、ほかの本と重なるメモはありません。')}</p>
                <div style={{ ...quoteBox, marginTop: 'var(--space-3)' }}>
                  <div><span style={source}>{selNode.memoCount > 1 ? `いちばん新しいメモ（${selNode.memoCount} 件から）` : 'この本のメモ'}</span><p style={quote}>{selNode.latest.text}</p></div>
                </div>
                <button type="button" onClick={() => { track('knowledge_map_overlap', { alone: true }); openOverlap({ id: selNode.latest.id, text: selNode.latest.text, bookId: selNode.latest.bookId }); }} style={{ ...linkTight, marginTop: 'var(--space-1)', marginBottom: 'calc(-1 * var(--space-2))' }}>
                  ほかの本と重ねて考える
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 'var(--space-2)' }}>
                <p style={note}>{withPhraseBreaks('この本のメモは、まだありません。')}</p>
                {/* 書く入口は夜空のすぐ下の 1 行（同じ操作を 2 つ並べない・2026-11-26 ui-critic） */}
              </div>
            )
          )}
          <ul style={{ listStyle: 'none', margin: mine.length ? 'var(--space-2) 0 0' : 0, padding: 0 }}>
            {mine.map((r, i) => (
              <li key={String(r.other.id)} style={{ padding: 'var(--space-3) 0', borderTop: i ? '1px solid var(--separator)' : 'none' }}>
                <button
                  type="button"
                  onClick={() => { chooseBook(String(r.other.id)); toTop(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 'var(--tap-min)', padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
                  aria-label={`『${titleOf(r.other)}』と重なる本を見る`}
                >
                  <MiniCover book={r.other} width={28} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(titleOf(r.other), { scriptBreaks: true })}</span>
                    <span style={meta}>{edgeMeta(r.count, r.tags)}</span>
                  </span>
                </button>
                <div style={{ ...quoteBox, gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  <div><span style={source}>{withPhraseBreaks(`『${titleOf(selNode.book)}』`, { scriptBreaks: true })}</span><p style={quote}>{r.my.text}</p></div>
                  <div><span style={source}>{withPhraseBreaks(`『${titleOf(r.other)}』`, { scriptBreaks: true })}</span><p style={quote}>{r.their.text}</p></div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-4)', marginTop: 'var(--space-1)', marginBottom: 'calc(-1 * var(--space-2))' }}>
                  <button type="button" onClick={() => { track('knowledge_map_overlap', {}); openOverlap({ id: r.my.id, text: r.my.text, bookId: r.my.bookId }, r.their.id); }} style={linkTight}>
                    重ねて考える
                  </button>
                  {onConsultBooks && (
                    <button type="button" style={{ ...linkTight, color: 'var(--text-2)' }} onClick={() => { track('knowledge_map_consult', {}); onConsultBooks(pairConsultQuestion(selNode.book, r.other), [selId, String(r.other.id)]); }}>
                      この 2 冊に相談する
                    </button>
                  )}
                </div>
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
                    onClick={() => { chooseBook(String(b.id)); toTop(); }}
                    aria-label={`『${titleOf(b)}』とつながる本を見る`}
                    style={{ minWidth: 'var(--tap-min)', minHeight: 'var(--tap-min)', padding: 'var(--space-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius)' }}
                  >
                    <MiniCover book={b} width={28} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ほかの重なり（2 冊の組・押すとその 2 冊を光らせる） ── */}
      {otherPairs.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--separator)' }}>
          <h4 style={{ ...subHead, color: 'var(--text-2)' }}>{pair ? 'ほかの重なり' : '重なっている 2 冊'}</h4>
          <ul style={{ listStyle: 'none', margin: 'var(--space-1) 0 0', padding: 0 }}>
            {otherPairs.map((e) => {
              const A = bookById.get(e.a); const B = bookById.get(e.b);
              return (
                <li key={pairKey(e)}>
                  <button
                    type="button"
                    onClick={() => { choosePair(e, 'list'); toTop(); }}
                    aria-label={`『${titleOf(A)}』と『${titleOf(B)}』の重なりを見る`}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 'var(--tap-min)', padding: 'var(--space-2) 0', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
                  >
                    <PairCovers a={A} b={B} size={24} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {/* 2 つの書名はそれぞれ 1 つの塊（割れるときは「×」の前後で・2026-11-26 ui-critic） */}
                      <span style={{ display: 'block', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                        <span style={{ display: 'inline-block', maxWidth: '100%' }}>{withPhraseBreaks(titleOf(A), { scriptBreaks: true })}</span>
                        {'\u00a0× '}
                        <span style={{ display: 'inline-block', maxWidth: '100%' }}>{withPhraseBreaks(titleOf(B), { scriptBreaks: true })}</span>
                      </span>
                      <span style={meta}>{edgeMeta(e.count, e.tags)}</span>
                    </span>
                    <ChevronRight size="1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
