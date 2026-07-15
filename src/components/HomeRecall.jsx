// 🔄 ホーム（本棚）上部の「今日の想起」カード。
//
// 思想（CLAUDE.md 厳守）:
//   - 静か・控えめ・Apple Notes 級・反ゲーミフィケーション。
//   - 振り返りタブを開かずに「過去メモが 1 枚ふいに戻ってくる」体験を surface する、
//     プッシュ通知（環境待ち）のアプリ内版。
//   - うるさくしないのが絶対条件:
//       ① メモが十分貯まっていない（5 件未満）なら出さない。
//       ② 当日 × で閉じたら、その日は二度と出さない（localStorage 記録）。
//       ③ 1 日 1 枚まで・日替わりで安定（同じ日は同じ 1 枚）。
//   - バッジ / 連続日数 / 目標は付けない。
//
// 自己完結: 本棚カードの再 render を誘発しないよう、fetch も state もこの中に閉じる。

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useHaptic } from '../hooks/useHaptic';
import { MessageSquareQuote, X, Target } from 'lucide-react';
import { recallFraming, memoExcerpt, pickRecallMemo, recallPatch } from '../lib/recall';
import { track, EVENTS } from '../lib/analytics';

const DISMISS_KEY = 'orime-home-recall-dismissed';
// これ未満なら出さない（控えめさの肝）。看板体験「過去メモがふいに戻る」瞬間を
// 新規ユーザーが最短でも1週間先まで体験できない（旧: 5件×7日前の AND）と離脱の
// 元になるため、閾値を 2 に下げ、下の minAgeDays を件数に応じて段階化する。
const MIN_MEMOS = 2;
// メモがまだ少ない初期は「1日前」から想起を起こして早期に一度は体験させ、
// 貯まってきたら本来の sweet-spot（30〜183日）に効かせるため厳しめ(7日前)に寄せる。
const EARLY_MATURITY = 8; // これ以上メモがあれば「成熟」扱い

// YYYY-MM-DD（ローカル日付）。dismiss の判定とログに使う。
function todayKey(now = Date.now()) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isDismissedToday(now = Date.now()) {
  try {
    return localStorage.getItem(DISMISS_KEY) === todayKey(now);
  } catch {
    return false;
  }
}

function markDismissedToday(now = Date.now()) {
  try {
    localStorage.setItem(DISMISS_KEY, todayKey(now));
  } catch {
    /* localStorage 不可（プライベートモード等）でも致命ではない */
  }
}

// 🌱 初回「戻ってくる」プレビューは端末で一度だけ（#5: 初日 aha）。
const PREVIEW_KEY = 'orime-home-recall-preview-shown-v1';
function isPreviewShown() {
  try { return localStorage.getItem(PREVIEW_KEY) === '1'; } catch { return false; }
}
function markPreviewShown() {
  try { localStorage.setItem(PREVIEW_KEY, '1'); } catch { /* ignore */ }
}

// 📦 日次キャッシュ（モジュールスコープ）。HomeRecall は本棚リスト⇄詳細の往復の
// たびに再マウントされフェッチ（最大 200 行）が走るが、表示メモは日替わりシードで
// 1 日固定。ユーザー×日のキーで取得行を再利用し、アプリ内で最頻のナビ経路から
// 重複クエリを消す（「覚えた/もう一度」後は markDismissedToday とキャッシュへのミラー反映で再選出を防ぐ）。
let _recallDayCache = { key: '', notes: null };

export default function HomeRecall({ onOpen, onAction }) {
  const { user } = useAuth();
  const haptic = useHaptic();
  const [memo, setMemo] = useState(null); // { id, text, createdAt, book }
  // 当日 dismiss 済みなら最初から描画しない（マウント時に確定）。
  const [dismissed, setDismissed] = useState(() => isDismissedToday());
  // 「行動にする」の進行/完了（想起→行動でループを閉じる）。
  const [actioning, setActioning] = useState(false);
  const [actioned, setActioned] = useState(false);
  // 別のメモに差し替わったら行動状態をリセット。
  useEffect(() => { setActioning(false); setActioned(false); }, [memo?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id || dismissed) {
      setMemo(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        // 同日 & 同ユーザーならキャッシュ行を再利用（往復ナビの重複フェッチ排除）。
        const dayKey = `${user.id}:${Math.floor(Date.now() / 86400000)}`;
        let notes = _recallDayCache.key === dayKey ? _recallDayCache.notes : null;
        if (!notes) {
          // 間隔反復用の列も取得（未適用DBでは列が無いので schema-error 時は
          // 基本列だけで再取得＝想起は「作成日ベース」に degrade するが壊れない）。
          let { data, error } = await supabase
            .from('book_memos')
            .select('id, text, created_at, book_id, last_recalled_at, recall_count, source_type, book:books(title)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(200);
          if (error) {
            ({ data, error } = await supabase
              .from('book_memos')
              .select('id, text, created_at, book_id, book:books(title)')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(200));
          }
          if (!active) return;
          // 通常の想起は MIN_MEMOS 未満なら出さないが、初回プレビュー（下記）は
          // 2 件から成立させたいので、まず 1 件未満だけを弾く。
          if (error || !Array.isArray(data) || data.length < 1) {
            setMemo(null); // 失敗・0件は静かに何も出さない
            return;
          }
          notes = data.map((r) => ({
            id: r.id,
            text: r.text,
            createdAt: r.created_at,
            bookId: r.book_id || null,
            title: r.book?.title || '',
            lastRecalledAt: r.last_recalled_at ?? null,
            recallCount: r.recall_count ?? 0,
            sourceType: r.source_type ?? null,
          }));
          _recallDayCache = { key: dayKey, notes };
        }
        if (!active) return;
        if (!Array.isArray(notes) || notes.length < 1) {
          setMemo(null);
          return;
        }
        // 日替わりで安定（同じ日は同じ 1 枚）。
        // メモがまだ少ない初期は minAgeDays:1 で早めに一度「戻ってくる」体験を起こし、
        // 貯まってきたら minAgeDays:7 で本来の「忘れた頃」に寄せる（段階的緩和）。
        const seed = Math.floor(Date.now() / 86400000);
        const minAgeDays = notes.length >= EARLY_MATURITY ? 7 : 1;
        const picked = notes.length >= MIN_MEMOS
          ? pickRecallMemo(notes, { now: Date.now(), minAgeDays, seed })
          : null;
        // recallFraming が空（＝今日書いたばかり等）なら通常想起は出さない。
        if (picked && recallFraming(picked.createdAt)) {
          // 本物の想起が初めて成立した時点でプレビューを卒業（以後は実想起のみ）。
          markPreviewShown();
          setMemo({ ...picked, preview: false });
          // 📊 初週想起体験率の分子（ホーム面の本物の想起）。
          track(EVENTS.RECALL_SHOWN, { surface: 'home' });
          return;
        }
        // 🌱 初回プレビュー（#5: 初日 aha）。まだ「戻ってくる」体験が一度も起きていない
        //   新規ユーザー（due なメモが無い＝全部書きたて）に、最新の一行を使って
        //   「これがこれから戻ってきます」を一度だけ正直に見せる。偽の日付は出さない。
        // プレビューは「実想起が初めて成立するまで」何度でも出せる（旧: 1回きり
        // だと、翌日メモ1〜2件のままのユーザーに何も起きない沈黙の谷ができていた）。
        // 1日1枚の静けさは dismiss（×）側が守る。
        if (!isPreviewShown() && notes.length >= 1) {
          setMemo({ ...notes[0], preview: true });
          return;
        }
        setMemo(null);
      } catch {
        if (active) setMemo(null); // 例外も静かに握りつぶす
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id, dismissed]);

  if (dismissed || !memo) return null;

  // プレビュー（初回 aha）は書きたて。宣伝的な見出し/フッターは出さず、メモ本文と
  // 「何の本か」だけを静かに見せる（本物の想起のみ「◯ヶ月前のあなたのメモ」を出す）。
  const isPreview = !!memo.preview;
  const framing = isPreview ? '' : recallFraming(memo.createdAt);
  if (!isPreview && !framing) return null;
  const excerpt = memoExcerpt(memo.text, 140);

  const handleOpen = () => {
    try {
      haptic.light();
    } catch {
      /* haptics は非必須 */
    }
    // その本の詳細（メモ一覧・行動追加がある場所）へ直接着地させ、想起→再読→行動の
    // ループを最短で閉じる。本が特定できない場合は呼び出し側が振り返りタブへ退避。
    onOpen?.(memo.bookId);
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    markDismissedToday();
    setDismissed(true);
  };

  // 🎯 想起した一行を、その場で行動に変える（本を開き直さずループを閉じる）。
  // 本に紐づくメモのみ（personal メモは bookId が無いので出さない）。
  const handleAction = async (e) => {
    e.stopPropagation();
    if (actioning || actioned || !memo?.bookId) return;
    setActioning(true);
    try { haptic.success?.(); } catch { /* non-critical */ }
    let ok = false;
    try {
      ok = await onAction?.({ bookId: memo.bookId, text: memo.text, sourceMemoId: memo.id });
    } catch { ok = false; }
    setActioning(false);
    if (ok) setActioned(true); // 失敗時は呼び出し側がトーストを出す（据え置きで再試行可）
  };

  // 🧠 間隔反復のフィードバック。「覚えた」= 定着(+1)して次の間隔まで当面出さない、
  // 「もう一度」= 定着カウントは据え置きで翌日また戻す。どちらも last_recalled_at を
  // now に更新して当面の再登場を制御する（recall.js の recallPatch）。書き込み後は
  // 今日のカードを閉じる（1日1枚の静けさを守る）。列が無い DB では静かに no-op。
  const recordRecall = async (e, mastered) => {
    e.stopPropagation();
    try { haptic.light(); } catch { /* non-critical */ }
    setDismissed(true);
    // setDismissed は in-memory state なので、本棚⇄詳細の往復（再マウント）で消える。
    // 当日フラグを永続化しないと、日次キャッシュの古い lastRecalledAt を材料に
    // pickRecallMemo が同じメモを同日中に再選出してしまう（1日1枚の約束が壊れる）。
    markDismissedToday();
    const patch = recallPatch(memo.recallCount, mastered);
    // 日次キャッシュにも DB 更新をミラー — 翌日以降の選出が最新の間隔情報を見るように。
    try {
      const cached = _recallDayCache.notes?.find((n) => n.id === memo.id);
      if (cached) {
        if (patch.last_recalled_at) cached.lastRecalledAt = patch.last_recalled_at;
        if (typeof patch.recall_count === 'number') cached.recallCount = patch.recall_count;
      }
    } catch { /* cache mirror failure is non-critical */ }
    try {
      await supabase
        .from('book_memos')
        .update(patch)
        .eq('id', memo.id);
    } catch { /* 列未適用・失敗は静かに無視（想起体験は成立している） */ }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={memo.title ? `『${memo.title}』のメモを振り返る` : 'メモを振り返る'}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen();
        }
      }}
      className="list-item-enter"
      style={{
        position: 'relative',
        marginBottom: 14,
        padding: '12px 14px',
        background: 'var(--c-card)',
        border: '1px solid var(--c-hairline)',
        borderRadius: 12,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        boxShadow: '0 1px 2px rgba(60, 50, 30, 0.04)',
      }}
    >
      {framing && (
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--c-ink-2)',
            margin: '0 0 6px',
            paddingRight: 32, // × ボタンと重ならない
          }}
        >
          <MessageSquareQuote size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
          {framing}
        </p>
      )}
      <p
        style={{
          fontSize: 13,
          color: 'var(--c-ink)',
          lineHeight: 1.6,
          margin: 0,
          // 見出しが無い（プレビュー）ときは、先頭行が × ボタンに被らないよう右に余白。
          paddingRight: framing ? 0 : 32,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {excerpt}
      </p>
      {memo.title && (
        <p
          style={{
            fontSize: 11,
            color: 'var(--c-ink-2)',
            margin: '6px 0 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          『{memo.title}』
        </p>
      )}
      {/* プレビュー（書きたて）は宣伝文を出さず、メモ本文＋本名だけの静かなカード。
          間隔反復フィードバック（覚えた/もう一度）は本物の想起でのみ出す。 */}
      {isPreview ? null : (
        // 🧠 間隔反復のフィードバック（覚えた/もう一度）＋ 🎯 行動にする。カード全体の
        //    タップ（開く）と干渉しないよう stopPropagation。
        <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={(e) => recordRecall(e, true)}
              style={{
                flex: 1, minHeight: 44, borderRadius: 9, border: '1px solid var(--c-hairline-strong)',
                background: '#fff', color: 'var(--c-brand)', fontSize: 12, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              ✓ 覚えた
            </button>
            <button
              type="button"
              onClick={(e) => recordRecall(e, false)}
              style={{
                flex: 1, minHeight: 44, borderRadius: 9, border: '1px solid var(--c-hairline-strong)',
                background: '#fff', color: 'var(--c-ink-2)', fontSize: 12, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              もう一度
            </button>
          </div>
          {/* 🎯 想起→行動でループを閉じる。本に紐づくメモのみ。 */}
          {memo.bookId && onAction && (
            <button
              type="button"
              onClick={handleAction}
              disabled={actioning || actioned}
              style={{
                width: '100%', marginTop: 8, minHeight: 44, borderRadius: 9, border: 'none',
                background: actioned ? 'var(--c-positive-soft)' : 'var(--c-brand)',
                color: actioned ? 'var(--c-positive)' : 'var(--c-brand-ink)',
                fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                cursor: (actioning || actioned) ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Target size={14} aria-hidden="true" />
              {actioned ? '行動リストに追加しました' : actioning ? '追加中…' : 'この気づきを行動にする'}
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="今日は閉じる"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          color: 'var(--c-ink-2)',
          fontSize: 16,
          cursor: 'pointer',
          fontFamily: 'inherit',
          lineHeight: 1,
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
