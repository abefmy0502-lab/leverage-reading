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
import Spinner from './Spinner';
import { Clock, Pin, Pencil, Copy } from 'lucide-react';
import { LIMITS } from '../lib/limits';

const wrap = { display: 'flex', flexDirection: 'column', gap: 16 };
const hint = { fontSize: 12, color: 'var(--c-ink-2)', lineHeight: 1.8, margin: 0 };
const chip = (active) => ({
  flex: '0 0 auto', whiteSpace: 'nowrap', fontSize: 12, padding: '7px 13px', minHeight: 44,
  borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 600 : 500,
  border: active ? '1.5px solid var(--c-brand)' : '1px solid var(--c-hairline-strong)',
  background: active ? 'var(--c-soft)' : 'transparent',
  color: active ? 'var(--c-brand)' : 'var(--c-ink-2)',
});
const inp = {
  flex: 1, minWidth: 150, padding: '10px 12px', fontSize: 16,
  border: '1px solid var(--c-hairline-strong)', borderRadius: 10, background: 'var(--surface)',
  color: 'var(--c-ink)', fontFamily: 'inherit', boxSizing: 'border-box',
};
const primaryBtn = {
  minHeight: 44, padding: '10px 16px', borderRadius: 10, border: 'none',
  background: 'var(--c-brand)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer',
};
const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '8px 14px',
  borderRadius: 10, border: '1px solid var(--c-hairline-strong)', background: 'transparent',
  color: 'var(--c-ink-2)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
};

export default function KnowledgeJourney({ userId, initialTheme = '' }) {
  const toast = useToast();
  const [themes, setThemes] = useState([]);
  const [custom, setCustom] = useState('');
  const [activeTheme, setActiveTheme] = useState('');
  const [state, setState] = useState({ status: 'idle' }); // idle|loading|done|thin|error

  useEffect(() => {
    let alive = true;
    if (!userId) return undefined;
    listThemes(userId).then((list) => { if (alive) setThemes(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  // AI 生成は数十秒かかる — タブ離脱（unmount）後の setState を防ぐ alive ガード
  // （上の listThemes と同じパターンに揃える）。
  const aliveRef = useRef(true);
  // unmount 時は setState を止めるだけでなくストリーム自体を abort する。
  // これが無いと誰も見ない SMART 生成が完走し、コストと月次コール枠を空費していた。
  const abortRef = useRef(null);
  useEffect(() => () => {
    aliveRef.current = false;
    try { abortRef.current?.abort(); } catch { /* ignore */ }
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} aria-hidden="true" style={{ color: 'var(--c-brand)' }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-ink)', margin: 0 }}>
            あなたの学びは、こう変わってきた
          </h2>
        </div>
        <p style={hint}>
          テーマを選ぶと、その学びが<strong>日付をたどってどう深まってきたか</strong>を、
          あなたのメモから振り返ります。いつ何を考え、どう行動し、考えがどう変わったか。
        </p>
      </div>

      {/* テーマチップ（実際に使っているタグ/カテゴリから） */}
      {themes.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink-soft)', margin: '0 0 8px' }}>
            <Pin size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
            あなたのメモから見つけたテーマ
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {themes.map((t) => (
              <button key={t.theme} type="button" style={chip(activeTheme === t.theme)} onClick={() => run(t.theme)}>
                {t.theme}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 自由入力 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pencil size={14} aria-hidden="true" style={{ color: 'var(--c-ink-3)' }} />
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value.slice(0, LIMITS.theme))}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submitCustom(); } }}
          placeholder="例：営業 / リーダーシップ / 習慣"
          maxLength={LIMITS.theme}
          aria-label="テーマを入力"
          style={inp}
        />
        <button type="button" style={{ ...primaryBtn, opacity: custom.trim() ? 1 : 0.5, cursor: custom.trim() ? 'pointer' : 'default' }} disabled={!custom.trim()} onClick={submitCustom}>
          たどる
        </button>
      </div>

      {state.status === 'loading' && !state.partial && <Spinner message="あなたのメモを時系列で読んでいます…" />}
      {state.status === 'loading' && state.partial && (
        <div aria-live="polite" aria-busy="true">
          <MarkdownSections text={state.partial} />
        </div>
      )}

      {state.status === 'thin' && (
        <EmptyState
          icon="🌱"
          title="まだ追える変化は少なめです"
          description="このテーマのメモが増えるほど、変遷がくっきり見えてきます。今日の一行から。"
        />
      )}

      {state.status === 'error' && (
        <p role="alert" style={{ fontSize: 12, color: 'var(--c-critical)', background: 'var(--c-critical-soft)', padding: '10px 12px', borderRadius: 8, lineHeight: 1.7 }}>
          {state.msg}
        </p>
      )}

      {state.status === 'done' && (
        <div className="tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--c-ink-3)', margin: 0 }}>
            📅 {state.first} 〜 {state.last}・メモ {state.count} 件をたどりました
          </p>
          <MarkdownSections text={state.content} />
          <div>
            <button type="button" style={ghostBtn} onClick={copy}>
              <Copy size={14} aria-hidden="true" />コピー
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
