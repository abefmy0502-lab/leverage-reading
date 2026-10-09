// 🏠✍️ ホームの「メモ」から開くクイックメモ（SPEC §1・§2）。
//
// 本の詳細画面に移らず、ホームの上にシートを重ねる（閉じても保存してもホームのまま＝
// iOS の「シートは元の画面に戻る」作法）。保存は本の詳細と同じ useBookMemos を使うので、
// メモ一覧・キャッシュ・計測は詳細画面から書いた場合と同一。
import { useBookMemos } from '../hooks/useBookMemos';
import QuickMemoSheet from './QuickMemoSheet';
import { frequentMemoTags } from '../lib/memoTags';

// scopeClass: シートを包む class（集中モードから開くときは 'focus-dark-scope'＝明るい画面の設定でも暗い値で描く）。
export default function HomeQuickMemo({ book, allTags = [], onClose, onSaved, onOpenFullEditor, scopeClass }) {
  const memoOps = useBookMemos(book.id);
  const nums = (memoOps.memos || []).map((m) => m.pageNumber).filter((n) => Number.isFinite(n));
  return (
    <QuickMemoSheet
      bookTitle={book.title}
      defaultPageNumber={nums.length ? Math.max(...nums) + 1 : ''}
      frequentTags={frequentMemoTags(memoOps.memos, allTags)}
      onClose={onClose}
      onCreate={async (payload) => {
        const result = await memoOps.createMemo(payload);
        onSaved?.(result, payload);
        return result;
      }}
      onOpenFullEditor={onOpenFullEditor}
      scopeClass={scopeClass}
    />
  );
}
