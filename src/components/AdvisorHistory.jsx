// 🕒 AdvisorHistory — AI 選書の履歴一覧 + 個別会話詳細。
//
// BookAdvisor 内で view='history' or 'detail' に切り替えた時に表示する。
// chat 画面 (.chat-scroll) と同じ flex column 内に置かれ、AI タブの
// レイアウトを乱さない。session オブジェクトは useAdvisorSessions から。

import { useMemo, useState } from 'react';
import EmptyState from './EmptyState.jsx';

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

export function AdvisorSessionDetail({ session, onResume, onNewSession, onClose }) {
  const messages = useMemo(() => Array.isArray(session?.messages) ? session.messages : [], [session]);
  const recs = useMemo(() => Array.isArray(session?.recommended_books) ? session.recommended_books : [], [session]);

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
            const text = (m.content ?? m.text ?? '').toString();
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 12, color: '#5c5043', fontWeight: 600, margin: 0 }}>📚 提案された本</p>
          {recs.map((b, i) => (
            <div key={i} style={{ background: '#faf6f0', border: '1px solid #e4ddd0', borderRadius: 10, padding: '10px 12px' }}>
              <p style={{ fontSize: 13, color: '#3d362c', fontWeight: 600, margin: 0 }}>『{b.title}』</p>
              {b.author && <p style={{ fontSize: 11, color: '#8a7e6b', margin: '2px 0 0' }}>{b.author}</p>}
              {b.why && <p style={{ fontSize: 11, color: '#5c5548', margin: '6px 0 0', lineHeight: 1.7 }}>{b.why}</p>}
            </div>
          ))}
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
