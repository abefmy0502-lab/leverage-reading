// 🕒 AdvisorHistory — AI 選書の履歴一覧 + 個別会話詳細。
//
// BookAdvisor 内で view='history' or 'detail' に切り替えた時に表示する。
// chat 画面 (.chat-scroll) と同じ flex column 内に置かれ、AI タブの
// レイアウトを乱さない。session オブジェクトは useAdvisorSessions から。

import { useMemo, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import { getAmazonLink } from '../lib/amazonLink';

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
  let cleaned = text.replace(
    /RECOMMENDATIONS_START[\s\S]*?RECOMMENDATIONS_END/g,
    '',
  );
  // 連続改行を 2 行までに圧縮 + 末尾整理
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

const card = {
  background: '#faf6f0',
  border: '1px solid #e4ddd0',
  borderRadius: 12,
  padding: '12px 14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const meta = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  fontSize: 11,
  color: '#8a7e6b',
};

const btnGhost = {
  background: 'transparent',
  border: '1px solid #d4ccbe',
  borderRadius: 8,
  padding: '4px 10px',
  fontSize: 11,
  color: '#8a7e6b',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export function AdvisorHistoryList({ sessions, loaded, onSelect, onClose, onDelete }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" onClick={onClose} style={{ ...btnGhost, border: 'none', color: '#5c5043' }}>← 戻る</button>
        <p style={{ fontSize: 13, color: '#3d362c', fontWeight: 600, margin: 0 }}>🕒 AI 選書の履歴</p>
        <span style={{ width: 50 }} />
      </div>

      {!loaded ? (
        <p style={{ fontSize: 12, color: '#a89e8c', textAlign: 'center', padding: 20 }}>
          読み込み中…
        </p>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon="🕒"
          title="まだ履歴がありません"
          description="AI 選書で会話を始めると、ここに履歴が残ります。"
        />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.map((s) => {
            const head = firstUserContent(s.messages).slice(0, 80) || '無題';
            const recCount = Array.isArray(s.recommended_books) ? s.recommended_books.length : 0;
            const addedCount = Array.isArray(s.added_book_ids) ? s.added_book_ids.length : 0;
            return (
              <li key={s.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => onSelect(s)}
                  style={card}
                >
                  <div style={{ fontSize: 13, color: '#3d362c', fontWeight: 500, lineHeight: 1.5, paddingRight: 28 }}>
                    {head}
                  </div>
                  <div style={meta}>
                    <span>{formatDate(s.created_at)}</span>
                    {recCount > 0 && <span>📚 {recCount} 冊提案</span>}
                    {addedCount > 0 && <span>✅ {addedCount} 冊追加</span>}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  aria-label="削除"
                  title="削除"
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'transparent',
                    border: 'none',
                    fontSize: 14,
                    color: '#a89e8c',
                    cursor: 'pointer',
                    padding: 4,
                    fontFamily: 'inherit',
                  }}
                >
                  🗑
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
// 推薦本カード — 履歴詳細用 (live chat と同じ field 構成 + Amazon + 追加 button)
// ============================================================================
function RecommendationCard({ book, isAdded, isAdding, onAdd }) {
  const amazonHref = getAmazonLink(book);
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e4ddd0',
        borderRadius: 14,
        padding: 14,
        boxShadow: '0 1px 4px rgba(30,25,20,0.04)',
        wordBreak: 'keep-all',
        overflowWrap: 'anywhere',
        boxSizing: 'border-box',
      }}
    >
      <p style={{ fontSize: 14, fontWeight: 700, color: '#5C4A2E', margin: 0 }}>
        『{book.title}』
      </p>
      {book.author && (
        <p style={{ fontSize: 12, color: '#8a7e6b', margin: '2px 0 8px' }}>— {book.author}</p>
      )}

      {book.why && (
        <RecField label="🎯 なぜあなたに必要か" text={book.why} />
      )}
      {book.core && (
        <RecField label="💡 この本の核心" text={book.core} />
      )}
      {book.focus && (
        <RecField label="📍 注目すべきポイント" text={book.focus} />
      )}
      {book.duration && (
        <div
          style={{
            background: '#FFF8E1',
            border: '1px solid #e0c878',
            borderRadius: 8,
            padding: '8px 10px',
            margin: '8px 0 0',
            fontSize: 12,
            color: '#5D4037',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          ⏱ {book.duration}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <a
          href={amazonHref}
          target="_blank"
          rel="sponsored noopener noreferrer"
          style={{
            flex: 1,
            minWidth: 120,
            padding: '10px 12px',
            background: '#FF9900',
            color: '#fff',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            textAlign: 'center',
            textDecoration: 'none',
            fontFamily: 'inherit',
            minHeight: 40,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          🛒 Amazon で買う
        </a>
        {isAdded ? (
          <button
            type="button"
            disabled
            style={{
              flex: 1,
              minWidth: 120,
              padding: '10px 12px',
              background: '#E0E0E0',
              color: '#666',
              border: 'none',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'not-allowed',
              fontFamily: 'inherit',
              minHeight: 40,
            }}
          >
            ✅ 追加済み
          </button>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            disabled={isAdding}
            style={{
              flex: 1,
              minWidth: 120,
              padding: '10px 12px',
              background: '#5c5043',
              color: '#faf6f0',
              border: 'none',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              cursor: isAdding ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              minHeight: 40,
              opacity: isAdding ? 0.7 : 1,
            }}
          >
            {isAdding ? '📚 計画を作成中…' : '📚 読みたいに追加'}
          </button>
        )}
      </div>
    </div>
  );
}

function RecField({ label, text }) {
  return (
    <div style={{ background: 'rgba(92,74,46,0.04)', borderRadius: 8, padding: '8px 10px', margin: '6px 0' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#5C4A2E', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 13, lineHeight: 1.7, color: '#3d362c', margin: 0 }}>{text}</p>
    </div>
  );
}

export function AdvisorSessionDetail({ session, books, onResume, onNewSession, onClose, onAddBook }) {
  const messages = useMemo(() => Array.isArray(session?.messages) ? session.messages : [], [session]);
  const recs = useMemo(() => Array.isArray(session?.recommended_books) ? session.recommended_books : [], [session]);

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

  const [addingTitle, setAddingTitle] = useState('');
  const lastUserQuery = useMemo(() => {
    const lastUser = [...messages].reverse().find((m) => m?.role === 'user');
    return (lastUser?.content || lastUser?.text || '').toString();
  }, [messages]);

  const handleAdd = async (rec) => {
    if (!onAddBook || addingTitle) return;
    setAddingTitle(rec.title);
    try {
      await onAddBook(rec, {
        sourceQuery: lastUserQuery,
        investPurpose: lastUserQuery || '',
        currentChallenge: '',
        hypothesis: '',
        bookReason: rec.why || '',
      });
    } finally {
      setAddingTitle('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" onClick={onClose} style={{ ...btnGhost, border: 'none', color: '#5c5043' }}>← 戻る</button>
        <p style={{ fontSize: 13, color: '#3d362c', fontWeight: 600, margin: 0 }}>{formatDate(session?.created_at)} の会話</p>
        <span style={{ width: 50 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 ? (
          <p style={{ fontSize: 12, color: '#a89e8c', textAlign: 'center', padding: 20 }}>
            メッセージがありません。
          </p>
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === 'user';
            const raw = (m.content ?? m.text ?? '').toString();
            // assistant メッセージは RECOMMENDATIONS の JSON を剥がして
            // プロセだけにする (永続化フォーマットの都合で生 JSON が混じっているため)
            const text = isUser ? raw : stripRecommendations(raw);
            if (!text) return null; // JSON だけのメッセージは非表示
            return (
              <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: 14,
                    background: isUser ? '#5c5043' : '#f7f3ec',
                    color: isUser ? '#faf6f0' : '#3d362c',
                    fontSize: 13,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'keep-all',
                    overflowWrap: 'anywhere',
                    borderBottomRightRadius: isUser ? 4 : 14,
                    borderBottomLeftRadius: isUser ? 14 : 4,
                  }}
                >
                  {text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {recs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          <p style={{ fontSize: 12, color: '#5c5043', fontWeight: 600, margin: 0 }}>📚 提案された本</p>
          {recs.map((b, i) => (
            <RecommendationCard
              key={`${b.title}-${i}`}
              book={b}
              isAdded={isBookAdded(b)}
              isAdding={addingTitle === b.title}
              onAdd={() => handleAdd(b)}
            />
          ))}
          <p style={{ fontSize: 10, color: '#a89e8c', margin: '4px 0 0', lineHeight: 1.6 }}>
            ※ Amazon のリンクはアソシエイトリンクです (購入時に運営に紹介料が入ります)
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onResume(session)}
          style={{
            flex: 1,
            minWidth: 140,
            padding: '12px 14px',
            background: '#5c5043',
            color: '#faf6f0',
            border: 'none',
            borderRadius: 10,
            fontSize: 13,
            fontFamily: 'inherit',
            fontWeight: 600,
            cursor: 'pointer',
            minHeight: 44,
          }}
        >
          💬 この会話を続ける
        </button>
        <button
          type="button"
          onClick={onNewSession}
          style={{
            flex: 1,
            minWidth: 140,
            padding: '12px 14px',
            background: 'transparent',
            color: '#5c5043',
            border: '1px solid #d4ccbe',
            borderRadius: 10,
            fontSize: 13,
            fontFamily: 'inherit',
            fontWeight: 500,
            cursor: 'pointer',
            minHeight: 44,
          }}
        >
          🆕 新しい会話を始める
        </button>
      </div>
    </div>
  );
}

const _exports = { AdvisorHistoryList, AdvisorSessionDetail };
export default _exports;
