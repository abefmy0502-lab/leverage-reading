// 📚 AdvisorAddConfirmModal — AI 選書の「読みたいに追加」を視覚的確認に。
//
// 背景: BookAdvisor で「📚 読みたいに追加」を押すと裏で searchBooksAPIFlat
// が走り、検索 1 件目の ISBN を盲信して保存していた。検索エンジンが推薦と
// 違う本を先に返した時 (例: "エッセンシャル思考" → "思考法の必読書 50 冊")
// 誤った ISBN/表紙が確定する事故が起きていた。
//
// 解決: 検索結果を strict match で絞り込み → 候補が見つかった時はこの
// モーダルで「これでいいですか?」と視覚確認を挟む → ユーザーが選んだ
// 候補の isbn + cover を rec に焼き込んで onAddBook に渡す → addFromAdvisor
// 側は rec.isbn / rec.cover を信頼してそのまま保存 (再 search なし)。
//
// 候補が 0 件の時はモーダルを skip し、addFromAdvisor の現行フローに
// 任せる (search が strict match に通ればそれを採用、ダメなら ISBN 空で
// 保存して bg resolver が title+author で再探索)。

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ensureHttps } from '../lib/url';

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
  borderRadius: 16,
  width: '100%',
  maxWidth: 'min(440px, 100vw - 16px)',
  maxHeight: 'min(90vh, 90dvh)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxSizing: 'border-box',
  boxShadow: '0 16px 48px rgba(30,25,20,0.18)',
};

const headerStyle = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 16px',
  borderBottom: '1px solid #e4ddd0',
  background: '#fff',
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
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  minHeight: 0,
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  WebkitOverflowScrolling: 'touch',
  boxSizing: 'border-box',
};

const recBoxStyle = {
  background: '#f5efde',
  border: '1px solid #e0d0a8',
  borderRadius: 10,
  padding: '10px 12px',
};

const candidateBtn = (selected) => ({
  display: 'flex',
  gap: 10,
  padding: 10,
  background: selected ? '#fff8e1' : '#fff',
  border: selected ? '2px solid #d4a040' : '1px solid #e4ddd0',
  borderRadius: 10,
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
  alignItems: 'flex-start',
});

const footerStyle = {
  flexShrink: 0,
  display: 'flex',
  gap: 8,
  padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid #e4ddd0',
  background: '#fff',
};

export default function AdvisorAddConfirmModal({ original, candidates, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(candidates[0] || null);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onCancel}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 16, color: '#3d362c', margin: 0, fontWeight: 600, flex: 1 }}>
            📚 追加する本を確認
          </h2>
          <button type="button" style={closeBtnStyle} onClick={onCancel} aria-label="閉じる">×</button>
        </div>

        <div style={bodyStyle}>
          <div style={recBoxStyle}>
            <p style={{ fontSize: 11, color: '#8a7040', margin: 0, fontWeight: 600 }}>🤖 AI からのおすすめ</p>
            <p style={{ fontSize: 14, color: '#3d362c', margin: '4px 0 0', fontWeight: 600, wordBreak: 'keep-all' }}>
              『{original.title}』
            </p>
            {original.author && (
              <p style={{ fontSize: 11, color: '#6b5f4d', margin: '2px 0 0' }}>{original.author}</p>
            )}
          </div>

          <p style={{ fontSize: 12, color: '#5c5548', margin: 0, lineHeight: 1.7, wordBreak: 'keep-all' }}>
            {candidates.length === 1
              ? '見つかった本を確認してから追加してください。'
              : '複数の候補が見つかりました。表紙を見て正しい本を選んでください。'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {candidates.map((c) => {
              const isSelected = selected && selected.isbn === c.isbn;
              return (
                <button
                  key={c.isbn || c.title}
                  type="button"
                  onClick={() => setSelected(c)}
                  style={candidateBtn(isSelected)}
                >
                  {c.cover ? (
                    <img
                      src={ensureHttps(c.cover)}
                      alt=""
                      loading="lazy"
                      style={{
                        width: 56,
                        height: 80,
                        objectFit: 'cover',
                        borderRadius: 4,
                        flexShrink: 0,
                        border: '1px solid #e4ddd0',
                      }}
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      style={{
                        width: 56,
                        height: 80,
                        flexShrink: 0,
                        borderRadius: 4,
                        background: '#f0ebe2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        color: '#6b5f4d',
                        border: '1px dashed #d4ccbe',
                      }}
                    >
                      📚
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: '#3d362c', fontWeight: 600, margin: 0, lineHeight: 1.4, wordBreak: 'keep-all' }}>
                      {c.title}
                    </p>
                    {c.author && (
                      <p style={{ fontSize: 11, color: '#6b5f4d', margin: '2px 0 0' }}>{c.author}</p>
                    )}
                    {(c.publisher || c.pubYear) && (
                      <p style={{ fontSize: 10, color: '#6b5f4d', margin: '2px 0 0' }}>
                        {[c.publisher, c.pubYear].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {c.isbn && (
                      <p style={{ fontSize: 9, color: '#6b5f4d', margin: '4px 0 0', fontFamily: 'monospace' }}>
                        ISBN {c.isbn}
                      </p>
                    )}
                    {!c.cover && (
                      <p style={{ fontSize: 10, color: '#a05040', margin: '4px 0 0' }}>
                        ⚠ 表紙未取得
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <p style={{ fontSize: 11, color: '#6b5f4d', margin: 0, lineHeight: 1.6 }}>
            💡 該当する本がここに無い場合は「キャンセル」して、本棚の「+ 本を追加」から検索してください。
          </p>
        </div>

        <div style={footerStyle}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid #d4ccbe',
              background: '#fff',
              color: '#5c5043',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 500,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => onConfirm(selected)}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 10,
              border: 'none',
              background: selected ? '#5c5043' : '#d4ccbe',
              color: '#faf6f0',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 700,
              cursor: selected ? 'pointer' : 'not-allowed',
              minHeight: 44,
            }}
          >
            ✓ この本を追加
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
