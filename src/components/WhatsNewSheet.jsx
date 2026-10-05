// 🆕 新しくなったこと — 版ごとに「どこの・何が・これまで → これから・影響・意図」を見せるシート（2026-10-05）。
//
// 開く場所は 3 つ（中身はどれも src/lib/releaseNotes.js と同じ）:
//   - 更新したあと、はじめて開いたときに 1 回だけ（App.jsx の useWhatsNew・見た版より新しい版だけ）
//   - 設定 → アプリ・サポート →「新しくなったこと」（全部・設定の上に重ねる＝layer="dialog"）
//   - Web の「アプリの新しい版があります」の「何が変わった？」（新しい版の中身・下に「更新する」）
//
// 見た目（DESIGN §5「新しくなったこと」）: 版ごとに見出し（20/600「10月5日の更新」）→ 12 → 項目のカード（間 12）。
// カードの中は 小さな見出し＝どこの（12/600/--text-2）→ 4 → 何が（17/600/--text）→ 8 → ラベル付きの行
// （15/--text-2・ラベル 600 の幅 4.5 字＋文（間 12・文字が大きいと文はラベルの下へ）・「これまで」「これから」「影響」「意図」・行の間 8）。2 つ目からの版は畳む見出しで畳む。

import { ChevronDown } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { withPhraseBreaks } from './TightBubble';
import { btnPrimary, groupTitle } from '../styles/ui';
import { releaseHeading } from '../lib/whatsNew';

const wrapText = { wordBreak: 'keep-all', overflowWrap: 'anywhere', lineBreak: 'strict' };

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

const whereStyle = { ...groupTitle, lineHeight: 1.3, ...wrapText };

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
  color: 'var(--text-2)',
};

const labelStyle = { margin: 0, flex: '0 0 4.5em', fontWeight: 600, whiteSpace: 'nowrap' };
const valueStyle = { margin: 0, flex: '1 1 10em', minWidth: 0, fontWeight: 400, ...wrapText };

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
      <h5 style={whatStyle}>{withPhraseBreaks(item.what)}</h5>
      <dl style={rowsStyle}>
        {ROWS.map(([key, label]) => (
          <div key={key} style={rowStyle}>
            <dt style={labelStyle}>{label}</dt>
            <dd style={valueStyle}>{withPhraseBreaks(item[key])}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function ReleaseItems({ release }) {
  return (
    <ul style={itemListStyle}>
      {release.items.map((item, i) => <ReleaseItem key={`${release.id}-${i}`} item={item} />)}
    </ul>
  );
}

// releases: 新しい順の版の配列。2 つ目からは畳む（多いと最初の版が下に押し流されるため）。
export function ReleaseNotesList({ releases }) {
  const list = Array.isArray(releases) ? releases.filter((r) => r && Array.isArray(r.items) && r.items.length) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {list.map((r, i) => (i === 0 ? (
        <section key={r.id} aria-label={releaseHeading(r)}>
          <h4 style={releaseHeadingStyle}>{withPhraseBreaks(releaseHeading(r))}</h4>
          <ReleaseItems release={r} />
        </section>
      ) : (
        <details key={r.id}>
          <summary style={foldSummaryStyle}>
            <span style={wrapText}>{withPhraseBreaks(releaseHeading(r))}</span>
            <span style={foldCountStyle}>{`${r.items.length} 件`}</span>
            <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </summary>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <ReleaseItems release={r} />
          </div>
        </details>
      )))}
    </div>
  );
}

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
      <ReleaseNotesList releases={releases} />
    </BottomSheet>
  );
}
