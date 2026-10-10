// 🏷 本の分野（2026-10-11・lib/bookFields.js・SPEC §2 / §4・DESIGN §5「分野」）。
//
//   BookFieldsInput  … 本の追加・編集画面の「分野」欄。付いている分野のチップ＋「変更」（押すと BookFieldsSheet）
//   BookFieldsSheet  … 分野を選ぶシート。大分類 → 中分類 → 分野のチップ（選ぶためのチップ 44）・3 つまで
//   BookFieldLinks   … 本の詳細の分野（押すと、すべての本をその分野で絞る）
//   BookFieldsRecord … 振り返り › 記録の「分野」（本のある分野だけ・本とメモの数・読書の時間）
//
// 反ゲーミフィケーション: 点数・%・順位・「あと N 冊」・「埋めよう」は出さない。
import { useState } from 'react';
import { Check, ChevronRight, Shapes } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { Chip } from './formPrimitives';
import { withPhraseBreaks } from './TightBubble';
import { btnLink, btnPrimary, groupTitle } from '../styles/ui';
import { BOOK_FIELD_GROUPS, FIELD_MAX } from '../lib/bookFields';
import { fmtReadingTotal } from '../lib/readingStats';

const chipRow = { display: 'flex', flexWrap: 'wrap', rowGap: 'var(--space-2)', columnGap: 'var(--space-2)' };
const note = { margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };

// fields: 付いている分野（一覧の順）/ onChange(fields) / auto: アプリが選んだまま（本人が触っていない）
export function BookFieldsInput({ fields = [], onChange, auto = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <p id="book-fields-label" style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>分野</p>
      <div style={chipRow} role="group" aria-labelledby="book-fields-label">
        {fields.map((f) => (
          <Chip key={f} size="select" active onClick={() => setOpen(true)} aria-label={`分野を変更（いま ${fields.join('、')}）`}>{f}</Chip>
        ))}
        <Chip size="select" onClick={() => setOpen(true)} aria-label={fields.length ? `分野を変更（いま ${fields.join('、')}）` : '分野を選ぶ'}>
          {fields.length ? '変更' : '選ぶ'}
        </Chip>
      </div>
      {auto && fields.length > 0 && <p style={note}>{withPhraseBreaks('書名などから自動で選びました。')}</p>}
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
  const full = picked.length >= FIELD_MAX;
  const toggle = (name) => setPicked((cur) => {
    if (cur.includes(name)) return cur.filter((x) => x !== name);
    if (cur.length >= FIELD_MAX) return cur;
    return [...cur, name];
  });
  const footer = (
    <button type="button" style={{ ...btnPrimary, width: '100%' }} onClick={() => onDone(picked)}>決定</button>
  );
  return (
    <BottomSheet title="分野" onClose={onClose} footer={footer} dismissLabel="キャンセル">
      <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }} aria-live="polite">
        {withPhraseBreaks(`${FIELD_MAX} つまで選べます`)}
      </p>
      {BOOK_FIELD_GROUPS.map((c, ci) => (
        <section key={c.id} style={{ marginTop: ci === 0 ? 'var(--space-4)' : 'var(--space-6)' }} aria-label={c.name}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)' }}>{c.name}</h3>
          {c.groups.map((g) => (
            <div key={g.id} style={{ marginTop: 'var(--space-3)' }} role="group" aria-label={`${c.name}・${g.name}`}>
              <p style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>{g.name}</p>
              <div style={chipRow}>
                {g.fields.map((f) => {
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
            </div>
          ))}
        </section>
      ))}
    </BottomSheet>
  );
}

// 本の詳細: 付いている分野（押すと、すべての本をその分野で絞る）。
export function BookFieldLinks({ fields = [], onPick }) {
  if (!fields.length) return null;
  return (
    <div data-book-fields="" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 'var(--space-2)', marginTop: 'var(--space-2)', marginBottom: 'calc((32px - 44px) / 2)' }}>
      <Shapes size="1.1em" strokeWidth={1.75} aria-label="分野" style={{ flexShrink: 0, color: 'var(--text-2)', fontSize: 'var(--text-meta)' }} />
      {fields.map((f) => (
        onPick
          ? <Chip key={f} onClick={() => onPick(f)} aria-label={`分野「${f}」の本を見る`}>{f}</Chip>
          : <span key={f} style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>{f}</span>
      ))}
    </div>
  );
}

// 振り返り › 記録の「分野」。record: lib/bookFields.js の buildFieldRecord の結果。
export function BookFieldsRecord({ record, onOpenField, onFindBooks }) {
  const { groups, thin } = record;
  return (
    <section
      data-book-fields-record=""
      aria-labelledby="book-fields-record-title"
      style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' }}
    >
      <h3 id="book-fields-record-title" style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>分野</h3>
      {groups.map((c) => (
        <div key={c.id} style={{ marginTop: 'var(--space-4)' }}>
          <p style={{ ...groupTitle, margin: 0 }}>{c.name}</p>
          <ul style={{ listStyle: 'none', margin: 'var(--space-1) 0 0', padding: 0 }}>
            {c.fields.map((f, i) => {
              const parts = [`本 ${f.books} 冊`];
              if (f.memos > 0) parts.push(`メモ ${f.memos} 件`);
              const time = f.seconds >= 60 ? fmtReadingTotal(f.seconds) : '';
              return (
                <li key={f.name} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--separator)' }}>
                  <button
                    type="button"
                    onClick={() => onOpenField?.(f.name)}
                    aria-label={`${f.name}・${parts.join('・')}${time ? `・読書 ${time}` : ''}・本を見る`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', minHeight: 48,
                      padding: 'var(--space-2) 0', background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', textAlign: 'left', color: 'var(--text)',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 'var(--space-3)', rowGap: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--text-sub)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{f.name}</span>
                      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {parts.join('・')}{time && <span style={{ color: 'var(--text-3)' }}>{` · ${time}`}</span>}
                      </span>
                    </span>
                    <ChevronRight size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {thin.length > 0 && onFindBooks && (
        <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--separator)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {withPhraseBreaks('まだ本の少ない分野')}{'：'}
            {thin.map((t, i) => <span key={t}>{i > 0 && '・'}<span style={{ whiteSpace: 'nowrap' }}>{t}</span></span>)}
          </p>
          <button
            type="button"
            onClick={() => onFindBooks(thin)}
            aria-label={`${thin.join('・')}の本を探す（AI 選書）`}
            style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))', marginBottom: 'calc(-1 * var(--space-3))' }}
          >
            この分野の本を探す<ChevronRight size="1.2em" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
