// 🔁 相談・AI 選書の会話から、ロードマップを見直すシート（2026-11-15 オーナー「AI 選書で自分が認識していない課題を新たに見つけたら、
//   読書計画カレンダーも更新されていく感じ。自分が記載した課題も・ロードマップも。AI 選書のみならず相談でも」）。
//
// 流れ: どの目標か（ロードマップのある目標が 2 つ以上のときだけ選ぶ）→「見直す（約 25 トークン）」→ AI が、その会話から
//   まだロードマップに無い課題が見えたかを確かめる → 見えたら 今の課題・必要なこと・まだ先の区切り を直して保存（カレンダーは
//   ロードマップから作るので一緒に変わる）・「元に戻す」 / 見えなければ「いまのロードマップのままで大丈夫そうです」。
// 勝手には見直さない（押したときだけ・トークンを使うので）。いまの区切りより前は変えない。
import { useMemo, useState } from 'react';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { Chip } from './formPrimitives';
import { withPhraseBreaks } from './TightBubble';
import { useToast } from './Toast';
import { btnPrimary, btnGhost, btnLinkQuiet } from '../styles/ui';
import { useGoals } from '../hooks/useGoals';
import { ensureAiConsent } from '../lib/aiConsent';
import { updateGoalRoadmap } from '../lib/ai';
import { horizonOf } from '../lib/goals';
import { roadmapHorizons, saveRoadmap, withUpdateLog } from '../lib/goalRoadmap';
import { appNow } from '../lib/appNow';
import { track } from '../lib/analytics';
import './goals.css';

const SOURCE_NAME = { consult: 'この相談', advisor: 'この AI 選書' };

export default function RoadmapReflectSheet({ source, books = [], onClose, onOpenRoadmap }) {
  const { goals, roadmaps, loaded } = useGoals();
  const toast = useToast();
  const horizons = useMemo(() => roadmapHorizons(goals, roadmaps), [goals, roadmaps]);
  const [key, setKey] = useState(null);
  const pick = key || horizons[0] || null;
  const [stage, setStage] = useState('confirm'); // confirm | loading | changed | same | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [prevRecord, setPrevRecord] = useState(null);
  const name = SOURCE_NAME[source?.kind] || 'この会話';

  const run = async () => {
    if (!pick) return;
    if (!(await ensureAiConsent('goal_roadmap'))) return;
    const record = roadmaps[pick];
    const goal = { key: pick, ...goals[pick] };
    setStage('loading');
    setError(null);
    try {
      const r = await updateGoalRoadmap({ goal, record, source, books, now: appNow() });
      if (!r.found) {
        setStage('same');
        track('goal_roadmap_reflect', { source: source?.kind || 'other', found: false });
        return;
      }
      setPrevRecord(record);
      const next = withUpdateLog({ ...record, roadmap: r.roadmap }, { source: source?.kind || 'other', newIssues: r.newIssues, note: r.note, prevRoadmap: record.roadmap });
      await saveRoadmap(pick, next);
      setResult(r);
      setStage('changed');
      track('goal_roadmap_reflect', { source: source?.kind || 'other', found: true });
    } catch (e) {
      setError({ message: e?.message || 'ロードマップを見直せませんでした。', notice: !!e?.notice });
      setStage('error');
    }
  };

  const undo = async () => {
    if (!prevRecord || !pick) return;
    await saveRoadmap(pick, prevRecord);
    toast.show?.('ロードマップを、見直す前に戻しました');
    onClose?.();
  };

  const footer = (() => {
    if (stage === 'confirm') {
      return (
        <button type="button" style={btnPrimary} onClick={run} disabled={!pick}>
          見直す（約 25 トークン）
        </button>
      );
    }
    if (stage === 'changed') {
      return (
        <button type="button" style={btnPrimary} onClick={() => { onClose?.(); onOpenRoadmap?.(pick); }}>
          ロードマップを見る
        </button>
      );
    }
    if (stage === 'same') return <button type="button" style={btnGhost} onClick={onClose}>閉じる</button>;
    return null;
  })();

  return (
    <BottomSheet title="ロードマップを見直す" onClose={onClose} dismissLabel={stage === 'loading' ? null : '閉じる'} dismissible={stage !== 'loading'} footer={footer}>
      {!loaded && <SkeletonBlock width="100%" height="var(--space-16)" />}
      {loaded && stage === 'confirm' && (
        <>
          <p className="goal-lead" style={{ marginBottom: 'var(--space-4)' }}>
            {withPhraseBreaks(`${name}から、まだロードマップに書いていない課題が見えたかを、AI が確かめます。見えたときだけ、今の課題・必要なこと・これからの道のりと読書計画が変わります。`)}
          </p>
          {horizons.length > 1 && (
            <div role="radiogroup" aria-label="見直す目標" className="plan-minutes" style={{ gridTemplateColumns: `repeat(${horizons.length}, 1fr)`, marginTop: 0, marginBottom: 'var(--space-3)' }}>
              {horizons.map((k) => (
                <Chip key={k} size="select" stretch active={pick === k} role="radio" aria-checked={pick === k} onClick={() => setKey(k)}>{horizonOf(k).label}</Chip>
              ))}
            </div>
          )}
          {pick && (
            <div className="goal-carry" style={{ marginBottom: 0 }}>
              <p className="goal-sec-title" style={{ margin: 0 }}>{`${horizonOf(pick).label}の目標`}</p>
              <p className="goal-carry-quote" style={{ marginBottom: 0 }}>{withPhraseBreaks(goals[pick]?.text || '')}</p>
            </div>
          )}
        </>
      )}
      {stage === 'loading' && (
        <div className="goal-building" role="status" aria-live="polite">
          <p className="goal-building-note">{withPhraseBreaks(`${name}と、いまのロードマップを見比べています…`)}</p>
          <SkeletonBlock width="70%" height="var(--text-body)" />
          <SkeletonBlock width="100%" height="var(--space-12)" />
        </div>
      )}
      {stage === 'changed' && result && (
        <div aria-live="polite">
          <p className="goal-sec-title">新しく見えた課題</p>
          <ul className="rm-list">
            {result.newIssues.map((t) => <li key={t}><p className="rm-issue" style={{ fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)' }}>{t}</p></li>)}
          </ul>
          {result.note && <p className="plan-summary">{withPhraseBreaks(result.note)}</p>}
          <p className="plan-summary" style={{ marginTop: 'var(--space-2)' }}>{withPhraseBreaks('読書計画のカレンダーも、新しい道のりに合わせて変わります。')}</p>
          <button type="button" style={{ ...btnLinkQuiet, marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={undo}>元に戻す</button>
        </div>
      )}
      {stage === 'same' && (
        <div aria-live="polite">
          <p className="goal-text" style={{ marginTop: 0, fontSize: 'var(--text-read)' }}>{withPhraseBreaks('いまのロードマップのままで、大丈夫そうです。')}</p>
          <p className="plan-summary">{withPhraseBreaks(`${name}で話したことは、もうロードマップの課題と道のりに入っていました。`)}</p>
        </div>
      )}
      {stage === 'error' && error && (
        <ErrorMessage
          title={error.notice ? 'AI のトークンについて' : '見直せませんでした'}
          description={error.message}
          actions={error.notice ? [{ label: '閉じる', onClick: onClose }] : [{ label: 'もう一度', variant: 'primary', onClick: run }, { label: '閉じる', onClick: onClose }]}
        />
      )}
    </BottomSheet>
  );
}
