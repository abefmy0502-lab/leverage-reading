// 🧾 AI への指示文をつくる（2026-10-21・lib/externalPrompt.js）。
//
// 開くのは 本の詳細のメモの下（その本を選んだ状態）と、相談の「…」（すべての本）。
// 組み立て（BottomSheet・題「AI への指示文」）:
//   ① どの本から？  この本／すべての本／本を選ぶ（メモのある本の一覧にチェック）。無料プランは 1 冊まで（複数は「（プラン）」）
//   ② 何についてまとめる？  自分の言葉の欄（80 字）＋候補のチップ（得たいこと・メモのタグ）
//   ③ どんな形で？  1 枚の要約／本ごとの比較（2 冊以上）／明日からの行動／人に説明する資料／反対の意見も入れる
//   ④ 誰が読む？ 自分／上司／チーム ・ 長さ 短く／ふつう／詳しく
//   下の主ボタン「指示文をつくる」→ できあがり（指示文の全文・「コピー」・「ChatGPT で開く」「Claude で開く」＝コピーしてから開く）
// AI は使わない（トークンを使わない）。どこにも送らない（送るのは本人）。

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, ExternalLink, Check, Plus, FileText } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import EmptyState from './EmptyState';
import { SkeletonBlock } from './Skeleton';
import { Chip } from './formPrimitives';
import { withPhraseBreaks } from './TightBubble';
import { useToast } from './Toast';
import { useAuth } from '../hooks/useAuth';
import { loadAllMemoRows } from '../hooks/useAllMemoRows';
import { usePaywall } from '../state/PaywallContext';
import { track } from '../lib/analytics';
import {
  buildExternalPrompt, cleanTheme, isThemeReady, THEME_MAX,
  PROMPT_FORMATS, PROMPT_AUDIENCES, PROMPT_LENGTHS, EXTERNAL_AI_LINKS,
} from '../lib/externalPrompt';
import { btnPrimary, btnPrimaryOff, btnGhost, btnLink, fieldNote, groupTitle, input as uiInput } from '../styles/ui';

const question = { fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.5 };
const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const chipRow = { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' };
const section = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };
const fmt = (n) => (Number(n) || 0).toLocaleString('ja-JP');

function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch { /* 下へ */ }
  return Promise.resolve(false);
}

// books: 本棚の本（全部）。initialBookIds: はじめに選んでおく本（本の詳細から開いたとき＝その 1 冊）。
export default function PromptMakerSheet({ books = [], initialBookIds = null, from = 'consult', onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const { freeMode, requirePlan } = usePaywall();
  const [rows, setRows] = useState(undefined); // undefined＝読み込み中・null＝読めなかった
  const [tryN, setTryN] = useState(0);
  useEffect(() => {
    let alive = true;
    setRows(undefined);
    loadAllMemoRows(user?.id).then((r) => { if (alive) setRows(r.error ? null : (r.rows || [])); });
    return () => { alive = false; };
  }, [user?.id, tryN]);
  useEffect(() => { track('prompt_maker', { action: 'open', from }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // メモのある本（メモの数の多い順）。この本のまとめだけの本も入れる。
  const counts = useMemo(() => {
    const m = new Map();
    for (const r of rows || []) if (r.book_id && String(r.text || '').trim()) m.set(r.book_id, (m.get(r.book_id) || 0) + 1);
    return m;
  }, [rows]);
  const memoBooks = useMemo(() => books
    .filter((b) => (counts.get(b.id) || 0) > 0 || String(b.leverageMemo || '').trim())
    .sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0)), [books, counts]);

  const single = Array.isArray(initialBookIds) && initialBookIds.length === 1 ? books.find((b) => b.id === initialBookIds[0]) : null;
  const [scope, setScope] = useState(single ? 'this' : 'all'); // 'this' | 'all' | 'pick'
  const [picked, setPicked] = useState(() => (single ? [single.id] : []));
  const selectedIds = scope === 'this' && single ? [single.id] : scope === 'all' ? memoBooks.map((b) => b.id) : picked;
  const selectedBooks = books.filter((b) => selectedIds.includes(b.id));
  const memoTotal = selectedIds.reduce((n, id) => n + (counts.get(id) || 0), 0);
  const multi = selectedIds.length > 1;

  const [theme, setTheme] = useState('');
  const [format, setFormat] = useState('one');
  const [audience, setAudience] = useState('self');
  const [length, setLength] = useState('normal');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  // 何について の候補: 選んだ本の「得たいこと」と、選んだ本のメモのタグ（多い順）から 4 つまで。
  const themeIdeas = useMemo(() => {
    const ideas = [];
    // 得たいことは 1 冊のときだけ（複数の本では 1 冊の目的がテーマに見えてしまう・2026-10-21 ui-critic）。
    for (const b of selectedBooks.length === 1 ? selectedBooks : []) {
      const p = cleanTheme(b.investPurpose || '');
      if (p && p.length <= 24) ideas.push(p);
    }
    const tagCount = new Map();
    const ids = new Set(selectedIds);
    for (const r of rows || []) {
      if (!ids.has(r.book_id) || !Array.isArray(r.tags)) continue;
      for (const t of r.tags) { const k = cleanTheme(t); if (k.length >= 2) tagCount.set(k, (tagCount.get(k) || 0) + 1); }
    }
    ideas.push(...[...tagCount.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k));
    return [...new Set(ideas)].slice(0, 3);
  }, [selectedBooks, selectedIds, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2 冊以上を選んでいないときは「本ごとの比較」を出さない（選んでいたら 1 枚の要約へ戻す）。
  const formats = PROMPT_FORMATS.filter((f) => f.key !== 'compare' || multi);
  useEffect(() => { if (!multi && format === 'compare') setFormat('one'); }, [multi]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = rows != null && selectedIds.length > 0 && memoTotal + selectedBooks.filter((b) => String(b.leverageMemo || '').trim()).length > 0 && isThemeReady(theme);

  const create = () => {
    if (!ready) return;
    // 無料プランは 1 冊まで（複数の本はプランの機能・すすめてよい ②）。
    if (multi && freeMode && !requirePlan('複数の本の指示文')) return;
    const r = buildExternalPrompt({ books: selectedBooks, memos: rows, theme, format, audience, length });
    setResult({ ...r, format });
    setCopied(false);
    // できあがりは先頭から見せる（フォームの下のほうで押しても、指示文の頭から）。
    requestAnimationFrame(() => { try { document.querySelector('[data-prompt-result]')?.scrollIntoView({ block: 'start' }); } catch { /* ignore */ } });
    track('prompt_maker', { action: 'create', from, books: Math.min(r.books, 9), format });
  };
  const doCopy = async (where = 'copy') => {
    if (!result) return false;
    const ok = await copyText(result.text);
    if (ok) setCopied(true);
    track('prompt_maker', { action: where, from });
    // コピーできたことは主ボタンの「コピーしました」で伝える（知らせを重ねない）。
    if (where === 'copy') {
      if (!ok) toast.error('コピーできませんでした。指示文を長押しして、コピーしてください。');
    } else if (!ok) {
      toast.error('コピーできませんでした。指示文を長押しして、コピーしてください。');
    }
    return ok;
  };

  const togglePick = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const planMark = freeMode ? '（プラン）' : '';

  const body = rows === undefined ? (
    <div role="status" aria-label="メモを読み込んでいます" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <SkeletonBlock width="40%" height="var(--text-sub)" radius="var(--radius)" />
      <SkeletonBlock width="80%" height={44} radius="var(--radius)" />
      <SkeletonBlock width="60%" height={44} radius="var(--radius)" />
    </div>
  ) : rows === null ? (
    <ErrorMessage
      title="メモを読み込めませんでした"
      description="通信状況を確認して、もう一度お試しください。"
      actions={[{ label: 'もう一度', onClick: () => setTryN((n) => n + 1) }]}
    />
  ) : memoBooks.length === 0 ? (
    <EmptyState titleAs="h3" icon={<FileText size={32} strokeWidth={1.5} aria-hidden="true" />} title="メモを書いた本がまだありません" description="メモを書くと、そのメモから指示文をつくれます。" />
  ) : result ? (
    <div data-prompt-result="" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', scrollMarginTop: 'var(--space-12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', margin: 'calc(-1 * var(--space-3)) 0' }}>
        <p style={meta}>
          <span style={{ whiteSpace: 'nowrap' }}>{fmt(result.books)} 冊・メモ {fmt(result.used)} 件</span>
          {result.used < result.total && <span style={{ whiteSpace: 'nowrap' }}>（{fmt(result.total)} 件のうち、近いものから）</span>}
          <span style={{ whiteSpace: 'nowrap' }}>・約 {fmt(Math.round(result.text.length / 100) * 100)} 字</span>
        </p>
        <button type="button" onClick={() => setResult(null)} style={{ ...btnLink, flexShrink: 0, marginRight: 'calc(-1 * var(--space-1))' }}>
          聞き方を変える
        </button>
      </div>
      <pre
        tabIndex={0}
        aria-label="できた指示文"
        style={{ margin: 0, maxHeight: '30vh', overflow: 'auto', WebkitMaskImage: 'linear-gradient(180deg, black calc(100% - var(--space-6)), transparent)', maskImage: 'linear-gradient(180deg, black calc(100% - var(--space-6)), transparent)', paddingBottom: 'var(--space-6)', padding: 'var(--space-3) var(--space-4)', background: 'var(--fill)', borderRadius: 'var(--radius)', fontFamily: 'inherit', fontSize: 'var(--text-meta)', lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'normal', overflowWrap: 'anywhere', userSelect: 'text', WebkitUserSelect: 'text' }}
      >
        {result.text}
      </pre>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          {EXTERNAL_AI_LINKS.map((l) => (
            <a
              key={l.key}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { doCopy(`open_${l.key}`); }}
              style={{ ...btnGhost, flex: '1 1 0', minWidth: 0, padding: '0 var(--space-3)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', textDecoration: 'none', boxSizing: 'border-box' }}
            >
              {l.label}<ExternalLink size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
            </a>
          ))}
        </div>
        {result.format === 'diagram' && (
          <p style={meta}>{withPhraseBreaks('図がコードのまま出たときは、「図にして」と頼んでください。')}</p>
        )}
        <p style={{ ...meta, color: 'var(--text-3)' }}>{withPhraseBreaks('コピーしてから開きます。貼りつけて送るのはあなたです（扱いはそれぞれの決まりに従います）。')}</p>
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <p style={meta}>{withPhraseBreaks('ChatGPT・Claude に貼る文をつくります。トークンはかかりません。')}</p>

      <section style={section} aria-label="どの本から？">
        <h3 style={question}>どの本から？</h3>
        <div role="radiogroup" style={chipRow}>
          {single && <Chip size="select" role="radio" aria-checked={scope === 'this'} active={scope === 'this'} onClick={() => setScope('this')}>この本</Chip>}
          <Chip size="select" role="radio" aria-checked={scope === 'all'} active={scope === 'all'} onClick={() => setScope('all')}>すべての本{planMark}</Chip>
          <Chip size="select" role="radio" aria-checked={scope === 'pick'} active={scope === 'pick'} onClick={() => setScope('pick')}>本を選ぶ</Chip>
        </div>
        {scope === 'pick' ? (
          <div role="group" aria-label="本を選ぶ" style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--separator)' }}>
            {memoBooks.map((b) => {
              const on = picked.includes(b.id);
              return (
                <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--btn-h)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--separator)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => togglePick(b.id)} style={{ width: '1.25em', height: '1.25em', accentColor: 'var(--accent)', flexShrink: 0, margin: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                  <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>メモ {fmt(counts.get(b.id) || 0)} 件</span>
                </label>
              );
            })}
          </div>
        ) : (
          <p style={meta}>
            {scope === 'this' && single
              ? <span style={{ whiteSpace: 'nowrap' }}>メモ {fmt(counts.get(single.id) || 0)} 件</span>
              : <><span style={{ whiteSpace: 'nowrap' }}>{fmt(memoBooks.length)} 冊</span>・<span style={{ whiteSpace: 'nowrap' }}>メモ {fmt(memoTotal)} 件</span></>}
          </p>
        )}
      </section>

      <section style={section} aria-label="何についてまとめる？">
        <h3 style={question}>何についてまとめる？<span style={fieldNote}>（必須）</span></h3>
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); } }}
          maxLength={THEME_MAX}
          placeholder="例：部下への仕事の任せ方"
          aria-label="何についてまとめる？"
          enterKeyHint="done"
          style={uiInput}
        />
        {themeIdeas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <span style={groupTitle}>候補</span>
            <div style={chipRow} aria-label="候補">
              {themeIdeas.map((t) => (
                <Chip key={t} size="select" shrink active={cleanTheme(theme) === t} aria-pressed={cleanTheme(theme) === t} onClick={() => setTheme(t)}>
                  <Plus size="1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</span>
                </Chip>
              ))}
            </div>
          </div>
        )}
      </section>

      <section style={section} aria-label="どんな形で？">
        <h3 style={question}>どんな形で？</h3>
        <div role="radiogroup" style={chipRow}>
          {formats.map((f) => (
            <Chip key={f.key} size="select" role="radio" aria-checked={format === f.key} active={format === f.key} onClick={() => setFormat(f.key)}>{f.label}</Chip>
          ))}
        </div>
      </section>

      <section style={section} aria-label="誰が読む？">
        <h3 style={question}>誰が読む？</h3>
        <div role="radiogroup" style={chipRow}>
          {PROMPT_AUDIENCES.map((a) => (
            <Chip key={a.key} size="select" role="radio" aria-checked={audience === a.key} active={audience === a.key} onClick={() => setAudience(a.key)}>{a.label}</Chip>
          ))}
        </div>
      </section>

      <section style={section} aria-label="長さは？">
        <h3 style={question}>長さは？</h3>
        <div role="radiogroup" style={chipRow}>
          {PROMPT_LENGTHS.map((l) => (
            <Chip key={l.key} size="select" role="radio" aria-checked={length === l.key} active={length === l.key} onClick={() => setLength(l.key)}>{l.label}</Chip>
          ))}
        </div>
      </section>
    </div>
  );

  const footer = rows && memoBooks.length > 0 ? (result ? (
    <button type="button" onClick={() => doCopy('copy')} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
      {copied ? <Check size="1.1em" aria-hidden="true" /> : <Copy size="1.1em" aria-hidden="true" />}{copied ? 'コピーしました' : '指示文をコピー'}
    </button>
  ) : (
    <button type="button" onClick={create} disabled={!ready} style={ready ? btnPrimary : btnPrimaryOff}>
      <span>指示文をつくる{multi && freeMode ? <span style={{ ...fieldNote, color: 'inherit', marginLeft: 'var(--space-1)' }}>（プラン）</span> : null}</span>
    </button>
  )) : null;

  return createPortal(
    <BottomSheet title="AI への指示文" eyebrow={single ? `『${single.title}』` : ''} dismissLabel={result ? '完了' : 'キャンセル'} onClose={onClose} footer={footer}>
      {body}
    </BottomSheet>,
    document.body,
  );
}

