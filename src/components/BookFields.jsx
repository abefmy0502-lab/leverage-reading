// 🏷 本の分野（2026-10-11・lib/bookFields.js・SPEC §2 / §4・DESIGN §5「分野」）。
//
//   BookFieldsInput  … 本の追加・編集画面の「分野」欄。付いている分野のチップ（押しても選ぶシート）＋「変更」（押すと BookFieldsSheet）。
//                      サーバーの見立てを待っている間は骨組み・失敗したら 1 行（pending / failed・2026-10-11 ui-critic）
//   BookFieldsSheet  … 分野を選ぶシート。大分類 4 つ（ビジネス・ものの見方・自分を伸ばす・そのほか）の見出し → 分野のチップ（選ぶためのチップ 44）・3 つまで
//   BookFieldLinks   … 本の詳細の分野（押すと、すべての本をその分野で絞る）
//   BookFolderLinks  … 本の詳細のフォルダ（押すと、すべての本をそのフォルダで絞る・右に「変更」／「フォルダに入れる」・2026-10-11）
//   BookFieldsRecord … 振り返り › 記録の「分野」（大分類 4 つをいつも全部・本のある分野は行＝本とメモの数・本がまだ無い分野は
//                      大分類ごとに 1 行の名前の並び＝押すと AI 選書。読書の時間は「読書の時間」カードの「分野ごと」へ一本化・2026-10-11）
//
// 反ゲーミフィケーション: 点数・%・順位・「あと N 冊」・「埋めよう」は出さない。
import { useState } from 'react';
import SegThumb from './SegThumb';
import { Check, ChevronRight, Search } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { Chip } from './formPrimitives';
import { withPhraseBreaks } from './TightBubble';
import { SkeletonBlock } from './Skeleton';
import { useHaptic } from '../hooks/useHaptic';
import { btnLink, btnPrimary, groupTitle } from '../styles/ui';
import { BOOK_FIELD_GROUPS, FIELD_MAX } from '../lib/bookFields';

const chipRow = { display: 'flex', flexWrap: 'wrap', rowGap: 'var(--space-2)', columnGap: 'var(--space-2)' };
// 付いている分野（押すと選ぶシート・選ぶシートの選択中と同じ色）。
const fieldTag = {
  display: 'inline-flex', alignItems: 'center', minHeight: 'var(--tap-min)', boxSizing: 'border-box',
  padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 'var(--text-sub)', fontWeight: 600,
};
const note = { margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };

// fields: 付いている分野（一覧の順）/ onChange(fields) / auto: アプリが選んだまま（本人が触っていない）
// autoFrom: 'info'＝本の紹介（サーバー・紹介文）から選んだ／'title'＝書名から
// pending: サーバーが本の分野を見立てている間（分野がまだ無いとき）/ failed: 見立てられなかった（分野がまだ無いとき）
export function BookFieldsInput({ fields = [], onChange, auto = false, autoFrom = 'title', pending = false, failed = false }) {
  const [open, setOpen] = useState(false);
  const waiting = pending && !fields.length;
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <p id="book-fields-label" style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>分野</p>
      {/* 付いている分野（選択中の色の面・押しても選ぶシート）＋文字ボタン「変更」／「分野を選ぶ」（2026-10-11 ui-critic）。 */}
      <div style={{ ...chipRow, alignItems: 'center' }} role="group" aria-labelledby="book-fields-label" aria-busy={waiting || undefined}>
        {fields.map((f) => (
          <button key={f} type="button" style={fieldTag} onClick={() => setOpen(true)} aria-label={`分野「${f}」を選び直す`}>{f}</button>
        ))}
        {waiting && (
          // 骨組みは「分野を選ぶ」の後ろ（order）＝読み込み中 → 失敗で文字ボタンの位置が動かない・行の高さも --tap-min のまま（2026-10-11 ui-critic）
          <span data-fields-pending="" aria-hidden="true" style={{ display: 'inline-flex', gap: 'var(--space-2)', order: 1 }}>
            <SkeletonBlock width="calc(var(--space-16) + var(--space-8))" height="var(--tap-min)" radius="var(--radius)" />
            <SkeletonBlock width="calc(var(--space-16) * 2)" height="var(--tap-min)" radius="var(--radius)" />
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={fields.length ? `分野を変更（いま ${fields.join('、')}）` : '分野を選ぶ'}
          // 自動で選ぶ前の何もない状態（分野なし・待っていない・失敗していない）だけ文字ボタンだけの行: 押せる高さ 44 の上下の余りを行の外へ出し、見出し → 文字を 8 に
          //   （フォルダの見出し → 入力欄と同じ間隔に見せる・2026-10-11 ui-critic）
          style={{ ...btnLink, minWidth: 'var(--tap-min)', justifyContent: 'center', ...(fields.length || waiting || failed ? {} : { marginLeft: 'calc(-1 * var(--space-1))', marginTop: 'calc(-1 * var(--space-3))', marginBottom: 'calc(-1 * var(--space-3))' }) }}
        >
          {fields.length ? '変更' : '分野を選ぶ'}
        </button>
        {/* 読み込み中も「分野を選ぶ」は出したまま（待たずに自分で選べる・選んだらあとで届いた答えで上書きしない＝App.jsx・2026-10-11 ui-critic） */}
      </div>
      {waiting && <p style={note} role="status">{withPhraseBreaks('本の紹介から分野を選んでいます…')}</p>}
      {!waiting && failed && !fields.length && <p style={note} role="status">{withPhraseBreaks('自動では選べませんでした。')}</p>}
      {auto && fields.length > 0 && <p style={note}>{withPhraseBreaks(autoFrom === 'info' ? '本の紹介から自動で選びました。' : '書名などから自動で選びました。')}</p>}
      {open && (
        <BookFieldsSheet
          selected={fields}
          onClose={() => setOpen(false)}
          onDone={(next) => { setOpen(false); onChange(next); }}
        />
      )}
    </div>
  );
}

export function BookFieldsSheet({ selected = [], onDone, onClose }) {
  const [picked, setPicked] = useState(() => [...selected]);
  const haptic = useHaptic();
  const full = picked.length >= FIELD_MAX;
  const toggle = (name) => {
    if (!picked.includes(name) && picked.length >= FIELD_MAX) { haptic.warning(); return; } // 3 つ選んだあとのほかのチップ
    setPicked((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : (cur.length >= FIELD_MAX ? cur : [...cur, name])));
  };
  const footer = (
    <button type="button" style={{ ...btnPrimary, width: '100%' }} onClick={() => onDone(picked)}>保存</button>
  );
  return (
    // 選べる数の補足は題の行の直下に固定（スクロールで隠れない・3 つ選んだら外し方を言う・読み上げにも出る・2026-10-11 ui-critic）
    <BottomSheet
      title="分野"
      onClose={onClose}
      footer={footer}
      dismissLabel="キャンセル"
      subheader={(
        <p data-fields-limit="" style={{ margin: 0, fontSize: 'var(--text-meta)', color: full ? 'var(--text)' : 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }} aria-live="polite">
          {withPhraseBreaks(full ? `選べるのは ${FIELD_MAX} つまでです。ほかを選ぶときは、どれかを外してください。` : `${FIELD_MAX} つまで選べます`)}
        </p>
      )}
    >
      {BOOK_FIELD_GROUPS.map((c, ci) => (
        <section key={c.id} style={{ marginTop: ci === 0 ? 0 : 'var(--space-6)' }} aria-label={c.name}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)' }}>{c.name}</h3>
          {/* 大分類 4 つの見出し＋チップだけ（中分類は 2026-10-11 にやめた）。 */}
          <div style={{ ...chipRow, marginTop: 'var(--space-2)' }} role="group" aria-label={c.name}>
            {c.fields.map((f) => {
              const on = picked.includes(f.name);
              const off = !on && full;
              return (
                <Chip
                  key={f.name}
                  size="select"
                  wrap
                  shrink
                  active={on}
                  aria-pressed={on}
                  aria-disabled={off || undefined}
                  onClick={() => toggle(f.name)}
                >
                  {on && <Check size="1em" aria-hidden="true" />}
                  <span style={off ? { color: 'var(--text-3)' } : undefined}>{withPhraseBreaks(f.name, { scriptBreaks: true })}</span>
                </Chip>
              );
            })}
          </div>
        </section>
      ))}
    </BottomSheet>
  );
}

// 本の詳細の分野・フォルダの行（2026-11-09 に作り直し・オーナー「もっと UI よくできる」）。
//   見出し列（幅 64・13/--text-2・SPEC §2）＋値の列（チップ・折り返す）＋操作の列（文字ボタン「変更」・いつも 1 行目の右端）。
//   前は 1 つの flex に見出しも操作も入っていたので、文字を大きくすると「変更」だけが見出しの下へ落ちて行の間が 44 空いていた。
//   操作を 3 列目に固定すると、チップがいくつ折り返しても「変更」は孤立した行にならない（ui-critic 18/20 の指摘 1）。
//   チップの見た目は 32・押せる範囲は 44（折り返した行の見た目の間は 44 − 32 ＝ 12）。
//   見出しは 1 行目の中央にそろえ、上下の余り（押せる範囲 − 見た目）は負の余白で行の外へ。
// 「・」を前の字につなぐ（行頭に「・」が来ない＝「リーダーシップ／・人材育成」と割れていた・2026-11-18）。
const glueMiddot = (t) => String(t || '').replace(/(.)・/g, '$1\u2060・');
const detailRowLabel = { flexShrink: 0, minWidth: 'max(var(--space-16), 4em)', whiteSpace: 'nowrap', fontSize: 'var(--text-meta)', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', minHeight: 'var(--tap-min)' }; // 文字が大きくても見出しを割らない（「フォ／ルダ」・2026-11-18）
const detailTapExtra = 'calc((var(--space-8) - var(--tap-min)) / 2)'; // 押せる範囲 44 と見た目 32 の差の半分（負）
// 「変更」の文字の右端を右の余白 16 にそろえる（押せる幅 44 は左へ伸ばす・2026-11-09 ui-critic）
const detailActionBtn = { ...btnLink, fontSize: 'var(--text-meta)', minWidth: 'var(--tap-min)', justifyContent: 'flex-end', padding: 0, flexShrink: 0, alignSelf: 'flex-start' };

function DetailRow({ label, ariaLabel, action = null, children, ...rest }) {
  // 文字が大きいとき（ルート 22px 以上）は、見出しと「変更」を 1 行目、値（チップ）を 2 行目の全幅に
  //  （値の列が狭く「リーダーシップ／・人材育成」と割れていた・2026-11-18 文字最大の点検）。
  const stacked = (() => { try { return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 22; } catch { return false; } })();
  return (
    <div
      {...rest}
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex', flexWrap: stacked ? 'wrap' : 'nowrap', alignItems: 'flex-start', columnGap: 'var(--space-2)',
        // 1 行目の上の余りも行の外へ（見出しの文字と前の行の間を 8 に）
        // 1 行目の上の余りも行の外へ（前の行との見た目の間は 8）。続く行も同じ＝前の行の下の余り（−6）とは margin の相殺で片方しか効かず、
        // 見た目 8・押せる箱は接するだけで重ならない（2026-11-09 ui-critic）
        // 縦に積むときは行と行の間を 16（見出し→自分のチップより広く・2026-11-18 ui-critic）。
        marginTop: stacked ? `calc(var(--space-4) + ${detailTapExtra})` : `calc(var(--space-2) + ${detailTapExtra})`,
        marginBottom: detailTapExtra,
      }}
    >
      <span aria-hidden="true" style={stacked ? { ...detailRowLabel, minHeight: 'auto', alignSelf: 'center' } : detailRowLabel}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 'var(--space-2)', rowGap: 0, minWidth: 0, flex: stacked ? '1 1 100%' : '1 1 0', order: stacked ? 3 : 0, marginTop: stacked ? detailTapExtra : 0 }}>
        {children}
      </div>
      {action && stacked ? <span style={{ marginLeft: 'auto', order: 2, display: 'inline-flex' }}>{action}</span> : action}
    </div>
  );
}

// 本の詳細: 付いている分野（押すと、すべての本をその分野で絞る）。
// onEdit: 「変更」（分野を選ぶシート）。フォルダの行と同じ形にして、2 行で操作の有無が違わないように（2026-10-21 ui-critic）。
export function BookFieldLinks({ fields = [], onPick, onEdit = null }) {
  if (!fields.length) return null;
  return (
    <DetailRow
      data-book-fields=""
      label="分野"
      ariaLabel="分野"
      action={onEdit && (
        <button type="button" onClick={onEdit} aria-label="分野を変更" style={detailActionBtn}>
          変更
        </button>
      )}
    >
      {fields.map((f) => (
        onPick
          // 長い分野の名前（起業・テクノロジー など）は「・」の後ろで折り返す＝「変更」に重ならない（2026-11-17 ui-critic）
          ? <Chip key={f} shrink wrap onClick={() => onPick(f)} aria-label={`分野「${f}」の本を見る`}>{withPhraseBreaks(glueMiddot(f), { scriptBreaks: true })}</Chip>
          : <span key={f} style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>{f}</span>
      ))}
    </DetailRow>
  );
}

// 本の詳細: 入っているフォルダ（押すと、すべての本をそのフォルダで絞る）＋文字ボタン「変更」（フォルダが無ければ「フォルダに入れる」）。
//   形は BookFieldLinks と同じ（分野の行のすぐ下でも、行の間は同じ 8）。
//   全状態の本で出す（フォルダは本人が自由に作る分け方・2026-10-11 オーナー「この画面でもフォルダ分けできるように」）。
export function BookFolderLinks({ folders = [], onPick, onEdit }) {
  return (
    <DetailRow
      data-book-folders=""
      label="フォルダ"
      ariaLabel="フォルダ"
      action={onEdit && folders.length > 0 && (
        <button type="button" onClick={onEdit} aria-label={`フォルダを変更（いま ${folders.join('、')}）`} style={detailActionBtn}>
          変更
        </button>
      )}
    >
      {folders.map((f) => (
        // 分野のチップと同じく折り返す（文字が大きいと「会社の課題…」と切れていた・2026-11-18）
        <Chip key={f} shrink wrap onClick={() => onPick?.(f)} aria-label={`フォルダ「${f}」の本を見る`}>
          {withPhraseBreaks(glueMiddot(f), { scriptBreaks: true })}
        </Chip>
      ))}
      {onEdit && folders.length === 0 && (
        // フォルダが無いときは見出し「フォルダ」＋文字ボタンだけ（文字の左端を値の列＝チップの左端にそろえる）
        <button
          type="button"
          onClick={onEdit}
          aria-label="フォルダに入れる"
          // 文字の左端をチップの左端（値の列）にそろえる（負の余白で 4 ずれていた・2026-11-18 ui-critic）。
          style={{ ...detailActionBtn, alignSelf: 'auto', paddingLeft: 0 }}
        >
          フォルダに入れる
        </button>
      )}
    </DetailRow>
  );
}

// 振り返り › 記録の「分野」。record: lib/bookFields.js の buildFieldRecord の結果。
// records: { all, done, active }（すべて・読了・積読・読書中ごとの buildFieldRecord の結果・2026-11-26 オーナー「読了、積読・読書中で分けて見れるように」）。
//   2 つ以上に分野の本があるときだけ、題の下に切り替え（読書の時間の「今月｜これまで」と同じ下線の形）。押すと下の行が替わり、
//   行を押すとその状態の本だけで、すべての本をその分野で絞る（onOpenField(分野, 'done' | 'active' | undefined)）。
//   「まだ本がない分野」は「すべて」のときだけ（読了だけで見て「まだ本がない」と言うと、積読の本があるのに無いと読める）。
const FIELD_SCOPES = [
  { v: 'all', label: 'すべて' },
  { v: 'done', label: '読了' },
  { v: 'active', label: '積読・読書中' },
];
const scopeBtn = (on) => ({
  minHeight: 'var(--tap-min)', padding: 0, border: 'none', borderBottom: '2px solid transparent', borderRadius: 0,
  background: 'transparent', color: on ? 'var(--text)' : 'var(--text-2)', fontFamily: 'inherit', fontSize: 'var(--text-sub)',
  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
});
export function BookFieldsRecord({ record, records, onOpenField, onFindBooks }) {
  const [scope, setScope] = useState('all');
    const scopes = records ? FIELD_SCOPES.filter((x) => x.v === 'all' || records[x.v]?.any) : [];
  const showScopes = scopes.length >= 2;
  const cur = showScopes && scopes.some((x) => x.v === scope) ? scope : 'all';
  const shown = records ? records[cur] : record;
  const filtered = cur !== 'all';
  // 読了・積読・読書中で見ているときは、本のある大分類だけ（大分類の全体の地図は「すべて」で見る）。
  const groups = filtered ? shown.groups.filter((c) => c.fields.length > 0) : shown.groups;
  // 棒の長さは、いちばん本の多い分野を 1 とした割合（本棚の形＝どこに本が寄っているかを一目で・2026-11-26 オーナー「直感的に」）。
  // 読了・積読・読書中で見ているときも「すべて」と同じものさし（状態を替えて見比べると、棒がそのまま本棚のどれだけかに読める・2026-11-26 ui-critic）。
  const scaleGroups = records ? records.all.groups : groups;
  const maxBooks = scaleGroups.reduce((m, g) => g.fields.reduce((mm, f) => Math.max(mm, f.books || 0), m), 0);
  return (
    <section
      data-book-fields-record=""
      aria-labelledby="book-fields-record-title"
      style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' }}
    >
      <h3 id="book-fields-record-title" style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>分野</h3>
      {showScopes && (
        <div role="group" aria-label="分野を見る本（下の行が替わります）" style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-6)', marginTop: 'var(--space-1)' }}>
          <SegThumb activeKey={cur} activeSelector='[aria-pressed="true"]' variant="underline" />
          {scopes.map((x) => (
            <button key={x.v} type="button" aria-pressed={cur === x.v} onClick={() => setScope(x.v)} style={scopeBtn(cur === x.v)}>
              {x.label}
              {x.v !== 'all' && <span style={{ marginLeft: 'var(--space-1)', fontWeight: 400, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{records[x.v].total}</span>}
            </button>
          ))}
        </div>
      )}
      {groups.map((c, ci) => (
        // 大分類の間は 24（見出しの下の最初だけ 16・2026-10-11 ui-critic）
        <div key={c.id} data-field-group={c.id} style={{ marginTop: ci === 0 ? 'var(--space-4)' : 'var(--space-6)' }}>
          {/* 大分類の行: 左に名前、右に本の合計（その大分類に本があるときだけ・2026-11-09 オーナー「UI を磨きたい」＝どの大分類に本が寄っているかが一目で） */}
          <p style={{ ...groupTitle, margin: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
            <span>{c.name}</span>
            {/* 本の合計は、その大分類の分野を 1 つでも持つ本の数（2 つの分野の本を二重に数えない）。分野が 1 つだけの大分類は、
                すぐ下の行と同じ数になるので出さない（2026-11-17 ui-critic） */}
            {c.fields.length > 0 && c.size > 1 && !(filtered && c.fields.length === 1) && <span style={{ fontWeight: 400, fontSize: 'var(--text-meta)', letterSpacing: 0, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', paddingRight: 'calc(var(--text-sub) * 1.1 + var(--space-2))' }}>{filtered ? `${c.books} 冊` : `本棚 ${c.books} 冊`}</span>}
          </p>
          {c.fields.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 'var(--space-1) 0 0', padding: 0 }}>
            {c.fields.map((f, i) => {
              const sub = [];
              if (f.memos > 0) sub.push(`メモ ${f.memos} 件`);
              // ★ 評価の平均（評価の付いた本が 2 冊以上のときだけ・小数 1 桁・押すと評価順で並ぶ・2026-10-11）
              const avg = Number.isFinite(f.avgRating) ? `★${f.avgRating.toFixed(1)}` : null;
              if (avg) sub.push(avg);
              const ratio = maxBooks > 0 ? (f.books || 0) / maxBooks : 0;
              return (
                <li key={f.name} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--separator)' }}>
                  <button
                    type="button"
                    onClick={() => onOpenField?.(f.name, filtered ? cur : undefined)}
                    aria-label={`${f.name}・${filtered ? FIELD_SCOPES.find((x) => x.v === cur).label : '本棚'} ${f.books} 冊${sub.length ? `・${sub.map((x) => (x === avg ? `評価の平均 ${f.avgRating.toFixed(1)}` : x)).join('・')}` : ''}・本を見る`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', minHeight: 'var(--tap-min)',
                      padding: 'var(--space-2) 0', background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 'var(--text-sub)', textAlign: 'left', color: 'var(--text)',
                    }}
                  >
                    {/* 1 行目＝分野の名前（左）と冊数（右）・その下に冊数の棒・あれば「メモ N 件 · ★4.2」（2026-11-26 作り直し）。
                        分野ごとの読書の時間は「読書の時間」カードの「分野ごと」に一本化した（同じ数を 2 か所に出さない・2026-10-11 オーナー裁定）。 */}
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 'var(--space-3)' }}>
                        <span style={{ flex: '1 1 auto', minWidth: 'min(100%, 8em)', fontSize: 'var(--text-sub)', lineHeight: 1.35, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{f.name}</span>
                        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{`${f.books} 冊`}</span>
                      </span>
                      <FieldBar ratio={ratio} />
                      {sub.length > 0 && (
                        <span style={{ fontSize: 'var(--text-meta)', lineHeight: 1.3, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                          {/* 「·」は前の塊の末尾に付け、折り返すのは記号の後ろの空白だけ（行頭に「·」を出さない・2026-10-11 ui-critic）。 */}
                          {sub.map((seg, k, all) => (
                            <span key={k} style={{ whiteSpace: 'nowrap' }}>{k ? ' ' : ''}{seg}{k < all.length - 1 ? '\u00A0·' : ''}</span>
                          ))}
                        </span>
                      )}
                    </span>
                    <ChevronRight size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                </li>
              );
            })}
          </ul>
          )}
          {/* 本がまだ無い分野は、大分類ごとにまとめて 1 行（全体の 14 分野が見える・押すと AI 選書の最初の悩みに入れて開く＝送らない・2026-10-11 オーナー）。 */}
          {!filtered && c.empty?.length > 0 && <EmptyFieldsLine names={c.empty} divided={c.fields.length > 0} onFindBooks={onFindBooks} />}
        </div>
      ))}
    </section>
  );
}

// 冊数の細い棒（読書の時間の「分野ごと」と同じ形＝高さ 6・溝 --fill・中身はアクセントを 65% に薄めた色・角丸 3＝グラフの形の例外）。
const FIELD_BAR_SOFT = 'color-mix(in srgb, var(--accent) 65%, var(--surface))';
function FieldBar({ ratio }) {
  const pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
  return (
    <span aria-hidden="true" style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--fill)', overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${pct}%`, minWidth: pct > 0 ? 3 : 0, height: '100%', borderRadius: 3, background: FIELD_BAR_SOFT }} />
    </span>
  );
}

// 本がまだ無い分野。見出し「まだ本がない分野」（12/--text-3）を 1 行にし、その下 4 に探す印つきのチップを折り返す。
//   チップは塗らない（枠 --border・文字 --text-2・名前の前に虫めがね）＝押すと探しに行く（AI 選書）と分かり、
//   自分の本がある行より弱く、本の詳細の分野チップ（絞り込み）とも別物に見える（DESIGN §5「探す印のチップ」・2026-10-11 ui-critic）。
//   区切り線 → 見出しは 12・チップの行の間は 12（押せる範囲 44・見た目 32）・最後の行の下の余りは行の外へ。
// onFindBooks が無ければ名前を文字で並べるだけ。
const tapExtra = 'calc((var(--space-8) - var(--tap-min)) / 2)';
function EmptyFieldsLine({ names, divided, onFindBooks }) {
  return (
    <div
      data-empty-fields=""
      role="group"
      aria-label="まだ本がない分野"
      style={{
        marginTop: divided ? 0 : 'var(--space-2)',
        paddingTop: divided ? 'var(--space-3)' : 0,
        borderTop: divided ? '1px solid var(--separator)' : 'none',
      }}
    >
      {/* 大分類の名前（12/600/--text-2）より弱く（13 だと大分類より強く見えた・2026-11-18 ui-critic） */}
      <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--text-3)', lineHeight: 1.5 }}>まだ本がない分野</p>
      <div
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 'var(--space-2)', rowGap: 0,
          marginTop: `calc(var(--space-1) + ${tapExtra})`,
          marginBottom: tapExtra,
        }}
      >
        {names.map((f) => (
          onFindBooks
            ? <FindFieldChip key={f} onClick={() => onFindBooks([f])} aria-label={`${f}の本を探す（AI 選書）`}>{f}</FindFieldChip>
            : <span key={f} style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 'var(--tap-min)' }}>{f}</span>
        ))}
      </div>
    </div>
  );
}

// 探す印のチップ（塗らない・枠 --border・文字 --text-2・虫めがね 0.95em・見た目 32・押せる範囲 44・長い名前は折り返す）。
function FindFieldChip({ onClick, children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      // 上下に（44 − 32）/ 2 ずつの余りをいつも持たせる＝文字を大きくしてチップが 32 より高くなっても、行の間は 12 のまま
      style={{ display: 'inline-flex', alignItems: 'center', minHeight: 'var(--tap-min)', minWidth: 'var(--tap-min)', maxWidth: '100%', boxSizing: 'border-box', padding: 'calc((var(--tap-min) - var(--space-8)) / 2) 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 'var(--space-8)', maxWidth: '100%', boxSizing: 'border-box',
          padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent',
          fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.3, textAlign: 'left', wordBreak: 'keep-all', overflowWrap: 'anywhere',
        }}
      >
        <Search size="0.95em" aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>{children}</span>
      </span>
    </button>
  );
}
