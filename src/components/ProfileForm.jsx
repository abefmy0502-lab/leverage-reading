// 👤 プロフィールの欄（2026-11-21）。初回ガイドの 2 枚目と、設定の「プロフィール」のシートで同じものを使う。
//   ニックネーム・好きな本（検索して選ぶ・見つからなければ書名をそのまま）・おすすめの 1 行。
//   値は親が持つ（value / onChange）。保存は親（lib/profile.js）。
//   fromShelf（VITE_SOCIAL のビルド・2026-11-21 3 回目・オーナー「好きな本は自分の本棚の本に」「好きな言葉はメモから選べるように・
//   メモはなくても自由入力」）: 好きな本は本棚の本（shelfBooks）から選ぶ・好きな言葉はその本のメモ（loadMemos）から選ぶか自由に書く。
import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { input as inputBase, groupTitle, fieldNote, btnGhost, btnLink } from '../styles/ui';
import { searchBooks } from '../lib/bookSearch';
import { PROFILE_LIMITS } from '../lib/profile';
import { AVATARS } from '../lib/avatars';

// 先頭は「なし」（選ばない＝ニックネームの 1 字か人の形）。
const AVATAR_CHOICES = [{ id: '', label: 'なし' }, ...AVATARS];
import UserAvatar from './UserAvatar';
import MiniCover from './MiniCover';
import { withPhraseBreaks } from './TightBubble';
import { autoGrowTextarea } from '../hooks/useComposerHeight';

const field = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' };
const label = { ...groupTitle, margin: 0 };
const hint = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, lineBreak: 'strict', textWrap: 'pretty' };
const rowBtn = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 'var(--tap-min)',
  padding: 'var(--space-2) 0', background: 'none', border: 'none', borderTop: '1px solid var(--separator)',
  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)',
};

function BookLine({ title, author, cover }) {
  return (
    <>
      <MiniCover title={title} cover={cover} width={40} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
        <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{title}</span>
        {author && <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>{author}</span>}
      </span>
    </>
  );
}

// 文字の数で切る（絵文字を 1 字と数える＝数え方を下の「N / 上限」とデータベースにそろえる・2026-11-26 点検）。
//   欄の maxLength は 2 倍にして、切るのはここで（絵文字を半分に割らない）。
const cutChars = (v, max) => [...String(v ?? '')].slice(0, max).join('');

export default function ProfileForm({ value, onChange, showBio = false, showAvatar = false, fromShelf = false, shelfBooks = [], loadMemos = null, showFavorite = true }) {
  const ids = { nick: useId(), book: useId(), line: useId(), bio: useId(), avatar: useId() };
  const set = (patch) => onChange({ ...value, ...patch });
  // 矢印キーで選ぶアイコンを動かす（radiogroup の作法）。
  const onAvatarKey = (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const cur = Math.max(0, AVATAR_CHOICES.findIndex((a) => a.id === (value.avatar || '')));
    const next = (cur + d + AVATAR_CHOICES.length) % AVATAR_CHOICES.length;
    set({ avatar: AVATAR_CHOICES[next].id });
    requestAnimationFrame(() => e.currentTarget?.querySelector?.(`[data-avatar-index="${next}"]`)?.focus());
  };
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null＝まだ探していない
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const listRef = useRef(null);
  const [changing, setChanging] = useState(false); // 「変更」で探し直している（選んでいた本は「やめる」で戻る）
  const hasBook = !!String(value.favTitle || '').trim();
  const chosen = hasBook && !changing;
  // 結果を出したら結果の頭まで送る（下の欄に押し出されて見えないことが無いように）。
  useEffect(() => { if (results) listRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [results]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q || searching) return;
    const my = ++seq.current;
    setSearching(true); setFailed(false);
    try {
      const r = await searchBooks(q);
      if (my !== seq.current) return;
      setResults(r.ok ? (r.results || []).slice(0, 3) : []);
      setFailed(!r.ok);
    } catch {
      if (my === seq.current) { setResults([]); setFailed(true); }
    } finally {
      if (my === seq.current) setSearching(false);
    }
  };
  const pick = (b) => {
    set({ favTitle: b.title, favAuthor: b.author || '', favIsbn: b.isbn || '', favCover: /^https:\/\//.test(b.cover || '') ? b.cover : '' });
    setResults(null); setQuery(''); setChanging(false);
  };
  const useTyped = () => {
    set({ favTitle: cutChars(query.trim(), PROFILE_LIMITS.title), favAuthor: '', favIsbn: '', favCover: '' });
    setResults(null); setQuery(''); setChanging(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {showAvatar && (
        <div style={field}>
          <span id={ids.avatar} style={label}>アイコン<span style={fieldNote}>（任意）</span></span>
          {/* 「なし」＋決まった 10 個から 1 つ（2026-11-21・lib/avatars.js）。1 つだけ選ぶ欄＝radiogroup（矢印キーで動かす）。
              選んだ物は外側に --surface の空き＋--accent の輪。6 列を等分して真ん中に置く（列の間がそろう）。 */}
          <div
            role="radiogroup"
            aria-labelledby={ids.avatar}
            onKeyDown={onAvatarKey}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', justifyItems: 'center', rowGap: 'var(--space-3)' }}
          >
            {AVATAR_CHOICES.map((a, idx) => {
              const on = (value.avatar || '') === a.id;
              return (
                <button
                  key={a.id || 'none'}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={a.label}
                  tabIndex={on || (!value.avatar && idx === 0) ? 0 : -1}
                  data-avatar-index={idx}
                  onClick={() => set({ avatar: a.id })}
                  style={{
                    width: 48, height: 48, padding: 0, border: 'none', borderRadius: '50%', background: 'none', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: on ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : 'none',
                  }}
                >
                  <UserAvatar avatarId={a.id} nickname={a.id ? '' : value.nickname} size={44} />
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div style={field}>
        <label htmlFor={ids.nick} style={label}>ニックネーム<span style={fieldNote}>（任意）</span></label>
        <input id={ids.nick} value={value.nickname} onChange={(e) => set({ nickname: cutChars(e.target.value, PROFILE_LIMITS.nickname) })} maxLength={PROFILE_LIMITS.nickname * 2} placeholder="例：ふみ" autoComplete="nickname" style={inputBase} />
      </div>

      {showBio && (
        <div style={field}>
          <label htmlFor={ids.bio} style={label}>自己紹介<span style={fieldNote}>（任意）</span></label>
          <textarea
            id={ids.bio}
            value={value.bio || ''}
            onChange={(e) => set({ bio: cutChars(e.target.value, PROFILE_LIMITS.bio) })}
            maxLength={PROFILE_LIMITS.bio * 2}
            rows={3}
            placeholder="例：メーカーで企画の仕事。チームづくりの本をよく読みます"
            style={{ ...inputBase, minHeight: 'calc(3 * 1.5em + var(--space-6))', lineHeight: 1.5, resize: 'none' }}
          />
          <p style={{ ...hint, textAlign: 'right' }} aria-live="polite">{[...String(value.bio || '')].length} / {PROFILE_LIMITS.bio}</p>
        </div>
      )}

      {showFavorite && (fromShelf
        ? <ShelfFavorite value={value} set={set} shelfBooks={shelfBooks} loadMemos={loadMemos} ids={ids} />
        : (
          <>
      <div style={field}>
            <label htmlFor={ids.book} style={label}>好きな本<span style={fieldNote}>（任意）</span></label>
            {chosen ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0 }}>
                  <BookLine title={value.favTitle} author={value.favAuthor} cover={value.favCover} />
                </span>
                <button type="button" style={{ ...btnLink, flexShrink: 0 }} onClick={() => { setChanging(true); setResults(null); setQuery(''); }}>変更</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input
                    id={ids.book}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); runSearch(); } }}
                    maxLength={PROFILE_LIMITS.title}
                    placeholder="書名か著者で探す"
                    enterKeyHint="search"
                    style={{ ...inputBase, flex: 1, minWidth: 0 }}
                  />
                  <button type="button" onClick={runSearch} disabled={!query.trim() || searching} aria-busy={searching || undefined} style={{ ...btnGhost, width: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <Search size="1em" aria-hidden="true" />{searching ? '探しています…' : '探す'}
                  </button>
                </div>
                {results && (
                  <div ref={listRef}>
                    <p style={{ ...hint, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 'var(--space-2)' }}>
                      {failed ? 'いまは探せませんでした。' : results.length ? '' : '見つかりませんでした。'}
                      <button type="button" style={{ ...btnLink, fontSize: 'var(--text-meta)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={useTyped}>「{query.trim()}」をそのまま使う</button>
                    </p>
                    {results.length > 0 && (
                      <div role="list" aria-label="見つかった本" style={{ borderBottom: '1px solid var(--separator)' }}>
                        {results.map((b) => (
                          <div role="listitem" key={`${b.isbn}|${b.title}`}>
                            <button type="button" style={rowBtn} onClick={() => pick(b)}><BookLine title={b.title} author={b.author} cover={b.cover} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {changing && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <button type="button" style={{ ...btnLink, fontSize: 'var(--text-meta)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={() => { setChanging(false); setResults(null); setQuery(''); }}>やめる（『{value.favTitle}』のまま）</button>
                  </div>
                )}
              </>
            )}
          </div>
    
          <div style={field}>
            <label htmlFor={ids.line} style={label}>その本のおすすめの 1 行<span style={fieldNote}>（任意）</span></label>
            <input id={ids.line} value={value.favLine} onChange={(e) => set({ favLine: cutChars(e.target.value, PROFILE_LIMITS.line) })} maxLength={PROFILE_LIMITS.line * 2} placeholder="例：仕事の見え方が変わった一冊" style={inputBase} />
            <p style={hint}>好きな本は読了として本棚に入ります。<br />この 1 行は、その本のメモに残ります。</p>
          </div>
          </>
        ))}
    </div>
  );
}

// 好きな本＝本棚の本から選ぶ・好きな言葉＝その本のメモから選ぶか自由に書く（2026-11-21 3 回目・VITE_SOCIAL）。
function ShelfFavorite({ value, set, shelfBooks, loadMemos, ids }) {
  // 好きな言葉の欄は中身に合わせて伸ばす（選んだメモが 2 行に隠れないように・2026-11-22）。
  const lineRef = useRef(null);
  useEffect(() => { autoGrowTextarea(lineRef.current); }, [value.favLine]);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [memos, setMemos] = useState(null); // null＝まだ読んでいない
  const [memoOpen, setMemoOpen] = useState(false);
  const hasBook = !!String(value.favTitle || '').trim();
  const books = Array.isArray(shelfBooks) ? shelfBooks : [];
  const current = hasBook ? books.find((b) => (value.favIsbn && b.isbn === value.favIsbn) || b.title === value.favTitle) || null : null;
  const q = query.trim().toLowerCase();
  const matches = (q ? books.filter((b) => `${b.title} ${b.author || ''}`.toLowerCase().includes(q)) : books).slice(0, 6);

  const choose = (b) => {
    set({ favTitle: b.title, favAuthor: b.author || '', favIsbn: b.isbn || '', favCover: /^https:\/\//.test(b.cover || '') ? b.cover : '' });
    setPicking(false); setQuery(''); setMemos(null); setMemoOpen(false);
  };
  const openMemos = async () => {
    setMemoOpen(true);
    if (memos || !current || !loadMemos) return;
    try { setMemos((await loadMemos(current)) || []); } catch { setMemos([]); }
  };

  return (
    <>
      <div style={field}>
        <span id={ids.book} style={label}>好きな本<span style={fieldNote}>（任意）</span></span>
        {hasBook && !picking ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0 }}>
              <BookLine title={value.favTitle} author={value.favAuthor} cover={value.favCover} />
            </span>
            <button type="button" style={{ ...btnLink, flexShrink: 0 }} onClick={() => setPicking(true)}>変更</button>
          </div>
        ) : books.length === 0 ? (
          <p style={hint}>本棚に本を入れると、ここで選べます。</p>
        ) : (
          <>
            <input
              aria-labelledby={ids.book}
              // 欄に入ったら、欄をシートの上の方へ送って候補が下の保存の帯に隠れないように（2026-11-21 ui-critic）。
              onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), 60); }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={PROFILE_LIMITS.title}
              placeholder="本棚の本から探す（書名・著者）"
              enterKeyHint="search"
              style={inputBase}
            />
            {matches.length > 0 ? (
              <div role="list" aria-label="本棚の本" style={{ borderBottom: '1px solid var(--separator)' }}>
                {matches.map((b) => (
                  <div role="listitem" key={b.id}>
                    <button type="button" style={rowBtn} onClick={() => choose(b)}><BookLine title={b.title} author={b.author} cover={b.cover} /></button>
                  </div>
                ))}
              </div>
            ) : <p style={hint}>本棚に見つかりませんでした。</p>}
            {picking && hasBook && (
              <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-4)' }}>
                <button type="button" style={{ ...btnLink, marginLeft: 'calc(-1 * var(--space-1))' }} onClick={() => { setPicking(false); setQuery(''); }}>やめる（『{value.favTitle}』のまま）</button>
                <button type="button" style={btnLink} onClick={() => { set({ favTitle: '', favAuthor: '', favIsbn: '', favCover: '' }); setPicking(false); setQuery(''); }}>好きな本を外す</button>
              </div>
            )}
          </>
        )}
      </div>

      <div style={field}>
        <label htmlFor={ids.line} style={label}>好きな言葉<span style={fieldNote}>（任意）</span></label>
        <textarea
          ref={lineRef}
          id={ids.line}
          value={value.favLine}
          onChange={(e) => set({ favLine: cutChars(e.target.value, PROFILE_LIMITS.line) })}
          maxLength={PROFILE_LIMITS.line * 2}
          rows={2}
          placeholder="例：心に残った一文を、そのまま"
          style={{ ...inputBase, minHeight: 'calc(2 * 1.5em + var(--space-6))', lineHeight: 1.5, resize: 'none' }}
        />
        <p style={{ ...hint, textAlign: 'right' }} aria-live="polite">{[...String(value.favLine || '')].length} / {PROFILE_LIMITS.line}</p>
        {current && loadMemos && !memoOpen && (
          <div>
            <button type="button" style={{ ...btnLink, marginLeft: 'calc(-1 * var(--space-1))' }} onClick={openMemos}>『{current.title}』のメモから選ぶ</button>
          </div>
        )}
        {memoOpen && (
          memos === null ? <p role="status" style={hint}>メモを読んでいます…</p>
            : memos.length === 0 ? <p style={hint}>この本のメモはまだありません。自由に書けます。</p>
              : (
                <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <p style={{ ...label, margin: 0 }}>『{current.title}』のメモ</p>
                  <button type="button" style={{ ...btnLink, flexShrink: 0 }} onClick={() => setMemoOpen(false)}>閉じる</button>
                </div>
                <p style={hint}>{withPhraseBreaks(`押すと、その文が好きな言葉に入ります（${PROFILE_LIMITS.line} 字まで）。`)}</p>
                <div role="list" aria-label="この本のメモ" style={{ borderBottom: '1px solid var(--separator)' }}>
                  {/* この本のメモは全部（2026-11-22 オーナー「メモ全て載っていない・全部選択できるように」）・本文も全部見せる。 */}
                  {memos.map((m) => (
                    <div role="listitem" key={m.id}>
                      <button
                        type="button"
                        style={{ ...rowBtn, alignItems: 'flex-start' }}
                        onClick={() => { set({ favLine: cutChars(String(m.text || '').replace(/\s+/g, ' ').trim(), PROFILE_LIMITS.line) }); setMemoOpen(false); }}
                      >
                        <span style={{ display: 'block', minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 'var(--text-body)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'break-word', lineBreak: 'strict', whiteSpace: 'pre-line' }}>{withPhraseBreaks(String(m.text || '').trim())}</span>
                          {[...String(m.text || '').replace(/\s+/g, ' ').trim()].length > PROFILE_LIMITS.line && (
                            <span style={{ display: 'block', marginTop: 'var(--space-1)', ...hint }}>はじめの {PROFILE_LIMITS.line} 字が入ります</span>
                          )}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                </div>
              )
        )}
      </div>
    </>
  );
}
