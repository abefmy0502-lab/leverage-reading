// 📖 この本で学べること（2026-10-08・SPEC §2「この本について」・lib/bookBrief.js）。
//
// 公開の紹介文と目次だけから AI が書いた ①概要 ②学べること（小説・物語は「味わえること」）③仮説の例。
// 読む前に「この本から何を得られそうか」をつかみ、仮説を決められるようにする。一度作ったら本に保存（開くたびに AI を呼ばない）。
//
//   variant="inCard" … 「この本について」のカードの中（読みたい・積読・2026-10-09 に 1 枚へ寄せた）。まだ無ければ副ボタン
//                      「この本で学べることを見る」＋ 1 回の目安トークン。作ったあとはカードの中の畳む行「この本で学べること」
//                      （作ったその場だけ開いたまま＝defaultOpen・画面を離れたら畳む＝主ボタンを最初の画面に残す）。
//                      flush: 畳む行「この本について」の下（compact のカード）＝上の間を取らず、下の余白を自分で持つ
//   variant="make"   … ボタン＋目安の行だけ
//   variant="fold"   … 畳む見出し（読書計画の編集画面・紹介と目次が今は読めないときの本の詳細）。仮説の例を押すと仮説の欄に入る
//   variant="section"… 畳まないカード
import { ChevronDown, Plus, Check } from 'lucide-react';
import { groupTitle, btnGhost, btnGhostOff, btnLink } from '../styles/ui';
import { glueForDisplay } from './BookAbout';
import { withPhraseBreaks } from './TightBubble';
import { parseBrief, isUsableBrief, briefLabels, briefSourceLine, BRIEF_NO_MATERIAL_TEXT } from '../lib/bookBrief';

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
  minHeight: 'var(--btn-h)', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', listStyle: 'none',
};
// カードの中の畳む行（「この本について」のカードの目次の行と同じ 48・15/600）。
const rowSummary = { ...foldSummary, fontSize: 'var(--text-sub)' };
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
// アプリの言葉（添え書き・目安・決まった 1 行）は文節の切れ目でだけ折り返す（文字最大で「まとめ／ました」と割らない）。
const metaStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0, lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const errorStyle = { ...metaStyle, fontSize: 'var(--text-sub)', color: 'var(--error)', marginTop: 'var(--space-2)' };
// 仮説の例を押せる行（--fill の面・角丸 12・左寄せ・押せる高さ 44 以上・右に ＋）。
const pickStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', width: '100%',
  minHeight: 'var(--tap-min)', padding: 'var(--space-2) var(--space-3)', border: 'none', borderRadius: 'var(--radius)',
  background: 'var(--fill)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 'var(--text-sub)', lineHeight: 1.5,
  textAlign: 'left', cursor: 'pointer', ...aiFlow,
};
// 文字の横のアイコンは em で（文字の大きさに合わせる・DESIGN §5）。
const iconSize = '1.2em';

/** 作っている途中の骨組み（AI の文の形・components.css の .ai-skeleton）。 */
function MakingSkeleton({ title = BRIEF_TITLE }) {
  return (
    <div role="status" aria-live="polite" aria-label={`${title}を作っています`} style={{ marginTop: 'var(--space-3)' }}>
      <div className="ai-skeleton" aria-hidden="true">
        <div className="ai-skeleton-line" style={{ width: '92%' }} />
        <div className="ai-skeleton-line" style={{ width: '80%' }} />
        <div className="ai-skeleton-line" style={{ width: '64%' }} />
      </div>
    </div>
  );
}

/**
 * 副ボタン「この本で学べることを見る」＋ 1 回の目安（材料が無ければ決まった 1 行）。
 *   waiting: 紹介と目次をまだ読み込んでいる（押せないが「作成中…」とは言わない）
 *   error:   作れなかった理由（ボタンの下に 1 行・ボタンは「もう一度作る」）
 */
export function BriefMakeButton({ material, making, waiting = false, costLine, onMake, error = '', style }) {
  if (!material && !waiting) return <p style={{ ...metaStyle, ...style }}>{withPhraseBreaks(BRIEF_NO_MATERIAL_TEXT)}</p>;
  const off = making || waiting;
  return (
    <div style={style}>
      <button
        type="button"
        onClick={onMake}
        disabled={off}
        aria-busy={off || undefined}
        // 主張しない副ボタン（行の中の副ボタンと同じ 44・15・DESIGN §5）。押せない間は薄くせず btnGhostOff。
        style={{ ...(off ? btnGhostOff : btnGhost), minHeight: 'var(--tap-min)', fontSize: 'var(--text-sub)' }}
      >
        {making ? '作成中…' : error ? 'もう一度作る' : BRIEF_MAKE_LABEL}
      </button>
      {!off && error && <p role="alert" style={errorStyle}>{withPhraseBreaks(error)}</p>}
      {!off && costLine && <p style={{ ...metaStyle, marginTop: 'var(--space-2)' }}>{withPhraseBreaks(costLine)}</p>}
      {making && <MakingSkeleton />}
    </div>
  );
}

/**
 * 中身（概要・学べること・仮説の例・どこから作ったか・作り直す）。
 *   onPickHypothesis: あれば仮説の例を押せる行にする（押すと仮説の欄に入る・勝手に保存しない）
 *   pickedHypotheses: もう仮説の欄に入っている例（✓ を出す）
 *   compact: 概要と学べることだけ（仮説の例は出さない）
 *   info: いま読める紹介文・目次（添え書きの言葉を材料に合わせる）
 */
//   error: 作り直しに失敗した理由（添え書きの行のすぐ下に 1 行・中身は前のまま残る）
export function BriefBody({ text, onPickHypothesis, pickedHypotheses = '', compact = false, onRemake, making = false, info = null, error = '' }) {
  const b = parseBrief(text);
  if (!isUsableBrief(b)) return null;
  const labels = briefLabels(text);
  const picked = String(pickedHypotheses || '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <p style={subTitle}>概要</p>
        <p style={summaryStyle}>{glueForDisplay(b.summary)}</p>
      </div>
      <div>
        <p style={subTitle}>{labels.learn}</p>
        <ul style={listStyle}>
          {b.learn.map((x, i) => <li key={i} style={itemStyle}>{dot}{glueForDisplay(x)}</li>)}
        </ul>
      </div>
      {!compact && b.hypotheses.length > 0 && (
        <div>
          <p style={subTitle}>仮説の例</p>
          {onPickHypothesis ? (
            <ul style={listStyle}>
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
                        ? <Check size={iconSize} aria-hidden="true" style={{ color: 'var(--success)', flexShrink: 0 }} />
                        : <Plus size={iconSize} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0 }} />}
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
      {/* どこから作った文か（正直に・いま読める材料に合わせる）＋ 作り直しは押したときだけ（確かめてから）。 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'calc(-1 * var(--space-2))' }}>
        <p style={{ ...metaStyle, flex: '1 1 10em' }}>{withPhraseBreaks(briefSourceLine(info))}</p>
        {onRemake && (
          <button
            type="button"
            onClick={onRemake}
            disabled={making}
            style={{ ...btnLink, whiteSpace: 'nowrap', marginRight: 'calc(-1 * var(--space-1))', ...(making ? { color: 'var(--text-3)', opacity: 1, cursor: 'default' } : null) }}
            // 読み上げは見出しの名前（この本で学べること／味わえること）に揃える。
            aria-label={making ? `${labels.title}を作り直しています` : `${labels.title}を作り直す`}
          >
            {making ? '作り直しています…' : '作り直す'}
          </button>
        )}
      </div>
      {!making && error && <p role="alert" style={{ ...errorStyle, marginTop: 'calc(-1 * var(--space-2))' }}>{withPhraseBreaks(error)}</p>}
      {making && <MakingSkeleton title={labels.title} />}
    </div>
  );
}

/**
 * @param {object} p
 * @param {string} p.text 保存済みの「この本で学べること」（無ければ ''）
 * @param {boolean} p.material 紹介か目次が足りるだけある（hasBriefMaterial）
 * @param {boolean} p.making 作っている途中
 * @param {string} p.costLine 「1 回 約 2 トークン・今月の残り …」
 * @param {object} p.info いま読める紹介文・目次（添え書きに使う）
 * @param {string} p.error 作れなかった理由（ボタンの下）
 */
export default function BookBrief({
  variant = 'inCard', text = '', material = false, making = false, costLine = '', onMake, onRemake,
  onPickHypothesis, pickedHypotheses = '', defaultOpen = false, infoLoading = false, info = null, error = '', flush = false, style,
}) {
  const has = isUsableBrief(parseBrief(text));
  const labels = briefLabels(text);
  const remake = onRemake || onMake;

  if (variant === 'make') {
    if (has) return null;
    return <BriefMakeButton material={material} making={making} waiting={infoLoading} costLine={costLine} onMake={onMake} error={error} style={style} />;
  }

  if (variant === 'inCard') {
    // 作ったあと: カードの中の畳む行（上に区切り線・目次の行と同じ形）。作ったその場だけ開いたまま。
    if (has) {
      return (
        <details key={defaultOpen ? 'open' : 'closed'} open={defaultOpen || undefined} style={{ marginTop: flush ? 0 : 'var(--space-3)', borderTop: '1px solid var(--separator)', ...style }}>
          <summary style={rowSummary}>
            <span style={{ flex: '0 1 auto', minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(labels.title)}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)', flex: '1 1 0', minWidth: 0 }}>
              <span style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{labels.short}</span>
              <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </span>
          </summary>
          <div style={{ paddingBottom: flush ? 'var(--space-4)' : 'var(--space-3)' }}>
            <BriefBody text={text} onPickHypothesis={onPickHypothesis} pickedHypotheses={pickedHypotheses} onRemake={remake} making={making} info={info} error={error} />
          </div>
        </details>
      );
    }
    // まだ無いとき: 区切り線の下 12 に副ボタン＋目安の行。
    return (
      <div style={{ marginTop: flush ? 0 : 'var(--space-3)', paddingTop: 'var(--space-3)', ...(flush ? { paddingBottom: 'var(--space-4)' } : null), borderTop: '1px solid var(--separator)', ...style }}>
        <BriefMakeButton material={material} making={making} costLine={costLine} onMake={onMake} error={error} />
      </div>
    );
  }

  if (variant === 'section') {
    if (!has) return null;
    return (
      <section aria-labelledby="book-brief-title" style={{ ...cardStyle, ...style }}>
        <h2 id="book-brief-title" style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-3)', lineHeight: 1.3 }}>{labels.title}</h2>
        <BriefBody text={text} onPickHypothesis={onPickHypothesis} pickedHypotheses={pickedHypotheses} compact={!onPickHypothesis} onRemake={remake} making={making} info={info} error={error} />
      </section>
    );
  }

  // variant === 'fold'（課題・仮説を書いた積読の本の詳細・読書計画の編集画面）
  if (!has && !material && !infoLoading) {
    // 紹介も目次も見つからない本: 畳まずに決まった 1 行だけ（開いても同じ 1 行なので）。
    return (
      <div style={{ ...cardStyle, ...style }}>
        <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-1)' }}>{BRIEF_TITLE}</p>
        <p style={metaStyle}>{withPhraseBreaks(BRIEF_NO_MATERIAL_TEXT)}</p>
      </div>
    );
  }
  const right = has ? labels.short : infoLoading ? '' : 'まだありません';
  return (
    <details key={defaultOpen ? 'open' : 'closed'} open={defaultOpen || undefined} style={{ ...foldStyle, ...style }}>
      <summary style={foldSummary}>
        {/* 文字を大きくしたときは、右の要約から先に … で縮める（見出しは文節の切れ目でだけ折り返す・シェブロンを押し出さない）。 */}
        <span style={{ flex: '0 1 auto', minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(has ? labels.title : BRIEF_TITLE)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)', flex: '1 1 0', minWidth: 0 }}>
          {right && <span style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{right}</span>}
          <ChevronDown size={iconSize} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        </span>
      </summary>
      <div style={{ paddingBottom: 'var(--space-4)' }}>
        {has
          ? <BriefBody text={text} onPickHypothesis={onPickHypothesis} pickedHypotheses={pickedHypotheses} onRemake={remake} making={making} info={info} error={error} />
          : <BriefMakeButton material={material} making={making} waiting={infoLoading} costLine={costLine} onMake={onMake} error={error} />}
      </div>
    </details>
  );
}
