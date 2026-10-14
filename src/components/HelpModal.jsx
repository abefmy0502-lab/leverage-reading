// 📖 ヘルプ（画面ごと）
//
// 2026-09-30 に「10 秒で分かる」形へ作り直した（オーナー要望「ヘルプの説明が長すぎてわかりにくい」）:
//   1. 上の行に「◯◯のヘルプ」、中身の先頭に何のための画面かの 1 文（summary）
//   2. まずはこれだけ — 3 つの手順（quickSteps）
//   3. くわしく — 項目の一覧（topics）。ふだんは畳んで、押すと 1〜3 行が開く（details）。一覧そのものが目次
//   4. よくある質問（HELP_FAQ）— 同じ畳む一覧。答えは決まっているので AI は使わない
//   5. ほかの画面の使い方 — 押すと、閉じずにその画面のヘルプへ切り替える（プラン・お支払いなど画面から開けないものも）。
//      切り替えたあとは上の行の左に「‹ もとの画面」
// 2026-10-14 オーナー「項目が多すぎる・いい感じの UI に」: いちばん上に「ヘルプを探す」（すべての画面の項目とよくある質問から、
//   見出しと中身の言葉で探す・AI は使わない）。くわしくは大事な 5 つだけ見せ、残りは「ほかの N 項目」で開く。よくある質問は 4 つ。
// 文言は src/lib/helpContent.js（**語** は太字）。見た目は DESIGN §5「ヘルプ」。

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getHelp, HELP_FAQ, HELP_SCREEN_ORDER } from '../lib/helpContent';
import { btnLink, card, groupTitle, input as uiInput } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 850,
  background: 'var(--backdrop)',
  backdropFilter: 'var(--backdrop-blur)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-4)', // 画面の左右の余白 16（DESIGN §1）
  fontFamily: 'var(--font-app)',
  boxSizing: 'border-box',
};

const cardStyle = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  width: '100%',
  maxWidth: 460, // 読む 1 行を 26 字ほどに止める（iPad・Web）
  maxHeight: 'min(85vh, 85dvh)',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: 'var(--shadow-overlay)',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-2) var(--space-2) var(--space-4)',
  borderBottom: '1px solid var(--separator)',
  background: 'var(--surface)',
  flexShrink: 0, // 中身が長くても見出しの行が潰れない
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-2)',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  padding: 0,
  borderRadius: 'var(--radius-full)',
  flexShrink: 0,
};

const bodyStyle = {
  padding: 'var(--space-4) var(--space-4) var(--space-6)',
  overflowY: 'auto',
  overflowX: 'hidden',
  // flex の子を正しくスクロールさせる 3 点（残りの高さを使い切る・中身より縮められる）
  flexGrow: 1,
  flexShrink: 1,
  minHeight: 0,
  width: '100%',
  WebkitOverflowScrolling: 'touch',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)', // グループの間は 24（DESIGN §1）
  boxSizing: 'border-box',
};

const summaryStyle = {
  fontSize: 'var(--text-body)',
  color: 'var(--text)',
  lineHeight: 1.5,
  margin: 0,
};
const groupTitleStyle = { ...groupTitle, margin: '0 0 var(--space-2)' };
// 太字の語は途中で折り返さない（語が 2 行に割れると読めない・12 字まで＝helpContent.test.js）。
const strongStyle = { fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' };

// まずはこれだけ（3 つの手順）: カード 1 枚に番号つきで。
const stepsCardStyle = {
  ...card,
  listStyle: 'none',
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};
const stepRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-3)',
  fontSize: 'var(--text-body)',
  lineHeight: 1.5,
  color: 'var(--text)',
};
const stepNumberStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 'var(--radius-full)',
  flexShrink: 0,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  fontSize: 'var(--text-meta)',
  fontWeight: 600,
  lineHeight: 1,
};

// 畳む一覧（項目・よくある質問・ほかの画面）: カード 1 枚の中に行を区切り線で並べる（iOS の設定の一覧と同じ）。
const listCardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};
const rowDivider = { borderTop: '1px solid var(--separator)' };
const topicSummaryStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  minHeight: 48,
  padding: 'var(--space-2) var(--space-3) var(--space-2) var(--space-4)',
  boxSizing: 'border-box',
  fontSize: 'var(--text-body)',
  lineHeight: 1.4,
  color: 'var(--text)',
  cursor: 'pointer',
  listStyle: 'none',
};
const topicLinesStyle = {
  listStyle: 'none',
  margin: 0,
  padding: '0 var(--space-4) var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};
const topicLineStyle = {
  display: 'flex',
  gap: 'var(--space-1)',
  alignItems: 'baseline',
  fontSize: 'var(--text-sub)',
  lineHeight: 1.6,
  color: 'var(--text-2)',
};
const lineMarkStyle = { color: 'var(--text-3)', flexShrink: 0 };
// 探した結果の、どの画面のヘルプか（見出しの下に 13/--text-2）
// 中身の 1 行で見つかったときは、その行を見出しの下に（なぜ見つかったか分かるように・1 行で …）
const hitStyle = { display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)', marginTop: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const whereStyle = { display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)', marginTop: 'var(--space-1)' };
const searchWrapStyle = { position: 'relative' };
const clearBtnStyle = { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 'var(--tap-min)', height: 'var(--tap-min)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, color: 'var(--text-3)', cursor: 'pointer' };
const searchIconStyle = { position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' };
const navRowStyle = {
  ...topicSummaryStyle,
  width: '100%',
  background: 'none',
  border: 'none',
  fontFamily: 'inherit',
  textAlign: 'left',
};

// 更新日は中身のいちばん下に 1 行（下に固定の欄にしない・読む場所を狭めない）。日付なので 13/400/--text-3。
const updatedStyle = {
  fontSize: 'var(--text-meta)',
  fontWeight: 400,
  color: 'var(--text-3)',
  margin: 0,
};

// 文節の切れ目で折り返す（BudouX の <wbr>＋keep-all）。
function phrased(text) {
  if (text == null || typeof text !== 'string') return text;
  return withPhraseBreaks(text);
}

// **語** を太字に（1 行に 1 か所まで・helpContent.test.js）。ほかは文節で折り返すだけ。
function rich(text) {
  if (typeof text !== 'string') return text;
  return text.split(/\*\*(.+?)\*\*/).map((part, i) => {
    if (!part) return null;
    return i % 2 === 1
      ? <strong key={i} style={strongStyle}>{phrased(part)}</strong>
      : <Fragment key={i}>{phrased(part)}</Fragment>;
  });
}

// はじめに見せる数（残りは「ほかの N 項目」で開く・2026-10-14）。
const TOPICS_SHOWN = 5;
const FAQ_SHOWN = 4;

// 押すと開く項目の一覧。一覧そのものが目次になる（見出しだけ並べ、中身は 1〜3 行）。
// limit を渡すと、はじめはその数だけ見せ、最後の行「ほかの N 項目」で残りを開く。where は探したときの画面の名前。
function TopicList({ items, limit = 0, moreLabel = '項目' }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? items.slice(0, limit) : items;
  const rest = items.length - shown.length;
  return (
    <div style={listCardStyle}>
      {shown.map((t, i) => (
        <details key={`${t.where || ''}${t.title}`} style={i ? rowDivider : undefined}>
          <summary style={topicSummaryStyle}>
            <span style={{ minWidth: 0 }}>
              {phrased(t.title)}
              {t.hit && <span style={hitStyle}>{t.hit}</span>}
              {t.where && <span style={whereStyle}>{t.where}</span>}
            </span>
            <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </summary>
          <ul style={topicLinesStyle}>
            {t.lines.map((line) => (
              <li key={line} style={topicLineStyle}>
                <span aria-hidden="true" style={lineMarkStyle}>・</span>
                <span>{rich(line)}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {rest > 0 && (
        <button type="button" aria-expanded={false} onClick={() => setAll(true)} style={{ ...navRowStyle, ...rowDivider, color: 'var(--accent)', fontWeight: 600 }}>
          <span>{`ほかの${moreLabel}（${rest}）`}</span>
          <ChevronDown size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
        </button>
      )}
      {/* 開いたあとは、最後の行で畳み直せる（2026-10-14） */}
      {limit > 0 && all && items.length > limit && (
        <button type="button" aria-expanded onClick={() => setAll(false)} style={{ ...navRowStyle, ...rowDivider, color: 'var(--accent)', fontWeight: 600 }}>
          <span>少なく表示</span>
          <ChevronDown size={20} aria-hidden="true" style={{ flexShrink: 0, transform: 'rotate(180deg)' }} />
        </button>
      )}
    </div>
  );
}

// 探すときの言葉の比べ方（太字の印・空白・大文字小文字を無視）。
const norm = (t) => String(t || '').replace(/\*\*/g, '').replace(/[\s\u00a0]+/g, '').toLowerCase();

// すべての画面の項目とよくある質問から探す（見出しを先に・最大 20 件）。
function searchHelp(query, currentKey) {
  const q0 = norm(query);
  if (!q0) return [];
  // 送りがなの違いでも見つける（「取り込み」で「取り込む」「取り込めます」も・漢字を含むときだけ末尾のひらがなを外す）
  const core = /[\u4e00-\u9fff]/.test(q0) ? q0.replace(/[\u3041-\u3093]+$/, '') : q0;
  const q = core.length >= 2 ? core : q0;
  // いま開いている画面の項目を先に。画面の名前は、ほかの画面の項目にだけ添える。
  const keys = [currentKey, ...HELP_SCREEN_ORDER.filter((k) => k !== currentKey)].filter((k) => getHelp(k));
  const pool = [
    ...keys.flatMap((k) => (getHelp(k).topics || []).map((t) => ({ ...t, where: k === currentKey ? '' : getHelp(k).title }))),
    ...HELP_FAQ.map((t) => ({ ...t, where: 'よくある質問' })),
  ];
  const inTitle = pool.filter((t) => norm(t.title).includes(q));
  const inLines = pool
    .filter((t) => !norm(t.title).includes(q) && t.lines.some((l) => norm(l).includes(q)))
    .map((t) => ({ ...t, hit: t.lines.find((l) => norm(l).includes(q)).replace(/\*\*/g, '') }));
  return [...inTitle, ...inLines].slice(0, 20);
}

// 開発中だけ: ?helpkey=billing のように、ほかの画面のヘルプを直に開く（スクショ用・本番では消える）。
function devHelpKey() {
  if (!import.meta.env.DEV) return null;
  try { return new URLSearchParams(window.location.search).get('helpkey'); } catch { return null; }
}

export default function HelpModal({ helpKey, onClose, onShowOnboarding }) {
  const [startKey] = useState(() => (devHelpKey() && getHelp(devHelpKey()) ? devHelpKey() : helpKey));
  const [key, setKey] = useState(startKey);
  const entry = getHelp(key);
  const trapRef = useFocusTrap(true);
  const bodyRef = useRef(null);
  const [query, setQuery] = useState('');
  const results = searchHelp(query, key);
  const searching = norm(query).length > 0;

  // ほかの画面のヘルプへ切り替える（閉じずに・いちばん上から読めるように送る）。
  const showKey = useCallback((k) => {
    setKey(k);
    setQuery('');
    requestAnimationFrame(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; });
  }, []);

  // 開くときは .modal / .modal-backdrop（ほかのダイアログと同じ）、閉じるときは逆の動き（200ms）を見せてから外す。
  // 動きを減らす設定ではすぐ閉じる。
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(closeTimerRef.current), []);
  const requestClose = useCallback(() => {
    if (closeTimerRef.current) return;
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
    if (reduce) { onClose?.(); return; }
    setClosing(true);
    closeTimerRef.current = setTimeout(() => onClose?.(), 200);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.isComposing && !e.nativeEvent?.isComposing) requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const otherScreens = HELP_SCREEN_ORDER.filter((k) => k !== key && getHelp(k));

  return (
    <div className={closing ? 'modal-backdrop-exit' : 'modal-backdrop'} style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="help-modal-title" onClick={requestClose}>
      <div ref={trapRef} className={closing ? 'modal-exit' : 'modal'} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          {/* ほかの画面のヘルプへ移ったときだけ、上の行の左に戻り先（スクロールしても消えない） */}
          {key !== startKey && getHelp(startKey) && (
            <button
              type="button"
              onClick={() => showKey(startKey)}
              style={{ ...btnLink, flexShrink: 0, marginLeft: 'calc(-1 * var(--space-1))' }}
            >
              ‹ {getHelp(startKey).title}
            </button>
          )}
          <h2 id="help-modal-title" style={{ fontSize: 'var(--text-body)', color: 'var(--text)', margin: 0, fontWeight: 600, flex: 1, minWidth: 0 }}>
            {/* 切り替えたあとは左に戻り先が並ぶので、あふれないよう画面の名前だけ */}
            {entry ? (key !== startKey ? entry.title : `${entry.title}のヘルプ`) : 'ヘルプ'}
          </h2>
          <button type="button" style={closeBtnStyle} onClick={requestClose} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
        </div>

        {/* key を変えると、開いていた項目を畳んだ状態で描き直す */}
        <div key={key} ref={bodyRef} className="lvg-help-body" style={bodyStyle}>
          {/* 🔎 ヘルプを探す（すべての画面の項目とよくある質問から・AI は使わない） */}
          <div style={searchWrapStyle}>
            <Search size={18} aria-hidden="true" style={searchIconStyle} />
            <input
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ヘルプを探す"
              aria-label="ヘルプを探す"
              maxLength={40}
              enterKeyHint="search"
              style={{ ...uiInput, paddingLeft: 'calc(var(--space-3) + 18px + var(--space-2))', paddingRight: query ? 'var(--tap-min)' : undefined }}
            />
            {query && (
              <button type="button" aria-label="探す言葉を消す" onClick={() => setQuery('')} style={clearBtnStyle}>
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>

          {searching ? (
            <section aria-live="polite" aria-labelledby="help-results">
              {results.length
                ? <h4 id="help-results" style={groupTitleStyle}>{`見つかった項目（${results.length}）`}</h4>
                : <h4 id="help-results" style={{ fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-1)' }}>見つかりませんでした</h4>}
              {results.length > 0
                ? <TopicList items={results} />
                : <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{phrased('別の言葉で探すか、下の「ほかの画面の使い方」をご覧ください。')}</p>}
            </section>
          ) : entry ? (
            <>
              <section>
                {entry.summary && <p style={summaryStyle}>{rich(entry.summary)}</p>}
              </section>

              {entry.quickSteps?.length > 0 && (
                <section aria-labelledby="help-quick">
                  <h4 id="help-quick" style={groupTitleStyle}>まずはこれだけ</h4>
                  <ol style={stepsCardStyle}>
                    {entry.quickSteps.map((s, i) => (
                      <li key={s} style={stepRowStyle}>
                        <span style={stepNumberStyle} aria-hidden="true">{i + 1}</span>
                        <span>{rich(s)}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {entry.topics?.length > 0 && (
                <section aria-labelledby="help-topics">
                  <h4 id="help-topics" style={groupTitleStyle}>くわしく（押すと開きます）</h4>
                  <TopicList items={entry.topics} limit={TOPICS_SHOWN} moreLabel="項目" />
                </section>
              )}
            </>
          ) : (
            <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
              この画面のヘルプはまだありません。下の「よくある質問」をご覧ください。
            </p>
          )}

          {!searching && (
            <section aria-labelledby="help-faq">
              <h4 id="help-faq" style={groupTitleStyle}>よくある質問</h4>
              <TopicList items={HELP_FAQ} limit={FAQ_SHOWN} moreLabel="質問" />
            </section>
          )}

          {otherScreens.length > 0 && (
            <section aria-labelledby="help-others">
              <h4 id="help-others" style={groupTitleStyle}>ほかの画面の使い方</h4>
              <div style={listCardStyle}>
                {otherScreens.map((k, i) => (
                  <button key={k} type="button" onClick={() => showKey(k)} style={i ? { ...navRowStyle, ...rowDivider } : navRowStyle}>
                    <span>{getHelp(k).title}</span>
                    <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {onShowOnboarding && (
            <button type="button" style={{ ...btnLink, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={() => onShowOnboarding()}>
              初回ガイドをもう一度見る
            </button>
          )}

          {entry?.lastUpdated && <p style={updatedStyle}>{entry.lastUpdated} 更新</p>}
        </div>
      </div>
    </div>
  );
}
