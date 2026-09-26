// 📚 これまで読んだ本で、相談相手をつくる（初日クイックスタート）。
//
// 一番の価値「読むほど、自分だけの相談相手が育つ」（CLAUDE.md）を初日に体験させる。
// 入れたばかりの人はメモ 0 件で相談しても根拠が無い（最大の壁）。すでに読んだ本と
// 「覚えていること」を 5 分で入れてもらい、その場で複数の本をつなげた答えを返す。
// 設計: company/feature-past-books-quickstart.md（2026-09-26 オーナー承認・おすすめ案）
//   - 冊数: 3〜5 冊（3 冊で「次へ」が押せる）
//   - 入口: 初回ガイド最後の主ボタン ＋ はじめの一歩 ＋ ホームの相談カード（メモ 0 件時）
//   - 一言: 「思い出せない」でスキップ可（責めない）
// DB 変更なし（books は status='done' で、一言は book_memos のカード式メモとして入る）。

import { useEffect, useRef, useState } from 'react';
import { X, Search, Check, MessageCircle, ChevronLeft } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { searchBooks } from '../lib/bookSearch';
import { findDuplicateBook } from '../lib/checkDuplicate';
import { invalidateKnowledgeCache } from '../lib/ai';
import { LIMITS, clamp } from '../lib/limits';
import { track, EVENTS } from '../lib/analytics';
import { btnPrimary, btnGhost, input as inputStyle, C } from '../styles/ui';

const MIN_BOOKS = 3;
const MAX_BOOKS = 5;

const overlay = {
  position: 'fixed', inset: 0, zIndex: 'var(--z-overlay)', background: 'var(--color-bg)',
  display: 'flex', flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
};
const body = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 20px 16px', WebkitOverflowScrolling: 'touch' };
const footer = { flexShrink: 0, padding: '12px 20px 16px', borderTop: `1px solid ${C.hairline}`, background: 'var(--color-bg)' };
const h1 = { fontSize: 21, fontWeight: 700, color: C.ink, margin: '4px 0 6px', lineHeight: 1.45 };
const lead = { fontSize: 13, color: 'var(--c-ink-soft)', lineHeight: 1.7, margin: '0 0 14px' };

const bookKey = (b) => (b.isbn ? `isbn:${b.isbn}` : `t:${b.title}|${b.author || ''}`);

// 入れた本から相談例を作る（AI を使わない＝原価ゼロ）。複数の本をつなげる問いを先に。
function suggestQuestions(entries) {
  const withMemo = entries.filter((e) => e.memo.trim());
  const titles = (withMemo.length >= 2 ? withMemo : entries).map((e) => e.book.title);
  const qs = [];
  if (titles.length >= 2) qs.push(`『${titles[0]}』と『${titles[1]}』から、いまの仕事で意識できることは？`);
  qs.push('最近、判断に迷うことがあります。私が読んだ本から、ヒントをください');
  return qs;
}

export default function PastBooksQuickstart({ books = [], onSaveBook, onAsk, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const trapRef = useFocusTrap(true);
  const [step, setStep] = useState('pick'); // 'pick' | 'memo' | 'saving' | 'done'
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null); // null=未検索
  const [searchError, setSearchError] = useState('');
  const [picked, setPicked] = useState([]); // [{ book, memo }]
  const [idx, setIdx] = useState(0);
  const [summary, setSummary] = useState({ books: 0, memos: 0 });
  const memoRef = useRef(null);

  useEffect(() => { track('quickstart_started'); }, []);
  useEffect(() => { if (step === 'memo') memoRef.current?.focus(); }, [step, idx]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError('');
    try {
      const r = await searchBooks(q);
      if (!r.ok) setSearchError('検索できませんでした。通信状況をご確認のうえ、もう一度お試しください。');
      setResults(r.ok ? r.results.slice(0, 8) : []);
    } catch {
      setSearchError('検索できませんでした。通信状況をご確認のうえ、もう一度お試しください。');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const isPicked = (b) => picked.some((p) => bookKey(p.book) === bookKey(b));
  const toggle = (b) => {
    if (isPicked(b)) {
      setPicked((arr) => arr.filter((p) => bookKey(p.book) !== bookKey(b)));
      return;
    }
    if (picked.length >= MAX_BOOKS) {
      toast.info(`ここでは ${MAX_BOOKS} 冊まで。ほかの本は、あとから本棚に追加できます。`);
      return;
    }
    setPicked((arr) => [...arr, { book: b, memo: '' }]);
  };
  const addTitleOnly = () => {
    const t = query.trim();
    if (!t) return;
    toggle({ title: clamp(t, LIMITS.bookTitle), author: '', isbn: '', cover: '', manual: true });
  };

  const setMemo = (text) => setPicked((arr) => arr.map((p, i) => (i === idx ? { ...p, memo: text } : p)));
  const nextMemo = () => {
    if (idx < picked.length - 1) setIdx(idx + 1);
    else saveAll();
  };
  const skipMemo = () => {
    setMemo('');
    if (idx < picked.length - 1) setIdx(idx + 1);
    else saveAll(picked.map((p, i) => (i === idx ? { ...p, memo: '' } : p)));
  };

  const saveAll = async (entries = picked) => {
    if (!user || !isSupabaseConfigured) return;
    setStep('saving');
    let bookCount = 0;
    const memoRows = [];
    for (const e of entries) {
      try {
        // 既に本棚にある本は追加せず、その本に一言だけ足す（重複登録しない）。
        const existing = findDuplicateBook(books, e.book);
        const saved = existing || await onSaveBook?.(e.book);
        if (!saved?.id) continue;
        bookCount += 1;
        const text = clamp(e.memo.trim(), LIMITS.memoText);
        if (text) memoRows.push({ user_id: user.id, book_id: saved.id, text, page_number: null, tags: [], photo_path: null });
      } catch (err) {
        console.warn('[quickstart] book save failed:', err?.message || err);
      }
    }
    let memoCount = 0;
    if (memoRows.length) {
      const { error } = await supabase.from('book_memos').insert(memoRows);
      if (error) {
        console.warn('[quickstart] memo insert failed:', error.message);
        toast.error('一言の保存に失敗しました。本は本棚に追加されています。');
      } else {
        memoCount = memoRows.length;
        invalidateKnowledgeCache();
        track(EVENTS.MEMO_ADDED, { via: 'quickstart', count: memoCount });
      }
    }
    track('quickstart_completed', { books: bookCount, memos: memoCount });
    setSummary({ books: bookCount, memos: memoCount });
    setStep('done');
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', flexShrink: 0 }}>
      {step === 'memo' ? (
        <button type="button" aria-label="戻る" onClick={() => (idx > 0 ? setIdx(idx - 1) : setStep('pick'))}
          style={{ width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', color: C.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
      ) : <span style={{ width: 44 }} />}
      <span style={{ fontSize: 12, color: C.ink2 }}>
        {step === 'pick' ? '1 / 3' : step === 'memo' ? `2 / 3 ・ ${idx + 1}冊目` : step === 'done' ? '3 / 3' : ''}
      </span>
      <button type="button" aria-label="閉じる" onClick={onClose} disabled={step === 'saving'}
        style={{ width: 44, height: 44, border: 'none', background: 'none', cursor: 'pointer', color: C.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={22} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div ref={trapRef} role="dialog" aria-modal="true" aria-label="これまで読んだ本から始める" style={overlay}>
      {header}

      {step === 'pick' && (
        <>
          <div style={body}>
            <h1 style={h1}>これまで読んで、<br />印象に残っている本は？</h1>
            <p style={lead}>
              {MIN_BOOKS}〜{MAX_BOOKS} 冊えらぶと、その本たちがあなたの最初の相談相手になります。うろ覚えの本でも大丈夫です。
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); runSearch(); } }}
                placeholder="書名や著者名で探す"
                aria-label="書名や著者名で探す"
                maxLength={LIMITS.bookTitle}
                enterKeyHint="search"
                style={{ ...inputStyle, flex: 1, minWidth: 0, minHeight: 48 }}
              />
              <button type="button" onClick={runSearch} disabled={!query.trim() || searching} aria-label="検索"
                style={{ ...btnPrimary, width: 52, flexShrink: 0, padding: 0, opacity: query.trim() ? 1 : 0.5 }}>
                <Search size={20} aria-hidden="true" />
              </button>
            </div>

            {searching && <p style={{ ...lead, margin: '14px 0' }}>探しています…</p>}
            {searchError && <p style={{ fontSize: 13, color: 'var(--c-critical)', margin: '12px 0' }}>{searchError}</p>}
            {results && !searching && (
              <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map((b) => {
                  const on = isPicked(b);
                  return (
                    <li key={bookKey(b)}>
                      <button type="button" onClick={() => toggle(b)} aria-pressed={on}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                          padding: 10, minHeight: 64, borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit',
                          background: on ? 'var(--c-soft)' : C.card, border: `1px solid ${on ? C.brand : C.hairline}`,
                        }}>
                        {b.cover
                          ? <img src={b.cover} alt="" style={{ width: 36, height: 52, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                          : <span style={{ width: 36, height: 52, borderRadius: 3, background: 'var(--c-soft)', flexShrink: 0 }} />}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                          <span style={{ display: 'block', fontSize: 12, color: C.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.author}</span>
                        </span>
                        {on && <Check size={20} aria-hidden="true" style={{ color: C.brand, flexShrink: 0 }} />}
                      </button>
                    </li>
                  );
                })}
                {query.trim() && (
                  <li>
                    <button type="button" onClick={addTitleOnly}
                      style={{ background: 'none', border: 'none', padding: '10px 2px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: C.brand, textDecoration: 'underline' }}>
                      見つからないときは「{query.trim()}」を書名だけで追加
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
          <div style={footer}>
            {picked.length > 0 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, paddingBottom: 2 }}>
                {picked.map((p) => (
                  <button key={bookKey(p.book)} type="button" onClick={() => toggle(p.book)} aria-label={`『${p.book.title}』を外す`}
                    style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 180, padding: '6px 10px', minHeight: 34, borderRadius: 99, border: `1px solid ${C.hairlineStrong}`, background: C.card, color: C.ink, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.book.title}</span>
                    <X size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}
            <button type="button" style={{ ...btnPrimary, opacity: picked.length >= MIN_BOOKS ? 1 : 0.5 }}
              disabled={picked.length < MIN_BOOKS}
              onClick={() => { setIdx(0); setStep('memo'); }}>
              {picked.length >= MIN_BOOKS ? `次へ（${picked.length}冊）` : `あと ${MIN_BOOKS - picked.length} 冊えらんでください`}
            </button>
          </div>
        </>
      )}

      {step === 'memo' && picked[idx] && (
        <>
          <div style={body}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              {picked[idx].book.cover
                ? <img src={picked[idx].book.cover} alt="" style={{ width: 48, height: 70, objectFit: 'cover', borderRadius: 4 }} />
                : <span style={{ width: 48, height: 70, borderRadius: 4, background: 'var(--c-soft)' }} />}
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink }}>『{picked[idx].book.title}』</p>
                {picked[idx].book.author && <p style={{ margin: '2px 0 0', fontSize: 12, color: C.ink2 }}>{picked[idx].book.author}</p>}
              </div>
            </div>
            <h1 style={h1}>この本で、いちばん<br />覚えていることは？</h1>
            <p style={lead}>一行で大丈夫です。あなたの言葉が、相談の答えの根拠になります。</p>
            <textarea
              ref={memoRef}
              value={picked[idx].memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              maxLength={LIMITS.memoText}
              placeholder="例：やらないことを決めるのが、一番大事な仕事"
              aria-label={`『${picked[idx].book.title}』でいちばん覚えていること`}
              style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }}
            />
          </div>
          <div style={{ ...footer, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" style={{ ...btnPrimary, opacity: picked[idx].memo.trim() ? 1 : 0.5 }}
              disabled={!picked[idx].memo.trim()} onClick={nextMemo}>
              {idx < picked.length - 1 ? '次の本へ' : '相談相手をつくる'}
            </button>
            <button type="button" style={{ ...btnGhost, border: 'none' }} onClick={skipMemo}>
              思い出せない（この本は飛ばす）
            </button>
          </div>
        </>
      )}

      {step === 'saving' && (
        <div style={{ ...body, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={lead}>本棚に入れています…</p>
        </div>
      )}

      {step === 'done' && (
        <>
          <div style={body}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--c-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '12px 0 12px' }}>
              <MessageCircle size={30} aria-hidden="true" style={{ color: C.brand }} />
            </div>
            <h1 style={h1}>あなたの相談相手が<br />できました</h1>
            <p style={lead}>
              <strong style={{ color: C.ink }}>{summary.books}冊</strong>
              {summary.memos > 0 && <>・メモ <strong style={{ color: C.ink }}>{summary.memos}件</strong></>}
              から答えます。本を読んでメモを残すほど、答えはあなたらしくなっていきます。
            </p>
            {summary.memos > 0 ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: '4px 0 8px' }}>さっそく相談してみましょう</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {suggestQuestions(picked).map((q) => (
                    <button key={q} type="button" onClick={() => { track('quickstart_first_consult'); onAsk?.(q); }}
                      style={{ textAlign: 'left', padding: '12px 14px', minHeight: 48, borderRadius: 'var(--radius-md)', border: `1px solid ${C.hairlineStrong}`, background: C.card, color: C.ink, fontSize: 14, lineHeight: 1.6, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {q}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p style={lead}>本を開いて、心が動いた一行をメモすると、相談できるようになります。</p>
            )}
          </div>
          <div style={footer}>
            <button type="button" style={btnGhost} onClick={onClose}>本棚を見る</button>
          </div>
        </>
      )}
    </div>
  );
}
