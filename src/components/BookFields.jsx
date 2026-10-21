// 🏷 本の分野（2026-10-11・lib/bookFields.js・SPEC §2 / §4・DESIGN §5「分野」）。
//
//   BookFieldsInput  … 本の追加・編集画面の「分野」欄。付いている分野のチップ（押しても選ぶシート）＋「変更」（押すと BookFieldsSheet）。
//                      サーバーの見立てを待っている間は骨組み・失敗したら 1 行（pending / failed・2026-10-11 ui-critic）
//   BookFieldsSheet  … 分野を選ぶシート。大分類 4 つ（仕事・自分と生活・教養・文芸・エンタメ）の見出し → 分野のチップ（選ぶためのチップ 44）・3 つまで
//   BookFieldLinks   … 本の詳細の分野（押すと、すべての本をその分野で絞る）
//   BookFolderLinks  … 本の詳細のフォルダ（押すと、すべての本をそのフォルダで絞る・右に「変更」／「フォルダに入れる」・2026-10-11）
//   BookFieldsRecord … 振り返り › 記録の「分野」（大分類 4 つをいつも全部・本のある分野は行＝本とメモの数・本がまだ無い分野は
//                      大分類ごとに 1 行の名前の並び＝押すと AI 選書。読書の時間は「読書の時間」カードの「分野ごと」へ一本化・2026-10-11）
//
// 反ゲーミフィケーション: 点数・%・順位・「あと N 冊」・「埋めよう」は出さない。
import { useState } from 'react';
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
    <button type="button" style={{ ...btnPrimary, width: '100%' }} onClick={() => onDone(picked)}>決定</button>
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
                  active={on}
                  aria-pressed={on}
                  aria-disabled={off || undefined}
                  onClick={() => toggle(f.name)}
                >
                  {on && <Check size="1em" aria-hidden="true" />}
                  <span style={off ? { color: 'var(--text-3)' } : undefined}>{f.name}</span>
                </Chip>
              );
            })}
          </div>
        </section>
      ))}
    </BottomSheet>
  );
}

// 本の詳細の分野・フォルダの行の見出し（13/--text-2・幅をそろえて値の列を合わせる・2026-10-11 ui-critic）。
//   幅は em（文字を大きくしても「フォルダ」が 1 行に入り、分野の行と値の列がそろう・2026-10-11 第 3 回の採点）。
const detailRowLabel = { flexShrink: 0, minWidth: '4.5em', fontSize: 'var(--text-meta)', color: 'var(--text-2)' };

// 本の詳細: 付いている分野（押すと、すべての本をその分野で絞る）。
// onEdit: 「変更」（本の編集画面の分野へ）。フォルダの行と同じ形にして、2 行で操作の有無が違わないように（2026-10-21 ui-critic）。
export function BookFieldLinks({ fields = [], onPick, onEdit = null }) {
  if (!fields.length) return null;
  return (
    // チップの見た目は 32（--space-8）・押せる範囲は 44。下の余りは負の余白で行の外へ（見た目の間隔をそろえる）。
    <div data-book-fields="" role="group" aria-label="分野" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 'var(--space-2)', marginTop: 'var(--space-2)', marginBottom: 'calc((var(--space-8) - var(--tap-min)) / 2)' }}>
      <span aria-hidden="true" style={detailRowLabel}>分野</span>
      {fields.map((f) => (
        onPick
          ? <Chip key={f} onClick={() => onPick(f)} aria-label={`分野「${f}」の本を見る`}>{f}</Chip>
          : <span key={f} style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>{f}</span>
      ))}
      {onEdit && (
        <button type="button" onClick={onEdit} aria-label="分野を変更" style={{ ...btnLink, fontSize: 'var(--text-meta)', minWidth: 'var(--tap-min)', justifyContent: 'center' }}>
          変更
        </button>
      )}
    </div>
  );
}

// 本の詳細: 入っているフォルダ（押すと、すべての本をそのフォルダで絞る）＋文字ボタン「変更」（フォルダが無ければ「フォルダに入れる」）。
//   形は BookFieldLinks と同じ（見出し「フォルダ」13/--text-2・チップ 32・押せる範囲 44）。分野の行のすぐ下（stacked）なら行の間を 8 に。
//   全状態の本で出す（フォルダは本人が自由に作る分け方・2026-10-11 オーナー「この画面でもフォルダ分けできるように」）。
export function BookFolderLinks({ folders = [], onPick, onEdit, stacked = false }) {
  const tapExtra = 'calc((var(--space-8) - var(--tap-min)) / 2)'; // 押せる範囲 44 と見た目 32 の差の半分（負）
  return (
    <div
      data-book-folders=""
      role="group"
      aria-label="フォルダ"
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 'var(--space-2)',
        marginTop: stacked ? `calc(${tapExtra} + var(--space-2))` : 'var(--space-2)',
        marginBottom: tapExtra,
      }}
    >
      <span aria-hidden="true" style={detailRowLabel}>フォルダ</span>
      {folders.map((f) => (
        <Chip key={f} shrink onClick={() => onPick?.(f)} aria-label={`フォルダ「${f}」の本を見る`}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f}</span>
        </Chip>
      ))}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={folders.length ? `フォルダを変更（いま ${folders.join('、')}）` : 'フォルダに入れる'}
          // フォルダが無いときも見出し「フォルダ」＋文字ボタン（文字の左端を値の列＝チップの左端にそろえる）
          style={{ ...btnLink, fontSize: 'var(--text-meta)', minWidth: 'var(--tap-min)', justifyContent: 'center', ...(folders.length ? null : { marginLeft: 'calc(-1 * var(--space-1))' }) }}
        >
          {folders.length ? '変更' : 'フォルダに入れる'}
        </button>
      )}
    </div>
  );
}

// 振り返り › 記録の「分野」。record: lib/bookFields.js の buildFieldRecord の結果。
export function BookFieldsRecord({ record, onOpenField, onFindBooks }) {
  const { groups } = record;
  return (
    <section
      data-book-fields-record=""
      aria-labelledby="book-fields-record-title"
      style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' }}
    >
      <h3 id="book-fields-record-title" style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>分野</h3>
      {groups.map((c, ci) => (
        // 大分類の間は 24（見出しの下の最初だけ 16・2026-10-11 ui-critic）
        <div key={c.id} data-field-group={c.id} style={{ marginTop: ci === 0 ? 'var(--space-4)' : 'var(--space-6)' }}>
          <p style={{ ...groupTitle, margin: 0 }}>{c.name}</p>
          {c.fields.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 'var(--space-1) 0 0', padding: 0 }}>
            {c.fields.map((f, i) => {
              const parts = [`本 ${f.books} 冊`];
              if (f.memos > 0) parts.push(`メモ ${f.memos} 件`);
              // ★ 評価の平均（評価の付いた本が 2 冊以上のときだけ・小数 1 桁・押すと評価順で並ぶ・2026-10-11）
              const avg = Number.isFinite(f.avgRating) ? `★${f.avgRating.toFixed(1)}` : null;
              if (avg) parts.push(avg);
              return (
                <li key={f.name} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--separator)' }}>
                  <button
                    type="button"
                    onClick={() => onOpenField?.(f.name)}
                    aria-label={`${f.name}・${parts.map((x) => (x === avg ? `評価の平均 ${f.avgRating.toFixed(1)}` : x)).join('・')}・本を見る`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', minHeight: 'var(--btn-h)',
                      padding: 'var(--space-2) 0', background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 'var(--text-sub)', textAlign: 'left', color: 'var(--text)',
                    }}
                  >
                    {/* 1 行目＝分野の名前・2 行目＝「本 N 冊 · メモ N 件」（区切りは「 · 」に統一）（どの行も同じ位置・2026-10-11 ui-critic）。
                        分野ごとの読書の時間は「読書の時間」カードの「分野ごと」に一本化した（同じ数を 2 か所に出さない・2026-10-11 オーナー裁定）。 */}
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--text-sub)', lineHeight: 1.3, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{f.name}</span>
                      <span style={{ fontSize: 'var(--text-meta)', lineHeight: 1.3, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                        {/* 「·」は前の塊の末尾に付け、折り返すのは記号の後ろの空白だけ（行頭に「·」を出さない・2026-10-11 ui-critic）。 */}
                        {parts.map((seg, i, all) => (
                          <span key={i} style={{ whiteSpace: 'nowrap' }}>{i ? ' ' : ''}{seg}{i < all.length - 1 ? '\u00A0·' : ''}</span>
                        ))}
                      </span>
                    </span>
                    <ChevronRight size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                </li>
              );
            })}
          </ul>
          )}
          {/* 本がまだ無い分野は、大分類ごとにまとめて 1 行（全体の 20 分野が見える・押すと AI 選書の最初の悩みに入れて開く＝送らない・2026-10-11 オーナー）。 */}
          {c.empty?.length > 0 && <EmptyFieldsLine names={c.empty} divided={c.fields.length > 0} onFindBooks={onFindBooks} />}
        </div>
      ))}
    </section>
  );
}

// 本がまだ無い分野。見出し「まだ本がない分野」（13/--text-2）を 1 行にし、その下 4 に探す印つきのチップを折り返す。
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
      <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>まだ本がない分野</p>
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
