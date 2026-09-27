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

// 見た目はトークンと ui.js の部品だけ（2026-09-27: 絵文字・点線の仮表紙・等幅 9px の ISBN・
// 警告色の「表紙未取得」をやめ、表紙が無いときはアプリ共通の自動の表紙（MiniCover）を出す）。
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { MiniCover } from './BookCards';
import { btnPrimary, btnPrimaryOff, btnGhost, groupTitle } from '../styles/ui';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--z-dialog)',
  background: 'var(--backdrop)',
  backdropFilter: 'var(--backdrop-blur)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-4)',
  fontFamily: 'var(--font-ui)',
  boxSizing: 'border-box',
};

const cardStyle = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  width: '100%',
  maxWidth: 'min(440px, 100vw - 16px)',
  maxHeight: 'min(90vh, 90dvh)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxSizing: 'border-box',
  boxShadow: 'var(--shadow-overlay)',
};

const headerStyle = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-2) var(--space-2) var(--space-4)',
  borderBottom: '1px solid var(--separator)',
  background: 'var(--surface)',
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-2)',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  padding: 0,
  borderRadius: 'var(--radius)',
};

const bodyStyle = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  minHeight: 0,
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  WebkitOverflowScrolling: 'touch',
  boxSizing: 'border-box',
};

const recBoxStyle = {
  background: 'var(--fill)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-3) var(--space-4)',
};

// 候補（選んでいるものだけ栗色の枠と淡い面・右にチェック）。
const candidateBtn = (selected) => ({
  display: 'flex',
  gap: 'var(--space-3)',
  padding: 'var(--space-3)',
  background: selected ? 'var(--accent-soft)' : 'var(--surface)',
  border: selected ? '1px solid var(--accent)' : '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  color: 'var(--text)',
  width: '100%',
  boxSizing: 'border-box',
  alignItems: 'flex-start',
});

const metaText = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 'var(--space-1) 0 0', lineHeight: 1.5 };

const footerStyle = {
  flexShrink: 0,
  display: 'flex',
  gap: 'var(--space-2)',
  padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid var(--separator)',
  background: 'var(--surface)',
};

export default function AdvisorAddConfirmModal({ original, candidates, onConfirm, onCancel }) {
  // index で選択を管理（ISBN が無い候補同士でも選択が壊れない / 確認ボタンが
  // 無効のまま固まらないようにする）。
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = candidates[selectedIdx] || null;
  const trapRef = useFocusTrap(true);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onCancel}>
      <div ref={trapRef} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 'var(--text-body)', color: 'var(--text)', margin: 0, fontWeight: 600, flex: 1 }}>
            追加する本を確認
          </h2>
          <button type="button" style={closeBtnStyle} onClick={onCancel} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
        </div>

        <div style={bodyStyle}>
          <div style={recBoxStyle}>
            <p style={groupTitle}>AI のおすすめ</p>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--text)', margin: 'var(--space-1) 0 0', fontWeight: 600, lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              『{original.title}』
            </p>
            {original.author && <p style={metaText}>{original.author}</p>}
          </div>

          <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 0, lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {candidates.length === 1
              ? '見つかった本を確かめてから追加してください。'
              : '候補がいくつか見つかりました。表紙を見て、正しい本を選んでください。'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} role="radiogroup" aria-label="追加する本の候補">
            {candidates.map((c, i) => {
              const isSelected = selectedIdx === i;
              return (
                <button
                  key={c.isbn || `${c.title}-${i}`}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedIdx(i)}
                  style={candidateBtn(isSelected)}
                >
                  {/* 表紙が無い・読めないときはアプリ共通の自動の表紙（書名入りの色面）。 */}
                  <MiniCover book={{ id: c.isbn || `cand-${i}`, title: c.title, cover: c.cover || '' }} width={56} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', fontWeight: 600, margin: 0, lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                      {c.title}
                    </p>
                    {c.author && <p style={metaText}>{c.author}</p>}
                    {(c.publisher || c.pubYear) && (
                      <p style={metaText}>{[c.publisher, c.pubYear].filter(Boolean).join(' · ')}</p>
                    )}
                    {c.isbn && <p style={{ ...metaText, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>ISBN {c.isbn}</p>}
                  </div>
                  {isSelected && <Check size={20} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 0, lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            ここに無いときは「キャンセル」して、「すべての本」の右上の ＋ から探してください。
          </p>
        </div>

        <div style={footerStyle}>
          <button type="button" onClick={onCancel} style={{ ...btnGhost, flex: 1, width: 'auto' }}>
            キャンセル
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => onConfirm(selected)}
            style={{ ...(selected ? btnPrimary : btnPrimaryOff), flex: 1, width: 'auto' }}
          >
            この本を追加
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
