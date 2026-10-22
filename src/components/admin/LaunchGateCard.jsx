// 🚀 公開の準備（売上までの関門）— 運営ダッシュボード 概況の「今日の一手」の下（2026-10-22 オーナー「徹底的に準備を進めてほしい」）。
//
// サーバー（api/launch-health.js）が「設定されているか」を真偽だけで返し、src/lib/launchGates.js の一覧に照らして
// 「まだ」を並べる。値は出さない。見出しは「売るために必須」の残りの数（0 なら「売れる状態です」）。
// 4 つのグループ（売るために必須・iPhone の 1.0 に必須・数字が見えるために・あると効く）。そろった行は薄く、まだの行は
// 名前の下に「どこで」（手順書の場所）。管理者でない・確かめられないときは ErrorMessage「確かめられませんでした」＋「もう一度」。
// 手順の順番は docs/revenue-gates.md。
import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Check, Circle } from 'lucide-react';
import ErrorMessage from '../ErrorMessage';
import { SkeletonBlock } from '../Skeleton';
import { withPhraseBreaks } from '../TightBubble';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { evaluateGates, groupGates, gateHeadline } from '../../lib/launchGates';

const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const sub = { margin: 0, fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'break-word' };
const groupTitle = { margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 };
const rowBox = { padding: 'var(--space-2) 0', borderTop: '1px solid var(--separator)' };

async function fetchHealth() {
  let token = null;
  try { const { data } = await supabase.auth.getSession(); token = data?.session?.access_token || null; } catch { /* 無ければ 401 */ }
  const r = await fetch('/api/launch-health', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(`launch-health ${r.status}`);
  return r.json();
}

function Row({ item }) {
  const ok = item.ok === true;
  return (
    <div style={{ ...rowBox, display: 'grid', gridTemplateColumns: '1.25em 1fr', columnGap: 'var(--space-2)', alignItems: 'start', color: ok ? 'var(--text-3)' : 'var(--text)' }}>
      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', height: 'calc(var(--text-sub) * 1.5)', color: ok ? 'var(--success)' : 'var(--text-3)' }}>
        {ok ? <Check size="1em" strokeWidth={2.5} /> : <Circle size="1em" strokeWidth={2} />}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sub)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{ok ? 'そろっている：' : 'まだ：'}</span>
          {withPhraseBreaks(item.label)}
        </div>
        {!ok && <p style={{ ...sub, marginTop: 'var(--space-1)' }}>{withPhraseBreaks(item.where)}</p>}
      </div>
    </div>
  );
}

export default function LaunchGateCard() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true); setError(null);
    try { setHealth(await fetchHealth()); } catch (e) { setError(e); setHealth(null); } finally { setLoading(false); }
  };
  useEffect(() => { if (isSupabaseConfigured) load(); else { setLoading(false); setError(new Error('not configured')); } }, []);

  const rows = useMemo(() => evaluateGates(health), [health]);
  const groups = useMemo(() => groupGates(rows), [rows]);
  const headline = gateHeadline(rows);
  const pendingAll = rows.filter((r) => r.ok === false).length;

  let body;
  if (loading) {
    body = (
      <div aria-busy="true" aria-label="公開の準備を確かめています" style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <SkeletonBlock width="45%" height={28} />
        {[4, 3].map((n, i) => (
          <div key={i} style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <SkeletonBlock width="40%" height={15} />
            {Array.from({ length: n }, (_, k) => <SkeletonBlock key={k} width={k % 2 ? '70%' : '85%'} height={22} />)}
          </div>
        ))}
      </div>
    );
  } else if (error || !health) {
    body = <ErrorMessage title="確かめられませんでした" description="管理者でログインしているか、サーバーの Supabase の鍵が入っているかを確かめて、もう一度お試しください。" actions={[{ label: 'もう一度', onClick: load }]} />;
  } else {
    body = (
      <>
        <p style={{ margin: 0, fontSize: 'var(--text-heading)', fontWeight: 600, lineHeight: 1.3, color: 'var(--text)' }}>{headline}</p>
        <p style={{ ...sub, marginTop: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
          {pendingAll === 0 ? 'ぜんぶそろっています' : `ぜんぶで あと ${pendingAll} つ`} · docs/revenue-gates.md
        </p>
        {groups.map((g) => (
          <div key={g.id} style={{ paddingTop: 'var(--space-4)' }}>
            <p style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>{g.title}{g.pending > 0 && <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)' }}>あと {g.pending}</span>}</p>
            {g.items.map((it) => <Row key={it.id} item={it} />)}
          </div>
        ))}
      </>
    );
  }

  return (
    <section aria-labelledby="launch-gate-title" style={{ margin: 'var(--space-6) 0' }}>
      <h2 id="launch-gate-title" style={{ margin: '0 0 var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
        <ListChecks size="1.2em" strokeWidth={2} aria-hidden="true" /> 公開の準備
      </h2>
      <div style={card}>{body}</div>
    </section>
  );
}
