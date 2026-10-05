// 🆕 新しくなったこと — 版ごとに「どこの・何が・これまで → これから・影響・意図」を見せるシート（2026-10-05）。
//
// 開く場所は 3 つ（中身はどれも src/lib/releaseNotes.js と同じ）:
//   - 更新したあと、はじめて開いたときに 1 回だけ（App.jsx の useWhatsNew・見た版より新しい版だけ）
//   - 設定 → アプリ・サポート →「新しくなったこと」（全部・設定の上に重ねる＝layer="dialog"）
//   - Web の「アプリの新しい版があります」の「何が変わった？」（新しい版の中身・下に「更新する」）
//
// 見た目（DESIGN §5「新しくなったこと」）: 版ごとに見出し（20/600「10月5日の更新」）→ 12 → 項目のカード（間 12）。
// カードの中は どこの（13/600/--text-2）→ 4 → 何が（17/600/--text）→ 8 → ラベル付きの行
// （15・ラベル 600/--text-2 の幅 4.5 字＋文 400/--text（間 12・文字が大きいと文はラベルの下へ）・「これまで」「これから」「影響」「意図」・行の間 8）。
// 2 つ目からの版は畳む見出しで畳む。更新したあとに出るシートと「何が変わった？」は、いちばん新しい版の上の 3 件だけを開き、
// 残りは「ほかに N 件」で畳む（読む量を減らす・項目は大事な順・2026-10-05 ui-critic）。全部開くのは設定の一覧だけ。

import { ChevronDown } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { withPhraseBreaks } from './TightBubble';
import { btnPrimary, groupTitle } from '../styles/ui';
import { releaseHeading } from '../lib/whatsNew';

const wrapText = { wordBreak: 'keep-all', overflowWrap: 'anywhere', lineBreak: 'strict' };

// 句読点・閉じかっこは直前の 1 字とつないで折り返さない（文字を大きくして 1 文節が 1 行に収まらないとき、
// 語の途中で割る最後の手段＝overflow-wrap が「。」だけを次の行の頭へ送っていた・2026-10-05）。
const PUNCT_TAIL_RE = /([^\s\u00a0][。、」』）]+)/;
const nowrap = { whiteSpace: 'nowrap' };
function phrased(text) {
  const parts = withPhraseBreaks(text);
  if (!Array.isArray(parts)) return parts;
  return parts.map((p, i) => {
    if (typeof p !== 'string' || !PUNCT_TAIL_RE.test(p)) return p;
    return p.split(PUNCT_TAIL_RE).filter(Boolean).map((seg, j) => (
      PUNCT_TAIL_RE.test(seg) && seg.length <= 4 ? <span key={`p${i}-${j}`} style={nowrap}>{seg}</span> : seg
    ));
  });
}

const releaseHeadingStyle = {
  fontSize: 'var(--text-heading)',
  fontWeight: 600,
  color: 'var(--text)',
  lineHeight: 1.3,
  margin: '0 0 var(--space-3)',
  ...wrapText,
};

const itemListStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const itemCardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
};

const whereStyle = { ...groupTitle, fontSize: 'var(--text-meta)', lineHeight: 1.3, ...wrapText };

const whatStyle = {
  fontSize: 'var(--text-body)',
  fontWeight: 600,
  color: 'var(--text)',
  lineHeight: 1.4,
  margin: 'var(--space-1) 0 0',
  ...wrapText,
};

// 1 行＝ラベル（幅 4.5 字＝太字の「これまで」が収まる幅に固定）＋文。文の行頭が 4 つの行でそろう（iOS の設定の詳細と同じ）。
// 文字サイズを大きくして文の欄が 10 字ぶん取れないときは、文をラベルの下へ回す（1 行 3〜4 字に縮めない）。
const rowsStyle = {
  margin: 'var(--space-2) 0 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const rowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: 'var(--space-3)',
  fontSize: 'var(--text-sub)',
  lineHeight: 1.6,
};

// ラベルは脇役（--text-2/600）、文が読むもの（--text/400）。
const labelStyle = { margin: 0, flex: '0 0 4.5em', fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap' };
const valueStyle = { margin: 0, flex: '1 1 10em', minWidth: 0, fontWeight: 400, color: 'var(--text)', ...wrapText };

// 2 つ目からの版の畳む見出し（DESIGN §5「畳む見出し」: 高さ 48・--surface＋枠・17/600・右に 13/--text-3 の要約）。
const foldSummaryStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minHeight: 48,
  padding: 'var(--space-2) var(--space-3) var(--space-2) var(--space-4)',
  boxSizing: 'border-box',
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  fontSize: 'var(--text-body)',
  fontWeight: 600,
  color: 'var(--text)',
  lineHeight: 1.4,
  cursor: 'pointer',
  listStyle: 'none',
};
// 「ほかに N 件」: 版の見出し（枠と面のある畳む見出し）と見分けるため、枠も面も無い文字の行（高さ 44・15/600/--text-2）。
// 右に残りの項目の「どこの」を 13/--text-3 で（何が畳まれているかを開かずに分かる・2026-10-05 ui-critic 第 3 回）。
const restSummaryStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minHeight: 44,
  padding: 'var(--space-1) 0',
  boxSizing: 'border-box',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  color: 'var(--text-2)',
  lineHeight: 1.4,
  cursor: 'pointer',
  listStyle: 'none',
};
// 「ほかに N 件」と どこの を包む行。どこの が 12 字ぶん取れないとき（文字が大きいとき）は下の行へ回す。
const restLabelWrap = { flex: '1 1 auto', minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 'var(--space-3)' };
const restWhereStyle = {
  flex: '1 1 12em',
  minWidth: 0,
  textAlign: 'right',
  fontSize: 'var(--text-meta)',
  fontWeight: 400,
  color: 'var(--text-3)',
  ...wrapText,
};
const foldCountStyle = { marginLeft: 'auto', fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', whiteSpace: 'nowrap' };

const ROWS = [
  ['before', 'これまで'],
  ['after', 'これから'],
  ['impact', '影響'],
  ['intent', '意図'],
];

function ReleaseItem({ item }) {
  return (
    <li style={itemCardStyle}>
      <p style={whereStyle}>{withPhraseBreaks(item.where)}</p>
      <h5 style={whatStyle}>{phrased(item.what)}</h5>
      <dl style={rowsStyle}>
        {ROWS.map(([key, label]) => (
          <div key={key} style={rowStyle}>
            <dt style={labelStyle}>{label}</dt>
            <dd style={valueStyle}>{phrased(item[key])}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function ItemList({ items, keyPrefix }) {
  return (
    <ul style={itemListStyle}>
      {items.map((item, i) => <ReleaseItem key={`${keyPrefix}-${i}`} item={item} />)}
    </ul>
  );
}

// open: 開いておく件数（null＝全部）。残りは「ほかに N 件」で畳む。
function ReleaseItems({ release, open = null }) {
  const items = release.items;
  if (!open || items.length <= open) return <ItemList items={items} keyPrefix={release.id} />;
  const rest = items.slice(open);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <ItemList items={items.slice(0, open)} keyPrefix={release.id} />
      <details>
        <summary style={restSummaryStyle}>
          <span style={restLabelWrap}>
            <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{`ほかに\u00a0${rest.length}\u00a0件`}</span>
            <span style={restWhereStyle}>{withPhraseBreaks([...new Set(rest.map((it) => it.where))].join('・'))}</span>
          </span>
          {/* 大きさは文字に合わせる（em・文字サイズを最大にしても題とつり合う） */}
          <ChevronDown size="1.1em" aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        </summary>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <ItemList items={rest} keyPrefix={`${release.id}-rest`} />
        </div>
      </details>
    </div>
  );
}

// releases: 新しい順の版の配列。2 つ目からは畳む（多いと最初の版が下に押し流されるため）。
// openCount: いちばん新しい版で開いておく件数（null＝全部・設定の一覧）。
export function ReleaseNotesList({ releases, openCount = null }) {
  const list = Array.isArray(releases) ? releases.filter((r) => r && Array.isArray(r.items) && r.items.length) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {list.map((r, i) => (i === 0 ? (
        <section key={r.id} aria-label={releaseHeading(r)}>
          <h4 style={releaseHeadingStyle}>{withPhraseBreaks(releaseHeading(r))}</h4>
          <ReleaseItems release={r} open={openCount} />
        </section>
      ) : (
        <details key={r.id}>
          <summary style={foldSummaryStyle}>
            <span style={wrapText}>{withPhraseBreaks(releaseHeading(r))}</span>
            <span style={foldCountStyle}>{`${r.items.length}\u00a0件`}</span>
            <ChevronDown size="1.2em" aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </summary>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <ReleaseItems release={r} />
          </div>
        </details>
      )))}
    </div>
  );
}

// 更新したあと・「何が変わった？」で開いておく件数。
export const AUTO_OPEN_ITEMS = 3;

// mode: 'after'（更新したあと・既定）／'all'（設定から）／'upcoming'（Web の新しい版の中身・下に「更新する」）
export default function WhatsNewSheet({ releases, onClose, mode = 'after', onApply, layer = null }) {
  const upcoming = mode === 'upcoming';
  return (
    <BottomSheet
      title={upcoming ? '新しい版で変わること' : '新しくなったこと'}
      onClose={onClose}
      layer={layer}
      dismissLabel={upcoming ? 'キャンセル' : '完了'}
      footer={upcoming && onApply ? (
        <button type="button" style={{ ...btnPrimary, width: '100%' }} onClick={onApply}>更新する</button>
      ) : null}
    >
      <ReleaseNotesList releases={releases} openCount={mode === 'all' ? null : AUTO_OPEN_ITEMS} />
    </BottomSheet>
  );
}
