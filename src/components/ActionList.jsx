// 🎯 行動 — 本を横断した行動リスト（振り返りタブの最初のサブタブ・SPEC §4）。
//
// 役割: 相談や読書で決めた行動を、やり切るまで見届ける場所。最重要アクション＝完了にする。
//   - やることを 期限を過ぎた / 今日 / 明日 / 今週（月〜日の暦の週） / 来週以降 / 期限なし に分けて上から並べる
//   - 完了した行動は一覧の最後の「完了した行動（N）」1 行から開く（切り替えを 2 段重ねにしない・DESIGN §5）
//   - 期限切れは控えめな警告色（責めない）。多いときだけ「期限を見直す」をそっと出す
//   - 達成率などの数字の演出はしない（反ゲーミフィケーション）。今週の完了数を 1 行だけ
//   - 行動 0 件は「相談の答えや、メモから行動を作れます」＋相談へのボタン
// 編集は「…」→ 編集（App の編集シート）、本の詳細へは「…」→ 本を開く（横の MoreHorizontal・DESIGN §5）。
// 行を長押しでも同じメニュー（完了・編集・本を開く・削除）、左へスワイプで削除（確認なし・トーストの「元に戻す」）。
// 完了にすると（2026-09-29）: その行が ✓ と取り消し線で 0.6 秒その場に残る → 同じ場所で「やってみて、どうでしたか？」
// の小さな欄に変わる（一覧の上に差し込まない＝下の行が跳ねない）→ × か「残す」で畳んで消える。
// 取り消しは下のトーストの「元に戻す」（スクロールしていても見える）。
// 見た目は DESIGN.md のトークンのみ。

import { Fragment, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LIMITS } from '../lib/limits';
import { input as uiInput, btnLink, btnGhostOff, groupTitle as uiGroupTitle } from '../styles/ui';
import { useAllActions } from '../hooks/useAllActions';
import { stripInlineMd } from '../lib/text';
import { completedActionMessage } from '../lib/actionMessages';
import { track, EVENTS } from '../lib/analytics';
import EmptyState from './EmptyState';
import { withPhraseBreaks } from './TightBubble';
import ContextMenu from './ContextMenu';
import SwipeableCard from './SwipeableCard';
import { useToast } from './Toast';
import { useLongPress } from '../hooks/useLongPress';
import { MoreHorizontal, BookOpen, Trash2, Pencil, CheckCircle2, Circle, ListTodo, Plus, MessageCircle, ChevronDown, ChevronRight, X } from 'lucide-react';

// 余白は辺ごとに書く（padding の一括指定と paddingBottom を混ぜると、描き直しで下の余白が戻らないことがある・2026-09-30）。
const wrap = { paddingTop: 'var(--space-3)', paddingLeft: 'var(--space-4)', paddingRight: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' };
const groupTitle = { ...uiGroupTitle, margin: '0 0 var(--space-2)' };
const card = { position: 'relative', background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4) var(--space-12) var(--space-4) var(--space-4)', display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' };
const rowBtn = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 };
// 押せない行の副ボタン（DESIGN §5「押せないボタン」＝ ui.js の btnGhostOff の色・枠を行サイズで使う）。
const rowBtnOff = { ...rowBtn, color: btnGhostOff.color, border: btnGhostOff.border, opacity: btnGhostOff.opacity, cursor: btnGhostOff.cursor };

// 期限('YYYY-MM-DD' の日付のみ文字列)をローカル0時で解釈する。素の new Date('YYYY-MM-DD')
// は UTC0時扱いになり JST(+9) で1日ずれ、「期限切れ/今週期限」判定が日付境界でずれる。
function parseDeadline(s) {
  if (!s) return new Date(NaN);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
}

// 期限までの日数（今日=0・過ぎたら負）。期限なし・不正は null。
function daysUntil(deadline) {
  if (!deadline) return null;
  const d = parseDeadline(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function fmtShort(deadline) {
  const d = parseDeadline(deadline);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const GROUPS = [
  { key: 'overdue', label: '期限を過ぎた行動' },
  { key: 'today', label: '今日' },
  { key: 'tomorrow', label: '明日' },
  { key: 'week', label: '今週' },
  { key: 'later', label: '来週以降' },
  { key: 'none', label: '期限なし' },
];

// 今日から今週の日曜までの日数（月曜はじまり＝useAllActions の「今週の予定」と同じ暦の週）。
function daysLeftInWeek() {
  const dow = new Date().getDay() || 7; // 日曜=7
  return 7 - dow;
}

function groupOf(a) {
  const n = daysUntil(a.deadline);
  if (n == null) return 'none';
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  // 明日は週をまたいでも（日曜の翌日＝月曜でも）「明日」に出す。日曜に「明日まで」の行動が
  // 来週以降に沈まないように。
  if (n === 1) return 'tomorrow';
  if (n <= daysLeftInWeek()) return 'week';
  return 'later';
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const byDeadline = (a, b) => {
  const ad = a.deadline || '9999-99-99';
  const bd = b.deadline || '9999-99-99';
  if (ad !== bd) return ad.localeCompare(bd);
  const pr = (PRIORITY_RANK[a.priority || 'medium'] ?? 1) - (PRIORITY_RANK[b.priority || 'medium'] ?? 1);
  if (pr !== 0) return pr;
  return (a.created_at || '').localeCompare(b.created_at || '');
};


// 完了した行を ✓ と取り消し線のまま、その場に残す時間。
// 押してから次の形（ふりかえりの欄・畳む）への動きが 0.5 秒以内に終わる長さにする
// （押した直後の動きは「ずれ」に数えない・0.6 秒待ってから動くと下の行が勝手に跳ねて見えた・2026-09-29）。
const CHECK_HOLD_MS = 250;
// 知らせ（下のバー）を出しておく時間。
const TOAST_MS = 6000;

const reducedMotion = () => {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; }
};
// 高さを動かす時間（--duration-fast）。動きを減らす設定では 0。
function fastMs() {
  if (typeof window === 'undefined' || reducedMotion()) return 0;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--duration-fast').trim();
    const n = parseFloat(v);
    if (Number.isFinite(n)) return /ms$/.test(v) ? n : n * 1000;
  } catch { /* ignore */ }
  return 200;
}
const HEIGHT_EASE = 'var(--duration-fast) var(--ease-out)';

const rowKeyOf = (a) => `${a.bookId}:${a.actionIdx}:${a.id || ''}`;
const sameAction = (x, y) => x.bookId === y.bookId && (x.id && y.id ? x.id === y.id : x.actionIdx === y.actionIdx);

// 一覧の 1 行（li）。中身が変わったら高さをなめらかに合わせ、collapsed で高さ 0 まで畳んでから onCollapsed。
// 並びの間（gap = --space-3）も負の余白で打ち消すので、消えた瞬間に下の行が跳ねない。
// entering: 畳んで消えた行を「元に戻す」で戻すとき、高さ 0 から広げて出す（畳んだ動きの逆・2026-09-29）。
function MorphItem({ phaseKey, collapsed, first, entering = false, onCollapsed, children }) {
  const ref = useRef(null);
  const lastH = useRef(null);
  const enterRef = useRef(entering);
  const wasCollapsed = useRef(false);
  const onCollapsedRef = useRef(onCollapsed);
  onCollapsedRef.current = onCollapsed;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const dur = fastMs();
    const clear = () => {
      el.style.height = '';
      el.style.overflow = '';
      el.style.transition = '';
      el.style.opacity = '';
      el.style.marginTop = '';
      el.style.marginBottom = '';
    };
    if (collapsed) {
      wasCollapsed.current = true;
      el.style.height = `${el.offsetHeight}px`;
      el.style.overflow = 'hidden';
      // eslint-disable-next-line no-unused-expressions
      el.offsetHeight;
      el.style.transition = `height ${HEIGHT_EASE}, opacity ${HEIGHT_EASE}, margin ${HEIGHT_EASE}`;
      el.style.height = '0px';
      el.style.opacity = '0';
      if (first) el.style.marginBottom = 'calc(-1 * var(--space-3))';
      else el.style.marginTop = 'calc(-1 * var(--space-3))';
      const t = setTimeout(() => onCollapsedRef.current?.(), dur + 20);
      return () => clearTimeout(t);
    }
    // 畳んでいる途中（または畳み終えて出し直した行）を「元に戻す」: いまの高さ（出し直しは 0）から本来の高さへ広げる。
    // 目印（enterRef / wasCollapsed）は広げ終わってから下ろす（開発中の StrictMode は effect を 2 回走らせるので、
    // 1 回目で下ろすと 2 回目で広げる動きが消える）。
    if (wasCollapsed.current || enterRef.current) {
      const fromZero = enterRef.current;
      const cs = getComputedStyle(el);
      const from = { h: fromZero ? 0 : el.getBoundingClientRect().height, op: fromZero ? '0' : cs.opacity, mt: cs.marginTop, mb: cs.marginBottom };
      clear();
      const natural = el.offsetHeight;
      lastH.current = natural;
      const done = () => { enterRef.current = false; wasCollapsed.current = false; };
      if (dur === 0) { done(); return undefined; }
      el.style.height = `${from.h}px`;
      el.style.overflow = 'hidden';
      el.style.opacity = from.op;
      if (fromZero) {
        if (first) el.style.marginBottom = 'calc(-1 * var(--space-3))';
        else el.style.marginTop = 'calc(-1 * var(--space-3))';
      } else {
        el.style.marginTop = from.mt;
        el.style.marginBottom = from.mb;
      }
      // eslint-disable-next-line no-unused-expressions
      el.offsetHeight;
      el.style.transition = `height ${HEIGHT_EASE}, opacity ${HEIGHT_EASE}, margin ${HEIGHT_EASE}`;
      el.style.height = `${natural}px`;
      el.style.opacity = '1';
      el.style.marginTop = '';
      el.style.marginBottom = '';
      const t = setTimeout(() => { done(); clear(); lastH.current = el.offsetHeight; }, dur + 20);
      return () => { clearTimeout(t); clear(); };
    }
    const prevH = lastH.current;
    const newH = el.offsetHeight;
    lastH.current = newH;
    if (prevH == null || Math.abs(prevH - newH) < 2 || dur === 0) return undefined;
    el.style.height = `${prevH}px`;
    el.style.overflow = 'hidden';
    // eslint-disable-next-line no-unused-expressions
    el.offsetHeight;
    el.style.transition = `height ${HEIGHT_EASE}`;
    el.style.height = `${newH}px`;
    const t = setTimeout(() => { clear(); lastH.current = el.offsetHeight; }, dur + 20);
    return () => { clearTimeout(t); clear(); };
  }, [phaseKey, collapsed, first]);
  return <li ref={ref} style={{ listStyle: 'none' }}>{children}</li>;
}

// 期限ごとのまとまり（見出し＋行）。まとまりの行がすべて畳まれるとき（collapsing）は、見出しごと
// 行と同じ速さで高さ 0 まで畳む（行だけ畳んで最後に見出しが消えると、下が約 50px 跳ねていた・2026-09-29）。
// 上の間（一覧の gap = --space-6）も負の余白で打ち消すので、消えた瞬間にも下が動かない。
// entering: 「元に戻す」で空のまとまりに行が戻るときは、高さ 0 から広げて出す。
// 高さは grid-template-rows（0fr ⇄ 1fr）で動かす＝中の行の高さが同時に変わっても、本来の高さへ合う。
function GroupSection({ collapsing = false, entering = false, children, ...rest }) {
  const [opened, setOpened] = useState(!entering);
  const [animating, setAnimating] = useState(entering);
  useLayoutEffect(() => {
    if (opened) return undefined;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setOpened(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [opened]);
  const shown = opened && !collapsing;
  const prevShown = useRef(shown);
  useLayoutEffect(() => {
    if (prevShown.current === shown) return undefined;
    prevShown.current = shown;
    const dur = fastMs();
    if (dur === 0) { setAnimating(false); return undefined; }
    setAnimating(true);
    const t = setTimeout(() => setAnimating(false), dur + 40);
    return () => clearTimeout(t);
  }, [shown]);
  const dur = fastMs();
  return (
    <section
      {...rest}
      style={{
        display: 'grid',
        gridTemplateRows: shown ? '1fr' : '0fr',
        opacity: shown ? 1 : 0,
        marginTop: shown ? 0 : 'calc(-1 * var(--space-6))',
        transition: dur ? `grid-template-rows ${HEIGHT_EASE}, opacity ${HEIGHT_EASE}, margin ${HEIGHT_EASE}` : undefined,
      }}
    >
      {/* 畳む・広げる間と畳んだあとだけ中身を切る（ふだんは見出しの負の余白・行のスワイプを切らない）。 */}
      <div style={{ minHeight: 0, ...(animating || !shown ? { overflow: 'hidden' } : null) }}>{children}</div>
    </section>
  );
}

const nowrap = { whiteSpace: 'nowrap' };

// 行動 1 行の中身（完了チェック・本文・メタ・「…」）。長押しでメニュー。
function ActionRow({ a, completing, swipeable, onCheck, onOpenMenu, onSwipeDelete, highlight = false }) {
  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onOpenMenu?.({ x: clientX, y: clientY, action: a }),
  });
  const shownDone = a.done || completing;
  // 行動の文は文節の切れ目でだけ折り返す（keep-all と一緒に・2026-09-30）。文が変わったときだけ区切り直す。
  const phrasedText = useMemo(() => withPhraseBreaks(stripInlineMd(a.text)), [a.text]);
  const n = daysUntil(a.deadline);
  const overdue = !shownDone && n != null && n < 0;
  // メタ行は [本・期限・優先・繰り返し・ページ]。警告色は期限の部分だけ（責めない）。
  // 書名はメタ行の先頭に 1 行で（長い書名は … で切る・文字を大きくしても 2 行に折れない・2026-10-01 ui-critic）。
  // 残り（期限・優先・繰り返し・ページ）はその右に（幅の 7 割まで・足りなければ項目の切れ目で折り返す）。
  const meta = [];
  if (a.deadline && !a.done) {
    // 「今日」「明日」のグループでは見出しが期限を言っているので繰り返さない。
    // それより先は曜日も付ける（「9/29」だけだと並びが分かりにくい）。
    const d = parseDeadline(a.deadline);
    const dow = Number.isNaN(d.getTime()) ? '' : `（${'日月火水木金土'[d.getDay()]}）`;
    const isOver = n != null && n < 0;
    // 期限を過ぎた行動は「期限を過ぎた行動（N）」の見出しの下にだけ並ぶので「（過ぎています）」は繰り返さない。
    const label = isOver ? `期限 ${fmtShort(a.deadline)}`
      : n === 0 || n === 1 ? null
      : `期限 ${fmtShort(a.deadline)}${dow}`;
    // 期限切れも本と同じ 1 行に（「本・期限 9/26」・警告色は期限の部分だけ・2026-09-29）。
    //   期限はまとまりで折り返さない（nowrap）。書名は … で 1 行に切る（下のメタ行）。
    if (label) meta.push(<span key="dl" style={{ whiteSpace: 'nowrap', ...(isOver ? { color: overdue ? 'var(--warning)' : 'var(--text-3)' } : null) }}>{label}</span>);
  }
  // 完了した行動は「いつやったか」を出す（優先は、もうやり終えたので出さない・2026-10-04）。
  if (a.done && a.completedAt && fmtShort(a.completedAt)) meta.push(`完了 ${fmtShort(a.completedAt)}`);
  if (a.priority === 'high' && !a.done) meta.push('優先');
  if (a.recurrence) meta.push(a.recurrence === 'weekly' ? '毎週' : '毎月');
  if (a.sourcePage) meta.push(`p.${a.sourcePage}`);

  const inner = (
    // highlight: 相談の答えから追加して「見る」で来たとき、その行を一度だけ淡く光らせる（2026-09-30）。
    <div {...longPress.bind} style={card} data-action-key={rowKeyOf(a)} className={highlight ? 'just-added-card' : undefined}>
      {/* 完了チェック（この画面の最頻操作・押せる範囲 44）。本の詳細の行動と同じ丸。 */}
      <button
        type="button"
        role="checkbox"
        aria-checked={shownDone}
        aria-label={shownDone ? `「${stripInlineMd(a.text)}」を未完了に戻す` : `「${stripInlineMd(a.text)}」を完了にする`}
        onClick={() => onCheck?.(a)}
        style={{ flexShrink: 0, width: 44, height: 44, margin: 'calc(-1 * var(--space-3)) 0 calc(-1 * var(--space-3)) calc(-1 * var(--space-3))', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        {shownDone
          ? <span key="on" className="check-pop" style={{ display: 'flex' }}><CheckCircle2 size={24} aria-hidden="true" style={{ color: 'var(--success)' }} /></span>
          : <Circle size={24} aria-hidden="true" style={{ color: 'var(--border)' }} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* overflowWrap は anywhere（break-word だと、文字を大きくしたときに行より長い文節がカードを画面の外まで押し広げた・2026-10-01）。
            折り返しは今までどおり文節の切れ目で、1 つの文節が行に収まらないときだけ中で折る。 */}
        <p className="text-pretty" style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.5, color: shownDone ? 'var(--text-3)' : 'var(--text)', textDecoration: shownDone ? 'line-through' : 'none', transition: `color ${HEIGHT_EASE}`, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {phrasedText}
        </p>
        {(a.bookTitle || meta.length > 0) && (
          // 1 行の flex（baseline）: 書名だけが縮んで … になり、「・」と期限などはいつも出す（flex: none）。
          // contain: inline-size＝書名の全幅（nowrap）が行の最小幅としてカードを押し広げない（flex の min-content 対策・2026-10-01 ui-critic）。
          //   いちばん大きな文字で期限などだけで行を超えるときは、カードの外へはみ出さず右端で切る（overflow: hidden）。
          <p style={{ margin: 'var(--space-1) 0 0', display: 'flex', alignItems: 'baseline', minWidth: 0, contain: 'inline-size', overflow: 'hidden', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5 }}>
            {a.bookTitle && (
              <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.bookTitle}</span>
            )}
            {meta.map((m, i) => (
              <Fragment key={i}>
                {(i > 0 || a.bookTitle) && <span aria-hidden="true" style={{ flex: 'none' }}>・</span>}
                <span style={{ flex: 'none', whiteSpace: 'nowrap' }}>{m}</span>
              </Fragment>
            ))}
          </p>
        )}
        {a.done && a.reflection && (
          <p style={{ margin: 'var(--space-2) 0 0', padding: 'var(--space-2) var(--space-3)', background: 'var(--fill)', borderRadius: 'var(--radius)', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {a.reflection}
          </p>
        )}
      </div>
      <button
        type="button"
        // 並んだ「…」を読み上げで見分けられるように、行動の文を入れる（長い文は 40 字で切る・2026-09-29）。
        aria-label={`「${String(a.text || '').trim().slice(0, 40)}」の操作`}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onOpenMenu?.({ x: r.right - 8, y: r.bottom + 4, action: a }); }}
        style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 0 }}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
    </div>
  );
  if (!swipeable || !onSwipeDelete) return inner;
  return <SwipeableCard onDelete={() => onSwipeDelete(a)}>{inner}</SwipeableCard>;
}

// 完了した行の、その場の「やってみて、どうでしたか？」（1 行・任意）。
function ReflectCard({ a, value, onChange, onSave, saving, onClose }) {
  const ref = useRef(null);
  // 欄が開いたら、下の知らせ（元に戻す）とタブバーに隠れない所まで寄せる（2026-09-29）。
  //   高さが広がり終わってから（その前は、下の余白がまだ足りずに最後まで寄せられない）。
  useEffect(() => {
    const t = setTimeout(() => {
      try { ref.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch { /* ignore */ }
    }, fastMs() + 40);
    return () => clearTimeout(t);
  }, []);
  return (
    <section
      ref={ref}
      aria-label="完了した行動のふりかえり"
      style={{
        background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)', position: 'relative',
        // 下の知らせ（高さ約 56）＋タブバー＋セーフエリアの上に止める。
        scrollMarginBottom: 'calc(var(--tabbar-h) + var(--space-16) + var(--space-4) + env(safe-area-inset-bottom, 0px))',
        scrollMarginTop: 'var(--space-4)',
      }}
    >
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, display: 'grid', placeItems: 'center', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}
      >
        <X size={18} aria-hidden="true" />
      </button>
      {/* ✓ と文は、行動の行の丸（押せる範囲 44・24 の印）と文の位置にそろえる（同じ場所で入れ替わって見えるように）。 */}
      {/* 文は完了した行と同じ形（17・--text-3・取り消し線）＝行がそのまま入れ替わって見える（2026-09-30）。 */}
      <p style={{ margin: 0, paddingRight: 'var(--space-8)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: 'var(--text-body)', color: 'var(--text-3)', lineHeight: 1.5 }}>
        <span aria-hidden="true" style={{ flexShrink: 0, width: 44, height: 44, margin: 'calc(-1 * var(--space-3)) 0 calc(-1 * var(--space-3)) calc(-1 * var(--space-3))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
        </span>
        {/* 「完了しました」は下の知らせ（元に戻す つき）の 1 か所だけで伝える。ここはどの行動かだけ（2026-09-29）。 */}
        <span className="text-pretty" style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'break-word', textDecoration: 'line-through' }}>{withPhraseBreaks(stripInlineMd(a.text))}</span>
      </p>
      <label htmlFor="act-reflection" style={{ display: 'block', margin: 'var(--space-3) 0 var(--space-2)', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {/* 文節の切れ目でだけ折り返す（文字を大きくすると「どうでし／たか？」と割れていた・2026-10-04）。 */}
        {withPhraseBreaks('やってみて、どうでしたか？')}
      </label>
      <input
        id="act-reflection"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); onSave(); } }}
        maxLength={LIMITS.memoText}
        placeholder="例：先に話を聞いたら、早く終わった"
        enterKeyHint="done"
        style={uiInput}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={!value.trim() || saving}
          aria-busy={saving || undefined}
          style={value.trim() && !saving ? rowBtn : rowBtnOff}
        >
          {saving ? '保存中…' : '残す'}
        </button>
      </div>
    </section>
  );
}

// showDoneNonce: 記録の「実行した行動」から来たときに変わる。完了した行動を開いた状態で見せる。
// focusAction: 相談の答えから追加した行動の「見る」で来たとき（{ bookId, text, nonce }）。その行まで送って淡く光らせる。
export default function ActionList({ books, onToggleAction, onReflect, onDeleteAction, onEditAction, onOpenBook, onGoToBooks, onAddAction, onGoConsult, showDoneNonce = null, focusAction = null }) {
  const { allActions, stats } = useAllActions(books);
  const toast = useToast();
  const [showDone, setShowDone] = useState(showDoneNonce != null);
  const doneSectionRef = useRef(null);
  useEffect(() => {
    if (showDoneNonce == null) return undefined;
    setShowDone(true);
    const t = setTimeout(() => { try { doneSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch { /* ignore */ } }, 80);
    return () => clearTimeout(t);
  }, [showDoneNonce]);

  // 🔁 完了にした直後の行（その場に残す）: [{ key, a, phase: 'check' | 'reflect' | 'collapse' }]
  //    'check'   : ✓ と取り消し線（CHECK_HOLD_MS）
  //    'reflect' : 同じ場所で「やってみて、どうでしたか？」（入力は任意・画面を奪わない）
  //    'collapse': 高さを畳んで消す
  const [completing, setCompleting] = useState([]);
  const [reflection, setReflection] = useState('');
  const [reflecting, setReflecting] = useState(false);
  const timersRef = useRef(new Map());
  const lastToastRef = useRef(null);
  // ふりかえりを残したあとの知らせ（「完了を取り消す」つき）。振り返りのタブを離れたら消す
  // （ほかの画面で「完了を取り消す」を押しても、何が戻ったか見えない・2026-09-30）。
  const reflectToastRef = useRef(null);
  useEffect(() => () => {
    if (reflectToastRef.current) toast.dismiss?.(reflectToastRef.current, { skipExpire: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach((t) => clearTimeout(t)); timers.clear(); };
  }, []);
  // shown: 畳むときに中身を差し替えない（ふりかえりの欄のまま畳む。行に戻してから畳むと一瞬跳ねた）。
  const setPhase = useCallback((key, phase) => {
    setCompleting((list) => list.map((c) => (c.key === key ? { ...c, phase, shown: phase === 'collapse' ? (c.shown || c.phase) : phase } : c)));
  }, []);
  const removeCompleting = useCallback((key) => {
    clearTimeout(timersRef.current.get(key));
    timersRef.current.delete(key);
    setCompleting((list) => list.filter((c) => c.key !== key));
  }, []);

  // 元に戻す: 行をその場で未完了の形に戻す。畳みかけ・畳み終えた行は、畳んだ動きの逆で広げて戻す
  //   （'restore' の間は行を残し、広げ終わったら外す＝そのあとは一覧の未完了の行としてそのまま続く・2026-09-29）。
  const undoComplete = (a) => {
    const key = rowKeyOf(a);
    clearTimeout(timersRef.current.get(key));
    setCompleting((list) => {
      const cur = list.find((c) => c.key === key);
      return [...list.filter((c) => c.key !== key), { key, a: cur ? cur.a : a, phase: 'restore', enter: !cur }];
    });
    timersRef.current.set(key, setTimeout(() => removeCompleting(key), fastMs() + 80));
    // 本の一覧まで描き直す保存は後回しにできる更新に（この行が戻る動きを先に描く・遅い端末で押しても反応が無く見えた）。
    startTransition(() => { onToggleAction?.(a.bookId, a.actionIdx, { silent: true, target: a }); });
  };

  const complete = (a) => {
    track(EVENTS.ACTION_COMPLETED);
    // 保存はすぐ始める（行の見た目だけ、その場にしばらく残す）。ハプティクスは applyActionToggle が一元発火。
    // 本の一覧まで描き直す更新は後回しにできる更新に（✓ と取り消し線を先に描く・遅い端末で押しても反応が無く見えた）。
    startTransition(() => { onToggleAction?.(a.bookId, a.actionIdx, { silent: true, target: a }); });
    const key = rowKeyOf(a);
    setReflection('');
    // 前に完了した行の欄は畳む（欄は同時に 1 つだけ）。
    setCompleting((list) => [
      ...list.filter((c) => c.key !== key).map((c) => (c.phase === 'collapse' ? c : { ...c, phase: 'collapse', shown: c.phase })),
      { key, a, phase: 'check' },
    ]);
    clearTimeout(timersRef.current.get(key));
    timersRef.current.set(key, setTimeout(() => setPhase(key, onReflect ? 'reflect' : 'collapse'), CHECK_HOLD_MS));
    // 取り消しは下のトーストで（スクロールしていても見える・トーストはタブの上に浮く）。
    if (lastToastRef.current) toast.dismiss?.(lastToastRef.current, { skipExpire: true });
    // 「元に戻す」つきは toast.undo にそろえる（完了なので印は ✓・DESIGN §5 トースト・2026-09-30）。
    lastToastRef.current = toast.undo({
      message: completedActionMessage(a),
      duration: TOAST_MS,
      destructive: false,
      success: true, // 印は ✓（完了の知らせ・2026-09-30）
      onUndo: () => undoComplete(a),
    });
  };

  const saveReflection = async (c) => {
    if (!c || !reflection.trim() || reflecting) return;
    setReflecting(true);
    const ok = await onReflect?.(c.a.bookId, c.a.actionIdx, { ...c.a, done: true }, reflection);
    setReflecting(false);
    if (ok) {
      setReflection('');
      setPhase(c.key, 'collapse');
      // 知らせは 1 つだけ: 下の「行動を完了しました／元に戻す」を、この文に差し替える
      // （中央の ✓ と下のバーが同時に 2 つ出ていた・2026-09-29）。
      if (lastToastRef.current) toast.dismiss?.(lastToastRef.current, { skipExpire: true });
      // 取り消すのは「完了」（ふりかえりを消すのではない）ので、何が戻るかはボタンの文言で言う（2026-09-29）。
      // 文は「残しました」だけ（ふりかえりの欄の「残す」を押した直後なので何をかは分かる・「完了を取り消す」と
      // 並んで 390 幅で 1 行に収まる・2026-09-30）。
      lastToastRef.current = toast.success('残しました', {
        duration: TOAST_MS,
        action: { label: '完了を取り消す', onClick: () => undoComplete(c.a) },
      });
      reflectToastRef.current = lastToastRef.current;
    }
  };

  const onCheck = (a) => {
    const key = rowKeyOf(a);
    if (completing.some((c) => c.key === key && c.phase !== 'restore')) { undoComplete(a); return; }
    // 未完了→完了の瞬間だけ計測（PII なし）。
    if (!a.done) { complete(a); return; }
    // 行動そのものを渡す（並びがずれても同じ行動を掴む・2026-10-04）。
    onToggleAction?.(a.bookId, a.actionIdx, { target: a });
  };

  const swipeDelete = (a) => onDeleteAction?.(a.bookId, a.actionIdx, { skipConfirm: true, target: a, undoable: true });

  const [menu, setMenu] = useState(null); // { x, y, action }

  const open = useMemo(() => allActions.filter((a) => !a.done).sort(byDeadline), [allActions]);
  // 「見る」で来た行動を探して、画面の中ほどまで送り、一度だけ光らせる（本が読み直されて行が現れるまで待つ・2026-09-30）。
  const [highlightKey, setHighlightKey] = useState(null);
  const focusedNonceRef = useRef(null);
  useEffect(() => {
    if (!focusAction?.nonce || focusedNonceRef.current === focusAction.nonce) return undefined;
    const want = String(focusAction.text || '').trim();
    const match = [...open].reverse().find((a) => a.bookId === focusAction.bookId && String(a.text || '').trim() === want);
    if (!match) return undefined;
    focusedNonceRef.current = focusAction.nonce;
    const key = rowKeyOf(match);
    setHighlightKey(key);
    const t1 = setTimeout(() => {
      try {
        const el = document.querySelector(`[data-action-key="${CSS.escape(key)}"]`);
        el?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      } catch { /* ignore */ }
    }, 120);
    const t2 = setTimeout(() => setHighlightKey((k) => (k === key ? null : k)), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [focusAction, open]);
  const done = useMemo(
    () => allActions.filter((a) => a.done).sort((a, b) => (b.completedAt || b.created_at || '').localeCompare(a.completedAt || a.created_at || '')),
    [allActions],
  );
  // 各グループの行: 未完了の行動 ＋ 完了にした直後でその場に残している行（同じ並び順で元の位置に）。
  const grouped = useMemo(() => {
    const m = new Map(GROUPS.map((g) => [g.key, []]));
    open.forEach((a) => m.get(groupOf(a)).push(a));
    completing.forEach((c) => {
      if (open.some((a) => sameAction(a, c.a))) return;
      m.get(groupOf(c.a)).push(c.a);
    });
    m.forEach((list) => list.sort(byDeadline));
    return m;
  }, [open, completing]);
  const overdueCount = open.filter((a) => groupOf(a) === 'overdue').length;
  const doneShown = useMemo(() => done.filter((a) => !completing.some((c) => sameAction(a, c.a))), [done, completing]);
  // 「今週の予定」は見出しの「今週」と同じ定義（期限が今週＝月〜日）で数える。
  const weekLine = useMemo(() => {
    const dowLeft = daysLeftInWeek();
    const dowPast = 6 - dowLeft; // 今週の月曜から今日までの日数
    const inWeek = allActions.filter((a) => { const n = daysUntil(a.deadline); return n != null && n >= -dowPast && n <= dowLeft; });
    return { total: inWeek.length, completed: inWeek.filter((a) => a.done).length };
  }, [allActions]);
  const bookOf = (a) => (books || []).find((b) => b.id === a.bookId);
  const canAdd = !!onAddAction && (books || []).length > 0;

  // 行動 0 件: 作り方の案内だけ（相談が主な入口・SPEC §4 エッジケース）。
  if (stats.total === 0 && completing.length === 0) {
    return (
      <div style={{ ...wrap, paddingBottom: 'var(--space-8)' }}>
        <EmptyState
          icon={<ListTodo size={32} strokeWidth={1.5} aria-hidden="true" />}
          title={<>{/* 句の途中で折り返さない */}<span style={{ display: 'inline-block' }}>相談の答えや、</span><span style={{ display: 'inline-block' }}>メモから行動を作れます</span></>}
          // 相談へ（主な入口）＋ 自分で書く「行動を追加」（2026-09-29・相談しなくても行動を置ける）。
          actions={[
            ...(onGoConsult ? [{ label: '相談する', icon: <MessageCircle size={18} aria-hidden="true" />, onClick: onGoConsult, variant: 'secondary' }] : []),
            ...(canAdd ? [{ label: '行動を追加', icon: <Plus size={18} aria-hidden="true" />, onClick: onAddAction, variant: onGoConsult ? 'ghost' : 'secondary' }] : []),
            ...(!onGoConsult && !canAdd && onGoToBooks ? [{ label: '本を追加する', icon: <BookOpen size={18} aria-hidden="true" />, onClick: onGoToBooks, variant: 'secondary' }] : []),
          ]}
        />
      </div>
    );
  }

  const renderItem = (a, i) => {
    const key = rowKeyOf(a);
    const c = completing.find((x) => x.key === key);
    const phase = c?.phase || 'idle';
    const restoring = phase === 'restore';
    // 畳んでいる間は、畳む前の中身のまま（ふりかえりの欄なら欄のまま）。
    const showReflect = phase === 'reflect' || (phase === 'collapse' && c?.shown === 'reflect');
    return (
      <MorphItem
        key={key}
        phaseKey={showReflect ? 'reflect' : 'row'}
        collapsed={phase === 'collapse'}
        entering={!!c?.enter}
        first={i === 0}
        onCollapsed={() => removeCompleting(key)}
      >
        {showReflect ? (
          <ReflectCard
            a={c.a}
            value={reflection}
            onChange={setReflection}
            saving={reflecting}
            onSave={() => saveReflection(c)}
            onClose={() => setPhase(key, 'collapse')}
          />
        ) : (
          <ActionRow
            a={c ? c.a : a}
            completing={!!c && !restoring}
            swipeable={!c || restoring}
            onCheck={onCheck}
            onOpenMenu={setMenu}
            onSwipeDelete={swipeDelete}
            highlight={!c && highlightKey === rowKeyOf(a)}
          />
        )}
      </MorphItem>
    );
  };

  const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

  return (
    // 一覧の下の余白はいつも 64（最後の行のチェックが下の知らせに隠れない。知らせが消えるたびに余白を縮めると
    // 中身が下がって見えた・2026-09-30）。
    <div style={{ ...wrap, paddingBottom: 'var(--space-16)' }}>
      {/* 上: 今週の完了数 1 行（数字の演出はしない）＋ 追加。完了一覧は最後の 1 行から。 */}
      {/* 文字を大きくして 1 行の文が「追加」の横に収まらないときは、「追加」を次の行へ（flex-wrap・文の幅の下限 12em）。
          文は短く 2 つのまとまりに（「今週の期限 3 件」「完了 0 件」・語の途中で割らない・2026-10-01 ui-critic）。 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <p style={{ margin: 0, flex: '1 1 12em', minWidth: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5 }}>
          {weekLine.total > 0
            ? <><span style={nowrap}>今週の期限 {weekLine.total} 件</span>・<span style={nowrap}>完了 {weekLine.completed} 件</span></>
            : <span style={nowrap}>やること {open.length} 件</span>}
        </p>
        {canAdd && (
          <button type="button" onClick={onAddAction} style={rowBtn}>
            <Plus size="1em" aria-hidden="true" />追加
          </button>
        )}
      </div>

      {/* ここに来るのは完了した行動があるときだけ（0 件は上の早期 return）。 */}
      {open.length === 0 && completing.length === 0 && done.length > 0 && (
        <EmptyState
          icon={<CheckCircle2 size={32} strokeWidth={1.5} aria-hidden="true" />}
          title="やることはすべて完了しています"
          actions={onGoConsult ? [{ label: '相談する', onClick: onGoConsult, variant: 'secondary' }] : []}
        />
      )}

      {GROUPS.map((g) => {
        const items = grouped.get(g.key);
        if (!items.length) return null;
        const phaseOf = (a) => completing.find((c) => c.key === rowKeyOf(a));
        const collapsing = items.every((a) => phaseOf(a)?.phase === 'collapse');
        const entering = items.every((a) => { const c = phaseOf(a); return c?.phase === 'restore' && c.enter; });
        return (
          <GroupSection key={g.key} collapsing={collapsing} entering={entering} aria-labelledby={`act-${g.key}`}>
            {/* 期限切れが多い（3 件以上）ときだけ、見出しの右に「期限を見直す」（責めない・見出しは 1 つ）。 */}
            {g.key === 'overdue' && overdueCount >= 3 && onEditAction ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', margin: 'calc(-1 * var(--space-3)) 0 calc(var(--space-2) - var(--space-3))' }}>
                <h2 id={`act-${g.key}`} style={{ ...uiGroupTitle }}>{g.label}（{overdueCount}）</h2>
                <button
                  type="button"
                  onClick={() => {
                    // 期限を過ぎた行動を古い順に 1 つずつ開く（保存したら次・キャンセルで終わる・2026-09-30）。
                    const list = open.filter((x) => groupOf(x) === 'overdue');
                    const a = list[0];
                    if (a) onEditAction(a.bookId, a.actionIdx, a, { queue: list.slice(1), total: list.length });
                  }}
                  style={{ ...btnLink, marginRight: 'calc(-1 * var(--space-1))' }}
                >
                  期限を見直す
                </button>
              </div>
            ) : (
              <h2 id={`act-${g.key}`} style={groupTitle}>{g.label}</h2>
            )}
            <ul style={listStyle}>{items.map(renderItem)}</ul>
          </GroupSection>
        );
      })}

      {/* 完了した行動は一覧の最後の 1 行から開く。 */}
      {doneShown.length > 0 && (
        <section ref={doneSectionRef} aria-label="完了した行動">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', background: 'none', border: 'none', borderTop: '1px solid var(--separator)', padding: 'var(--space-2) 0 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            <span style={uiGroupTitle}>完了した行動（{doneShown.length}）</span>
            {showDone
              ? <ChevronDown size={20} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
              : <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)' }} />}
          </button>
          {showDone && <ul style={{ ...listStyle, marginTop: 0 }}>{doneShown.map(renderItem)}</ul>}
        </section>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            menu.action.done
              ? { label: '未完了に戻す', icon: <Circle size={16} aria-hidden="true" />, onClick: () => onCheck(menu.action) }
              : { label: '完了にする', icon: <CheckCircle2 size={16} aria-hidden="true" />, onClick: () => onCheck(menu.action) },
            ...(onEditAction ? [{ label: '編集', icon: <Pencil size={16} aria-hidden="true" />, onClick: () => onEditAction(menu.action.bookId, menu.action.actionIdx, menu.action) }] : []),
            { label: '本を開く', icon: <BookOpen size={16} aria-hidden="true" />, onClick: () => { const b = bookOf(menu.action); if (b) onOpenBook?.(b); } },
            { label: '削除', icon: <Trash2 size={16} aria-hidden="true" />, destructive: true, onClick: () => onDeleteAction?.(menu.action.bookId, menu.action.actionIdx, { target: menu.action }) },
          ]}
        />
      )}
    </div>
  );
}
