// 📥 ほかのアプリから取り込む（#4・2026-09-27）— ブクログの CSV・読書メーター（2026-09-29）・Kindle のハイライト。
//
// 役割（1 文）: これまでに残した読書の記録を 1 回で取り込み、初日から相談の材料を揃える。
// 流れ: ファイルを選ぶ → 見つかった本とメモを確かめる → 取り込む → 相談してみる。
// 読み取りは端末の中だけ（AI も外部送信も使わない）。保存は App の onImport（重複は既存の本に足す）。
// 見た目は DESIGN.md のトークンのみ。主ボタンは各段で 1 つ。
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, BookOpen, ClipboardPaste, Share } from 'lucide-react';
import MiniCover from './MiniCover';
import { Chip } from './formPrimitives';
import BottomSheet from './BottomSheet';
import { useConfirm } from './ConfirmDialog';
import ErrorMessage from './ErrorMessage';
import NotifyOptInCard from './NotifyOptInCard';
import { withPhraseBreaks } from './TightBubble';
import { btnPrimary, btnPrimaryOff, btnLink, groupTitle } from '../styles/ui';
import { resolveListBooks, setGuessedStatus, hasNotes } from '../lib/importLookup';
import { BOOKMETER_BOOKMARKLET } from '../lib/bookmeterBookmarklet';
import { KINDLE_BOOKMARKLET } from '../lib/kindleBookmarklet';
import { importHandoffText } from '../lib/importHandoff';
import { shareReferral } from '../lib/referral';
import { searchBooksOnServer } from '../lib/bookSearch';
import { input as uiInput } from '../styles/ui';
import { autoGrowTextarea } from '../hooks/useComposerHeight';
import { decodeImportBytes, parseImportText, parsePastedText, summarizeImport, mergeImportResults, importShortfall, planImport, IMPORT_MAX_BYTES, IMPORT_MAX_BOOKS } from '../lib/importers';
import { track } from '../lib/analytics';

// 日本語の折り返し: 文節で切る（auto-phrase）＋最後の行に語が 1 つだけ残らない（pretty）。
// 「」の中や「です。」だけの行ができないように（auto-phrase 非対応の端末は通常の折り返し）。
// 約物の空きを詰める（palt・行の頭の全角かっこが字下げに見えない・2026-10-04 ui-critic）。
const body = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6, margin: 0, textWrap: 'pretty', wordBreak: 'auto-phrase', fontFeatureSettings: '"palt"' };
// 見出し（見つかった数・取り込んだ数）。行間は見出しの 1.3・改行は <wbr> と改行しない空白で決める。
const heading = { margin: 0, fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'balance', fontFeatureSettings: '"palt"' };
// 1 語として離したくない部分（「この本のまとめ」など）。
const nowrap = { whiteSpace: 'nowrap' };
// 見出しの数の区切り。keep-all でも「・」のあとは改行できてしまうので、前後を単語結合子（U+2060）で
// つなぐ（「本 3 冊・」で終わる行を作らない）。改行は <wbr> を置いた所だけ。
const KEEP_DOT = '\u2060・\u2060';
// <wbr> のあとに来る開き括弧は、行の頭に来たとき全角の左の空きで字下げして見えるので、半角の幅に詰める（halt・2026-09-30）。
const halt = { fontFeatureSettings: '"halt"' };
const haltOpen = (str) => (typeof str === 'string' && str.startsWith('（') ? <><span style={halt}>（</span>{str.slice(1)}</> : str);
const howTitle = { fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', margin: 0 };
// 手順どうし（ブクログ・読書メーター・Kindle）の間は 24、見出しから本文は 4（まとまりの中 ＜ まとまりの間・2026-11-23 点検）。
const list = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' };
const howItem = { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' };

// 初日クイックスタートで一度に一言を書ける冊数（PastBooksQuickstart の MAX_BOOKS と同じ）。
const QUICKSTART_MAX_BOOKS = 5;
// 冊数は 3 桁ごとに区切る（1,000）。
const fmt = (n) => Number(n || 0).toLocaleString('ja-JP');

const SOURCE_LABEL = { booklog: 'ブクログ', bookmeter: '読書メーター', kindle: 'Kindle', goodreads: 'Goodreads', storygraph: 'StoryGraph', orime: 'orime の書き出し', list: '書名の一覧' };
// 状態をまとめて決める選択肢（状態が分からない本・2026-11-25）。
const GUESS_CHOICES = [['want', '読みたい'], ['before', '積読'], ['reading', '読書中'], ['done', '読了']];
// 読書メーターの棚の名前（保存したページの棚。残りのページの案内に使う）。
const SHELF_LABEL = { done: '読んだ本', reading: '読んでる本', before: '積読本', want: '読みたい本' };
// 確かめる画面の各行に出す、取り込んだあとの本の状態（アプリの 4 つの状態の名前）。
const IMPORT_STATUS_LABEL = { done: '読了', reading: '読書中', before: '積読', want: '読みたい' };

// existingBooks: いまの本棚（確かめる画面で「本棚にあります」と数え方を取り込みと揃えるため）。
// onAddOneLine(books): 完了画面の「覚えている一文を足す（N 冊）」— メモも感想も無い新しい本に、
//   初日クイックスタートの「一言」の段から一言を足す（App が PastBooksQuickstart を initialBooks で開く）。
// loadMemoTexts(bookIds): 本棚の本にもうあるメモの本文（Map<id, Set<本文>>・読めなければ null）。確かめる画面で、
//   同じ文のメモ（取り込みでも足さない）を数えないため（2026-09-29）。
export default function ImportSheet({ onImport, onClose, onAsk, onUndoImport, onAddOneLine, existingBooks = [], loadMemoTexts = null }) {
  const inputRef = useRef(null);
  // 文字の大きさの設定が大きいとき（ルートの文字 22px 以上）は、下に固定の欄の「外には送りません」を手順の後ろへ回す
  // （固定の欄が高くなって、手順が 2 行しか見えなかった・2026-10-08 ui-critic）。
  const [largeText] = useState(() => {
    try { return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 22; } catch { return false; }
  });
  const [step, setStep] = useState('pick'); // pick | paste | checking | preview | importing | done
  // 貼り付けた一覧（2026-11-25）。
  const [pasteText, setPasteText] = useState('');
  // 書店で確かめている間の止め（シートを閉じたら止める）。
  const lookupRef = useRef(null);
  // 書店の検索がつながらなかったとき（もう一度確かめる・このまま取り込む）。
  const [checkFail, setCheckFail] = useState(null);
  // 確かめている本の出どころ（貼り付け／ファイル）＝確かめている途中の出口の言葉。
  const [checkFromPaste, setCheckFromPaste] = useState(false);
  useEffect(() => () => lookupRef.current?.abort(), []);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState(null);
  const [undoing, setUndoing] = useState(false);
  // 取り込みを始めたときの見込み（取り込み中は本棚が増えていくので、数え直すと「新しい本」が減って見える）。
  const [planSnap, setPlanSnap] = useState(null);
  // 本棚の本にもうあるメモの本文（確かめる画面の「新しいメモ M 件」を取り込みと同じ数にする）。
  const [memoTexts, setMemoTexts] = useState(null);
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
      // 本が 1 冊も読めなかったファイルの名前（確かめる画面に 1 行で出す＝どれが入らなかったか分かるように・2026-09-29）。
      const unreadFiles = [];
      for (const file of files) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const text = decodeImportBytes(await file.arrayBuffer());
          const one = parseImportText(file.name, text);
          if (one?.books?.length) parsed.push(one);
          else unreadFiles.push(file.name);
        } catch {
          unreadFiles.push(file.name);
        }
      }
      const r = { ...mergeImportResults(parsed), fileCount: files.length, unreadFiles };
      if (!r.books?.length) {
        // ファイルの種類は下の一覧に書いてあるので、ここでは繰り返さない。
        setError('読み取れる本がありませんでした。下のどれかのファイルを選んでください。');
        return;
      }
      await prepare(r);
    } catch {
      setError('ファイルを読み取れませんでした。ファイルの形式を確認して、もう一度お試しください。');
    }
  };

  // 読めた結果を確かめる画面へ。1 行 1 冊の一覧は、先に書店の検索で本を確かめる（2026-11-25・lib/importLookup.js）。
  const prepare = async (r0) => {
    setCheckFail(null);
    let r = r0;
    const needs = r.books.filter((b) => b.needsLookup).length;
    if (needs) {
      lookupRef.current?.abort();
      const ctrl = new AbortController();
      lookupRef.current = ctrl;
      setError('');
      setProgress({ done: 0, total: needs });
      setCheckFromPaste(!!r.fromPaste);
      setStep('checking');
      const res = await resolveListBooks(r.books, {
        search: (q) => searchBooksOnServer(q, { signal: ctrl.signal }),
        onEach: (done, total) => setProgress({ done, total }),
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      const lookupOf = (x) => ({ found: x.found, loose: x.loose, missing: x.missing, failed: x.failed || 0, merged: x.merged || 0, mergedBooks: x.mergedBooks || 0, mergedLines: x.mergedLines || 0 });
      // 書店の検索がつながらず、1 冊も確かめられなかった（通信・サーバー）。ファイルのせいにしない（2026-11-25 ui-critic）。
      if (res.failed > 0 && res.found === 0 && res.loose === 0) {
        setCheckFail({ r0, asIs: { ...r, books: res.books, lookup: lookupOf(res) } });
        setStep('checkFailed');
        return;
      }
      // ファイルから読んだ一覧で、書店に 1 冊も見つからなかったら、本の一覧ではないファイル（メモ書き・ほかの形式）とみなす
      //   （「これは読めないファイルです」が本 2 冊として入っていた・2026-11-25 ui-critic）。貼り付けた一覧は本人が書いたので入れる。
      if (!r.fromPaste && res.found === 0 && res.loose === 0 && !res.failed) {
        const others = res.books.filter((b) => !b.unverified);
        if (!others.length) {
          setStep('pick');
          setError('読み取れる本がありませんでした。下のどれかのファイルを選んでください。');
          return;
        }
        res.books = others;
        res.missing = 0;
      }
      r = { ...r, books: res.books, lookup: lookupOf(res) };
    }
    await toPreview(r);
  };

  // 確かめる画面へ（本棚にある本のメモの本文を先に読む＝確かめる画面の数が、出てから減って見えないように）。
  const toPreview = async (r) => {
    let texts = null;
    if (loadMemoTexts) {
      const ids = planImport(r, existingBooks).matchedIds;
      if (ids.length) {
        try { texts = await loadMemoTexts(ids); } catch { texts = null; }
      }
    }
    setMemoTexts(texts);
    setError(''); // 前に選んだファイルの「取り込めませんでした」を残さない
    setResult(r);
    setStep('preview');
    track('import_previewed', { source: r.source, ...summarizeImport(r) });
  };

  // 読書メーターの全ページを 1 回で保存するコードをコピー（2026-11-25）。
  const [copied, setCopied] = useState(false);
  const copyBookmarklet = async () => {
    try { await navigator.clipboard.writeText(BOOKMETER_BOOKMARKLET); setCopied(true); track('import_bookmarklet_copied', {}); } catch { setCopied(false); }
  };
  // 💻 パソコンで続ける（2026-11-27・lib/importHandoff.js）: 手順と 2 つのコードを共有シートで自分のパソコンへ。無ければコピー。
  //   コピーもできなければ、読むだけの欄に文を出して長押しで選んでもらう（黙って失敗しない・ui-critic）。
  //   パソコン（細かく指せる・hover できる）では出さない＝そこではもう手順どおりに進める。
  const [handoffState, setHandoffState] = useState(''); // '' | 'copied' | 'manual'
  const handoffOn = useMemo(() => {
    try { return !window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return true; }
  }, []);
  const sendHandoff = async () => {
    track('import_handoff', { action: 'open' });
    const text = importHandoffText();
    if (await shareReferral(text)) return;
    try { await navigator.clipboard.writeText(text); setHandoffState('copied'); } catch { setHandoffState('manual'); }
  };
  // Kindle のノートブックの全部の本を 1 回で保存するコードをコピー（2026-11-26・lib/kindleBookmarklet.js）。
  const [kindleCopied, setKindleCopied] = useState(false);
  const copyKindleBookmarklet = async () => {
    try { await navigator.clipboard.writeText(KINDLE_BOOKMARKLET); setKindleCopied(true); track('import_bookmarklet_copied', { source: 'kindle' }); } catch { setKindleCopied(false); }
  };

  // 📋 一覧を貼り付ける（2026-11-25）: 書名か ISBN を 1 行に 1 冊。読書メーターの「テキストのみ」のコピーや、
  //   スプレッドシートの列のコピーもそのまま（書名に見えない行は書店で確かめて外せる）。
  const readPasted = async () => {
    const text = pasteText.trim();
    if (!text) return;
    try {
      const one = parsePastedText(text);
      if (!one?.books?.length) { setError('本として読める行がありませんでした。書名か ISBN を 1 行に 1 冊ずつ書いてください。'); return; }
      await prepare({ ...mergeImportResults([one]), fileCount: 1, unreadFiles: [], fromPaste: true });
    } catch {
      setError('読み取れませんでした。書名か ISBN を 1 行に 1 冊ずつ書いてください。');
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
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;
    setUndoing(true);
    try {
      await onUndoImport(outcome);
      onClose?.();
    } catch {
      setUndoing(false);
      setError('取り消せませんでした。通信状況を確認して、もう一度お試しください。');
    }
  };

  // 本棚と突き合わせた見込み（本が多いファイルでも、描き直すたびに数え直さない）。
  const livePlan = useMemo(() => (result ? planImport(result, existingBooks, IMPORT_MAX_BOOKS, memoTexts) : null), [result, existingBooks, memoTexts]);

  const runImport = async () => {
    if (!result || !livePlan) return;
    const snap = livePlan;
    setPlanSnap(snap);
    setError(''); // 前の回の失敗の文を残さない（やり直して成功しても赤い文が出ていた・2026-11-25 点検）
    setStep('importing');
    setProgress({ done: 0, total: snap.books.length });
    try {
      // 取り込むのは、本棚にある本と、新しい本 2,000 冊まで（残りは同じファイルをもう一度選ぶと取り込める）。
      const o = await onImport({ ...result, books: snap.books }, (done, total) => setProgress({ done, total }));
      setOutcome(o);
      setStep('done');
    } catch {
      setError('取り込みが途中で止まりました。通信状況を確認して、もう一度「取り込む」を押してください。入った分は二重になりません。');
      setPlanSnap(null); // 確かめる画面に戻ったら、いまの本棚で数え直す
      setStep('preview');
      // 途中まで足したメモは、次の取り込みで足さない。数え直せるように本文を読み直す（読めなければ前のまま）。
      if (loadMemoTexts && snap.matchedIds?.length) {
        loadMemoTexts(snap.matchedIds).then((t) => { if (t) setMemoTexts(t); }).catch(() => {});
      }
    }
  };


  let content;
  let footer = null;
  // 貼り付けた一覧の行の数（主ボタンに「書店で確かめる（N 冊）」）。
  const pasteLines = step === 'paste' ? pasteText.split(/\r?\n/).filter((l) => l.trim()).length : 0;
  const localNote = (
    <p style={{ ...body, fontSize: 'var(--text-meta)', textAlign: largeText ? 'left' : 'center' }}>ファイルはこの端末の中で読み取ります。<span style={nowrap}>外には送りません。</span></p>
  );
  if (step === 'pick') {
    content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {error && <ErrorMessage icon={null} title="取り込めませんでした" description={error} />}
        {/* パソコンが要る手順（ブクログ・読書メーター・Kindle）を、スマホから自分のパソコンへ送る（2026-11-27）。
            手順の一覧とは線と見出しで分ける（6 つ目の取り込み元に見えないように）。
            一覧の上に置く（スマホで開いた人が最初に読むのはブクログの「スマホのアプリからは書き出せません」＝そこで止まらないように・2026-11-27 模擬 6 回目）。 */}
        {handoffOn && (
          <section aria-labelledby="import-handoff-title" style={{ borderBottom: '1px solid var(--separator)', paddingBottom: 'var(--space-3)' }}>
            <p id="import-handoff-title" style={{ ...groupTitle, margin: 0 }}>パソコンが手元に無いとき</p>
            <p id="import-handoff-desc" style={{ ...body, marginTop: 'var(--space-1)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('手順とコードを、メールやメモで自分のパソコンへ送れます。')}</p>
            <button type="button" onClick={sendHandoff} aria-describedby="import-handoff-desc" style={{ ...btnLink, marginLeft: 'calc(-1 * var(--space-1))', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Share size="1.1em" aria-hidden="true" style={{ flexShrink: 0 }} />
              <span aria-live="polite">{handoffState === 'copied' ? 'コピーしました。パソコンへ送ってください' : '手順をパソコンへ送る'}</span>
            </button>
            {handoffState === 'manual' && (
              <>
                <p role="alert" style={{ ...body, color: 'var(--error)', marginTop: 'var(--space-2)' }}>{withPhraseBreaks('この端末ではコピーできませんでした。下の文を長押しで選んでコピーしてください。')}</p>
                <textarea readOnly rows={6} value={importHandoffText()} aria-label="パソコンへ送る手順" style={{ ...uiInput, resize: 'none', marginTop: 'var(--space-2)', lineHeight: 1.6 }} />
              </>
            )}
          </section>
        )}
        <ul style={list}>
          <li style={howItem}>
            <p style={howTitle}>ブクログ</p>
            {/* 公式ヘルプの手順（パソコンの Web 版だけ・本棚マーク → スパナ → エクスポート・2026-11-25 調査）。 */}
            <p style={body}>パソコンの Web 版のブクログで、本棚の本棚マーク → スパナのマーク → 「エクスポート」で CSV を保存して選びます。スマホのアプリからは書き出せません。レビュー・読書メモ・カテゴリ（フォルダになります）も取り込みます。</p>
          </li>
          <li style={howItem}>
            {/* 読書メーターには公式の書き出しが無いので、パソコンで保存したページ（.html）を選ぶ。書き出しツールの CSV もそのまま読める（ヘルプ）。 */}
            <p style={howTitle}>読書メーター</p>
            <p style={body}>パソコンで「読んだ本」を「リスト」表示にして、ページを保存（.html）して選びます。感想も取り込みます。ページが分かれているときは、全部のページを保存してまとめて選べます。</p>
            {/* 全ページを 1 回で（2026-11-25・lib/bookmeterBookmarklet.js）。本人のブラウザで本人の一覧を読むだけ・外へは送らない。 */}
            <details style={{ marginTop: 'var(--space-1)' }}>
              <summary style={{ ...body, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center' }}>全ページを 1 回で保存する（パソコン）</summary>
              <ol style={{ ...body, margin: 'var(--space-2) 0 0', paddingLeft: '1.2em', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <li>{withPhraseBreaks('下のボタンでコードをコピーし、ブラウザにブックマークを作って、URL の欄に貼ります。')}</li>
                <li>{withPhraseBreaks('読書メーターにログインして「読んだ本」を開き、そのブックマークを押します。')}</li>
                <li>{withPhraseBreaks('全部のページを読んで、1 つのファイルに保存します。そのファイルをここで選びます。')}</li>
              </ol>
              <button type="button" onClick={copyBookmarklet} style={{ ...btnLink, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
                {copied ? 'コピーしました' : 'コードをコピー'}
              </button>
            </details>
          </li>
          <li style={howItem}>
            <p style={howTitle}>Kindle アプリ</p>
            {/* 初めての人がたどり着ける手順（2026-10-08 オーナー承認・ui-critic）。補足は手順の後ろに小さく。 */}
            <p style={{ ...body, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('Kindle アプリで本を開き、画面を押して上のノートブックのアイコン ')}<span style={nowrap}>→ エクスポート。</span>{withPhraseBreaks('届いた HTML ファイルを「ファイル」に保存して、ここで選びます。')}</p>
            <p style={{ ...body, fontSize: 'var(--text-meta)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('読んでいる途中でも取り込めます。同じメモは二重に入りません。何冊分かをまとめて選べます。')}</p>
            {/* 全部の本を 1 回で（2026-11-26・lib/kindleBookmarklet.js）。本人のブラウザで本人のノートブックを読むだけ・外へは送らない。 */}
            <details style={{ marginTop: 'var(--space-1)' }}>
              <summary style={{ ...body, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center' }}>全部の本を 1 回で保存する（パソコン）</summary>
              <ol style={{ ...body, margin: 'var(--space-2) 0 0', paddingLeft: '1.2em', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <li>{withPhraseBreaks('下のボタンでコードをコピーし、ブラウザにブックマークを作って、URL の欄に貼ります。')}</li>
                <li>{withPhraseBreaks('read.amazon.co.jp/notebook を開いてログインし、そのブックマークを押します。')}</li>
                <li>{withPhraseBreaks('全部の本のハイライトとメモを読んで、1 つのファイルに保存します。そのファイルをここで選びます。')}</li>
              </ol>
              <button type="button" onClick={copyKindleBookmarklet} style={{ ...btnLink, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
                {kindleCopied ? 'コピーしました' : 'コードをコピー'}
              </button>
            </details>
          </li>
          <li style={howItem}>
            <p style={howTitle}>Kindle 端末</p>
            <p style={body}>パソコンにつないで、documents にある「<span style={nowrap}>My Clippings.txt</span>」を選びます。</p>
          </li>
          <li style={howItem}>
            <p style={howTitle}>Goodreads・StoryGraph</p>
            <p style={body}>{withPhraseBreaks('書き出した CSV をそのまま選びます。棚・星・読了日・レビューも取り込みます。')}</p>
          </li>
        </ul>
        {largeText && localNote}
      </div>
    );
    // 「外に送らない」はファイルを渡す直前に 1 行だけ（読書の記録を渡す不安を、押す前に消す・2026-09-29）。
    footer = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {!largeText && localNote}
        <button type="button" onClick={pickFile} style={btnPrimary}>
          <FileUp size="1.1em" aria-hidden="true" style={{ flexShrink: 0 }} /><span style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('ファイルを選ぶ')}</span>
        </button>
        {/* ファイルが無い人の入口（書名か ISBN の一覧を貼る・2026-11-25）。 */}
        <button type="button" onClick={() => { setError(''); setStep('paste'); }} style={{ ...btnLink, width: '100%' }}>
          <ClipboardPaste size="1.1em" aria-hidden="true" style={{ flexShrink: 0 }} />書名の一覧を貼り付ける
        </button>
      </div>
    );
  } else if (step === 'paste') {
    content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {error && <ErrorMessage icon={null} title="読み取れませんでした" description={error} />}
        <p style={body}>{withPhraseBreaks('書名か ISBN を 1 行に 1 冊ずつ。著者は「書名 / 著者」のように書けます。')}</p>
        <textarea
          value={pasteText}
          autoFocus
          maxLength={200000}
          rows={8}
          aria-label="書名の一覧"
          placeholder={'考え方 / 稲盛和夫\n9784763141712\n7つの習慣'}
          onChange={(e) => { setPasteText(e.target.value); autoGrowTextarea(e.target); }}
          style={{ ...uiInput, resize: 'none', overflowY: 'auto', minHeight: 'calc(var(--text-body) * 1.6 * 8 + var(--space-6))', maxHeight: '50vh', lineHeight: 1.6 }}
        />
      </div>
    );
    footer = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* 貼り付けた一覧は書店の検索に送る（ファイルの「端末の中だけ」とは違う・2026-11-25 ui-critic）。 */}
        <p style={{ ...body, fontSize: 'var(--text-meta)', textAlign: largeText ? 'left' : 'center' }}>{withPhraseBreaks('書名と ISBN だけを書店の検索に送ります。')}<span style={nowrap}>メモは送りません。</span></p>
        <button type="button" onClick={readPasted} disabled={!pasteLines} style={pasteLines ? btnPrimary : btnPrimaryOff}>
          {pasteLines ? `書店で確かめる（${fmt(pasteLines)} 冊）` : '書店で確かめる'}
        </button>
        <button type="button" onClick={() => { setError(''); setStep('pick'); }} style={{ ...btnLink, width: '100%' }}>ファイルから取り込む</button>
      </div>
    );
  } else if (step === 'checking') {
    content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {/* 進み具合は見出しに（押せない灰色のボタンで同じ言葉を繰り返さない・2026-11-25 ui-critic）。 */}
        <p role="status" aria-live="polite" style={{ ...heading, fontVariantNumeric: 'tabular-nums' }}>
          書店で本を確かめています{progress.total > 0 && <><wbr /><span style={nowrap}>（{Math.min(progress.done, progress.total)} / {progress.total} 冊）</span></>}
        </p>
        {progress.total >= 50 && (
          <p style={body}>{withPhraseBreaks(progress.total >= 500 ? '数分かかることがあります。画面を開いたままお待ちください。' : '1 分ほどかかることがあります。画面を開いたままお待ちください。')}</p>
        )}
      </div>
    );
    footer = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <button type="button" onClick={() => { lookupRef.current?.abort(); setStep(checkFromPaste ? 'paste' : 'pick'); }} style={{ ...btnLink, width: '100%' }}>
          {checkFromPaste ? '一覧を直す' : 'ファイルを選び直す'}
        </button>
      </div>
    );
  } else if (step === 'checkFailed' && checkFail) {
    // 書店の検索がつながらなかった（通信・サーバー）。もう一度確かめるか、貼った一覧はそのまま入れる（書いた書名のまま）。
    content = (
      <ErrorMessage icon={null} title="書店で確かめられませんでした" description="通信状況を確認して、もう一度お試しください。書いた書名のまま進むこともできます。" />
    );
    footer = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <button type="button" onClick={() => prepare(checkFail.r0)} style={btnPrimary}>もう一度確かめる</button>
        {/* 原因は通信なので、ファイルの一覧も同じく書いた書名のまま確かめる画面へ進める（行き止まりにしない）。 */}
        <button type="button" onClick={() => { const r = checkFail.asIs; toPreview(r).finally(() => setCheckFail(null)); }} style={{ ...btnLink, width: '100%' }}>書いた書名のまま進む</button>
      </div>
    );
  } else if ((step === 'preview' || step === 'importing') && result) {
    // 取り込み中も同じ中身を出したまま、下のボタンだけ「取り込んでいます」にする（シートの高さを変えない）。
    const importing = step === 'importing';
    // 本棚と突き合わせて、取り込みと同じ決まりで数える（lib/importers.js の planImport・2026-09-29）:
    //   本棚にある本には「メモとして足す」（レビュー・感想もメモ）、新しい本のレビュー・感想は「この本のまとめ」。
    //   まとめもメモ 1 件として数える（ホームの「メモ N 件」・完了画面と同じ数え方）。
    const plan = importing && planSnap ? planSnap : livePlan;
    // 一覧は新しい本を先に（最大 20 冊）。本棚にある本は 1 行にまとめる（「本棚にある本 N 冊（新しいメモ M 件を足す）」・2026-09-29）。
    const newRows = plan.rows.filter((r) => !r.existing);
    const guessedRows = newRows.filter((r) => r.book.statusGuessed);
    const guessedCount = guessedRows.length;
    // いま選んでいる状態（決めつけた本がみな同じ状態なら、その状態を選んだ形に）
    // 選んだ状態を優先する（メモのある本は積読を選んでも読了のまま＝本の状態だけ見ると、押した所が選ばれて見えない）。
    const guessedStatusRaw = guessedCount && result.guessChoice ? result.guessChoice : '';
    const shown = newRows.slice(0, 20);
    // 数と単位は離さない（改行しない空白）。改行してよいのは「ブクログ：」のあとと「（まとめ…）」の前だけ
    // （keep-all なので「・」の前後では切れない＝「・」で終わる行ができない）。
    const countParts = [
      plan.newBooks > 0 ? `新しい本\u00a0${plan.newBooks}\u00a0冊` : `本棚の本\u00a0${plan.existingBooks}\u00a0冊`,
      // まとめだけのときは「まとめ N 件」（「メモ N 件（まとめ N 件を含む）」と同じ数を言い直さない・2026-09-29）。
      plan.memos > 0 ? (plan.summaries === plan.memos ? `まとめ\u00a0${plan.memos}\u00a0件` : `メモ\u00a0${plan.memos}\u00a0件`) : '',
    ].filter(Boolean);
    const source = result.fromPaste ? '貼り付けた一覧' : SOURCE_LABEL[result.source];
    const shortfall = importShortfall(result);
    const files = result.fileCount || 1;
    const unread = Array.isArray(result.unreadFiles) ? result.unreadFiles : [];
    // 状態が分からない本の、いまの内訳（まとめて選ぶ前は取り込み元の見立てが混ざる＝「いまは 読書中 1・読了 3」）。
    // メモか感想のある本は、読みたい・積読を選んでも読了で入る（lib/importLookup.js の setGuessedStatus）。
    const guessedWithNotes = guessedRows.filter((r) => hasNotes(r.book)).length;
    // 内訳は、選んだ状態が効く本だけで数える（メモの有る本と無い本が混ざるときは、メモの無い本）。
    const mixBase = guessedWithNotes > 0 && guessedWithNotes < guessedCount ? guessedRows.filter((r) => !hasNotes(r.book)) : guessedRows;
    const guessedMix = GUESS_CHOICES.map(([v, label]) => [label, mixBase.filter((r) => r.book.status === v).length]).filter(([, n]) => n > 0);
    const guessedStatus = guessedStatusRaw || (mixBase.length && mixBase.every((r) => r.book.status === mixBase[0].book.status) ? mixBase[0].book.status : '');
    const allGuessed = guessedCount > 0 && guessedCount === newRows.length;
    // 状態が分からない本が全部メモ（感想）つき（Kindle はいつも）なら、効く 2 つ（読書中・読了）だけを出す＝押しても変わらない選択を置かない。
    const notesOnly = guessedCount > 0 && guessedWithNotes === guessedCount;
    const choices = notesOnly ? GUESS_CHOICES.filter(([v]) => v === 'reading' || v === 'done') : GUESS_CHOICES;
    // メモの有る本と無い本が混ざり、読みたい・積読を選んでいる（メモのある本だけ読了になる）ときは、
    //   選んだ状態が効く「メモの無い本」の数で言う。読書中・読了なら全部その状態になるので「この N 冊は」。
    const mixedNotes = guessedWithNotes > 0 && !notesOnly && (guessedStatus === 'want' || guessedStatus === 'before');
    const choiceCount = mixedNotes ? guessedCount - guessedWithNotes : guessedCount;
    content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {error && <ErrorMessage icon={null} title="取り込めませんでした" description={error} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p style={heading}>
            {source ? <>{source}：<wbr /></> : null}{countParts.join(KEEP_DOT)}
            {plan.memos > 0 && plan.summaries > 0 && plan.summaries < plan.memos && <><wbr />{haltOpen(`（まとめ\u00a0${plan.summaries}\u00a0件を含む）`)}</>}
          </p>
          {/* 書店で確かめた結果（一覧・貼り付け）。見つからない本も書いた書名のまま入る（消さない）。 */}
          {result.lookup && (
            <p role="note" style={{ ...body, textWrap: 'wrap' }}>
              {/* 0 の項目は出さない。項目の途中では割らず、改行は「・」のあとだけ（2026-11-25 ui-critic）。 */}
              {[
                result.lookup.found > 0 && `書店で確かめた本 ${fmt(result.lookup.found)} 冊`,
                result.lookup.loose > 0 && `近い書名に合わせた本 ${fmt(result.lookup.loose)} 冊`,
                result.lookup.missing > 0 && `見つからなかった本 ${fmt(result.lookup.missing)} 冊`,
                result.lookup.failed > 0 && `確かめられなかった本 ${fmt(result.lookup.failed)} 冊`,
                result.lookup.mergedBooks > 0 && `同じ本の行 ${fmt(result.lookup.mergedLines)} つを ${fmt(result.lookup.mergedBooks)} 冊に`,
              ].filter(Boolean).map((t, i, arr) => <Fragment key={t}><span style={nowrap}>{t}{i < arr.length - 1 ? '・' : ''}</span>{i < arr.length - 1 ? <wbr /> : null}</Fragment>)}
            </p>
          )}
          {/* 新しい本は一度に 2,000 冊まで（本棚にある本は数えない）。残りは取り込んだあと同じファイルをもう一度選ぶ（2026-09-29）。
              一覧より先に読むよう、見出しのすぐ下に置く（一覧の下だと見落とす・2026-10-04）。 */}
          {plan.remainingBooks > 0 && (
            <p role="note" style={body}>
              {files - unread.length > 1 ? '選んだファイル' : 'ファイル'}には<span style={nowrap}> {fmt(plan.fileBooks)} 冊</span>あります。一度に取り込めるのは<span style={nowrap}> {fmt(IMPORT_MAX_BOOKS)} 冊</span>まで。取り込んだあと同じファイルをもう一度選ぶと、<span style={nowrap}>残りの {fmt(plan.remainingBooks)} 冊を</span>取り込めます。
            </p>
          )}
        </div>
        {/* 🧭 状態が分からない本（取り込み元に状態が無い・分からない値・Kindle のハイライト・一覧）をまとめて決める（2026-11-25）。
            前は分からない本をすべて「読了」にしていた。並びはアプリの 4 つの状態の順（読みたい → 読了）。 */}
        {!importing && guessedCount > 0 && (
          <div role="radiogroup" aria-labelledby="import-guess-h" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <p id="import-guess-h" style={{ ...body, color: 'var(--text)', fontWeight: 600 }}>
              {mixedNotes
                ? <><span style={nowrap}>メモの無い本 {fmt(choiceCount)} 冊</span>{withPhraseBreaks('を入れる状態')}</>
                : allGuessed
                  ? <><span style={nowrap}>この {fmt(guessedCount)} 冊</span>{withPhraseBreaks('を入れる状態')}</>
                  : <><span style={nowrap}>状態が分からない本 {fmt(guessedCount)} 冊</span>{withPhraseBreaks('を入れる状態')}</>}
              {!guessedStatus && guessedMix.length > 1 && (
                <span style={{ fontWeight: 400, color: 'var(--text-2)' }}><wbr />{haltOpen(`（いまは ${guessedMix.map(([l, n]) => `${l}\u00a0${n}`).join('・')}）`)}</span>
              )}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {choices.map(([v, label]) => (
                <Chip
                  key={v}
                  size="select"
                  stretch
                  role="radio"
                  aria-checked={guessedStatus === v}
                  active={guessedStatus === v}
                  onClick={() => setResult((cur) => setGuessedStatus(cur, v))}
                >
                  {label}
                </Chip>
              ))}
            </div>
            {mixedNotes && (
              <p style={{ ...body, fontSize: 'var(--text-meta)' }}>{withPhraseBreaks(`メモのある本 ${fmt(guessedWithNotes)} 冊は、読了で入ります`)}</p>
            )}
          </div>
        )}
        <ul style={{ ...list, gap: 0 }}>
          {shown.map(({ book: b, memos: n, summary }, i) => (
            <li key={`${b.title}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', padding: 'var(--space-2) 0', borderTop: i ? '1px solid var(--separator)' : 'none' }}>
              {/* 書店で確かめた本は表紙で、自分の本かどうかが一目で分かる（2026-11-25 ui-critic）。 */}
              <MiniCover title={b.title} cover={b.cover || ''} width={24} showTitle={false} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                {/* 新しい本は、どの状態で入るかを小さく（読了／読書中など・2026-09-29）。 */}
                {IMPORT_STATUS_LABEL[b.status] && (
                  <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {IMPORT_STATUS_LABEL[b.status]}
                    {b.author ? `・${b.author}` : ''}
                    {b.matchedLoosely && b.typedTitle ? `・「${b.typedTitle}」から近い本に` : ''}
                    {b.checkFailed ? '・書店で確かめられませんでした' : b.unverified ? '・書店で見つかりませんでした' : ''}
                  </span>
                )}
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
          {newRows.length > shown.length && (
            <li style={{ display: 'flex', alignItems: 'center', minHeight: 'var(--tap-min)', borderTop: '1px solid var(--separator)' }}>
              <span style={{ ...body, fontSize: 'var(--text-meta)' }}>ほか {fmt(newRows.length - shown.length)} 冊</span>
            </li>
          )}
          {/* 本棚にある本は新しく作らず、その本にメモとして足す（取り込みと同じ決まり）。1 行にまとめる。
              足すメモは、その本にもう同じ文があるものを除いた数（取り込みでも足さない）。 */}
          {plan.existingBooks > 0 && (
            <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', padding: 'var(--space-2) 0', borderTop: newRows.length ? '1px solid var(--separator)' : 'none' }}>
              {/* 新しい本の行の表紙（幅 24）と書名の左端を揃える。 */}
              <span aria-hidden="true" style={{ width: 24, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                <BookOpen size="1.1em" style={{ color: 'var(--text-3)' }} />
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                <span style={nowrap}>本棚にある本 {fmt(plan.existingBooks)} 冊</span>
                <wbr />
                <span style={{ color: 'var(--text-2)' }}>
                  {plan.existingMemos > 0
                    ? <><span style={halt}>（</span><span style={nowrap}>新しいメモ {fmt(plan.existingMemos)} 件</span>を足す）</>
                    : haltOpen('（足す新しいメモはありません）')}
                </span>
              </span>
            </li>
          )}
        </ul>
        {/* 読書メーターの一覧はページに分かれている。棚の全冊数より少なければ、残りのページも選んでもらう（2026-09-29）。 */}
        {shortfall && (
          <p role="note" style={body}>
            {SHELF_LABEL[shortfall.shelf] || '本棚の本'}は<span style={nowrap}>全 {shortfall.total} 冊</span>です。{files > 1 ? '保存したページ' : 'このファイル'}には <span style={nowrap}>{shortfall.found} 冊</span>。残りのページも保存して選んでください。
          </p>
        )}
        {/* 読めなかった行（書名も ISBN も無い行・2026-11-25 黙って飛ばさない）。 */}
        {result.skipped > 0 && (
          <p role="note" style={{ ...body, overflowWrap: 'anywhere' }}>
            {withPhraseBreaks(`${fmt(result.skipped)} 行は本として読めませんでした`)}{result.skippedExample ? `（例: ${result.skippedExample}）` : ''}。
          </p>
        )}
        {/* 本が 1 冊も読めなかったファイル（いくつか選んだうちの 1 つが別の形式など）。 */}
        {unread.length > 0 && (
          <p role="note" style={{ ...body, overflowWrap: 'anywhere' }}>読み取れなかったファイル: {unread.join('、')}</p>
        )}
        {/* 「同じ本には足す・同じメモは二重にならない」はヘルプ（bookList の取り込み）だけに書く（説明の補足文を置かない・DESIGN §0-6）。 */}
      </div>
    );
    // 取り込み中: 主ボタンを押せない形にして進み具合を出す。「別のファイルを選ぶ」は場所だけ残して隠す（高さを変えない）。
    const progressLabel = progress.total > 0
      ? `取り込んでいます（${Math.min(progress.done, progress.total)} / ${progress.total} 冊）`
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
        {/* 50 冊以上の取り込み中は、「別のファイルを選ぶ」の場所に待ち時間の案内（閉じて途中で止めないように・2026-09-29）。 */}
        {importing && (plan.books?.length || 0) >= 50 ? (
          <p style={{ ...body, fontSize: 'var(--text-meta)', textAlign: 'center', minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center', justifyContent: 'center', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            <span>{(plan.books?.length || 0) >= 500 ? '数分かかることがあります。' : '1 分ほどかかることがあります。'}<wbr />画面を開いたままお待ちください。</span>
          </p>
        ) : (
          <button
            type="button"
            onClick={result.fromPaste ? () => { setError(''); setResult(null); setStep('paste'); } : pickFile}
            disabled={importing}
            aria-hidden={importing || undefined}
            tabIndex={importing ? -1 : undefined}
            style={{ ...btnLink, width: '100%', visibility: importing ? 'hidden' : 'visible' }}
          >
            {result.fromPaste ? '一覧を直す' : '別のファイルを選ぶ'}
          </button>
        )}
      </div>
    );
  } else if (step === 'done' && outcome) {
    // 数え方は確かめる画面・ホームの「メモ N 件」と同じ: 新しい本のレビュー・感想（「この本のまとめ」）もメモ 1 件（2026-09-29）。
    const reviews = outcome.reviewsAdded || 0;
    const memos = (outcome.memosAdded || 0) + reviews;
    const any = memos > 0;
    // 数と「件」は離さない（改行を許さない空白）。改行してよいのは「（まとめ…）」の前と「〜を」のあとだけ（<wbr>）。
    // 「を」は前の語（または閉じ括弧）と離さない（「を取り込みました」の「を」が行の頭に来ないように・2026-09-29）。
    const headParts = [
      outcome.booksAdded > 0 ? `新しい本\u00a0${outcome.booksAdded}\u00a0冊` : '',
      memos > 0 ? (reviews === memos ? `まとめ\u00a0${memos}\u00a0件` : `メモ\u00a0${memos}\u00a0件`) : '',
    ].filter(Boolean);
    // まとめだけのときは「まとめ N 件」で足りるので、括弧の注は付けない（2026-09-29）。
    const summaryNote = memos > 0 && reviews > 0 && reviews < memos ? `（まとめ\u00a0${reviews}\u00a0件を含む）` : '';
    const headLead = summaryNote ? headParts.join(KEEP_DOT) : headParts.slice(0, -1).map((part) => part + KEEP_DOT).join('');
    const headTail = `${summaryNote || headParts[headParts.length - 1] || ''}を`;
    const nothingNew = headParts.length === 0;
    // 取り込まずに残した新しい本（一度に 2,000 冊まで）と、読書メーターの保存していないページの本（2026-09-29）。
    const remaining = planSnap?.remainingBooks || 0;
    const doneShortfall = result ? importShortfall(result) : null;
    // 別のファイルを選ぶ: 選ぶ画面に戻してからファイルを選ぶ（選ばずに戻っても、選ぶ画面にいる）。
    const pickAnother = () => { setOutcome(null); setResult(null); setStep('pick'); pickFile(); };
    content = (
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 0 }}>
        {error && <ErrorMessage icon={null} title="取り消せませんでした" description={error} />}
        <p style={heading}>
          {/* 確かめる画面と同じ形「新しい本 N 冊・メモ M 件（まとめ K 件を含む）」。 */}
          {!nothingNew ? <>{headLead}{summaryNote ? <wbr /> : null}<span style={nowrap}>{haltOpen(headTail)}</span><wbr />取り込みました</>
            : <>新しく取り込むものは<wbr />ありませんでした</>}
        </p>
        {/* したことは見出しの 1 行だけ（同じ数を言い直す 2 行目は置かない・2026-09-29）。
            見出しと同じことを言い直す文（「本棚に並べました」など）は置かず、見出しで言えないことだけを 1 文。 */}
        {/* 何も入らなかったときは見出し「新しく取り込むものはありませんでした」だけ（「すでに取り込み済みです」と言い直さない・2026-10-04）。 */}
        {!any && !nothingNew && outcome.booksMatched > 0 && (
        <p style={body}>ほかの<span style={nowrap}> {fmt(outcome.booksMatched)} 冊</span>は、すでに本棚にあります。</p>
        )}
        {/* 保存できなかった本（通信が切れたなど）は黙って減らさず伝える（DESIGN §5「一部だけ失敗の 1 行」＝13/--text-2・面なし）。同じファイルをもう一度選べば、
            取り込めた本・同じメモは二重にならずに残りだけ入る（2026-10-04）。 */}
        {/* 直す入口は同じ行の右に「もう一度選ぶ」（同じファイルを選べば残りだけ入る・ui-critic 2026-10-04）。 */}
        {outcome.booksFailed > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 'var(--space-2)' }}>
            <p style={{ ...body, fontSize: 'var(--text-meta)', flex: '1 1 12em', minWidth: 0 }}><span style={nowrap}>{fmt(outcome.booksFailed)} 冊</span>は取り込めませんでした。<wbr /><span style={nowrap}>通信状況を確認してください。</span></p>
            <button type="button" onClick={pickAnother} disabled={undoing} style={{ ...btnLink, flexShrink: 0, whiteSpace: 'nowrap' }}>もう一度選ぶ</button>
          </div>
        )}
        {/* メモの保存が途中で止まった（入った本とメモは残る・同じファイル（一覧）をもう一度選べば残りだけ入る・2026-11-26 点検）。 */}
        {outcome.memosFailed && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 'var(--space-2)' }}>
            <p style={{ ...body, fontSize: 'var(--text-meta)', flex: '1 1 12em', minWidth: 0 }}>{typeof outcome.memosFailed === 'number' ? <><span style={nowrap}>メモ {fmt(outcome.memosFailed)} 件</span>は入りませんでした。</> : 'メモの一部は入りませんでした。'}<wbr /><span style={nowrap}>通信状況を確認してください。</span></p>
            <button type="button" onClick={pickAnother} disabled={undoing} style={{ ...btnLink, flexShrink: 0, whiteSpace: 'nowrap' }}>もう一度選ぶ</button>
          </div>
        )}
        {remaining > 0 && (
          <p style={body}>残りの<span style={nowrap}> {fmt(remaining)} 冊</span>は、同じファイルをもう一度選ぶと取り込めます。</p>
        )}
        {doneShortfall && (
          <p style={body}>読書メーターの残り<span style={nowrap}> {fmt(doneShortfall.total - doneShortfall.found)} 冊</span>は、残りのページを保存して取り込めます。</p>
        )}
        {/* 🔔 メモが入ったら、通知の案内を 1 回だけ（まだ決めていない人だけ・下の主ボタンがあるので副ボタン・2026-10-10）。 */}
        {any && <NotifyOptInCard where="import" primary={false} style={{ marginTop: 'var(--space-3)' }} />}
      </div>
    );
    // 閉じる入口は右上の「完了」1 つだけ（完了の画面ではいつも・2026-09-29）。下の主ボタンは次にすること:
    //   相談の材料が入った（メモ か「この本のまとめ」＝どちらもメモとして相談の根拠になる）→「相談してみる」
    //   （送らずに相談を開く＝入力欄と相談例から自分で選んで送る・勝手にトークンを使わない）／
    //   本だけ入った（メモも感想も無い）→「覚えている一文を足す（N 冊）」／何も新しく入らなかった →「別のファイルを選ぶ」。
    const canUndo = !!onUndoImport && ((outcome.createdBookIds?.length || 0) + (outcome.createdMemoIds?.length || 0) > 0);
    // メモも「この本のまとめ」も無い新しい本は、相談の根拠にならない。一言を足す入口（2026-09-29）。
    //   一度に開くのは初日クイックスタートと同じ最大 5 冊（数はボタンに出す冊数と同じ）。
    const bare = (Array.isArray(outcome.bareBooks) ? outcome.bareBooks : []).slice(0, QUICKSTART_MAX_BOOKS);
    const canAddOneLine = bare.length > 0 && !!onAddOneLine;
    const addOneLineClick = () => { track('import_add_one_line', { books: bare.length }); onAddOneLine(bare); };
    const primaryStyle = undoing ? btnPrimaryOff : btnPrimary;
    let primary;
    if (any && onAsk) {
      // 取り込んだメモのある本から作った相談を、相談の入力欄に入れて開く（送らない・App の onAsk・2026-10-02）。
      primary = <button type="button" onClick={() => onAsk(outcome)} disabled={undoing} style={primaryStyle}>相談してみる</button>;
    } else if (canAddOneLine) {
      primary = <button type="button" onClick={addOneLineClick} disabled={undoing} style={primaryStyle}>覚えている一文を足す（{bare.length}&nbsp;冊）</button>;
    } else {
      primary = <button type="button" onClick={pickAnother} disabled={undoing} style={primaryStyle}>別のファイルを選ぶ</button>;
    }
    // 相談してみるが主のときだけ、一言を足すは脇役の文字ボタンで下に。
    const addOneLineLink = any && onAsk && canAddOneLine ? (
      <button type="button" onClick={addOneLineClick} disabled={undoing} style={{ ...btnLink, width: '100%' }}>
        覚えている一文を足す（{bare.length}&nbsp;冊）
      </button>
    ) : null;
    // 残した本があるときは、同じファイルを選び直す入口（主ボタンが「別のファイルを選ぶ」のときと、
    // 一言を足すの文字ボタンがあるときは出さない＝下のボタンは多くても 3 つ）。
    const pickAgainLink = remaining > 0 && !addOneLineLink && ((any && onAsk) || canAddOneLine) ? (
      <button type="button" onClick={pickAnother} disabled={undoing} style={{ ...btnLink, width: '100%' }}>
        同じファイルをもう一度選ぶ（残り&nbsp;{fmt(remaining)}&nbsp;冊）
      </button>
    ) : null;
    const addOneLine = addOneLineLink || pickAgainLink ? <>{addOneLineLink}{pickAgainLink}</> : null;
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
      // 選ぶ・確かめる: 決定は下のボタンなので右上は「キャンセル」。完了画面: 閉じるのは右上「完了」だけ（下は次にすること）。
      dismissLabel={step === 'done' ? '完了' : 'キャンセル'}
      // 貼り付けた一覧・確かめた結果を、聞かずに捨てない（書店で確かめるのは数分かかることもある・2026-11-26 点検）
      //   書店で確かめている途中（checking）・確かめられなかった画面（checkFailed）も、貼り付けた一覧を聞かずに捨てない（2026-11-27 点検）。
      beforeClose={(step === 'paste' && pasteText.trim()) || step === 'preview' || step === 'checking' || step === 'checkFailed' ? () => confirm({
        title: '取り込まずに閉じますか？',
        message: step === 'preview' ? '確かめた本の一覧は残りません。' : '貼り付けた一覧は残りません。',
        confirmLabel: '閉じる',
        cancelLabel: step === 'preview' ? '選び続ける' : '続ける',
      }) : undefined}
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
