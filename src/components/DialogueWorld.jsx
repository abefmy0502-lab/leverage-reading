// 🌐 対話の世界の入口（2026-11-25 オーナー「本と、著者と、これまで読んできた本たちと会話できる世界」・lib/dialogueWorld.js）。
//   相談の最初の画面（すべての本・まだ会話が無いとき）の相談例の下に、静かに 3 つ:
//     本と話す   … メモのある本の表紙（横に送る）→ 押すとその本が話し相手（相談の見出しと問いかけが変わる）
//                  ＋「2 冊を選んで、考えをぶつける」（相談相手のシート）
//     著者と話す … 著者の名前（お気に入りの著者が先）→ その著者の本が話し相手
//     読んできた本から … 話しかけてくる 1 枚（再会・つながり・前の自分）。日ごとに 1 枚・AI なし
//   ここではトークンを使わない（話し相手を選ぶ・下書きを入れる・重ねるまで）。送るのは本人。
import { useMemo } from 'react';
import { ChevronRight, UserRound } from 'lucide-react';
import MiniCover from './MiniCover';
import { withPhraseBreaks } from './TightBubble';
import { useAllMemoRows } from '../hooks/useAllMemoRows';
import { btnLink, btnLinkQuiet, groupTitle, scrollFade } from '../styles/ui';
import { talkBooks, talkAuthors, rediscoverCard, shortBookTitle } from '../lib/dialogueWorld';
import { localFavoriteAuthors } from '../lib/favoriteAuthors';
import { openOverlap } from '../lib/overlap';
import { track } from '../lib/analytics';

const COVER_W = 64;
const sectionGap = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' };
const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };

export default function DialogueWorld({ books = [], memoBookIds = null, userId = null, onPickBooks, onPickSeveral, onDraft }) {
  const list = useMemo(() => talkBooks(books, memoBookIds), [books, memoBookIds]);
  const authors = useMemo(() => talkAuthors(books, memoBookIds, localFavoriteAuthors(userId)), [books, memoBookIds, userId]);
  const { rows, status } = useAllMemoRows({ userId, books, active: list.length > 0 });
  const card = useMemo(() => (rows ? rediscoverCard({ rows, books }) : null), [rows, books]);

  // メモを読み終えてから一度に出す（「読んできた本から」があとから差し込まれて、表紙の列が押し下げられないように・2026-11-25 ui-critic）。
  if (!list.length || status === 'loading') return null;

  const openCard = () => {
    if (!card) return;
    track('dialogue_rediscover', { kind: card.kind });
    if (card.kind === 'reunion') onDraft?.(card.question, card.bookIds);
    else openOverlap({ id: card.memo.id, text: card.memo.text, bookId: card.memo.book_id }, card.other.id);
  };

  return (
    <div data-dialogue-world="" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', marginTop: 'var(--space-6)' }}>
      {card && (
        <section aria-labelledby="dw-rediscover-h" style={sectionGap}>
          <h3 id="dw-rediscover-h" style={{ ...groupTitle, margin: 0 }}>読んできた本から</h3>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--space-3) var(--space-4) var(--space-1)' }}>
            <p style={meta}>{withPhraseBreaks(card.lead)}</p>
            <p style={{ margin: 'var(--space-2) 0 0', fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'normal', lineBreak: 'strict', overflowWrap: 'anywhere' }}>
              「{card.quote}」
            </p>
            <button type="button" onClick={openCard} style={{ ...btnLink, minHeight: 'var(--tap-min)', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
              {card.action}<ChevronRight size="1em" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="dw-books-h" style={sectionGap}>
        <h3 id="dw-books-h" style={{ ...groupTitle, margin: 0 }}>本と話す</h3>
        <ul style={{ listStyle: 'none', margin: '0 calc(-1 * var(--space-4))', padding: '0 var(--space-4)', display: 'flex', gap: 'var(--space-3)', overflowX: 'auto', scrollbarWidth: 'none', ...scrollFade }}>
          {list.map((b) => (
            <li key={b.id} style={{ flexShrink: 0, width: COVER_W }}>
              <button
                type="button"
                onClick={() => { track('dialogue_pick', { kind: 'book' }); onPickBooks?.([b.id]); }}
                aria-label={`『${b.title}』と話す`}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%', minHeight: 'var(--tap-min)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                <MiniCover title={b.title} cover={b.cover} width={COVER_W} />
                <span aria-hidden="true" style={{ fontSize: 'var(--text-caption)', color: 'var(--text-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                  {withPhraseBreaks(shortBookTitle(b.title, 16), { scriptBreaks: true })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {list.length >= 2 && (
          <button type="button" onClick={() => { track('dialogue_pick', { kind: 'several' }); onPickSeveral?.(); }} style={{ ...btnLinkQuiet, alignSelf: 'flex-start', minHeight: 'var(--tap-min)', marginLeft: 'calc(-1 * var(--space-1))' }}>
            2 冊を選んで、考えをぶつける
          </button>
        )}
      </section>

      {authors.length > 0 && (
        <section aria-labelledby="dw-authors-h" style={sectionGap}>
          <h3 id="dw-authors-h" style={{ ...groupTitle, margin: 0 }}>著者と話す</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {authors.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => { track('dialogue_pick', { kind: 'author', books: a.bookIds.length }); onPickBooks?.(a.bookIds, a.name); }}
                aria-label={`${a.name}さんの本と話す`}
                // 話し相手を選ぶ部品（枠のチップ・人の印）。押すと送る「たとえば」の相談例（塗りの面）と見分ける（2026-11-25 ui-critic）。
                style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 'var(--tap-min)', padding: '0 var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sub)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <UserRound size="1em" aria-hidden="true" style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                {a.name}{a.bookIds.length > 1 && <span style={{ color: 'var(--text-3)', marginLeft: 'var(--space-1)' }}>{a.bookIds.length}&nbsp;冊</span>}
              </button>
            ))}
          </div>
          <p style={{ ...meta, color: 'var(--text-3)' }}>{withPhraseBreaks('答えは AI の解釈です。著者本人の言葉ではありません。')}</p>
        </section>
      )}
    </div>
  );
}
