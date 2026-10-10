// 📷 写真で共有の入口で、背景をどうするかを選ぶシート（2026-10-11 オーナー裁定）。
// 「写真で共有」を押したらすぐカメラ、をやめ、毎回 3 つから選ぶ（覚えない＝毎回聞く）:
//   カメラで撮る … 隠した input（capture あり）＝iOS はカメラ・パソコンは写真を選ぶ画面
//   写真から選ぶ … 隠した input（capture なし）＝iOS はフォトライブラリ（「アルバムから選ぶ」と同じ）
//   写真なし（本の表紙） … カメラを開かずに共有のシートへ（表紙がある本は「表紙の色」・無ければ紙）
// 押した瞬間に（await を挟まずに）input を開く必要があるので、選ぶ処理は親（App.jsx）が持つ。
// 閉じる入口は右上の「キャンセル」1 つ（DESIGN §5 のシート）。説明の文は置かない。
import { Camera, Image as ImageIcon, BookOpen } from 'lucide-react';
import BottomSheet from './BottomSheet';

const listBox = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};

const row = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  width: '100%',
  minHeight: 'calc(var(--btn-h) + var(--space-2))', // 56
  padding: 'var(--space-2) var(--space-4)',
  background: 'none',
  border: 'none',
  color: 'var(--text)',
  fontSize: 'var(--text-body)',
  fontWeight: 400,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

export const SHARE_SOURCES = [
  { key: 'camera', label: 'カメラで撮る', Icon: Camera },
  { key: 'album', label: '写真から選ぶ', Icon: ImageIcon },
  { key: 'none', label: '写真なし（本の表紙）', Icon: BookOpen },
];

export default function ShareSourceSheet({ onPick, onClose }) {
  return (
    <BottomSheet title="写真で共有" dismissLabel="キャンセル" onClose={onClose}>
      <div style={listBox}>
        {SHARE_SOURCES.map(({ key, label, Icon }, i) => (
          <button
            key={key}
            type="button"
            data-share-source={key}
            onClick={() => onPick(key)}
            style={{ ...row, borderTop: i === 0 ? 'none' : '1px solid var(--separator)' }}
          >
            <Icon size="1.3em" strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-2)' }} />
            <span style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
