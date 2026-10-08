// 📖 この本で学べること（2026-10-08・SPEC §2「この本について」・lib/bookBrief.js）。
//
// 公開の紹介文と目次だけから AI が書いた ①概要 ②学べること ③仮説の例。読む前に「この本から何を得られそうか」を
// つかみ、仮説を決められるようにする。一度作ったら本に保存（開くたびに AI を呼ばない）。
//
//   variant="inCard"  … 「この本について」のカードの中（紹介文・添え書きの下・目次の上）。まだ無ければ副ボタン
//                       「この本で学べることを見る」＋ 1 回の目安トークン。作ったらカードの中に開いて見せる
//   variant="section" … 課題・仮説を書いた積読: 課題・仮説のカードの上に、畳まずに 1 行の見出し＋中身（短く）
//   variant="fold"    … 読書計画の編集画面（得たいこと・課題・仮説を書くところ）の上に畳んで置く。仮説の例を押すと仮説の欄に入る
//   variant="make"    … ボタンだけ（積読の「この本について」の畳む見出しの中）
import { ChevronDown, Plus, Check } from 'lucide-react';
import { groupTitle, btnGhost, btnGhostOff, btnLink } from '../styles/ui';
import { glueForDisplay } from './BookAbout';
import { parseBrief, isUsableBrief, BRIEF_NO_MATERIAL_TEXT } from '../lib/bookBrief';

export const BRIEF_TITLE = 'この本で学べること';
export const BRIEF_MAKE_LABEL = 'この本で学べることを見る';

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
};
// DESIGN §5「畳む見出し」（App.jsx の detailsStyle / summaryStyle・BookPhases の softBox と同じ形）。
const foldStyle = { ...cardStyle, padding: '0 var(--space-4)' };
const foldSummary = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)',
  minHeight: 48, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', listStyle: 'none',
};
const subTitle = { ...groupTitle, margin: '0 0 var(--space-2)' };
// AI の文は文節で止めずに流す（word-break: normal・line-break: strict・text-wrap: pretty＝CLAUDE.md・MarkdownSections と同じ）。
const aiFlow = { wordBreak: 'normal', lineBreak: 'strict', textWrap: 'pretty', overflowWrap: 'anywhere' };
// 概要＝読む文章（明朝 18・行間 1.6・DESIGN §2）。
const summaryStyle = {
  fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)', margin: 0, ...aiFlow,
};
const listStyle = {
  listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
  fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5, ...aiFlow,
};
// 頭の「・」は --text-3・折り返した 2 行目は 1 字下げ（DESIGN §5 畳む一覧の箇条と同じ）。
const itemStyle = { paddingLeft: '1em', textIndent: '-1em' };
const dot = <span aria-hidden="true" style={{ color: 'var(--text-3)' }}>・</span>;
const metaStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 };
// 仮説の例を押せる行（--fill の面・角丸 12・左寄せ・押せる高さ 44 以上・右に ＋）。
const pickStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', width: '100%',
  minHeight: 44, padding: 'var(--space-2) var(--space-3)', border: 'none', borderRadius: 'var(--radius)',
  background: 'var(--fill)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 'var(--text-sub)', lineHeight: 1.5,
  textAlign: 'left', cursor: 'pointer', ...aiFlow,
};

/** 作っている途中の骨組み（AI の文の形・components.css の .ai-skeleton）。 */
function MakingSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="この本で学べることを作っています" style={{ marginTop: 'var(--space-3)' }}>
      <div className="ai-skeleton" aria-hidden="true">
        <div className="ai-skeleton-line" style={{ width: '92%' }} />
        <div className="ai-skeleton-line" style={{ width: '80%' }} />
        <div className="ai-skeleton-line" style={{ width: '64%' }} />
      </div>
    </div>
  );
}

/** 副ボタン「この本で学べることを見る」＋ 1 回の目安（材料が無ければ決まった 1 行）。 */
//   waiting: 紹介と目次をまだ読み込んでいる（押せないが「作成中…」とは言わない）
export function BriefMakeButton({ material, making, waiting = false, costLine, onMake, style }) {
  if (!material && !waiting) return <p style={{ ...metaStyle, ...style }}>{BRIEF_NO_MATERIAL_TEXT}</p>;
  const off = making || waiting;
  return (
    <div style={style}>
      <button
        type="button"
        onClick={onMake}
        disabled={off}
        aria-busy={off || undefined}
        // 主張しない副ボタン（行の中の副ボタンと同じ 44・15・DESIGN §5）。押せない間は薄くせず btnGhostOff。
        style={{ ...(off ? btnGhostOff : btnGhost), minHeight: 44, fontSize: 'var(--text-sub)' }}
      >
        {making ? '作成中…' : BRIEF_MAKE_LABEL}
      </button>
      {!off && costLine && <p style={{ ...metaStyle, marginTop: 'var(--space-2)' }}>{costLine}</p>}
      {making && <MakingSkeleton />}
    </div>
  );
}

/**
 * 中身（概要・学べること・仮説の例・添え書き）。
 *   onPickHypothesis: あれば仮説の例を押せる行にする（押すと仮説の欄に入る・勝手に保存しない）
 *   pickedHypotheses: もう仮説の欄に入っている例（✓ を出す）
 *   compact: 概要と学べることだけ（仮説の例は出さない）
 */
export function BriefBody({ text, onPickHypothesis, pickedHypotheses = '', compact = false, onRemake, making = false }) {
  const b = parseBrief(text);
  if (!isUsableBrief(b)) return null;
  const picked = String(pickedHypotheses || '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <p style={subTitle}>概要</p>
        <p style={summaryStyle}>{glueForDisplay(b.summary)}</p>
      </div>
      <div>
        <p style={subTitle}>学べること</p>
        <ul style={listStyle}>
          {b.learn.map((x, i) => <li key={i} style={itemStyle}>{dot}{glueForDisplay(x)}</li>)}
        </ul>
      </div>
      {!compact && b.hypotheses.length > 0 && (
        <div>
          <p style={subTitle}>仮説の例</p>
          {onPickHypothesis ? (
            <ul style={{ ...listStyle, gap: 'var(--space-2)' }}>
              {b.hypotheses.map((x, i) => {
                const on = picked.includes(x);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => onPickHypothesis(x)}
                      aria-label={on ? `${x}（仮説に入っています）` : `${x}（仮説に入れる）`}
                      style={pickStyle}
                    >
                      <span>{glueForDisplay(x)}</span>
                      {on
                        ? <Check size={18} aria-hidden="true" style={{ color: 'var(--success)', flexShrink: 0 }} />
                        : <Plus size={18} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul style={listStyle}>
              {b.hypotheses.map((x, i) => <li key={i} style={itemStyle}>{dot}{glueForDisplay(x)}</li>)}
            </ul>
          )}
        </div>
      )}
      {/* どこから作った文か（正直に）＋ 作り直しは押したときだけ。 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'calc(-1 * var(--space-2))' }}>
        <p style={{ ...metaStyle, flex: '1 1 12em' }}>紹介と目次から AI がまとめました</p>
        {onRemake && (
          <button
            type="button"
            onClick={onRemake}
            disabled={making}
            style={{ ...btnLink, marginRight: 'calc(-1 * var(--space-1))', ...(making ? { color: 'var(--text-3)', opacity: 1, cursor: 'default' } : null) }}
          >
            {making ? '作り直しています…' : '作り直す'}
          </button>
        )}
      </div>
      {making && <MakingSkeleton />}
    </div>
  );
}

/**
 * @param {object} p
 * @param {string} p.text 保存済みの「この本で学べること」（無ければ ''）
 * @param {boolean} p.material 紹介か目次が足りるだけある（hasBriefMaterial）
 * @param {boolean} p.making 作っている途中
 * @param {string} p.costLine 「1 回 約 2 トークン・今月の残り …」
 */
export default function BookBrief({
  variant = 'inCard', text = '', material = false, making = false, costLine = '', onMake,
  onPickHypothesis, pickedHypotheses = '', defaultOpen = false, infoLoading = false, style,
}) {
  const has = isUsableBrief(parseBrief(text));

  if (variant === 'make') {
    if (has) return null;
    return <BriefMakeButton material={material} making={making} costLine={costLine} onMake={onMake} style={style} />;
  }

  if (variant === 'inCard') {
    // カードの中: 上に区切り線（目次の畳みと同じ）＋ 12。中身があれば見出し＋中身・無ければボタン。
    return (
      <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--separator)', ...style }}>
        {has ? (
          <>
            <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-3)', lineHeight: 1.3 }}>{BRIEF_TITLE}</h3>
            <BriefBody text={text} onPickHypothesis={onPickHypothesis} pickedHypotheses={pickedHypotheses} onRemake={onMake} making={making} />
          </>
        ) : (
          <BriefMakeButton material={material} making={making} costLine={costLine} onMake={onMake} />
        )}
      </div>
    );
  }

  if (variant === 'section') {
    if (!has) return null;
    return (
      <section aria-labelledby="book-brief-title" style={{ ...cardStyle, ...style }}>
        <h2 id="book-brief-title" style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-3)', lineHeight: 1.3 }}>{BRIEF_TITLE}</h2>
        <BriefBody text={text} onPickHypothesis={onPickHypothesis} pickedHypotheses={pickedHypotheses} compact={!onPickHypothesis} onRemake={onMake} making={making} />
      </section>
    );
  }

  // variant === 'fold'（読書計画の編集画面）
  if (!has && !material && !infoLoading) {
    // 紹介も目次も見つからない本: 畳まずに決まった 1 行だけ（開いても同じ 1 行なので）。
    return (
      <div style={{ ...cardStyle, ...style }}>
        <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-1)' }}>{BRIEF_TITLE}</p>
        <p style={metaStyle}>{BRIEF_NO_MATERIAL_TEXT}</p>
      </div>
    );
  }
  const right = has ? '概要・学べること・仮説' : infoLoading ? '' : 'まだありません';
  return (
    <details key={defaultOpen ? 'open' : 'closed'} open={defaultOpen || undefined} style={{ ...foldStyle, ...style }}>
      <summary style={foldSummary}>
        {BRIEF_TITLE}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          {right && <span style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)' }}>{right}</span>}
          <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        </span>
      </summary>
      <div style={{ paddingBottom: 'var(--space-4)' }}>
        {has
          ? <BriefBody text={text} onPickHypothesis={onPickHypothesis} pickedHypotheses={pickedHypotheses} onRemake={onMake} making={making} />
          : <BriefMakeButton material={material} making={making} waiting={infoLoading} costLine={costLine} onMake={onMake} />}
      </div>
    </details>
  );
}
