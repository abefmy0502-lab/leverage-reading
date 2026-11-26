// 🏠✍️ ホームの「メモ」から開くクイックメモ（SPEC §1・§2）。
//
// 本の詳細画面に移らず、ホームの上にシートを重ねる（閉じても保存してもホームのまま＝
// iOS の「シートは元の画面に戻る」作法）。保存は本の詳細と同じ useBookMemos を使うので、
// メモ一覧・キャッシュ・計測は詳細画面から書いた場合と同一。
import { useBookMemos } from '../hooks/useBookMemos';
import QuickMemoSheet from './QuickMemoSheet';
import { frequentMemoTags } from '../lib/memoTags';
import { promptedMemoText } from '../lib/doneReflection';
import { LIMITS } from '../lib/limits';

// scopeClass: シートを包む class（集中モードから開くときは 'focus-dark-scope'＝明るい画面の設定でも暗い値で描く）。
// firstPrompt: この本のメモがまだ 1 件も無いときだけ入力欄の上に出す問い（集中モードのおわり・2026-11-26 体験した人の声
//   「読み終えても何を書けばいいか分からない」）。保存したメモの頭に「問い：…」の 1 行（読了の 3 つの問いと同じ形）。
export default function HomeQuickMemo({ book, allTags = [], onClose, onSaved, onOpenFullEditor, scopeClass, firstPrompt = '' }) {
  const memoOps = useBookMemos(book.id);
  const prompt = firstPrompt && !memoOps.loading && (memoOps.memos || []).length === 0 ? firstPrompt : '';
  const nums = (memoOps.memos || []).map((m) => m.pageNumber).filter((n) => Number.isFinite(n));
  return (
    <QuickMemoSheet
      bookTitle={book.title}
      defaultPageNumber={nums.length ? Math.max(...nums) + 1 : ''}
      frequentTags={frequentMemoTags(memoOps.memos, allTags)}
      onClose={onClose}
      prompt={prompt}
      onCreate={async (raw) => {
        const payload = prompt ? { ...raw, text: promptedMemoText(prompt, raw?.text, LIMITS.memoText) } : raw;
        const result = await memoOps.createMemo(payload);
        onSaved?.(result, payload);
        return result;
      }}
      onOpenFullEditor={prompt ? undefined : onOpenFullEditor}
      scopeClass={scopeClass}
    />
  );
}
