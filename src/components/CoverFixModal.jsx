// 🖼 表紙修正モーダル
//
// 「自動取得した表紙が違う」と気づいたユーザーが、別エディションの表紙を
// 選び直したり手動アップロードに進めるための UI。
//
// 動作:
//   1. findIsbnCandidatesWithMetadata でタイトル/著者厳格マッチの候補を取得
//   2. 各候補 ISBN について tryCoverForIsbn で実在検証された URL を並列取得
//   3. 表紙が取れた候補だけをグリッド表示。タップで book を更新
//   4. 該当無しなら「📷 自分でアップロードする」ボタンへ誘導

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { findIsbnCandidatesWithMetadata } from '../lib/bookSearch';
import { tryCoverForIsbn } from '../lib/bookCover';
import { ensureHttps } from '../lib/url';

// 親ツリーの overflow:hidden / transform / z-index に左右されないよう
// document.body に portal する。zIndex も他モーダル群より高く設定。
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(30,25,20,0.55)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  fontFamily: "var(--font-app)",
  boxSizing: 'border-box',
};

const cardStyle = {
  background: '#faf6f0',
  borderRadius: 14,
  width: 'min(460px, 100%)',
  maxHeight: 'min(85vh, 85dvh)',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 16px 48px rgba(30,25,20,0.18)',
  overflow: 'hidden',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 16px',
  borderBottom: '1px solid #e4ddd0',
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: '#5c5043',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  padding: 0,
  borderRadius: 10,
};

const bodyStyle = {
  padding: '14px 16px 18px',
  overflowY: 'auto',
  flex: 1,
  WebkitOverflowScrolling: 'touch',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

export default function CoverFixModal({ book, onClose, onPick, onManualUpload }) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]); // [{isbn, title, author, coverUrl}]

  // 小型端末（〜480px）では 1 カラムに段組（320px 幅でも表紙が潰れないように）。
  // 表示の段組のみ — 選択ロジックには影響しない。
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 480 : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setNarrow(window.innerWidth <= 480);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const meta = await findIsbnCandidatesWithMetadata(book.title, book.author);
        // 自分自身の ISBN を先頭に置く (現在の表紙の出典として認識しやすい)
        const ordered = [];
        const seen = new Set();
        if (book.isbn) {
          const norm = String(book.isbn).replace(/[-\s]/g, '');
          ordered.push({ isbn: norm, title: book.title, author: book.author, isCurrent: true });
          seen.add(norm);
        }
        for (const m of meta) {
          if (seen.has(m.isbn)) continue;
          seen.add(m.isbn);
          ordered.push(m);
        }
        // 並列で表紙取得 (上限 8 件)
        const limited = ordered.slice(0, 8);
        const resolved = await Promise.all(
          limited.map(async (c) => {
            try {
              const url = await tryCoverForIsbn(c.isbn);
              return url ? { ...c, coverUrl: url } : null;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        const list = resolved.filter(Boolean);
        setCandidates(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [book.title, book.author, book.isbn, book.id]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 16, color: '#3d362c', margin: 0, fontWeight: 600, flex: 1 }}>
            🖼 正しい表紙を選択
          </h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div style={bodyStyle}>
          <p style={{ fontSize: 12, color: '#5c5548', margin: 0, lineHeight: 1.7 }}>
            「{book.title}」の別エディションを含めて、見つかった表紙の中から正しいものを選んでください。
          </p>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '24px 0', color: '#6b5f4d' }}>
              <div
                aria-hidden="true"
                style={{
                  width: 24,
                  height: 24,
                  border: '2px solid #e4ddd0',
                  borderTopColor: '#5C4A2E',
                  borderRadius: '50%',
                  animation: 'lvg-ptr-spin 0.8s linear infinite',
                }}
              />
              <span style={{ fontSize: 12 }}>候補を取得中…</span>
            </div>
          ) : candidates.length === 0 ? (
            <div
              style={{
                padding: '20px 16px',
                background: '#f0ebe2',
                border: '1px solid #e4ddd0',
                borderRadius: 10,
                fontSize: 13,
                color: '#5c5043',
                lineHeight: 1.7,
                textAlign: 'center',
              }}
            >
              候補となる表紙が見つかりませんでした。<br />
              下の「自分でアップロードする」から手動で設定してください。
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: narrow ? '1fr' : 'repeat(2, 1fr)',
                gap: 10,
              }}
            >
              {candidates.map((c) => (
                <button
                  key={c.isbn}
                  type="button"
                  onClick={() => {
                    onPick({ cover: c.coverUrl, coverIsbn: c.isbn });
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: 8,
                    background: c.isCurrent ? '#fff8e1' : '#fff',
                    border: c.isCurrent ? '2px solid #d4a040' : '2px solid #e4ddd0',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minHeight: 200,
                  }}
                >
                  <img
                    src={ensureHttps(c.coverUrl)}
                    alt={
                      c.isCurrent
                        ? `『${c.title || book.title}』の現在の表紙候補`
                        : `『${c.title || book.title}』の表紙候補`
                    }
                    loading="lazy"
                    style={{
                      width: '100%',
                      aspectRatio: '2/3',
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: '1px solid #e4ddd0',
                    }}
                  />
                  <div style={{ fontSize: 10, color: '#6b5f4d', textAlign: 'center', lineHeight: 1.4 }}>
                    {c.isCurrent && (
                      <div style={{ fontSize: 10, color: '#8a7040', fontWeight: 600, marginBottom: 2 }}>
                        ✓ 現在の表紙
                      </div>
                    )}
                    ISBN: {c.isbn}
                    {c.title && c.title !== book.title && (
                      <div style={{ marginTop: 2, color: '#6b5f4d', fontStyle: 'italic' }}>
                        {c.title.slice(0, 30)}{c.title.length > 30 ? '…' : ''}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid #e4ddd0', margin: '4px 0' }} />

          <p style={{ fontSize: 11, color: '#6b5f4d', margin: 0, lineHeight: 1.7 }}>
            該当する表紙が無い場合や、自分で撮影した写真を使いたい場合:
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              onManualUpload();
            }}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid #d4ccbe',
              background: '#fff',
              color: '#5c5043',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            📷 自分でアップロードする
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
