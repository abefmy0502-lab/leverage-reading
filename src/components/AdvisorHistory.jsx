// 🕒 AdvisorHistory — AI 選書の履歴一覧 + 個別会話詳細。
//
// BookAdvisor 内で view='history' or 'detail' に切り替えた時に表示する。
// chat 画面 (.chat-scroll) と同じ flex column 内に置かれ、AI タブの
// レイアウトを乱さない。session オブジェクトは useAdvisorSessions から。

import { useMemo, useState } from 'react';
import {
  History,
  ChevronLeft,
  BookOpen,
  Check,
  Trash2,
  MessageSquare,
  Plus,
} from 'lucide-react';
import EmptyState from './EmptyState.jsx';
import MarkdownSections from './MarkdownSections';
import Spinner from './Spinner';
import BookStoreLinks from './BookStoreLinks';
import { STORE_DISCLOSURE_TEXT } from '../lib/rakutenLink';
import { btnPrimary, btnGhost, btnGhostOff, btnText } from '../styles/ui';
import { displayUserText, concernOf, interviewPairsOf, advisorSetupFields } from '../lib/advisorText';
import { filterProseTitles, proseTitleLists } from '../lib/advisorProse';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const t = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `今日 ${t}`;
  if (d.toDateString() === yesterday.toDateString()) return `昨日 ${t}`;
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) + ` ${t}`;
}

function firstUserContent(messages) {
  if (!Array.isArray(messages)) return '';
  const m = messages.find((x) => x?.role === 'user');
  return (m?.content || m?.text || '').toString();
}


// AI 応答から RECOMMENDATIONS_START..END の JSON ブロックを除去して
// 人間向けのプロセだけ残す。session.messages は永続化用に AI の生テキスト
// (マーカー込み) を保存しているため、履歴表示時はここで剥がす。
function stripRecommendations(text) {
  if (!text) return '';
  let cleaned = text
    // END マーカー欠落（max_tokens 打ち切り）でも生 JSON を残さないよう `|$` を許容。
    // App.jsx の stripRecoBlock と挙動を揃える（履歴詳細でも生マーカーを漏らさない）。
    .replace(/RECOMMENDATIONS_START[\s\S]*?(?:RECOMMENDATIONS_END|$)/g, '')
    // ブロック除去で空になった「## 📚 おすすめの本」見出しも落とす。
    .replace(/\n*#{1,4}\s*📚?\s*おすすめの本[^\n]*\s*(?=#{1,4}\s|$)/gu, '\n');
  // 連続改行を 2 行までに圧縮 + 末尾整理
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

// ── 見た目は DESIGN.md のトークンのみ（相談＝MyBookBrain と同じ部品の形） ──
// カード: --surface ＋ 枠 --separator ＋ 角丸 12 ＋ 内側 16。影なし。
const cardBase = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
};

// 一覧の行（押すと会話を開く）。
const card = {
  ...cardBase,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  width: '100%',
  minHeight: 44,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const meta = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-3)',
  fontSize: 'var(--text-meta)',
  color: 'var(--text-3)',
};

const metaItem = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' };

// 画面の余白（左右 16）。
const pageStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4) var(--space-6)' };

// iOS のナビゲーションバーの形: 左に戻る・中央に題名・右は同じ幅の空き（相談と同じ）。
const navRow = { display: 'flex', alignItems: 'center', minHeight: 44 };
const navSide = { width: 96, flexShrink: 0 };
const navTitle = { flex: 1, minWidth: 0, margin: 0, textAlign: 'center', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 };
const backBtn = { ...btnText, fontSize: 'var(--text-body)', fontWeight: 400, padding: 'var(--space-2) 0', gap: 'var(--space-1)', lineHeight: 1.3 };

// 行の中の副ボタン（DESIGN §5 btnRow: 44・15・600）。
const rowBtn = { ...btnGhost, width: 'auto', minHeight: 44, padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sub)', flexShrink: 0 };

// 読む文章（AI の答え・推薦理由）＝明朝 18・行間 1.6。
const readText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)' };

function NavBar({ backLabel, onBack, title }) {
  return (
    <div style={navRow}>
      <div style={navSide}>
        <button type="button" onClick={onBack} style={backBtn}>
          <ChevronLeft size={20} aria-hidden="true" />{backLabel}
        </button>
      </div>
      <h2 style={navTitle}>{title}</h2>
      <div style={navSide} aria-hidden="true" />
    </div>
  );
}

export function AdvisorHistoryList({ sessions, loaded, onSelect, onClose, onDelete }) {
  return (
    <div style={pageStyle}>
      <NavBar backLabel="AI 選書" onBack={onClose} title="履歴" />

      {!loaded ? (
        <Spinner message="読み込み中…" />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<History size={32} strokeWidth={1.5} aria-hidden="true" />}
          title="まだ履歴がありません"
          actions={[{ label: '本を探す', onClick: onClose, variant: 'secondary' }]}
        />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {sessions.map((s) => {
            const head = displayUserText(firstUserContent(s.messages)).split('\n')[0].slice(0, 80) || '無題';
            const recCount = Array.isArray(s.recommended_books) ? s.recommended_books.length : 0;
            const addedCount = Array.isArray(s.added_book_ids) ? s.added_book_ids.length : 0;
            return (
              <li key={s.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => onSelect(s)}
                  style={card}
                >
                  <div style={{ fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.5, paddingRight: 'var(--space-8)', overflowWrap: 'anywhere' }}>
                    {head}
                  </div>
                  <div style={meta}>
                    <span>{formatDate(s.created_at)}</span>
                    {recCount > 0 && (
                      <span style={metaItem}>
                        <BookOpen size={14} aria-hidden="true" />
                        {recCount} 冊提案
                      </span>
                    )}
                    {addedCount > 0 && (
                      <span style={metaItem}>
                        <Check size={14} aria-hidden="true" />
                        {addedCount} 冊追加
                      </span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  aria-label="削除"
                  title="削除"
                  style={{
                    // 44px ルール: アイコンは小さいまま実効タップ領域を広げ、
                    // 隣接する「カードを開く」への誤タップを防ぐ。
                    position: 'absolute',
                    top: 'var(--space-1)',
                    right: 'var(--space-1)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                    padding: 0,
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// 推薦本カード — 履歴詳細用 (live chat と同じ field 構成 + ストアリンク + 追加 button)
// ============================================================================
function RecommendationCard({ book, isAdded, isAdding, onAdd }) {
  return (
    <div
      style={{
        ...cardBase,
        wordBreak: 'keep-all',
        overflowWrap: 'anywhere',
      }}
    >
      <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, margin: 0 }}>
        『{book.title}』
      </p>
      {book.author && (
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 'var(--space-1) 0 0' }}>{book.author}</p>
      )}

      {book.why && (
        <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: 'var(--fill)', borderRadius: 'var(--radius)' }}>
          <p style={fieldLabel}>なぜあなたに</p>
          <p style={{ ...readText, margin: 'var(--space-1) 0 0' }}>{book.why}</p>
        </div>
      )}
      {book.core && <RecField label="この本の核心" text={book.core} />}
      {book.focus && <RecField label="注目ポイント" text={book.focus} />}
      {book.duration && (
        <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 'var(--space-3) 0 0' }}>
          <span style={{ fontWeight: 600 }}>目安</span>　{book.duration}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
        {isAdded ? (
          <p role="status" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--success)' }}>
            <Check size={16} aria-hidden="true" />
            追加済み
          </p>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdd?.();
            }}
            disabled={isAdding}
            style={{
              ...rowBtn,
              cursor: isAdding ? 'wait' : 'pointer',
              // 押せない間は薄くせず、副ボタンの無効の色（btnGhostOff）で示す。
              ...(isAdding ? { color: btnGhostOff.color, borderColor: btnGhostOff.borderColor } : null),
              opacity: 1,
              touchAction: 'manipulation',
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {isAdding ? '計画を作成中…' : '読みたいに追加'}
          </button>
        )}
        {/* Amazon + 楽天 の両方（会話中のカードと同じ部品）。開示はカード群の下にまとめて出す。 */}
        <BookStoreLinks book={book} variant="compact" showDisclosure={false} stopPropagation />
      </div>
    </div>
  );
}

const fieldLabel = { fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text-2)', margin: 0 };

function RecField({ label, text }) {
  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <p style={fieldLabel}>{label}</p>
      <p style={{ fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)', margin: 'var(--space-1) 0 0' }}>{text}</p>
    </div>
  );
}

export function AdvisorSessionDetail({ session, books, onResume, onNewSession, onClose, onAddBook, onBookAdded }) {
  const messages = useMemo(() => Array.isArray(session?.messages) ? session.messages : [], [session]);
  const recs = useMemo(() => Array.isArray(session?.recommended_books) ? session.recommended_books : [], [session]);
  // AI の文の書名は、実在を確かめたカードの本（_verify==='ok'）と本棚の本だけ残す（会話中と同じ・lib/advisorProse.js）。
  //   確かめた結果を持たない古い会話は、本棚の本以外の書名を出さない（「この会話を続ける」で確かめ直せる）。
  const proseLists = useMemo(() => proseTitleLists(recs, books), [recs, books]);

  // 既に本棚にある本 (タイトル+著者の正規化キー or ISBN/ASIN で重複判定)
  const addedKeySet = useMemo(() => {
    const norm = (s) => (s || '').toString().toLowerCase().replace(/\s+/g, '');
    const set = new Set();
    (books || []).forEach((b) => {
      if (b.isbn) set.add(`isbn:${norm(b.isbn)}`);
      if (b.asin) set.add(`asin:${norm(b.asin)}`);
      if (b.title) set.add(`ta:${norm(b.title)}|${norm(b.author || '')}`);
    });
    return set;
  }, [books]);

  const isBookAdded = (rec) => {
    const norm = (s) => (s || '').toString().toLowerCase().replace(/\s+/g, '');
    if (rec.isbn && addedKeySet.has(`isbn:${norm(rec.isbn)}`)) return true;
    if (rec.asin && addedKeySet.has(`asin:${norm(rec.asin)}`)) return true;
    if (rec.title && addedKeySet.has(`ta:${norm(rec.title)}|${norm(rec.author || '')}`)) return true;
    return false;
  };

  // 連打防止 + UI 即時反映用のローカル set。クリック直後に key を入れ、
  // 失敗時のみ rollback する。背景処理 (DB insert / 表紙取得 / AI 要約) は
  // 一切 await しないので、ボタンは < 5ms で「✅ 追加済み」に切り替わる。
  const [locallyAdded, setLocallyAdded] = useState(() => new Set());
  // 直近の相談文（AI 向けのテンプレートのまま保存されている）から、本人の言葉だけを使う。
  const lastUserRaw = useMemo(() => {
    const lastUser = [...messages].reverse().find((m) => m?.role === 'user');
    return (lastUser?.content || lastUser?.text || '').toString();
  }, [messages]);
  const lastUserQuery = useMemo(() => concernOf(lastUserRaw), [lastUserRaw]);
  // 読書準備の分け方は AI 選書の画面と同じ（課題＝相談＋1 問目・得たいこと＝理想の状態の答え・lib/advisorText.js）。
  const setupFields = useMemo(
    () => advisorSetupFields(lastUserQuery, interviewPairsOf(lastUserRaw)),
    [lastUserQuery, lastUserRaw],
  );

  const recKey = (rec) => {
    const norm = (s) => (s || '').toString().toLowerCase().replace(/\s+/g, '');
    return rec.isbn ? `isbn:${norm(rec.isbn)}` : `ta:${norm(rec.title)}|${norm(rec.author || '')}`;
  };

  const handleAdd = (rec) => {
    if (!onAddBook) return;
    const key = recKey(rec);
    if (locallyAdded.has(key)) return; // 連打ガード
    // 1. UI 即時反映 — ここで一切 await しない
    setLocallyAdded((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    // 2. 重い処理は完全に背景。Promise.resolve().then で次の tick へ。
    //    handler は同期で終わる。
    Promise.resolve().then(async () => {
      try {
        const saved = await onAddBook(rec, {
          sourceQuery: setupFields.purpose.slice(0, 400),
          investPurpose: setupFields.purpose.slice(0, 400),
          currentChallenge: setupFields.challenge.slice(0, 400),
          hypothesis: String(rec.core || '').slice(0, 300),
          bookReason: rec.why || '',
        });
        // onAddBook は失敗時に throw せず null を返す契約。falsy は失敗として巻き戻す。
        if (!saved) {
          setLocallyAdded((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          return;
        }
        // このセッションの added_book_ids に記録（履歴一覧の「N 冊追加」を正しく）。
        if (saved.id) onBookAdded?.(saved.id);
      } catch (e) {
        // 失敗したらローカル state を巻き戻す → ボタンが復活
        setLocallyAdded((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    });
  };

  return (
    <div style={pageStyle}>
      <NavBar backLabel="履歴" onBack={onClose} title={formatDate(session?.created_at)} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }} role="region" aria-label="AI 選書の会話">
        {messages.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={32} strokeWidth={1.5} aria-hidden="true" />}
            title="この会話には記録がありません"
          />
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === 'user';
            const raw = (m.content ?? m.text ?? '').toString();
            // assistant メッセージは RECOMMENDATIONS の JSON を剥がして
            // プロセだけにする (永続化フォーマットの都合で生 JSON が混じっているため)
            const text = isUser ? displayUserText(raw) : filterProseTitles(stripRecommendations(raw), proseLists);
            if (!text) return null; // JSON だけのメッセージは非表示
            return isUser ? (
              // ユーザーの相談＝右寄せの --fill 吹き出し（相談と同じ）。
              <div
                key={i}
                style={{ display: 'flex', justifyContent: 'flex-end' }}
                role="article"
                aria-label="あなたの相談"
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius)',
                    background: 'var(--fill)',
                    color: 'var(--text)',
                    fontSize: 'var(--text-body)',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'keep-all',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {text}
                </div>
              </div>
            ) : (
              // AI の提案＝Markdown（見出し・箇条書き）として描画（生の ## を出さない。会話中と同じ）。
              <div key={i} role="article" aria-label="AI の提案" style={{ minWidth: 0 }}>
                <MarkdownSections text={text} />
              </div>
            );
          })
        )}
      </div>

      {recs.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }} aria-labelledby="advisor-history-recs">
          <h3 id="advisor-history-recs" style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: 0 }}>
            提案された本
          </h3>
          {recs.map((b, i) => (
            <RecommendationCard
              key={`${b.title}-${i}`}
              book={b}
              // ローカル即時 set または books 由来の既存判定で「追加済み」表示。
              // どちらも同期 read なので button の見た目は次の render で確定する。
              isAdded={locallyAdded.has(recKey(b)) || isBookAdded(b)}
              isAdding={false}
              onAdd={() => handleAdd(b)}
            />
          ))}
          <small style={{ fontSize: 'var(--text-caption)', color: 'var(--text-3)', lineHeight: 1.5 }}>
            {STORE_DISCLOSURE_TEXT}
          </small>
        </section>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        <button type="button" onClick={() => onResume(session)} style={btnPrimary}>
          この会話を続ける
        </button>
        <button type="button" onClick={onNewSession} style={btnGhost}>
          新しい会話を始める
        </button>
      </div>
    </div>
  );
}

const _exports = { AdvisorHistoryList, AdvisorSessionDetail };
export default _exports;
