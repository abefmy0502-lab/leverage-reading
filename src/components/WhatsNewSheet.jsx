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

import { Fragment } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { withPhraseBreaks } from './TightBubble';
import { btnPrimary, btnLink, groupTitle } from '../styles/ui';
import { releaseHeading, groupReleasesByDay } from '../lib/whatsNew';

const wrapText = { wordBreak: 'keep-all', overflowWrap: 'anywhere', lineBreak: 'strict' };

// 句読点・閉じかっこは直前の 1 字とつないで折り返さない（文字を大きくして 1 文節が 1 行に収まらないとき、
// 語の途中で割る最後の手段＝overflow-wrap が「。」だけを次の行の頭へ送っていた・2026-10-05）。
const PUNCT_TAIL_RE = /([^\s\u00a0][。、」』）]+)/;
const nowrap = { whiteSpace: 'nowrap' };
// 「10月8日」「2026年10月9日」「◯月1日」は途中で割らない（keepDateTogether・2026-10-09 ui-critic）。
// かぎかっこの中の 8 字以下の画面の言葉（「日付を選ぶ」「見る」など）もひとまとまり（かっこごと割らない）。
const DATE_RE = /((?:\d{4}年)?[\d◯]{1,2}月\d{1,2}日)/;
// 閉じかっこの後ろの助詞・「だけ」・読点までひとまとまり（「「この本を共有」／で、」と割れていた・2026-11-23 ui-critic）。
const KEEP_RE = new RegExp(`(${DATE_RE.source.slice(1, -1)}|「[^「」]{1,8}」(?:だけ)?[をにでとがはのへもや]?[、。]?)`);
function phrased(text) {
  const t = String(text ?? '');
  if (KEEP_RE.test(t)) {
    return t.split(KEEP_RE).map((p, i) => (i % 2 === 1
      ? <span key={`d${i}`} style={nowrap}>{p}</span>
      : <Fragment key={`t${i}`}>{phrasedPlain(p)}</Fragment>));
  }
  return phrasedPlain(t);
}
function phrasedPlain(text) {
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
  // 右の内側を版の畳む見出し（内側 12＋枠 1）とそろえ、▾ の列を上下で合わせる
  padding: 'var(--space-1) calc(var(--space-3) + 1px) var(--space-1) 0',
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
  // 左から読む並び（下の行へ回っても行頭が「ほかに」とそろう）
  textAlign: 'left',
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

// 「開く ›」（2026-11-23）: 項目に open（その画面の決まった名前・releaseNotes.js の OPEN_TARGETS）があり、
//   開いた場所がその画面へ移れる（openTargets に入っている）ときだけ、カードのいちばん下に文字ボタン。
//   移れない場所（Web の新しい版の知らせなど）では出さない＝押しても何も起きないボタンを作らない。
const openBtnStyle = {
  ...btnLink,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  margin: 'var(--space-1) 0 calc(-1 * var(--space-2)) calc(-1 * var(--space-1))',
};

function ReleaseItem({ item, opener }) {
  const canOpen = !!(opener && typeof item.open === 'string' && opener.targets.includes(item.open));
  return (
    <li style={itemCardStyle}>
      <p style={whereStyle}>{withPhraseBreaks(item.where)}</p>
      <h5 style={whatStyle}>{phrased(item.what)}</h5>
      <dl style={rowsStyle}>
        {ROWS.map(([key, label]) => (
          <div key={key} style={rowStyle}>
            <dt style={labelStyle}>{label}</dt>
            {/* 読んでほしいのは「これから」。ほかの 3 つは --text-2 で一歩下げる（項目が長く、どこが大事か分かりにくかった・2026-11-18 ui-critic）。 */}
            <dd style={key === 'after' ? valueStyle : { ...valueStyle, color: 'var(--text-2)' }}>{phrased(item[key])}</dd>
          </div>
        ))}
      </dl>
      {canOpen && (
        <button type="button" style={openBtnStyle} onClick={() => opener.onOpen(item.open)} aria-label={`${item.where}を開く`}>
          開く
          <ChevronRight size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
        </button>
      )}
    </li>
  );
}

function ItemList({ items, keyPrefix, opener }) {
  return (
    <ul style={itemListStyle}>
      {items.map((item, i) => <ReleaseItem key={`${keyPrefix}-${i}`} item={item} opener={opener} />)}
    </ul>
  );
}

// open: 開いておく件数（null＝全部）。残りは「ほかに N 件」で畳む。
function ReleaseItems({ release, open = null, opener = null }) {
  const items = release.items;
  if (!open || items.length <= open) return <ItemList items={items} keyPrefix={release.id} opener={opener} />;
  const rest = items.slice(open);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <ItemList items={items.slice(0, open)} keyPrefix={release.id} opener={opener} />
      <details>
        <summary style={restSummaryStyle}>
          <span style={restLabelWrap}>
            <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{`ほかに\u00a0${rest.length}\u00a0件`}</span>
            <span style={restWhereStyle}>{withPhraseBreaks([...new Set(rest.map((it) => it.where))].join('・'))}</span>
          </span>
          {/* 大きさは文字に合わせる（em・文字サイズを最大にしても題とつり合う） */}
          <ChevronDown size="1.2em" aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        </summary>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <ItemList items={rest} keyPrefix={`${release.id}-rest`} opener={opener} />
        </div>
      </details>
    </div>
  );
}

// 同じ日の版をまとめると 1 日に 20 件を超えることがあるので、日ごとに上の 8 件だけ開き、残りは「ほかに N 件」（2026-10-09 ui-critic）。
const DAY_OPEN_ITEMS = 8;

// releases: 新しい順の版の配列。2 つ目からは畳む（多いと最初の版が下に押し流されるため）。
// openCount: いちばん新しい版で開いておく件数（null＝日ごとに上の 8 件・設定の一覧）。
// opener: { targets: [...], onOpen(target) } — 「開く ›」で移れる画面（無ければ出さない）。
export function ReleaseNotesList({ releases, openCount = null, opener = null }) {
  // 同じ日の版は 1 つの見出しにまとめる（「10月8日の更新」が 5 つ並ばないように・2026-10-09）。
  const list = groupReleasesByDay(Array.isArray(releases) ? releases : []).filter((r) => r && Array.isArray(r.items) && r.items.length);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {list.map((r, i) => (i === 0 ? (
        <section key={r.id} aria-label={releaseHeading(r)}>
          <h4 style={releaseHeadingStyle}>{withPhraseBreaks(releaseHeading(r))}</h4>
          <ReleaseItems release={r} open={openCount ?? DAY_OPEN_ITEMS} opener={opener} />
        </section>
      ) : (
        <details key={r.id}>
          <summary style={foldSummaryStyle}>
            <span style={wrapText}>{withPhraseBreaks(releaseHeading(r))}</span>
            <span style={foldCountStyle}>{`${r.items.length}\u00a0件`}</span>
            <ChevronDown size="1.2em" aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </summary>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <ReleaseItems release={r} open={DAY_OPEN_ITEMS} opener={opener} />
          </div>
        </details>
      )))}
    </div>
  );
}

// 更新したあと・「何が変わった？」で開いておく件数。
export const AUTO_OPEN_ITEMS = 3;

// mode: 'after'（更新したあと・既定）／'all'（設定から）／'upcoming'（Web の新しい版の中身・下に「更新する」）
// onOpen(target) / openTargets: 項目の「開く ›」で移れる画面（releaseNotes.js の OPEN_TARGETS のうち、開いた場所が扱えるもの）。
//   呼ぶ側がシートを閉じてから移る。新しい版の中身（upcoming）はまだ入っていない画面なので出さない。
export default function WhatsNewSheet({ releases, onClose, mode = 'after', onApply, layer = null, onOpen = null, openTargets = [] }) {
  const upcoming = mode === 'upcoming';
  const opener = !upcoming && onOpen && openTargets.length ? { targets: openTargets, onOpen } : null;
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
      <ReleaseNotesList releases={releases} openCount={mode === 'all' ? null : AUTO_OPEN_ITEMS} opener={opener} />
    </BottomSheet>
  );
}
