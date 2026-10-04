// 🕒 AdvisorHistory — AI 選書の履歴一覧 + 個別会話詳細。
//
// BookAdvisor 内で view='history' or 'detail' に切り替えた時に表示する。
// chat 画面 (.chat-scroll) と同じ flex column 内に置かれ、AI タブの
// レイアウトを乱さない。session オブジェクトは useAdvisorSessions から。

import { useMemo, useState } from 'react';
import {
  History,
  ChevronLeft,
  BookOpen,
  Check,
  Trash2,
  MessageSquare,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import EmptyState from './EmptyState.jsx';
import MarkdownSections from './MarkdownSections';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import AdvisorStoreLinks from './AdvisorStoreLinks';
import { STORE_DISCLOSURE_TEXT } from '../lib/rakutenLink';
import { btnPrimary, btnGhost, btnGhostOff, btnText, groupTitle } from '../styles/ui';
import { displayUserText, concernOf, interviewPairsOf, advisorSetupPayload } from '../lib/advisorText';
import { filterProseTitles, proseTitleLists } from '../lib/advisorProse';
import { dropSummarySection, introTextOf, splitRecoAnswer } from '../lib/advisorSummary';
import { fmtDateTimeJa } from '../lib/dates';

// 日時は過去の相談と同じ「10月4日 22:38」（lib/dates.js の fmtDateTimeJa・以前は「今日 22:38」と混ざっていた・2026-10-04）。
export function formatDate(iso) {
  return fmtDateTimeJa(iso);
}

function firstUserContent(messages) {
  if (!Array.isArray(messages)) return '';
  const m = messages.find((x) => x?.role === 'user');
  return (m?.content || m?.text || '').toString();
}


// AI 応答から RECOMMENDATIONS_START..END の JSON ブロックを除去して
// 人間向けのプロセだけ残す。session.messages は永続化用に AI の生テキスト
// (マーカー込み) を保存しているため、履歴表示時はここで剥がす。
function stripRecommendations(text) {
  if (!text) return '';
  let cleaned = text
    // END マーカー欠落（max_tokens 打ち切り）でも生 JSON を残さないよう `|$` を許容。
    // App.jsx の stripRecoBlock と挙動を揃える（履歴詳細でも生マーカーを漏らさない）。
    .replace(/RECOMMENDATIONS_START[\s\S]*?(?:RECOMMENDATIONS_END|$)/g, '')
    // ブロック除去で空になった「## 📚 おすすめの本」見出しも落とす。
    .replace(/\n*#{1,4}\s*📚?\s*おすすめの本[^\n]*\s*(?=#{1,4}\s|$)/gu, '\n');
  // 連続改行を 2 行までに圧縮 + 末尾整理
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

// ── 見た目は DESIGN.md のトークンのみ（相談＝MyBookBrain と同じ部品の形） ──
// カード: --surface ＋ 枠 --separator ＋ 角丸 12 ＋ 内側 16。影なし。
const cardBase = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
  boxSizing: 'border-box',
};

// 一覧の行（押すと会話を開く）。
const card = {
  ...cardBase,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  width: '100%',
  minHeight: 44,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const meta = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-3)',
  fontSize: 'var(--text-meta)',
  color: 'var(--text-3)',
};

const metaItem = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' };

// 画面の余白（左右 16）。
const pageStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4) var(--space-6)' };

// iOS のナビゲーションバーの形: 左に戻る・中央に題名・右は同じ幅の空き（相談の押し込まれた画面と同じ・DESIGN §5）。
// 2026-10-04: スクロールの箱の外（上）に置き、全体の見出しとサブタブを隠したときはノッチの分をこの行が吸収する。
//   線は中身を下へ送ったときだけ（太さぶんはいつも取る）。シェブロンの見た目の左端を余白 16 に。
const navRow = { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 52, paddingTop: 'var(--space-1)', paddingBottom: 'var(--space-1)', paddingLeft: 'var(--space-4)', paddingRight: 'var(--space-4)' };
const navSide = { width: 96, flexShrink: 0 };
const navTitle = { flex: 1, minWidth: 0, margin: 0, textAlign: 'center', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
// 文字は App の BACK_LABEL_SIZE と同じ上限（文字サイズを最大にしても「‹ AI 選書」を 1 行に・2026-10-04）。
const backBtn = { ...btnText, fontSize: 'min(var(--text-body), var(--text-bar-max))', fontWeight: 400, padding: 'var(--space-2) 0', marginLeft: 'calc(-1 * var(--space-2))', gap: 0, lineHeight: 1.3, whiteSpace: 'nowrap' };


// 読む文章（AI の答え・推薦理由）＝明朝 18・行間 1.6。
const readText = { fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, color: 'var(--text)' };
// 推薦の前置き＝本のカードより控えめな 1 段落（15/--text-2・見出しもカードも付けない・会話中と同じ）。
const introText = { fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6, margin: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' };

// pushed: 全体の見出しを隠した画面（行が画面の最上部＝ノッチを避ける）。scrolled: 中身を下へ送った（下に線）。
export function AdvisorNavBar({ backLabel, onBack, title, pushed = false, scrolled = false }) {
  return (
    <div
      style={{
        ...navRow,
        borderBottom: `1px solid ${scrolled ? 'var(--separator)' : 'transparent'}`,
        transition: 'border-color var(--duration-fast) var(--ease-out)',
        ...(pushed ? { paddingTop: 'max(var(--space-1), env(safe-area-inset-top, 0px))', minHeight: 'calc(52px + env(safe-area-inset-top, 0px))' } : null),
      }}
    >
      <div style={navSide}>
        <button type="button" onClick={onBack} style={backBtn}>
          <ChevronLeft size={20} aria-hidden="true" />{backLabel}
        </button>
      </div>
      <h2 style={navTitle}>{title}</h2>
      <div style={navSide} aria-hidden="true" />
    </div>
  );
}

// 一覧の読み込み中＝本物の行と同じ形（題 2 行＋日付の行・枠 --separator のカード 3 枚）。スピナーだけにしない（DESIGN §5）。
function HistoryListSkeleton() {
  return (
    <div role="status" aria-label="読み込み中" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ ...card, cursor: 'default', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <SkeletonBlock width="86%" height="var(--text-body)" />
          <SkeletonBlock width="48%" height="var(--text-body)" />
          <SkeletonBlock width="36%" height="var(--text-meta)" />
        </div>
      ))}
    </div>
  );
}

export function AdvisorHistoryList({ sessions, loaded, onSelect, onClose, onDelete }) {
  return (
    <div style={pageStyle}>
      {/* 上の「‹ AI 選書」の行は BookAdvisor がスクロールの箱の外に置く（AdvisorNavBar）。 */}
      {!loaded ? (
        <HistoryListSkeleton />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<History size={32} strokeWidth={1.5} aria-hidden="true" />}
          title="まだ履歴がありません"
          actions={[{ label: '本を探す', onClick: onClose, variant: 'secondary' }]}
        />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {sessions.map((s) => {
            const head = displayUserText(firstUserContent(s.messages)).split('\n')[0].slice(0, 80) || '無題';
            const recCount = Array.isArray(s.recommended_books) ? s.recommended_books.length : 0;
            const addedCount = Array.isArray(s.added_book_ids) ? s.added_book_ids.length : 0;
            return (
              <li key={s.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => onSelect(s)}
                  style={card}
                >
                  {/* 文節の切れ目でだけ折り返す（「足りま／せん」と語の途中で切らない・2026-10-04）。 */}
                  <div style={{ fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.5, paddingRight: 'var(--space-8)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                    {withPhraseBreaks(head)}
                  </div>
                  <div style={meta}>
                    <span>{formatDate(s.created_at)}</span>
                    {recCount > 0 && (
                      <span style={metaItem}>
                        <BookOpen size={14} aria-hidden="true" />
                        {recCount} 冊提案
                      </span>
                    )}
                    {addedCount > 0 && (
                      <span style={metaItem}>
                        <Check size={14} aria-hidden="true" />
                        {addedCount} 冊追加
                      </span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  aria-label="削除"
                  title="削除"
                  style={{
                    // 44px ルール: アイコンは小さいまま実効タップ領域を広げ、
                    // 隣接する「カードを開く」への誤タップを防ぐ。
                    position: 'absolute',
                    top: 'var(--space-1)',
                    right: 'var(--space-1)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                    padding: 0,
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// 推薦本カード — 履歴詳細用 (live chat と同じ field 構成 + ストアリンク + 追加 button)
// ============================================================================
// 会話中のおすすめのカード（BookAdvisor）と同じ組み立て（2026-10-04）: 書名 20/600 → 著者 → 実在の注意 →
//   小さな見出し＋本文（なぜあなたに＝明朝 18／核心・注目ポイント・目安＝15）→ 全幅の副ボタン「読みたいに追加」
//   （追加したら同じ箱で「✓ 追加済み」）→ Amazon・楽天ブックスの文字リンク。以前は「なぜあなたに」だけ面つきの箱・
//   目安は 1 行・追加は幅の狭いボタン・ストアは枠のボタンで、同じ本のカードが画面ごとに違って見えた。
function RecommendationCard({ book, index = 0, isAdded, isChecking, onAdd }) {
  return (
    <div
      style={{
        ...cardBase,
        wordBreak: 'keep-all',
        overflowWrap: 'anywhere',
      }}
    >
      {/* 上の段は会話中のカードと同じ（表紙＝あれば 52×74・角丸 4 → #番号 → 書名 → 著者）。 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        {book.cover && (
          <img
            src={book.cover}
            alt=""
            width="52"
            loading="lazy"
            style={{ width: 52, height: 74, objectFit: 'cover', borderRadius: 4, flexShrink: 0, background: 'var(--fill)' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0 }}>#{index + 1}</p>
          <p style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: 'var(--space-1) 0 0', textIndent: '-0.5em' }}>
            『{book.title}』
          </p>
          {book.author && (
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 'var(--space-1) 0 0' }}>{book.author}</p>
          )}
        </div>
      </div>
      {/* 実在の検証の結果（会話中のカードと同じ文言・2026-09-30）。確かめた本と、結果を持たない古い会話には出さない。 */}
      {(book._verify === 'unknown' || book._verify === 'suspect') && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: 'var(--warning-soft)', borderRadius: 'var(--radius)' }}>
          <TriangleAlert size={16} aria-hidden="true" style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 'var(--space-1)' }} />
          <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>
            {book._verify === 'unknown' ? '確認できませんでした' : 'この本は書誌情報が見つかりませんでした。書名・著者が正しいか、実在する本かご確認ください。'}
          </p>
        </div>
      )}

      {book.why && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <p style={fieldLabel}>なぜあなたに</p>
          <p style={{ ...readText, margin: 'var(--space-1) 0 0' }}>{withPhraseBreaks(book.why)}</p>
        </div>
      )}
      {book.core && <RecField label="この本の核心" text={book.core} />}
      {book.focus && <RecField label="注目ポイント" text={book.focus} />}
      {book.duration && <RecField label="目安" text={book.duration} />}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
        {isAdded ? (
          <p role="status" style={{ ...btnGhostOff, margin: 0, cursor: 'default', color: 'var(--text-2)' }}>
            <Check size={18} aria-hidden="true" style={{ color: 'var(--success)', flexShrink: 0 }} />
            追加済み
          </p>
        ) : isChecking ? (
          // 同じ本かを確かめている間（会話中のカードと同じ・確認で追加するまでは「追加済み」にしない）。薄くせず文言で示す。
          <button type="button" disabled aria-busy="true" style={{ ...btnGhostOff, touchAction: 'manipulation' }}>
            確かめています…
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdd?.();
            }}
            // カードの主役の操作なので全幅の副ボタン（48・17/600）。
            style={{ ...btnGhost, touchAction: 'manipulation' }}
          >
            <Plus size={18} aria-hidden="true" />
            読みたいに追加
          </button>
        )}
        {/* Amazon + 楽天 の両方（会話中のカードと同じ文字リンク）。開示はカード群の下にまとめて出す。 */}
        <AdvisorStoreLinks book={book} />
      </div>
    </div>
  );
}

// 小さな見出し（DESIGN §5・12/600/--text-2＝ui.js の groupTitle・会話中のカードと同じ）。
const fieldLabel = { ...groupTitle, margin: 0 };

function RecField({ label, text }) {
  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <p style={fieldLabel}>{label}</p>
      {/* カードは keep-all なので、文節の切れ目（<wbr>）を入れて読点・かっこの位置だけで折り返さないようにする。 */}
      <p style={{ fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)', margin: 'var(--space-1) 0 0' }}>{withPhraseBreaks(text)}</p>
    </div>
  );
}

export function AdvisorSessionDetail({ session, books, onResume, onNewSession, onClose, onAddBook, onBookAdded, verifyBeforeAdd = null }) {
  const messages = useMemo(() => Array.isArray(session?.messages) ? session.messages : [], [session]);
  const recs = useMemo(() => Array.isArray(session?.recommended_books) ? session.recommended_books : [], [session]);
  // AI の文の書名は、実在を確かめたカードの本（_verify==='ok'）と本棚の本だけ残す（会話中と同じ・lib/advisorProse.js）。
  //   確かめた結果を持たない古い会話は、本棚の本以外の書名を出さない（「この会話を続ける」で確かめ直せる）。
  const proseLists = useMemo(() => proseTitleLists(recs, books), [recs, books]);

  // 既に本棚にある本 (タイトル+著者の正規化キー or ISBN/ASIN で重複判定)
  const addedKeySet = useMemo(() => {
    const norm = (s) => (s || '').toString().toLowerCase().replace(/\s+/g, '');
    const set = new Set();
    (books || []).forEach((b) => {
      if (b.isbn) set.add(`isbn:${norm(b.isbn)}`);
      if (b.asin) set.add(`asin:${norm(b.asin)}`);
      if (b.title) set.add(`ta:${norm(b.title)}|${norm(b.author || '')}`);
    });
    return set;
  }, [books]);

  const isBookAdded = (rec) => {
    const norm = (s) => (s || '').toString().toLowerCase().replace(/\s+/g, '');
    if (rec.isbn && addedKeySet.has(`isbn:${norm(rec.isbn)}`)) return true;
    if (rec.asin && addedKeySet.has(`asin:${norm(rec.asin)}`)) return true;
    if (rec.title && addedKeySet.has(`ta:${norm(rec.title)}|${norm(rec.author || '')}`)) return true;
    return false;
  };

  // 連打防止 + UI 即時反映用のローカル set。クリック直後に key を入れ、
  // 失敗時のみ rollback する。背景処理 (DB insert / 表紙取得 / AI 要約) は
  // 一切 await しないので、ボタンは < 5ms で「✅ 追加済み」に切り替わる。
  const [locallyAdded, setLocallyAdded] = useState(() => new Set());
  // 直近の相談文（AI 向けのテンプレートのまま保存されている）から、本人の言葉だけを使う。
  const lastUserRaw = useMemo(() => {
    const lastUser = [...messages].reverse().find((m) => m?.role === 'user');
    return (lastUser?.content || lastUser?.text || '').toString();
  }, [messages]);
  const lastUserQuery = useMemo(() => concernOf(lastUserRaw), [lastUserRaw]);
  // 読書準備は AI 選書の画面と同じ中身（課題＝相談＋1 問目・得たいこと＝理想の状態の答え・仮説は空・
  //   選書理由＝なぜ＋核心＝lib/advisorText.js の advisorSetupPayload・2026-10-04）。
  const interviewPairs = useMemo(() => interviewPairsOf(lastUserRaw), [lastUserRaw]);
  const setupFor = (rec) => advisorSetupPayload(lastUserQuery, interviewPairs, rec);

  const recKey = (rec) => {
    const norm = (s) => (s || '').toString().toLowerCase().replace(/\s+/g, '');
    return rec.isbn ? `isbn:${norm(rec.isbn)}` : `ta:${norm(rec.title)}|${norm(rec.author || '')}`;
  };
  // 同じ本かを確かめている本（会話中のカードと同じ「確かめています…」）。
  const [checking, setChecking] = useState(() => new Set());
  const setIn = (setter, key, on) => setter((prev) => {
    if (prev.has(key) === on) return prev;
    const next = new Set(prev);
    if (on) next.add(key); else next.delete(key);
    return next;
  });

  // 追加へ進む（確かめたあと）。ここで初めて「追加済み」にし、保存は裏で（失敗したら戻す）。
  const proceedAdd = (key, verifiedRec) => {
    setIn(setChecking, key, false);
    setIn(setLocallyAdded, key, true);
    Promise.resolve().then(async () => {
      try {
        const saved = await onAddBook(verifiedRec, setupFor(verifiedRec));
        // onAddBook は失敗時に throw せず null を返す契約。falsy は失敗として巻き戻す。
        if (!saved) { setIn(setLocallyAdded, key, false); return; }
        // このセッションの added_book_ids に記録（履歴一覧の「N 冊追加」を正しく）。
        if (saved.id) onBookAdded?.(saved.id);
      } catch {
        setIn(setLocallyAdded, key, false);
      }
    });
  };

  const handleAdd = (rec) => {
    if (!onAddBook) return;
    const key = recKey(rec);
    if (locallyAdded.has(key) || checking.has(key)) return; // 連打ガード
    // 会話中のカードと同じ流れ: すぐ「確かめています…」→ 同じ本か確かめる（候補が複数なら確認のシート）→ 追加。
    if (verifyBeforeAdd) {
      setIn(setChecking, key, true);
      verifyBeforeAdd(rec, {
        proceed: (verified) => proceedAdd(key, verified),
        cancel: () => setIn(setChecking, key, false),
        setup: setupFor(rec),
      });
      return;
    }
    proceedAdd(key, rec);
  };

  // 推薦の答え（本のカードを含む最後の AI の文）は、会話中と同じ順に組み替える:
  //   前置き（15/--text-2 の 1 段落）→ 本のカード → 読む順番など（SPEC §3-2・2026-10-04）。
  //   古い会話（答えにブロックが無い）は、今までどおり会話の下にカードを並べる。
  const recoIdx = useMemo(() => {
    if (recs.length === 0) return -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role !== 'user' && splitRecoAnswer(m?.content ?? m?.text ?? '').found) return i;
    }
    return -1;
  }, [messages, recs.length]);

  const recsSection = recs.length > 0 ? (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }} aria-label="提案された本">
      {recs.map((b, i) => {
        const key = recKey(b);
        return (
          <RecommendationCard
            key={`${b.title}-${i}`}
            book={b}
            index={i}
            // ローカル即時 set または books 由来の既存判定で「追加済み」表示。
            isAdded={locallyAdded.has(key) || isBookAdded(b)}
            isChecking={checking.has(key)}
            onAdd={() => handleAdd(b)}
          />
        );
      })}
    </section>
  ) : null;
  // 紹介料の注記は AI 選書の画面と同じ 13/--text-3・文節で折り返す。置き場所も会話中と同じ＝読む順番の後ろ（2026-10-04）。
  const storeDisclosure = recs.length > 0 ? (
    <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, margin: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
      {withPhraseBreaks(STORE_DISCLOSURE_TEXT)}
    </p>
  ) : null;

  return (
    <div style={pageStyle}>
      {/* 上の「‹ 過去の AI 選書」の行は BookAdvisor がスクロールの箱の外に置く（AdvisorNavBar）。 */}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }} role="region" aria-label="AI 選書の会話">
        {messages.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={32} strokeWidth={1.5} aria-hidden="true" />}
            title="この会話には記録がありません"
          />
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === 'user';
            const raw = (m.content ?? m.text ?? '').toString();
            // assistant メッセージは RECOMMENDATIONS の JSON を剥がして
            // プロセだけにする (永続化フォーマットの都合で生 JSON が混じっているため)
            // 励ましだけの「まとめ」は出さない（会話中のおすすめと同じ・SPEC §3-2）。
            if (!isUser && i === recoIdx) {
              // 推薦の答え: 前置き → 本のカード → 読む順番（まとめは出さない）。
              const parts = splitRecoAnswer(raw);
              const intro = introTextOf(filterProseTitles(stripRecommendations(parts.before), proseLists));
              const after = filterProseTitles(dropSummarySection(stripRecommendations(parts.after)), proseLists);
              return (
                <div key={i} role="article" aria-label="AI の提案" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {intro && <p style={introText}>{withPhraseBreaks(intro)}</p>}
                    {recsSection}
                  </div>
                  {after && <MarkdownSections text={after} />}
                  {storeDisclosure}
                </div>
              );
            }
            const text = isUser ? displayUserText(raw) : filterProseTitles(dropSummarySection(stripRecommendations(raw)), proseLists);
            if (!text) return null; // JSON だけのメッセージは非表示
            return isUser ? (
              // ユーザーの相談＝右寄せの --fill 吹き出し（相談と同じ）。
              <div
                key={i}
                style={{ display: 'flex', justifyContent: 'flex-end' }}
                role="article"
                aria-label="あなたの相談"
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius)',
                    background: 'var(--fill)',
                    color: 'var(--text)',
                    fontSize: 'var(--text-body)',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'keep-all',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {text}
                </div>
              </div>
            ) : (
              // AI の提案＝Markdown（見出し・箇条書き）として描画（生の ## を出さない。会話中と同じ）。
              <div key={i} role="article" aria-label="AI の提案" style={{ minWidth: 0 }}>
                <MarkdownSections text={text} />
              </div>
            );
          })
        )}
      </div>

      {/* 古い会話（答えに本のカードの印が無い）は、会話の下に「提案された本」として並べる。 */}
      {recoIdx < 0 && recs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: 0 }}>
            提案された本
          </h3>
          {recsSection}
          {storeDisclosure}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        <button type="button" onClick={() => onResume(session)} style={btnPrimary}>
          この会話を続ける
        </button>
        <button type="button" onClick={onNewSession} style={btnGhost}>
          新しい会話を始める
        </button>
      </div>
    </div>
  );
}

const _exports = { AdvisorHistoryList, AdvisorSessionDetail };
export default _exports;
