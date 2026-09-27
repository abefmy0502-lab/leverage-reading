// 🕰 知識の足あと — テーマを選ぶと、その学びが日付をたどって「どう深まってきたか」を
// あなたのメモから AI が物語る（変遷追跡）。要約ではなく“変化”を映す。煽らない（本田哲学）。
//
// 既存資産だけで成立: gatherKnowledge + formatMemo(withDate) + listThemes を再利用し、
// DB 変更ゼロ。出力は ThemeReport と同じ MarkdownSections でレンダリング。

import { useEffect, useState, useCallback, useRef } from 'react';
import { listThemes, generateKnowledgeJourney } from '../lib/ai';
import { toMessage } from '../lib/errors';
import { useToast } from './Toast';
import MarkdownSections from './MarkdownSections';
import EmptyState from './EmptyState';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { Sprout, Copy, RotateCw, Square } from 'lucide-react';
import { LIMITS } from '../lib/limits';
import { btnPrimary, input as uiInput } from '../styles/ui';

// 見た目は DESIGN.md のトークンのみ。題名「考えの足あと」と「‹ 相談」は親（MyBookBrain）が出す。
const wrap = { display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' };
const headingStyle = { fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', margin: '0 0 var(--space-3)', lineHeight: 1.3 };
const groupTitle = { fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-2)' };
// 選択チップ: 選択中＝--accent-soft ＋ --accent 600 / それ以外＝--fill ＋ --text（テーマまとめと同じ）。
const chip = (active) => ({
  flex: '0 0 auto', whiteSpace: 'nowrap', minHeight: 44, padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 'var(--text-sub)', fontWeight: active ? 600 : 400,
  background: active ? 'var(--accent-soft)' : 'var(--fill)',
  color: active ? 'var(--accent)' : 'var(--text)',
});
const inp = { ...uiInput, flex: 1, minWidth: 0, width: 'auto' };
const primaryBtn = { ...btnPrimary, width: 'auto', flexShrink: 0 };
// 行の中の副ボタン（DESIGN §5 btnRow: 高さ 44・15・600）。
const rowBtn = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' };
// 文字ボタン（--accent・高さ 44）。生成中の「中止」に使う。
const textBtn = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: 'var(--space-2) 0', border: 'none', background: 'none', color: 'var(--accent)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 };
// 生成中のカード（テーマまとめの生成中と同じ形）。
const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };

export default function KnowledgeJourney({ userId, initialTheme = '', onInitialThemeUsed }) {
  const toast = useToast();
  const [themes, setThemes] = useState([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [custom, setCustom] = useState('');
  const [activeTheme, setActiveTheme] = useState('');
  const [state, setState] = useState({ status: 'idle' }); // idle|loading|done|thin|error
  const [aborting, setAborting] = useState(false);
  // 生成が始まったら結果の欄を画面に入れる（テーマ選択の下に隠れて見えないのを防ぐ）。
  const resultRef = useRef(null);

  useEffect(() => {
    let alive = true;
    if (!userId) { setThemesLoading(false); return undefined; }
    setThemesLoading(true);
    listThemes(userId)
      .then((list) => { if (alive) setThemes(list || []); })
      .catch(() => {})
      .finally(() => { if (alive) setThemesLoading(false); });
    return () => { alive = false; };
  }, [userId]);

  // AI 生成は数十秒かかる — タブ離脱（unmount）後の setState を防ぐ alive ガード
  // （上の listThemes と同じパターンに揃える）。
  const aliveRef = useRef(true);
  // unmount 時は setState を止めるだけでなくストリーム自体を abort する。
  // これが無いと誰も見ない SMART 生成が完走し、コストと月次コール枠を空費していた。
  const abortRef = useRef(null);
  useEffect(() => {
    // StrictMode（開発）は mount→unmount→mount と 2 回走るので、mount のたびに戻す
    // （戻さないと以後の setState がすべて止まり、生成中のまま終わらない）。
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      try { abortRef.current?.abort(); } catch { /* ignore */ }
    };
  }, []);

  const run = useCallback(async (t) => {
    const theme = (t || '').trim();
    if (!theme || state.status === 'loading') return;
    const controller = new AbortController();
    abortRef.current = controller;
    setActiveTheme(theme);
    setAborting(false);
    setState({ status: 'loading' });
    try {
      const r = await generateKnowledgeJourney(userId, theme, {
        // ⚡ ストリーミング表示 — 足あとは長文になりやすい。最初の段落から流し込む。
        onChunk: (text) => {
          if (!aliveRef.current) return;
          setState((st) => (st.status === 'loading' ? { status: 'loading', partial: text } : st));
        },
        signal: controller.signal,
      });
      if (!aliveRef.current) return;
      if (controller.signal.aborted) { setActiveTheme(''); setState({ status: 'idle' }); return; }
      if (r?.tooThin) setState({ status: 'thin' });
      else setState({ status: 'done', ...r });
    } catch (e) {
      if (!aliveRef.current) return;
      // 中止＝キャンセル扱い（テーマまとめと同じ）。エラーにせず選択の状態へ戻す。
      if (controller.signal.aborted || e?.name === 'AbortError') { setActiveTheme(''); setState({ status: 'idle' }); return; }
      // 先頭の絵文字（toMessage が付ける 🌐 等）は外す — アイコンに絵文字を使わない（DESIGN §3-2）。
      const msg = toMessage(e, '足あとの生成に失敗しました。').replace(/^[\p{Extended_Pictographic}️\s]+/u, '');
      setState({ status: 'error', msg });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (aliveRef.current) setAborting(false);
    }
  }, [userId, state.status]);

  const stop = useCallback(() => {
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) return;
    setAborting(true);
    try { controller.abort(); } catch { /* ignore */ }
  }, []);

  // 生成が始まったら結果の欄までスクロールする。
  const isLoading = state.status === 'loading';
  useEffect(() => {
    if (!isLoading) return;
    try { resultRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); } catch { /* ignore */ }
  }, [isLoading]);

  // 📐→🕰 テーマまとめから「このテーマの足あとを見る」で遷移してきた時、
  // テーマを引き継いで自動で変遷を生成する（一度だけ）。
  const initialRanRef = useRef(false);
  useEffect(() => {
    if (initialRanRef.current || !initialTheme || !userId) return;
    initialRanRef.current = true;
    run(initialTheme);
    // 親に「使った」と知らせて消してもらう。残っていると、ほかの画面から「考えの足あと」に
    // 戻るたびに同じテーマを AI で作り直していた（2026-09-27・見えない原価）。
    onInitialThemeUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTheme, userId]);

  const copy = async () => {
    if (state.status !== 'done') return;
    try {
      await navigator.clipboard.writeText(state.content);
      toast.success('コピーしました。');
    } catch {
      toast.error('コピーできませんでした。');
    }
  };

  const submitCustom = () => {
    const t = custom.trim();
    if (t) run(t);
  };

  return (
    <div style={wrap}>
      {/* 問いかけの見出し ＋ テーマチップ（実際に使っているタグ/カテゴリから） */}
      <section aria-labelledby="journey-themes">
        <h2 id="journey-themes" style={headingStyle}>どのテーマの変化をたどりますか</h2>
        {themesLoading ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }} aria-hidden="true">
            <SkeletonBlock width={96} height={44} radius="var(--radius)" />
            <SkeletonBlock width={128} height={44} radius="var(--radius)" />
            <SkeletonBlock width={80} height={44} radius="var(--radius)" />
          </div>
        ) : themes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {themes.map((t) => (
              <button key={t.theme} type="button" style={chip(activeTheme === t.theme)} aria-pressed={activeTheme === t.theme} onClick={() => run(t.theme)}>
                {t.theme}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 自由入力（見えるラベルはテーマまとめと揃える） */}
      <div>
        <label htmlFor="journey-custom" style={{ ...groupTitle, display: 'block' }}>
          テーマを自分で入力
        </label>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input
            id="journey-custom"
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value.slice(0, LIMITS.theme))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submitCustom(); } }}
            placeholder="例：営業、習慣"
            maxLength={LIMITS.theme}
            style={inp}
          />
          <button type="button" style={{ ...primaryBtn, opacity: custom.trim() ? 1 : 0.5, cursor: custom.trim() ? 'pointer' : 'default' }} disabled={!custom.trim()} onClick={submitCustom}>
            たどる
          </button>
        </div>
      </div>

      {state.status !== 'idle' && (
        <div ref={resultRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', scrollMarginTop: 'var(--space-4)' }}>
          {activeTheme && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 44 }}>
              <h3 style={{ ...headingStyle, margin: 0, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{activeTheme}</h3>
              {state.status === 'loading' && (
                <button
                  type="button"
                  onClick={stop}
                  disabled={aborting}
                  style={{ ...textBtn, opacity: aborting ? 0.6 : 1 }}
                  aria-label={aborting ? '中止しています' : '足あとの生成を中止'}
                >
                  <Square size={14} aria-hidden="true" />{aborting ? '中止中…' : '中止'}
                </button>
              )}
            </div>
          )}
          {state.status === 'loading' && !state.partial && (
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }} aria-live="polite" aria-busy="true">
              <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5 }}>
                あなたのメモを時系列で読んでいます…
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <SkeletonBlock width="90%" height={14} radius="var(--radius-full)" />
                <SkeletonBlock width="76%" height={14} radius="var(--radius-full)" />
                <SkeletonBlock width="84%" height={14} radius="var(--radius-full)" />
                <SkeletonBlock width="64%" height={14} radius="var(--radius-full)" />
              </div>
            </div>
          )}
          {state.status === 'loading' && state.partial && (
            <div aria-live="polite" aria-busy="true">
              <MarkdownSections text={state.partial} />
            </div>
          )}

          {state.status === 'thin' && (
            <EmptyState
              icon={<Sprout size={32} strokeWidth={1.5} aria-hidden="true" />}
              title="まだ追える変化は少なめです"
              description="このテーマのメモが増えるほど、変遷がくっきり見えてきます。今日の一行から。"
            />
          )}

          {state.status === 'error' && (
            <ErrorMessage
              icon={null}
              description={state.msg}
              actions={activeTheme ? [{
                label: 'もう一度試す',
                ariaLabel: `テーマ「${activeTheme}」の足あとをもう一度たどる`,
                onClick: () => run(activeTheme),
                variant: 'secondary',
                icon: <RotateCw size={16} />,
              }] : []}
            />
          )}

          {state.status === 'done' && (
            <div className="tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
                {state.first} 〜 {state.last}・メモ {state.count} 件をたどりました
              </p>
              <MarkdownSections text={state.content} />
              <div>
                <button type="button" style={rowBtn} onClick={copy}>
                  <Copy size={16} aria-hidden="true" />コピー
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
