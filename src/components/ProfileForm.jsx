// 👤 プロフィールの欄（2026-11-21）。初回ガイドの 2 枚目と、設定の「プロフィール」のシートで同じものを使う。
//   ニックネーム・好きな本（検索して選ぶ・見つからなければ書名をそのまま）・おすすめの 1 行。
//   値は親が持つ（value / onChange）。保存は親（lib/profile.js）。
import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { input as inputBase, groupTitle, fieldNote, btnGhost, btnLink } from '../styles/ui';
import { searchBooks } from '../lib/bookSearch';
import { PROFILE_LIMITS } from '../lib/profile';
import { AVATARS } from '../lib/avatars';
import UserAvatar from './UserAvatar';

const field = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' };
const label = { ...groupTitle, margin: 0 };
const hint = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, lineBreak: 'strict', textWrap: 'pretty' };
const coverBox = { width: 40, height: 56, flexShrink: 0, borderRadius: 'var(--space-1)', background: 'var(--fill)', objectFit: 'cover' };
const rowBtn = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 'var(--tap-min)',
  padding: 'var(--space-2) 0', background: 'none', border: 'none', borderTop: '1px solid var(--separator)',
  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)',
};

function BookLine({ title, author, cover }) {
  return (
    <>
      {cover ? <img src={cover} alt="" style={coverBox} /> : <span style={coverBox} aria-hidden="true" />}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
        <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{title}</span>
        {author && <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>{author}</span>}
      </span>
    </>
  );
}

export default function ProfileForm({ value, onChange, showBio = false, showAvatar = false }) {
  const ids = { nick: useId(), book: useId(), line: useId(), bio: useId() };
  const set = (patch) => onChange({ ...value, ...patch });
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
    set({ favTitle: query.trim().slice(0, PROFILE_LIMITS.title), favAuthor: '', favIsbn: '', favCover: '' });
    setResults(null); setQuery(''); setChanging(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {showAvatar && (
        <div style={field} role="group" aria-label="アイコン">
          <span style={label}>アイコン</span>
          {/* 10 個の決まったアイコンから 1 つ（2026-11-21・lib/avatars.js）。押した物を枠で示す・もう一度押すと外す。 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 48px)', justifyContent: 'space-between', rowGap: 'var(--space-3)' }}>
            {AVATARS.map((a) => {
              const on = value.avatar === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={a.label}
                  onClick={() => set({ avatar: on ? '' : a.id })}
                  style={{
                    width: 48, height: 48, padding: 0, border: 'none', borderRadius: '50%', background: 'none', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: on ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : 'none',
                  }}
                >
                  <UserAvatar avatarId={a.id} size={44} />
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div style={field}>
        <label htmlFor={ids.nick} style={label}>ニックネーム<span style={fieldNote}>（任意）</span></label>
        <input id={ids.nick} value={value.nickname} onChange={(e) => set({ nickname: e.target.value })} maxLength={PROFILE_LIMITS.nickname} placeholder="例：ふみ" autoComplete="nickname" style={inputBase} />
      </div>

      {showBio && (
        <div style={field}>
          <label htmlFor={ids.bio} style={label}>自己紹介<span style={fieldNote}>（任意）</span></label>
          <textarea
            id={ids.bio}
            value={value.bio || ''}
            onChange={(e) => set({ bio: e.target.value })}
            maxLength={PROFILE_LIMITS.bio}
            rows={3}
            placeholder="例：メーカーで企画の仕事。チームづくりの本をよく読みます"
            style={{ ...inputBase, minHeight: 'calc(3 * 1.5em + var(--space-6))', lineHeight: 1.5, resize: 'none' }}
          />
          <p style={{ ...hint, textAlign: 'right' }} aria-live="polite">{[...String(value.bio || '')].length} / {PROFILE_LIMITS.bio}</p>
        </div>
      )}

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
        <input id={ids.line} value={value.favLine} onChange={(e) => set({ favLine: e.target.value })} maxLength={PROFILE_LIMITS.line} placeholder="例：仕事の見え方が変わった一冊" style={inputBase} />
        <p style={hint}>好きな本は読了として本棚に入ります。<br />この 1 行は、その本のメモに残ります。</p>
      </div>
    </div>
  );
}
