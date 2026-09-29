// 📥 ほかのアプリから取り込む（#4・2026-09-27）— ブクログの CSV・読書メーター（2026-09-29）・Kindle のハイライト。
//
// 役割（1 文）: これまでに残した読書の記録を 1 回で取り込み、初日から相談の材料を揃える。
// 流れ: ファイルを選ぶ → 見つかった本とメモを確かめる → 取り込む → 相談してみる。
// 読み取りは端末の中だけ（AI も外部送信も使わない）。保存は App の onImport（重複は既存の本に足す）。
// 見た目は DESIGN.md のトークンのみ。主ボタンは各段で 1 つ。
import { useRef, useState } from 'react';
import { FileUp, BookOpen } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { useConfirm } from './ConfirmDialog';
import ErrorMessage from './ErrorMessage';
import { btnPrimary, btnPrimaryOff, btnLink } from '../styles/ui';
import { decodeImportBytes, parseImportText, summarizeImport, mergeImportResults, importShortfall, planImport, IMPORT_MAX_BYTES } from '../lib/importers';
import { track } from '../lib/analytics';

// 日本語の折り返し: 文節で切る（auto-phrase）＋最後の行に語が 1 つだけ残らない（pretty）。
// 「」の中や「です。」だけの行ができないように（auto-phrase 非対応の端末は通常の折り返し）。
const body = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6, margin: 0, textWrap: 'pretty', wordBreak: 'auto-phrase' };
// 見出し（見つかった数・取り込んだ数）。行間は見出しの 1.3・改行は <wbr> と改行しない空白で決める。
const heading = { margin: 0, fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'balance' };
// 1 語として離したくない部分（「この本のまとめ」など）。
const nowrap = { whiteSpace: 'nowrap' };
// 見出しの数の区切り。keep-all でも「・」のあとは改行できてしまうので、前後を単語結合子（U+2060）で
// つなぐ（「本 3 冊・」で終わる行を作らない）。改行は <wbr> を置いた所だけ。
const KEEP_DOT = '\u2060・\u2060';
const howTitle = { fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', margin: 0 };
const list = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };

// 初日クイックスタートで一度に一言を書ける冊数（PastBooksQuickstart の MAX_BOOKS と同じ）。
const QUICKSTART_MAX_BOOKS = 5;

const SOURCE_LABEL = { booklog: 'ブクログ', bookmeter: '読書メーター', kindle: 'Kindle' };
// 読書メーターの棚の名前（保存したページの棚。残りのページの案内に使う）。
const SHELF_LABEL = { done: '読んだ本', reading: '読んでる本', before: '積読本', want: '読みたい本' };

// existingBooks: いまの本棚（確かめる画面で「本棚にあります」と数え方を取り込みと揃えるため）。
// onAddOneLine(books): 完了画面の「覚えている一言を足す（N 冊）」— メモも感想も無い新しい本に、
//   初日クイックスタートの「一言」の段から一言を足す（App が PastBooksQuickstart を initialBooks で開く）。
export default function ImportSheet({ onImport, onClose, onAsk, onUndoImport, onAddOneLine, existingBooks = [] }) {
  const inputRef = useRef(null);
  const [step, setStep] = useState('pick'); // pick | preview | importing | done
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const confirm = useConfirm();

  const pickFile = () => { setError(''); inputRef.current?.click(); };

  // いくつかのファイルを一度に選べる（Kindle のノートブックは 1 冊 1 ファイルなので・2026-09-29）。
  // 読めたファイルの本とメモを 1 つにまとめて確かめる（同じ本は 1 冊にまとめる）。
  const onFile = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // 同じファイルを選び直せるように
    if (!files.length) return;
    if (files.some((f) => f.size > IMPORT_MAX_BYTES)) { setError('ファイルが大きすぎます（1 つ 5MB まで）。'); return; }
    try {
      const parsed = [];
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        const text = decodeImportBytes(await file.arrayBuffer());
        parsed.push(parseImportText(file.name, text));
      }
      const r = { ...mergeImportResults(parsed), fileCount: files.length };
      if (!r.books.length) {
        // ファイルの種類は下の一覧に書いてあるので、ここでは繰り返さない。
        setError('読み取れる本がありませんでした。下のどれかのファイルを選んでください。');
        return;
      }
      setError(''); // 前に選んだファイルの「取り込めませんでした」を残さない
      setResult(r);
      setStep('preview');
      track('import_previewed', { source: r.source, ...summarizeImport(r) });
    } catch {
      setError('ファイルを読み取れませんでした。形式を確かめて、もう一度お試しください。');
    }
  };

  // 取り込みを取り消す: この取り込みで入れたものだけを消す（もとからあった本は、足したメモだけ消す）。
  // 押し間違いで消えないよう、確かめてから消す（2026-09-29）。
  const undoImport = async () => {
    if (!outcome || !onUndoImport || undoing) return;
    const ok = await confirm({
      title: '取り込みを取り消しますか？',
      message: 'この取り込みで入れた本・メモ・まとめを消します。もとから本棚にあった本は残ります。',
      confirmLabel: '取り消す',
      cancelLabel: 'やめる',
      danger: true,
    });
    if (!ok) return;
    setUndoing(true);
    try {
      await onUndoImport(outcome);
      onClose?.();
    } catch {
      setUndoing(false);
      setError('取り消せませんでした。通信環境を確認して、もう一度お試しください。');
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
      setError('取り込みの途中で止まりました。通信環境を確認して、もう一度お試しください（取り込めた分は残っています。同じファイルをもう一度選んでも、同じメモは二重になりません）。');
      setStep('preview');
    }
  };


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
            {/* 読書メーターには公式の書き出しが無いので、パソコンで保存したページ（.html）を選ぶ。書き出しツールの CSV もそのまま読める（ヘルプ）。 */}
            <p style={howTitle}>読書メーター</p>
            <p style={body}>パソコンで「読んだ本」を「リスト」表示にして、ページを保存（.html）して選びます。感想も取り込みます。ページが分かれているときは、全部のページを保存してまとめて選べます。</p>
          </li>
          <li>
            <p style={howTitle}>Kindle アプリ</p>
            <p style={body}>本を開いて「ノートブック」→ 共有（エクスポート）で届く HTML を、「ファイル」に保存して選びます。</p>
          </li>
          <li>
            <p style={howTitle}>Kindle 端末</p>
            <p style={body}>パソコンにつないで、documents にある「<span style={nowrap}>My Clippings.txt</span>」を選びます。</p>
          </li>
        </ul>
      </div>
    );
    // 「外に送らない」はファイルを渡す直前に 1 行だけ（読書の記録を渡す不安を、押す前に消す・2026-09-29）。
    footer = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <p style={{ ...body, fontSize: 'var(--text-meta)', textAlign: 'center' }}>ファイルはこの端末の中で読み取ります。<span style={nowrap}>外には送りません。</span></p>
        <button type="button" onClick={pickFile} style={btnPrimary}>
          <FileUp size={18} aria-hidden="true" />ファイルを選ぶ
        </button>
      </div>
    );
  } else if ((step === 'preview' || step === 'importing') && result) {
    // 取り込み中も同じ中身を出したまま、下のボタンだけ「取り込んでいます」にする（シートの高さを変えない）。
    const importing = step === 'importing';
    // 本棚と突き合わせて、取り込みと同じ決まりで数える（lib/importers.js の planImport・2026-09-29）:
    //   本棚にある本には「メモとして足す」（レビュー・感想もメモ）、新しい本のレビュー・感想は「この本のまとめ」。
    //   まとめもメモ 1 件として数える（ホームの「メモ N 件」・完了画面と同じ数え方）。
    const plan = planImport(result, existingBooks);
    const shown = plan.rows.slice(0, 20);
    // 数と単位は離さない（改行しない空白）。改行してよいのは「ブクログ：」のあとと「（まとめ…）」の前だけ
    // （keep-all なので「・」の前後では切れない＝「・」で終わる行ができない）。
    const countParts = [
      plan.newBooks > 0 ? `新しい本\u00a0${plan.newBooks}\u00a0冊` : `本棚の本\u00a0${plan.existingBooks}\u00a0冊`,
      plan.memos > 0 ? `メモ\u00a0${plan.memos}\u00a0件` : '',
    ].filter(Boolean);
    const source = SOURCE_LABEL[result.source];
    const shortfall = importShortfall(result);
    const files = result.fileCount || 1;
    content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {error && <ErrorMessage icon={null} title="取り込めませんでした" description={error} />}
        <p style={heading}>
          {source ? <>{source}：<wbr /></> : null}{countParts.join(KEEP_DOT)}
          {plan.memos > 0 && plan.summaries > 0 && <><wbr />{`（まとめ\u00a0${plan.summaries}\u00a0件を含む）`}</>}
        </p>
        <ul style={{ ...list, gap: 0 }}>
          {shown.map(({ book: b, existing, memos: n, summary }, i) => (
            <li key={`${b.title}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 44, padding: existing ? 'var(--space-2) 0' : 0, borderTop: i ? '1px solid var(--separator)' : 'none' }}>
              <BookOpen size={18} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                {/* 本棚にある本は新しく作らず、その本にメモとして足す（取り込みと同じ決まり）。 */}
                {existing && <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>本棚にあります（メモとして足す）</span>}
              </span>
              {n > 0 ? (
                // まとめも入る本は「メモ n・まとめ」（各行を足すと見出しの「メモ M 件（まとめ K 件を含む）」になるように）。
                <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', flexShrink: 0 }}>
                  メモ {n}{summary ? '・まとめ' : ''}
                </span>
              ) : summary ? (
                // メモが無く、レビュー・感想だけの新しい本（読書メーターに多い）は「まとめ」と出す（見出しの「まとめ N 件を含む」と対応）。
                <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', flexShrink: 0 }}>まとめ</span>
              ) : null}
            </li>
          ))}
        </ul>
        {plan.rows.length > shown.length && (
          <p style={{ ...body, fontSize: 'var(--text-meta)' }}>ほか {plan.rows.length - shown.length} 冊</p>
        )}
        {/* 読書メーターの一覧はページに分かれている。棚の全冊数より少なければ、残りのページも選んでもらう（2026-09-29）。 */}
        {shortfall && (
          <p role="note" style={body}>
            {SHELF_LABEL[shortfall.shelf] || '本棚の本'}は<span style={nowrap}>全 {shortfall.total} 冊</span>です。{files > 1 ? '保存したページ' : 'このファイル'}には <span style={nowrap}>{shortfall.found} 冊</span>。残りのページも保存して選んでください。
          </p>
        )}
        {/* 「同じ本には足す・同じメモは二重にならない」はヘルプ（bookList の取り込み）だけに書く（説明の補足文を置かない・DESIGN §0-6）。 */}
        {result.source === 'kindle' && (
          <p style={{ ...body, fontSize: 'var(--text-meta)' }}>本の状態は「読了」で入ります（あとで変えられます）。</p>
        )}
      </div>
    );
    // 取り込み中: 主ボタンを押せない形にして進み具合を出す。「別のファイルを選ぶ」は場所だけ残して隠す（高さを変えない）。
    const progressLabel = progress.total > 0
      ? `取り込んでいます（${Math.min(progress.done + 1, progress.total)} / ${progress.total} 冊）`
      : '取り込んでいます…';
    footer = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {importing ? (
          <button type="button" disabled aria-disabled="true" style={{ ...btnPrimaryOff, fontVariantNumeric: 'tabular-nums' }}>
            <span role="status" aria-live="polite">{progressLabel}</span>
          </button>
        ) : (
          <button type="button" onClick={runImport} style={btnPrimary}>取り込む</button>
        )}
        <button
          type="button"
          onClick={pickFile}
          disabled={importing}
          aria-hidden={importing || undefined}
          tabIndex={importing ? -1 : undefined}
          style={{ ...btnLink, width: '100%', visibility: importing ? 'hidden' : 'visible' }}
        >
          別のファイルを選ぶ
        </button>
      </div>
    );
  } else if (step === 'done' && outcome) {
    // 数え方は確かめる画面・ホームの「メモ N 件」と同じ: 新しい本のレビュー・感想（「この本のまとめ」）もメモ 1 件（2026-09-29）。
    const reviews = outcome.reviewsAdded || 0;
    const memos = (outcome.memosAdded || 0) + reviews;
    const any = memos > 0;
    // 数と「件」は離さない（改行を許さない空白）。改行してよいのは「（まとめ…）」の前と「〜を」のあとだけ（<wbr>）。
    const headParts = [
      outcome.booksAdded > 0 ? `新しい本\u00a0${outcome.booksAdded}\u00a0冊` : '',
      memos > 0 ? `メモ\u00a0${memos}\u00a0件` : '',
    ].filter(Boolean);
    const summaryNote = memos > 0 && reviews > 0 ? <><wbr />{`（まとめ\u00a0${reviews}\u00a0件を含む）`}</> : null;
    // したことを 1 文に（例「本 2 冊を追加・1 冊にメモを足しました。」）。最後だけ「〜ました」。
    // 数と単位は改行しない空白でつなぐ。「この本のまとめ」はかぎかっこの中で切らない（nowrap）。
    const matome = <span style={nowrap}>「この本のまとめ」</span>;
    // 読書メーターでは「感想」と呼ぶ（ブクログは「レビュー」）。
    const reviewWord = result?.source === 'bookmeter' ? '感想' : 'レビュー';
    const did = any ? [
      outcome.booksAdded > 0 ? [`本 ${outcome.booksAdded} 冊を追加`, `本 ${outcome.booksAdded} 冊を追加しました`] : null,
      outcome.booksMatched > 0 ? [`${outcome.booksMatched} 冊にメモを足し`, `${outcome.booksMatched} 冊にメモを足しました`] : null,
      reviews > 0 ? [<>{reviewWord}を{matome}に入れ</>, <>{reviewWord}を{matome}に<span style={nowrap}>入れました</span></>] : null,
    ].filter(Boolean) : [];
    const didParts = did.map((d, i) => (i === did.length - 1 ? d[1] : d[0]));
    content = (
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 0 }}>
        {error && <ErrorMessage icon={null} title="取り消せませんでした" description={error} />}
        <p style={heading}>
          {/* 確かめる画面と同じ形「新しい本 N 冊・メモ M 件（まとめ K 件を含む）」。 */}
          {headParts.length > 0 ? <>{headParts.join(KEEP_DOT)}{summaryNote}を<wbr />取り込みました</>
            : <>新しく取り込むものは<wbr />ありませんでした</>}
        </p>
        <p style={body}>
          {didParts.length > 0 && <>{didParts.map((p, i) => <span key={i}>{i > 0 ? '・' : ''}{p}</span>)}。</>}
          {!any && outcome.booksAdded > 0 && '本棚に並べました。読みながらメモを残すと、相談の根拠になります。'}
          {!any && outcome.booksAdded > 0 && outcome.booksMatched > 0 && `ほかの ${outcome.booksMatched} 冊は、すでに本棚にあります。`}
          {/* 「です。」だけが次の行に残らないよう、最後の句はまとめて折り返す。 */}
          {!any && outcome.booksAdded === 0 && <>このファイルの本とメモは、<span style={nowrap}>すでに取り込み済みです。</span></>}
        </p>
      </div>
    );
    // 閉じる入口は 1 つだけ: 相談できるときは右上の「完了」、何も入らなかったときは下の「閉じる」。
    // 「相談してみる」は送らずに相談を開く（入力欄と相談例から、自分で選んで送る＝勝手にトークンを使わない・2026-09-29）。
    // 出すのは相談の材料が入ったとき（メモ か「この本のまとめ」＝どちらもメモとして相談の根拠になる）だけ。
    const canUndo = !!onUndoImport && ((outcome.createdBookIds?.length || 0) + (outcome.createdMemoIds?.length || 0) > 0);
    const primary = any && onAsk ? (
      <button type="button" onClick={() => onAsk()} disabled={undoing} style={undoing ? btnPrimaryOff : btnPrimary}>
        相談してみる
      </button>
    ) : (
      <button type="button" onClick={onClose} disabled={undoing} style={undoing ? btnPrimaryOff : btnPrimary}>閉じる</button>
    );
    // メモも「この本のまとめ」も無い新しい本は、相談の根拠にならない。一言を足す入口を文字ボタンで（2026-09-29）。
    //   一度に開くのは初日クイックスタートと同じ最大 5 冊（数はボタンに出す冊数と同じ）。
    const bare = (Array.isArray(outcome.bareBooks) ? outcome.bareBooks : []).slice(0, QUICKSTART_MAX_BOOKS);
    const addOneLine = bare.length > 0 && onAddOneLine ? (
      <button type="button" onClick={() => { track('import_add_one_line', { books: bare.length }); onAddOneLine(bare); }} disabled={undoing} style={{ ...btnLink, width: '100%' }}>
        覚えている一言を足す（{bare.length}&nbsp;冊）
      </button>
    ) : null;
    footer = canUndo ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {primary}
        {addOneLine}
        {/* 取り消しは脇役（文字ボタン）。消すのはこの取り込みで入れたものだけ。 */}
        <button type="button" onClick={undoImport} disabled={undoing} aria-busy={undoing || undefined} style={{ ...btnLink, width: '100%', color: undoing ? 'var(--text-3)' : 'var(--error)' }}>
          {undoing ? '取り消しています…' : '取り込みを取り消す'}
        </button>
      </div>
    ) : addOneLine ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {primary}
        {addOneLine}
      </div>
    ) : primary;
  }

  return (
    <BottomSheet
      title="ほかのアプリから取り込む"
      onClose={onClose}
      footer={footer}
      // 取り込み中は閉じない（途中で閉じるとシートだけ消えて画面が固まる）。
      dismissible={step !== 'importing' && !undoing}
      // 選ぶ・確かめる: 決定は下のボタンなので右上は「キャンセル」。完了画面: 相談できるときだけ右上「完了」。
      dismissLabel={step === 'done' ? ((outcome?.memosAdded || 0) + (outcome?.reviewsAdded || 0) > 0 && onAsk ? '完了' : null) : 'キャンセル'}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.html,.htm,.json,text/csv,text/plain,text/html,application/json"
        multiple
        onChange={onFile}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />
      {content}
    </BottomSheet>
  );
}
