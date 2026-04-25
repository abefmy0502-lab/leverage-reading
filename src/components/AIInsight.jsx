// Reusable card for AI-generated tab insights inside Personal Capital.
// Caches results in localStorage with a 5-minute TTL keyed by a stable hash of
// the input statistics, so the same dashboard data won't burn API calls twice.
//
// Usage:
//   <AIInsight
//     tabKey="map"
//     contextHash={stableHashOfStats}
//     systemPrompt="..."
//     userPrompt="..."
//     title="🤖 あなたの読書傾向"
//   />

import { useCallback, useEffect, useRef, useState } from 'react';
import { callClaude } from '../lib/ai';
import { useAuth } from '../hooks/useAuth';

const TTL_MS = 5 * 60 * 1000;

const FALLBACK_DEFAULT = 'AI 分析は現在ご利用いただけません。少し時間をおいて再度お試しください。';

function safeStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function makeKey(userId, tabKey, contextHash) {
  return `aiInsight_${userId || 'anon'}_${tabKey}_${contextHash}`;
}

function readCache(key) {
  const s = safeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.text !== 'string') return null;
    if (typeof obj.savedAt !== 'number') return null;
    if (Date.now() - obj.savedAt > TTL_MS) return null;
    return obj.text;
  } catch {
    return null;
  }
}

function writeCache(key, text) {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify({ text, savedAt: Date.now() }));
  } catch {
    /* ignore quota errors — non-critical cache */
  }
}

// callClaude returns a string for both success and known error responses.
// Treat known error prefixes as failures so we don't cache them as insights.
function looksLikeError(text) {
  if (!text || typeof text !== 'string') return true;
  if (text.length < 8) return true;
  if (text.startsWith('エラー')) return true;
  if (text.startsWith('AI機能を使うには')) return true;
  if (text.startsWith('リクエストが多すぎ')) return true;
  if (text.startsWith('通信エラー')) return true;
  if (text.startsWith('レスポンス解析エラー')) return true;
  return false;
}

const cardStyle = {
  background: '#faf6f0',
  border: '1px solid #e4ddd0',
  borderRadius: 12,
  padding: '12px 14px',
  marginTop: 12,
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
  gap: 8,
};

const titleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: '#5c5043',
  margin: 0,
  flex: 1,
};

const regenBtnStyle = {
  fontSize: 11,
  padding: '4px 10px',
  borderRadius: 8,
  border: '1px solid #d4ccbe',
  background: 'transparent',
  color: '#5c5043',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 28,
};

const bodyStyle = {
  fontSize: 13,
  color: '#3d362c',
  lineHeight: 1.8,
  whiteSpace: 'pre-line',
  margin: 0,
};

const skeletonStyle = {
  height: 14,
  background: 'linear-gradient(90deg, #ece5d6 0%, #f5efe2 50%, #ece5d6 100%)',
  backgroundSize: '600px 100%',
  animation: 'leverage-shimmer 1.4s ease-in-out infinite',
  borderRadius: 4,
  marginBottom: 6,
};

const noteStyle = {
  fontSize: 10,
  color: '#a89e8c',
  marginTop: 8,
  lineHeight: 1.5,
};

export default function AIInsight({
  tabKey,
  contextHash,
  systemPrompt,
  userPrompt,
  title = '🤖 AI 分析',
  fallback = FALLBACK_DEFAULT,
  maxTokens = 600,
}) {
  const { user } = useAuth();
  const [text, setText] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const aliveRef = useRef(true);

  useEffect(() => () => {
    aliveRef.current = false;
  }, []);

  const cacheKey = makeKey(user?.id, tabKey, contextHash);

  const generate = useCallback(
    async ({ force = false } = {}) => {
      if (!force) {
        const cached = readCache(cacheKey);
        if (cached) {
          setText(cached);
          setErrorMsg(null);
          return;
        }
      }
      setLoading(true);
      setErrorMsg(null);
      try {
        const result = await callClaude(systemPrompt, userPrompt, { max_tokens: maxTokens });
        if (!aliveRef.current) return;
        if (looksLikeError(result)) {
          setText(null);
          setErrorMsg(result || fallback);
          return;
        }
        setText(result);
        writeCache(cacheKey, result);
      } catch {
        if (!aliveRef.current) return;
        setText(null);
        setErrorMsg(fallback);
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    },
    [cacheKey, systemPrompt, userPrompt, fallback, maxTokens]
  );

  useEffect(() => {
    aliveRef.current = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return (
    <section style={cardStyle}>
      <div style={headerStyle}>
        <h4 style={titleStyle}>{title}</h4>
        <button
          type="button"
          onClick={() => generate({ force: true })}
          disabled={loading}
          style={{ ...regenBtnStyle, opacity: loading ? 0.5 : 1 }}
        >
          {loading ? '生成中...' : '↻ 再生成'}
        </button>
      </div>

      {loading && !text && (
        <div aria-hidden="true">
          <span style={{ ...skeletonStyle, width: '100%', display: 'block' }} />
          <span style={{ ...skeletonStyle, width: '92%', display: 'block' }} />
          <span style={{ ...skeletonStyle, width: '70%', display: 'block' }} />
        </div>
      )}

      {!loading && text && <p style={bodyStyle}>{text}</p>}

      {!loading && !text && errorMsg && (
        <p style={{ ...bodyStyle, color: '#a05040' }}>{errorMsg}</p>
      )}

      <p style={noteStyle}>
        この分析は端末内に約 5 分間キャッシュされます（同じ統計なら API を叩き直しません）。
      </p>
    </section>
  );
}
