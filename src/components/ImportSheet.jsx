// 📥 ほかのアプリから取り込む（#4・2026-09-27）— ブクログの CSV・Kindle のハイライト。
//
// 役割（1 文）: これまでに残した読書の記録を 1 回で取り込み、初日から相談の材料を揃える。
// 流れ: ファイルを選ぶ → 見つかった本とメモを確かめる → 取り込む → 相談してみる。
// 読み取りは端末の中だけ（AI も外部送信も使わない）。保存は App の onImport（重複は既存の本に足す）。
// 見た目は DESIGN.md のトークンのみ。主ボタンは各段で 1 つ。
import { useRef, useState } from 'react';
import { FileUp, BookOpen } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import { btnPrimary, btnLink } from '../styles/ui';
import { decodeImportBytes, parseImportText, summarizeImport, IMPORT_MAX_BYTES } from '../lib/importers';
import { track } from '../lib/analytics';

const body = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 };
const howTitle = { fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', margin: 0 };
const list = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

const SOURCE_LABEL = { booklog: 'ブクログ', kindle: 'Kindle' };

export default function ImportSheet({ onImport, onClose, onAsk }) {
  const inputRef = useRef(null);
  const [step, setStep] = useState('pick'); // pick | preview | importing | done
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState(null);

  const pickFile = () => { setError(''); inputRef.current?.click(); };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じファイルを選び直せるように
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) { setError('ファイルが大きすぎます（5MB まで）。'); return; }
    try {
      const text = decodeImportBytes(await file.arrayBuffer());
      const r = parseImportText(file.name, text);
      if (!r.books.length) {
        setError('読み取れる本が見つかりませんでした。ブクログの CSV か、Kindle の「My Clippings.txt」・ノートブックの HTML を選んでください。');
        return;
      }
      setResult(r);
      setStep('preview');
      track('import_previewed', { source: r.source, ...summarizeImport(r) });
    } catch {
      setError('ファイルを読み取れませんでした。形式を確かめて、もう一度お試しください。');
    }
  };

  const runImport = async () => {
    if (!result) return;
    setStep('importing');
    setProgress({ done: 0, total: result.books.length });
    try {
      const o = await onImport(result, (done, total) => setProgress({ done, total }));
      setOutcome(o);
      setStep('done');
    } catch {
      setError('取り込みの途中で止まりました。通信の状態を確かめて、もう一度お試しください（取り込めた分は残っています。同じファイルをもう一度選んでも、同じメモは二重になりません）。');
      setStep('preview');
    }
  };

  const sum = result ? summarizeImport(result) : null;

  let content;
  let footer = null;
  if (step === 'pick') {
    content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {error && <ErrorMessage icon={null} title="取り込めませんでした" description={error} />}
        <ul style={list}>
          <li>
            <p style={howTitle}>ブクログ</p>
            <p style={body}>Web のブクログで「設定」→「エクスポート」から CSV を保存して選びます。レビューと読書メモも取り込みます。</p>
          </li>
          <li>
            <p style={howTitle}>Kindle アプリ</p>
            <p style={body}>本を開いて「ノートブック」→ 共有（エクスポート）で届く HTML を、「ファイル」に保存して選びます。</p>
          </li>
          <li>
            <p style={howTitle}>Kindle 端末</p>
            <p style={body}>パソコンにつないで、documents にある「My Clippings.txt」を選びます。</p>
          </li>
        </ul>
        {/* 「端末の中だけで読み取る」はヘルプ（bookList の取り込み）へ。ここに補足文は置かない（DESIGN §0-6）。 */}
      </div>
    );
    footer = (
      <button type="button" onClick={pickFile} style={btnPrimary}>
        <FileUp size={18} aria-hidden="true" />ファイルを選ぶ
      </button>
    );
  } else if (step === 'preview' && result) {
    const shown = result.books.slice(0, 20);
    // 件数は完了画面と同じ分け方（メモ＝カードのメモ・まとめ＝レビュー）。完了画面と数字がずれないように。
    const memoCount = result.books.reduce((n, b) => n + (b.memos?.length || 0), 0);
    const reviewCount = result.books.filter((b) => b.review).length;
    const countParts = [`本 ${sum.books} 冊`, memoCount > 0 ? `メモ ${memoCount} 件` : '', reviewCount > 0 ? `まとめ ${reviewCount} 件` : ''].filter(Boolean);
    content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {error && <ErrorMessage icon={null} title="取り込めませんでした" description={error} />}
        <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'balance' }}>
          {SOURCE_LABEL[result.source] || ''}：{countParts.join('・')}
        </p>
        <ul style={{ ...list, gap: 0 }}>
          {shown.map((b, i) => (
            <li key={`${b.title}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 44, borderTop: i ? '1px solid var(--separator)' : 'none' }}>
              <BookOpen size={18} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sub)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
              {(b.memos?.length || 0) > 0 && (
                <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', flexShrink: 0 }}>
                  メモ {b.memos.length}
                </span>
              )}
            </li>
          ))}
        </ul>
        {result.books.length > shown.length && (
          <p style={{ ...body, fontSize: 'var(--text-meta)' }}>ほか {result.books.length - shown.length} 冊</p>
        )}
        <p style={{ ...body, fontSize: 'var(--text-meta)' }}>
          {/* 「本棚に同じ本があるときは、その本に足す」はヘルプ（bookList の取り込み）へ。 */}
          同じメモは二重になりません。{result.source === 'kindle' ? '本の状態は「読了」で入ります（あとで変えられます）。' : ''}
        </p>
      </div>
    );
    footer = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <button type="button" onClick={runImport} style={btnPrimary}>取り込む</button>
        <button type="button" onClick={pickFile} style={{ ...btnLink, width: '100%' }}>別のファイルを選ぶ</button>
      </div>
    );
  } else if (step === 'importing') {
    content = (
      <div role="status" aria-live="polite" style={{ padding: 'var(--space-8) 0', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--text)' }}>取り込んでいます…</p>
        {/* margin は一括指定だけで書く（margin と marginTop を混ぜると、段の切替で React が警告する）。 */}
        <p style={{ ...body, margin: 'var(--space-2) 0 0', fontVariantNumeric: 'tabular-nums' }}>{progress.done} / {progress.total} 冊</p>
      </div>
    );
  } else if (step === 'done' && outcome) {
    // メモ＝カードのメモ。新しい本のレビューは「この本のまとめ」に入るので別に数える（件数を水増ししない）。
    const memos = outcome.memosAdded || 0;
    const reviews = outcome.reviewsAdded || 0;
    const any = memos + reviews > 0;
    const headParts = [memos > 0 ? `メモ ${memos} 件` : '', reviews > 0 ? `まとめ ${reviews} 件` : ''].filter(Boolean);
    // したことを 1 文に（例「本 2 冊を追加・1 冊にメモを足しました。」）。最後だけ「〜ました」。
    const did = any ? [
      outcome.booksAdded > 0 ? [`本 ${outcome.booksAdded} 冊を追加`, `本 ${outcome.booksAdded} 冊を追加しました`] : null,
      outcome.booksMatched > 0 ? [`${outcome.booksMatched} 冊にメモを足し`, `${outcome.booksMatched} 冊にメモを足しました`] : null,
      reviews > 0 ? ['レビューを「この本のまとめ」に入れ', 'レビューを「この本のまとめ」に入れました'] : null,
    ].filter(Boolean) : [];
    const didSentence = did.length ? `${[...did.slice(0, -1).map((d) => d[0]), did[did.length - 1][1]].join('・')}。` : '';
    content = (
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 0 }}>
        <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'balance' }}>
          {any ? `${headParts.join('・')}を取り込みました` : outcome.booksAdded > 0 ? `本 ${outcome.booksAdded} 冊を取り込みました` : '新しく取り込むものはありませんでした'}
        </p>
        <p style={body}>
          {[
            didSentence,
            !any && outcome.booksAdded > 0 ? '本棚に並べました。読みながらメモを残すと、相談の根拠になります。' : '',
            !any && outcome.booksAdded > 0 && outcome.booksMatched > 0 ? `ほかの ${outcome.booksMatched} 冊は、すでに本棚にあります。` : '',
            !any && outcome.booksAdded === 0 ? 'このファイルの本とメモは、すでに取り込み済みです。' : '',
          ].filter(Boolean).join('')}
        </p>
      </div>
    );
    // 閉じる入口は 1 つだけ: 相談できるときは右上の「完了」、何も入らなかったときは下の「閉じる」。
    footer = any && onAsk ? (
      <button type="button" onClick={() => onAsk('取り込んだメモから、いまの私にいちばん役立ちそうな学びを教えて')} style={btnPrimary}>
        相談してみる
      </button>
    ) : (
      <button type="button" onClick={onClose} style={btnPrimary}>閉じる</button>
    );
  }

  return (
    <BottomSheet
      title="ほかのアプリから取り込む"
      onClose={onClose}
      footer={footer}
      // 取り込み中は閉じない（途中で閉じるとシートだけ消えて画面が固まる）。
      dismissible={step !== 'importing'}
      // 選ぶ・確かめる: 決定は下のボタンなので右上は「キャンセル」。完了画面: 相談できるときだけ右上「完了」。
      dismissLabel={step === 'done' ? ((outcome?.memosAdded || 0) + (outcome?.reviewsAdded || 0) > 0 && onAsk ? '完了' : null) : 'キャンセル'}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.html,.htm,text/csv,text/plain,text/html"
        onChange={onFile}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />
      {content}
    </BottomSheet>
  );
}
