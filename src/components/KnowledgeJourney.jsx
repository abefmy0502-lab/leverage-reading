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
import Spinner from './Spinner';
import { SkeletonBlock } from './Skeleton';
import { Sprout, Copy, RotateCw } from 'lucide-react';
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

export default function KnowledgeJourney({ userId, initialTheme = '' }) {
  const toast = useToast();
  const [themes, setThemes] = useState([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [custom, setCustom] = useState('');
  const [activeTheme, setActiveTheme] = useState('');
  const [state, setState] = useState({ status: 'idle' }); // idle|loading|done|thin|error

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
      if (r?.tooThin) setState({ status: 'thin' });
      else setState({ status: 'done', ...r });
    } catch (e) {
      if (!aliveRef.current) return;
      setState({ status: 'error', msg: toMessage(e, '足あとの生成に失敗しました。') });
    }
  }, [userId, state.status]);

  // 📐→🕰 テーマまとめから「このテーマの足あとを見る」で遷移してきた時、
  // テーマを引き継いで自動で変遷を生成する（一度だけ）。
  const initialRanRef = useRef(false);
  useEffect(() => {
    if (initialRanRef.current || !initialTheme || !userId) return;
    initialRanRef.current = true;
    run(initialTheme);
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

      {state.status === 'loading' && !state.partial && <Spinner message="あなたのメモを時系列で読んでいます…" />}
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
  );
}
