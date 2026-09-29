// 💬 ホーム最上段の「困ったときは、相談する」カード（SPEC §1 の主役）。
//
// Orime の一番の価値＝「読むほど、自分だけの相談相手が育つ」（CLAUDE.md）を、
// アプリを開いた瞬間に見せる。ここで書いた困りごとは「相談」タブの
// マイ読書脳へそのまま渡して送信する（onAsk）。
// 「あなたが読んだ N 冊・メモ N 件から答えます」で、積み重ね＝相談の質を毎回伝える。
//   - 本 0 冊: 出さない（ホームの「はじめる」カードが案内する）
//   - 本を読み込めなかった（countUnknown）: 冊数が分からないので「あなたの本から答えます」で出す
//   - メモ 0 件（カード式・学び・この本のまとめのどれも無い）: 上の 1 行は「本 N 冊・メモはまだありません」、
//     入力欄の代わりに「これまで読んだ本から始める」
//     （初日クイックスタート・SPEC §1）
// 見た目は DESIGN.md のトークンのみ（主ボタン＝相談する の 1 つだけ）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAppDataCache } from '../state/AppDataCache';
import { LIMITS } from '../lib/limits';
import { track } from '../lib/analytics';
import { btnPrimary, btnLink, card, input, groupTitle } from '../styles/ui';
import { buildConsultExamples, countSummaryMemos, memoSearchQuery } from '../lib/consultHelpers';
import { useAllActions } from '../hooks/useAllActions';
import { usePaywall } from '../state/PaywallContext';
import { nextResetLabelJa } from '../lib/freeTrial';
import { PAID_TOKENS, monthDayLabelJa } from '../lib/tokens';
import { loadDefaultJapaneseParser } from 'budoux';
import { SkeletonBlock } from './Skeleton';

// 相談例は文節（BudouX）の切れ目でだけ折り返す（「使え／る」「ヒ／ント」のように語の途中で割れないように）。
// iOS の Safari は word-break: auto-phrase を知らないので、keep-all＋<wbr> で切れ目を渡す（App.jsx の書名と同じ）。
const jaPhraseParser = loadDefaultJapaneseParser();
function withPhraseBreaks(text) {
  const s = String(text || '');
  let phrases;
  try { phrases = jaPhraseParser.parse(s); } catch { return s; }
  if (!phrases || phrases.length <= 1) return s;
  return phrases.flatMap((p, i) => (i === 0 ? [p] : [<wbr key={i} />, p]));
}

// 相談例（AI を使わない＝原価ゼロ）は相談タブと同じ作り方（lib/consultHelpers.js）:
//   前の相談の続き → 本の「現在の課題」→ メモのある本 → よくある困りごと。ここでは 2 つだけ。

// countUnknown: 本の読み込みに失敗して冊数が分からないとき。0 冊扱いで隠さず、件数なしの 1 行で出す。
// onSearchMemos(query): トークンを使い切ったときの「メモを検索して探す」（振り返り › メモを、言葉を入れて開く）。
export default function HomeConsult({ books = [], onAsk, onQuickstart, onSearchMemos, countUnknown = false }) {
  const { user } = useAuth();
  const cache = useAppDataCache();
  // 🪙 トークンを使い切っていたら、書いても送れない。入力欄の代わりに「いつ戻るか」とボタンを出す
  //   （書いた相談が相談タブで黙って消えないように・SPEC §1）。
  const { plan, freeMode, trialEndsAt, tokensAvailable, canBuyTokens, openTokenSheet, openPaywall } = usePaywall();
  const tokensUsedUp = (freeMode || canBuyTokens) && tokensAvailable != null && tokensAvailable <= 0;
  const inputRef = useRef(null);
  const bookCount = books.length;
  const [cardCount, setCardCount] = useState(null);
  // メモの件数を取りに行った結果が出たか（取れなかったときも true）。
  // 出るまでは「あなたの N 冊…」の 1 行を同じ高さの空きにしておく。先に「10 冊から」を出して
  // 200ms ほど後に「・メモ 30 件」が差し込まれると、文字が横に押し出されて動いて見えるため（2026-09-29）。
  //   回線が止まったままでも 1 行が空き続けないよう、3 秒で件数なしの文を出す。
  const [countSettled, setCountSettled] = useState(() => !user || !isSupabaseConfigured);
  useEffect(() => {
    if (countSettled) return undefined;
    const t = setTimeout(() => setCountSettled(true), 3000);
    return () => clearTimeout(t);
  }, [countSettled]);
  const [text, setText] = useState('');
  // 「メモ N 件」＝カード式＋学び（book_memos）＋「この本のまとめ」の入っている本（1 冊 1 件）。
  // 相談・初日クイックスタート・記録と同じ数え方（lib/consultHelpers.js・2026-09-29）。
  // まとめだけ（読書メーター等の感想を取り込んだ人）でも、相談の入力欄を出す。
  const summaryCount = useMemo(() => countSummaryMemos(books), [books]);
  const memoCount = cardCount == null ? null : cardCount + summaryCount;
  const [memoBookIds, setMemoBookIds] = useState(null);
  const [lastQuestion, setLastQuestion] = useState(null); // 前の相談（「前に相談した「…」、その後どう進める？」）
  // 相談例は、材料（メモのある本・前の相談）がそろってから 1 回だけ出す（2026-09-29）。
  // 以前は読み込み後 1 秒ほどで前の相談が届いて例が入れ替わり、1 つ目の例が 77px ずれていた。
  // そろうまでは同じ高さの形（Skeleton）。待つのは最大 600ms（遅い回線でも待たせすぎない）。
  // 一度出した例は、この画面を開いている間は変えない（押そうとした例が動かないように）。
  const [examplesReady, setExamplesReady] = useState(() => !user || !isSupabaseConfigured || bookCount === 0);
  useEffect(() => {
    if (examplesReady) return undefined;
    const t = setTimeout(() => setExamplesReady(true), 600);
    return () => clearTimeout(t);
  }, [examplesReady]);
  const frozenExamples = useRef(null);
  // 行動（本に入っている）。この 7 日でふりかえりを書いて完了した行動があれば、1 つ目の例を「やってみた「…」、次はどうする？」に。
  const { allActions } = useAllActions(books);
  const liveExamples = useMemo(
    () => buildConsultExamples({ books, memoBookIds, lastConsult: lastQuestion ? { question: lastQuestion } : null, count: 2, memoCount, actions: allActions }).map((e) => e.text),
    [books, memoBookIds, lastQuestion, memoCount, allActions],
  );
  if (examplesReady && !frozenExamples.current) frozenExamples.current = liveExamples;
  const examples = frozenExamples.current || [];

  // メモが動いたら（ホームのクイックメモ・本の詳細など）件数を取り直す。
  // 最初のメモを書いた直後に、案内から入力欄へ切り替わるように。
  const [memoTick, setMemoTick] = useState(0);
  useEffect(() => cache?.subscribeAnyMemo?.(() => setMemoTick((t) => t + 1)), [cache]);

  useEffect(() => {
    if (!user || !isSupabaseConfigured || bookCount === 0) return undefined;
    let alive = true;
    (async () => {
      try {
        const [{ count, error }, idsRes, lastRes] = await Promise.all([
          supabase
            .from('book_memos')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          // 相談例に出す本を「メモのある本」に限るため（新しい順に最大 1000 件で十分）。
          supabase
            .from('book_memos')
            .select('book_id')
            .eq('user_id', user.id)
            .not('book_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1000),
          // 前の相談（新しい 1 件）。読めなければ例に出さないだけ。
          Promise.resolve(supabase
            .from('chat_messages')
            .select('content')
            .eq('user_id', user.id)
            .eq('role', 'user')
            .order('created_at', { ascending: false })
            .limit(1)).catch(() => ({ data: null, error: true })),
        ]);
        if (alive && !error) setCardCount(count || 0);
        if (alive && !idsRes.error) setMemoBookIds(new Set((idsRes.data || []).map((r) => r.book_id)));
        if (alive && lastRes && !lastRes.error) setLastQuestion(lastRes.data?.[0]?.content || null);
      } catch { /* 件数が取れなくても入口自体は出す */ }
      if (alive) { setExamplesReady(true); setCountSettled(true); }
    })();
    return () => { alive = false; };
  }, [user?.id, bookCount, memoTick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (bookCount === 0 && !countUnknown) return null;

  const send = (q) => {
    const question = (q ?? text).trim();
    // 空のまま押されたら入力欄へ案内する（主ボタンを薄く無効化すると「主役」が
    // 脇役より弱く見えるため、見た目は常に主ボタンのままにする・DESIGN §0）。
    if (!question) { inputRef.current?.focus(); return; }
    track('home_consult_sent', { example: q != null });
    onAsk?.(question);
    setText('');
  };

  // 書きかけの文字があるときは、件数が後から 0 と分かっても入力欄を消さない。
  const hasMemos = memoCount == null || memoCount > 0 || text.trim().length > 0;

  return (
    <section aria-labelledby="home-consult-title" style={card}>
      <h2 id="home-consult-title" style={{ fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>
        困ったときは、相談する
      </h2>
      <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', margin: 'var(--space-2) 0 var(--space-4)', lineHeight: 1.5 }}>
        {/* メモ 0 件でも同じ 1 行（説明の補足文は置かない・DESIGN §0-6）。 */}
        {/* 件数が分かるまでは、同じ 1 行ぶんの高さだけ空けておく（文字は見せない・読み上げない）。 */}
        {countUnknown && bookCount === 0
          ? 'あなたの本から答えます'
          : !countSettled
            ? <span aria-hidden="true" style={{ visibility: 'hidden' }}>あなたの {bookCount} 冊から答えます</span>
            : memoCount === 0
              // メモがまだ無いうちは「から答えます」と言わない（答えの根拠になるのはメモ・2026-09-29）。
              ? <>本 {bookCount} 冊・メモはまだありません</>
              : <>あなたの {bookCount} 冊{memoCount > 0 && <>・メモ {memoCount} 件</>}から答えます</>}
      </p>

      {!hasMemos && onQuickstart && (
        <button type="button" onClick={onQuickstart} style={btnPrimary}>
          これまで読んだ本から始める
        </button>
      )}

      {hasMemos && tokensUsedUp && (
        <UsedUpNotice
          plan={plan}
          trialEndLabel={plan === 'trial' ? monthDayLabelJa(trialEndsAt) : ''}
          onAction={canBuyTokens ? openTokenSheet : () => openPaywall('free_used')}
          actionLabel={canBuyTokens ? 'トークンを追加' : 'プランを見る'}
          onSearch={onSearchMemos ? () => { track('home_consult_search_memos', {}); onSearchMemos(memoSearchQuery(text.trim() || lastQuestion || '')); } : null}
        />
      )}

      {hasMemos && !tokensUsedUp && (
        <>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={LIMITS.aiQuestion}
            placeholder="例：上司への報告がうまくいかない"
            aria-label="相談したいこと"
            style={{ ...input, resize: 'none', lineHeight: 1.5, display: 'block' }}
          />
          <button
            type="button"
            onClick={() => send()}
            style={{ ...btnPrimary, marginTop: 'var(--space-3)' }}
          >
            相談する
          </button>
          <p style={{ ...groupTitle, margin: 'var(--space-4) 0 var(--space-2)' }}>たとえば</p>
          {/* 相談例はチップ（--fill 面・枠なし）。入力欄（枠あり）と見分けがつくように。 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {!examplesReady && [0, 1].map((i) => (
              // 相談例のチップと同じ高さ（2 行＋上下 12）の形。そろったら本物に 1 回だけ入れ替わる。
              <SkeletonBlock key={`sk-${i}`} height={69} radius="var(--radius)" />
            ))}
            {examplesReady && examples.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                style={{
                  display: 'block', width: '100%', minHeight: 44, padding: 'var(--space-3)', textAlign: 'left',
                  background: 'var(--fill)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5,
                }}
              >
                {/* 2 行で止める（1 行だと何を聞く例か読めない）。全文は読み上げ・送信にそのまま使う。 */}
                {/* 文節の切れ目（<wbr>）でだけ折り返す。1 つの文節が行に収まらないときだけ中で折る（overflowWrap）。 */}
                <span style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'pretty' }}>{withPhraseBreaks(q)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// トークンを使い切ったときの 1 行＋ボタン（相談タブの「ここまで」の案内と同じ言い方）。
//   無料プラン・有料: 「今月のトークンは、ここまでです（M月1日に戻ります）」
//   7 日間無料: 「無料期間のトークンは、ここまでです（無料期間が終わる M月D日から、毎月 800 トークン使えます）」
// onSearch: 「メモを検索して探す」（AI を使わずに、自分のメモから手がかりを探す・2026-09-29）。脇役の文字ボタン。
function UsedUpNotice({ plan, trialEndLabel, onAction, actionLabel, onSearch }) {
  const nowrap = { whiteSpace: 'nowrap' };
  return (
    <>
      <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.5 }}>
        {plan === 'trial' ? (
          <>無料期間のトークンは、ここまでです{trialEndLabel && <>（無料期間が終わる<span style={nowrap}>{trialEndLabel}</span>から、<span style={nowrap}>毎月 {PAID_TOKENS} トークン</span>使えます）</>}</>
        ) : (
          <>今月のトークンは、ここまでです（<span style={nowrap}>{nextResetLabelJa()}</span>に戻ります）</>
        )}
      </p>
      <button type="button" onClick={onAction} style={{ ...btnPrimary, marginTop: 'var(--space-3)' }}>
        {actionLabel}
      </button>
      {onSearch && (
        <button type="button" onClick={onSearch} style={{ ...btnLink, width: '100%', marginTop: 'var(--space-2)' }}>
          メモを検索して探す
        </button>
      )}
    </>
  );
}
