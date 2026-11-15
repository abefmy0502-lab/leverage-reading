// 🧭 目標とロードマップ・読書計画カレンダー（2026-11-15 オーナー「1 年後・3 年後・5 年後の目標を、達成するには？で深掘りして
//   ロードマップに。課題ややるべきことが見える」「本棚からいつまでにどの本をどの順番に読むのかをカレンダーに・読むスピードを調整」）。
//
// 画面（振り返り › 行動 のいちばん上の 1 行から開く・押し込まれた全画面）:
//   goals    … 道（いま → 1 年後 → 3 年後 → 5 年後）。目標を書く・書き直す・「達成するには？」・ロードマップを見る
//   interview … 「達成するには？」の深掘り（AI が 1 つずつ聞く・2 つまで・答えの候補はいくつでも選べる）
//   roadmap  … 必要なこと・今の課題・道のり（区切りごとにやること・読む本）・本棚に無いテーマ
//   plan     … 読書計画カレンダー（1 日に読む時間を選ぶと、今日から日付を割り振る・遅れは出さない）
// 言葉は GLOSSARY（目標・行動・積読・トークン）。%・連続日数・「あと N 冊」は出さない。
// 見た目は goals.css（トークンだけ）。

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Check, Search } from 'lucide-react';
import './goals.css';
import { AdvisorNavBar } from './AdvisorHistory';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { MiniCover } from './BookCards';
import { Chip } from './formPrimitives';
import { withPhraseBreaks } from './TightBubble';
import { useToast } from './Toast';
import { btnPrimary, btnPrimaryOff, btnGhost, btnLink, btnLinkQuiet, input as uiInput } from '../styles/ui';
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack';
import { useReadingSessions } from '../hooks/useReadingSessions';
import { useGoals } from '../hooks/useGoals';
import { PaywallContext } from '../state/PaywallContext';
import { ensureAiConsent } from '../lib/aiConsent';
import { runGoalInterview, generateGoalRoadmap } from '../lib/ai';
import { interviewChips, toggleChoice, choiceSelected, OPT_OFF, OPT_UNSURE, OFF_PLACEHOLDER } from '../lib/advisorInterview';
import { GOAL_HORIZONS, GOAL_MAX, horizonOf, fmtGoalDeadline, saveGoal, suggestHorizon, cleanGoalText } from '../lib/goals';
import { GOAL_ASK_LIMIT, phaseSpecs, currentPhaseIndex, saveRoadmap, pruneRoadmapBooks } from '../lib/goalRoadmap';
import {
  PLAN_MINUTES, PLAN_DEFAULT_MINUTES, readingSpeedFactor, planItemsFromRoadmap, scheduleBooks, monthWeeks, weekBands,
  planMonths, bookOnDay, fmtSpan, fmtMd, fmtRange, fmtHoursMin, parseYmd,
} from '../lib/readingPlan';
import { appNow } from '../lib/appNow';
import { toLocalYmd } from '../lib/dates';
import { sanitizeForPrompt } from '../lib/ai';
import { track } from '../lib/analytics';

const DOW = ['月', '火', '水', '木', '金', '土', '日'];
const NAV_TITLE = { goals: '目標', interview: '達成するには？', roadmap: 'ロードマップ', plan: '読書計画' };

// 問いの終わりの「？」を前の 2 文字とつなぐ（行頭に「？」だけを残さない）。
function gluedEnd(text) {
  const t = String(text || '');
  const m = t.match(/^([\s\S]*?)([^\s]{2}[？?。！!]+)$/u);
  if (!m) return withPhraseBreaks(t);
  return <>{withPhraseBreaks(m[1])}<span style={{ whiteSpace: 'nowrap' }}>{m[2]}</span></>;
}

export default function GoalScreen({ start = null, books = [], onClose, onOpenBook, onAddActionText, onAddReadingActions, onFindBooks }) {
  const { goals, roadmaps, purpose, loaded } = useGoals();
  const pay = useContext(PaywallContext);
  const toast = useToast();
  const { rows: sessions } = useReadingSessions();
  const [view, setView] = useState(start?.view || 'goals');
  const [horizon, setHorizon] = useState(start?.horizon || null);
  const [editing, setEditing] = useState(null); // { key, text }
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef(null);

  const goal = horizon && goals[horizon] ? { key: horizon, ...goals[horizon] } : null;
  const record = horizon ? roadmaps[horizon] : null;

  const back = useCallback(() => {
    if (view === 'plan') { setView('roadmap'); return; }
    if (view === 'roadmap' || view === 'interview') { setView('goals'); return; }
    onClose?.();
  }, [view, onClose]);
  useEdgeSwipeBack({ onBack: back, enabled: !editing });
  useEffect(() => { scrollRef.current?.scrollTo?.({ top: 0 }); setScrolled(false); }, [view, horizon]);

  const open = (key, v) => { setHorizon(key); setView(v); };

  // 無料プランは目標 1 つまで（2026-11-15 オーナー決定）。ほかの目標でもうロードマップを作っていたら、プランの画面へ。
  const canBuild = (key) => {
    if (!pay?.freeMode) return true;
    const others = Object.keys(roadmaps || {}).filter((k) => k !== key && roadmaps[k]?.roadmap);
    if (others.length === 0) return true;
    pay.openPaywall?.('feature', '目標のロードマップ');
    return false;
  };

  const startInterview = async (key) => {
    if (!canBuild(key)) return;
    if (!(await ensureAiConsent('goal_interview'))) return;
    track('goal_interview_start', { horizon: key });
    open(key, 'interview');
  };

  const backLabel = view === 'goals' ? '行動' : view === 'plan' ? 'ロードマップ' : '目標';
  return (
    <div className="goal-screen" role="dialog" aria-modal="true" aria-label={NAV_TITLE[view]}>
      <AdvisorNavBar backLabel={backLabel} title={NAV_TITLE[view]} onBack={back} pushed scrolled={scrolled} />
      <div className="goal-scroll" ref={scrollRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
        <div className="goal-inner">
          {view === 'goals' && (
            <GoalsView
              goals={goals}
              roadmaps={roadmaps}
              purpose={purpose}
              loaded={loaded}
              onEdit={(key) => setEditing({ key, text: goals[key]?.text || '' })}
              onCarry={async (key, text) => {
                const r = await saveGoal(key, text);
                if (r) toast.success?.(`${horizonOf(key).label}の目標に入れました`);
              }}
              onInterview={startInterview}
              onRoadmap={(key) => open(key, 'roadmap')}
            />
          )}
          {view === 'interview' && goal && (
            <InterviewView
              goal={goal}
              goals={goals}
              roadmaps={roadmaps}
              books={books}
              onDone={() => setView('roadmap')}
              onCancel={() => setView('goals')}
            />
          )}
          {view === 'roadmap' && goal && record?.roadmap && (
            <RoadmapView
              goal={goal}
              record={record}
              books={books}
              onOpenBook={onOpenBook}
              onAddActionText={onAddActionText}
              onFindBooks={onFindBooks}
              onPlan={() => setView('plan')}
              onRebuild={() => startInterview(goal.key)}
            />
          )}
          {view === 'roadmap' && goal && !record?.roadmap && (
            <ErrorMessage title="ロードマップがまだありません" description="「達成するには？」に答えると、ロードマップができます。" actions={[{ label: '達成するには？を考える', variant: 'primary', onClick: () => startInterview(goal.key) }]} />
          )}
          {view === 'plan' && goal && record?.roadmap && (
            <PlanView
              goal={goal}
              record={record}
              books={books}
              sessions={sessions}
              onOpenBook={onOpenBook}
              onAddReadingActions={onAddReadingActions}
            />
          )}
        </div>
      </div>
      {editing && (
        <GoalEditSheet
          horizonKey={editing.key}
          initial={editing.text}
          hasRoadmap={!!roadmaps[editing.key]?.roadmap}
          onClose={() => setEditing(null)}
          onSave={async (text) => {
            const key = editing.key;
            const r = await saveGoal(key, text);
            setEditing(null);
            if (!r) { toast.error?.('目標を保存できませんでした。もう一度押してください。'); return; }
            track('goal_saved', { horizon: key, cleared: !cleanGoalText(text) });
            if (cleanGoalText(text) && roadmaps[key]?.roadmap && cleanGoalText(text) !== roadmaps[key]?.goalText) {
              toast.show?.('目標を書き直しました。ロードマップは「つくり直す」で新しい目標に合わせられます。');
            }
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 道（いま → 1 年後 → 3 年後 → 5 年後）
// ---------------------------------------------------------------------------
function GoalsView({ goals, roadmaps, purpose, loaded, onEdit, onCarry, onInterview, onRoadmap }) {
  const anyGoal = GOAL_HORIZONS.some((h) => goals[h.key]?.text);
  const carryText = purpose?.text && !anyGoal ? purpose.text : '';
  const [carryKey, setCarryKey] = useState(() => suggestHorizon(carryText));
  useEffect(() => { setCarryKey(suggestHorizon(carryText)); }, [carryText]);

  if (!loaded) {
    return (
      <div role="status" aria-label="読み込み中" className="goal-building">
        <SkeletonBlock width="80%" height="var(--text-sub)" />
        {[0, 1, 2].map((i) => <SkeletonBlock key={i} width="100%" height="var(--space-16)" />)}
      </div>
    );
  }
  return (
    <>
      <p className="goal-lead">{withPhraseBreaks('目標ごとに「達成するには？」を一緒に考えて、やることと読む本の順番にします。')}</p>
      {carryText && (
        <section className="goal-carry" aria-label="はじめに書いた目標">
          <p className="goal-sec-title" style={{ margin: 0 }}>はじめに書いた目標</p>
          <p className="goal-carry-quote">{withPhraseBreaks(carryText)}</p>
          <div role="radiogroup" aria-label="入れる目標" className="plan-minutes" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 0 }}>
            {GOAL_HORIZONS.map((h) => (
              <Chip key={h.key} size="select" stretch active={carryKey === h.key} role="radio" aria-checked={carryKey === h.key} onClick={() => setCarryKey(h.key)}>{h.label}</Chip>
            ))}
          </div>
          <button type="button" style={{ ...btnGhost, marginTop: 'var(--space-3)' }} onClick={() => onCarry(carryKey, carryText)}>
            {horizonOf(carryKey).label}の目標に入れる
          </button>
        </section>
      )}
      <ol className="goal-road" aria-label="目標の道のり">
        <li>
          <span className="goal-dot is-now" aria-hidden="true" />
          <p className="goal-now-label">いま</p>
        </li>
        {GOAL_HORIZONS.map((h) => {
          const g = goals[h.key];
          const rec = roadmaps[h.key];
          const needs = (rec?.roadmap?.needs || []).map((n) => n.name);
          return (
            <li key={h.key}>
              <span className={`goal-dot${g?.text ? (rec?.roadmap ? ' is-here' : ' is-set') : ''}`} aria-hidden="true" />
              <p className="goal-when">
                <strong>{h.label}</strong>
                {g?.text && <span>{fmtGoalDeadline(g.at, h.years)}</span>}
              </p>
              {g?.text ? (
                <>
                  <p className="goal-text">{withPhraseBreaks(g.text)}</p>
                  {needs.length > 0 && (
                    <p className="goal-needs-peek">{withPhraseBreaks(`必要なこと：${needs.join('・')}`)}</p>
                  )}
                  <div className="goal-actions">
                    {rec?.roadmap ? (
                      <button type="button" style={{ ...btnGhost, width: 'auto', paddingLeft: 'var(--space-4)', paddingRight: 'var(--space-3)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }} onClick={() => onRoadmap(h.key)}>
                        ロードマップを見る<ChevronRight size="1em" aria-hidden="true" />
                      </button>
                    ) : (
                      <button type="button" style={{ ...btnGhost, width: 'auto', paddingLeft: 'var(--space-4)', paddingRight: 'var(--space-4)' }} onClick={() => onInterview(h.key)}>
                        達成するには？を考える
                      </button>
                    )}
                    <button type="button" style={btnLinkQuiet} onClick={() => onEdit(h.key)}>書き直す</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="goal-empty">{withPhraseBreaks(`例：${h.example}`)}</p>
                  <div className="goal-actions">
                    <button type="button" style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }} onClick={() => onEdit(h.key)}>
                      <Plus size="1em" aria-hidden="true" />{h.label}の目標を書く
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function GoalEditSheet({ horizonKey, initial, hasRoadmap, onClose, onSave }) {
  const h = horizonOf(horizonKey);
  const [text, setText] = useState(initial || '');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 250); return () => clearTimeout(t); }, []);
  const dirty = cleanGoalText(text) !== cleanGoalText(initial);
  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    await onSave(text);
    setSaving(false);
  };
  return (
    <BottomSheet
      title={`${h.label}の目標`}
      onClose={onClose}
      dismissLabel="キャンセル"
      footer={(
        <button type="button" style={dirty && !saving ? btnPrimary : btnPrimaryOff} disabled={!dirty || saving} onClick={save}>
          {saving ? '保存しています…' : '保存'}
        </button>
      )}
    >
      <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6 }}>
        {withPhraseBreaks(`${h.label}に、どうなっていたいですか。何を・どんな場面で、まで書くと、ロードマップが具体的になります。`)}
      </p>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={GOAL_MAX}
        rows={3}
        placeholder={h.example}
        aria-label={`${h.label}の目標`}
        style={{ ...uiInput, resize: 'none', lineHeight: 1.6 }}
        onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } }}
      />
      <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-3)', textAlign: 'right' }}>{[...text].length} / {GOAL_MAX}</p>
      {hasRoadmap && dirty && (
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6 }}>
          {withPhraseBreaks('ロードマップはそのまま残ります。新しい目標に合わせるときは、ロードマップの「つくり直す」から。')}
        </p>
      )}
      {initial && (
        <button type="button" style={{ ...btnLinkQuiet, marginTop: 'var(--space-2)' }} onClick={() => setText('')}>この目標を消す</button>
      )}
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// 「達成するには？」の深掘り
// ---------------------------------------------------------------------------
function InterviewView({ goal, goals, roadmaps, books, onDone, onCancel }) {
  const h = horizonOf(goal.key);
  const [qa, setQa] = useState([]);
  const [step, setStep] = useState(null); // { question, options, summary }
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState(null); // { message, notice }
  const [answer, setAnswer] = useState('');
  const [off, setOff] = useState(false);
  const busyRef = useRef(false);
  const answerRef = useRef(null);
  const summaryRef = useRef('');

  const build = useCallback(async (finalQa) => {
    setBuilding(true);
    setError(null);
    if (!(await ensureAiConsent('goal_roadmap'))) { setBuilding(false); onCancel(); return; }
    try {
      const { roadmap } = await generateGoalRoadmap({ goal, goals, roadmaps, qa: finalQa, summary: summaryRef.current, books });
      await saveRoadmap(goal.key, {
        goalText: goal.text,
        goalAt: goal.at,
        qa: finalQa,
        summary: summaryRef.current,
        roadmap,
        plan: roadmaps?.[goal.key]?.plan || null,
      });
      track('goal_roadmap_built', { horizon: goal.key, asks: finalQa.length });
      onDone();
    } catch (e) {
      setError({ message: e?.message || 'ロードマップを作れませんでした。', notice: !!e?.notice, stage: 'build' });
      setBuilding(false);
    }
  }, [goal, goals, roadmaps, books, onDone, onCancel]);

  const ask = useCallback(async (nextQa) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    const round = nextQa.length + 1;
    const res = round > GOAL_ASK_LIMIT ? { done: true, summary: summaryRef.current } : await runGoalInterview({ goal, goals, roadmaps, qa: nextQa, round });
    busyRef.current = false;
    setLoading(false);
    if (!res) { setError({ message: '問いを用意できませんでした。少し時間をおいてから、もう一度押してください。', stage: 'ask', qa: nextQa }); return; }
    if (res.stop) { setError({ message: res.stop, notice: true, stage: 'ask' }); return; }
    if (res.summary) summaryRef.current = res.summary;
    if (res.done) { setStep(null); build(nextQa); return; }
    setStep(res);
    setAnswer('');
    setOff(false);
    setTimeout(() => answerRef.current?.focus?.({ preventScroll: true }), 50);
  }, [goal, goals, roadmaps, build]);

  useEffect(() => { ask([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (text) => {
    const a = clampAnswer(text);
    if (!a || !step) return;
    const next = [...qa, { q: step.question, a: off ? `${a}（選択肢はどれも違う、と自分の言葉で答えた）` : a }];
    setQa(next);
    setStep(null);
    ask(next);
  };
  const finishNow = () => {
    if (busyRef.current) return;
    const next = answer.trim() && step ? [...qa, { q: step.question, a: clampAnswer(answer) }] : qa;
    setQa(next);
    setStep(null);
    build(next);
  };

  // 答えの欄は中身に合わせて伸ばす（候補をいくつも選ぶと 1 行に入らない・2026-11-15）。
  useEffect(() => {
    const el = answerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [answer, step]);

  const left = Math.max(0, GOAL_ASK_LIMIT - qa.length - 1);
  const chips = step ? interviewChips(step) : [];
  const starts = chips.filter((c) => c.kind === 'start');
  const labels = starts.map((c) => c.label);

  return (
    <>
      <header className="goal-head">
        <p className="goal-when"><strong>{h.label}</strong><span>{fmtGoalDeadline(goal.at, h.years)}</span></p>
        <p className="goal-text">{withPhraseBreaks(goal.text)}</p>
      </header>

      {error && (
        <ErrorMessage
          title={error.notice ? 'AI のトークンについて' : (error.stage === 'build' ? 'ロードマップを作れませんでした' : '問いを用意できませんでした')}
          description={error.message}
          actions={error.notice ? [{ label: '目標に戻る', onClick: onCancel }] : [
            { label: 'もう一度', variant: 'primary', onClick: () => (error.stage === 'build' ? build(qa) : ask(error.qa || qa)) },
            { label: '目標に戻る', onClick: onCancel },
          ]}
        />
      )}

      {!error && (loading || building) && <Building building={building} />}

      {!error && !loading && !building && step && (
        <div className="goal-q-card" role="group" aria-label="達成するには？の問い">
          <p className="goal-q" aria-live="polite">{gluedEnd(step.question)}</p>
          <div className="ai-answer-field" style={{ marginTop: 'var(--space-3)' }}>
            <textarea
              ref={answerRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={off ? OFF_PLACEHOLDER : '自分の言葉で答える'}
              aria-label={off ? OFF_PLACEHOLDER : '自分の言葉で答える'}
              rows={1}
              maxLength={400}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(answer); }
              }}
            />
            <button type="button" className="send-btn" onClick={() => submit(answer)} disabled={!answer.trim()} aria-label="答える" title="答える">
              <ChevronRight size={20} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
          {starts.length > 0 && (
            <div className="goal-chips" role="group" aria-label="答えの候補（いくつでも選べます）">
              {starts.map((c) => (
                <button key={c.label} type="button" className="goal-chip" aria-pressed={choiceSelected(answer, c.label)} onClick={() => setAnswer((t) => toggleChoice(t, c.label, labels))}>
                  {withPhraseBreaks(c.label)}
                </button>
              ))}
            </div>
          )}
          <div className="goal-chips" role="group" aria-label="うまく答えられないとき">
            <button type="button" className="goal-chip" aria-pressed={off} onClick={() => { setOff((v) => !v); answerRef.current?.focus?.(); }}>{OPT_OFF}</button>
            <button type="button" className="goal-chip" onClick={() => submit('（まだ言葉にできない）')}>{OPT_UNSURE}</button>
          </div>
          <p className="goal-q-progress">
            {left > 0 ? 'あと 1 つ聞いたら、ロードマップをつくります' : '次で、ロードマップをつくります'}
          </p>
          <button type="button" style={{ ...btnLinkQuiet, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={finishNow}>このくらいでつくる</button>
        </div>
      )}
    </>
  );
}

function clampAnswer(t) {
  return sanitizeForPrompt(String(t || '')).trim().slice(0, 400);
}

function Building({ building }) {
  return (
    <div className="goal-building" role="status" aria-live="polite">
      <p className="goal-building-note">{building ? 'ロードマップをつくっています。本棚の本から、読む順番も選んでいます…' : '問いを考えています…'}</p>
      {building ? (
        <ol className="goal-road" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <span className="goal-dot" />
              <SkeletonBlock width="40%" height="var(--text-meta)" />
              <div style={{ height: 'var(--space-2)' }} />
              <SkeletonBlock width="90%" height="var(--text-body)" />
              <div style={{ height: 'var(--space-2)' }} />
              <SkeletonBlock width="70%" height="var(--text-sub)" />
            </li>
          ))}
        </ol>
      ) : (
        <div className="goal-q-card" aria-hidden="true">
          <SkeletonBlock width="90%" height="var(--text-body)" />
          <div style={{ height: 'var(--space-2)' }} />
          <SkeletonBlock width="60%" height="var(--text-body)" />
          <div style={{ height: 'var(--space-4)' }} />
          <SkeletonBlock width="100%" height="var(--space-12)" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ロードマップ
// ---------------------------------------------------------------------------
function RoadmapView({ goal, record, books, onOpenBook, onAddActionText, onFindBooks, onPlan, onRebuild }) {
  const h = horizonOf(goal.key);
  const roadmap = useMemo(() => pruneRoadmapBooks(record.roadmap, books), [record.roadmap, books]);
  const specs = phaseSpecs(goal.key, record.goalAt || goal.at);
  const here = currentPhaseIndex(goal.key, record.goalAt || goal.at, appNow());
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const [added, setAdded] = useState(() => new Set());
  const planBooks = roadmap.phases.some((p) => p.books.some((b) => byId.get(b.bookId)?.status !== 'done'));
  const stale = record.goalText && cleanGoalText(record.goalText) !== cleanGoalText(goal.text);

  return (
    <>
      <header className="goal-head">
        <p className="goal-when"><strong>{h.label}</strong><span>{fmtGoalDeadline(goal.at, h.years)}</span></p>
        <p className="goal-text">{withPhraseBreaks(goal.text)}</p>
        {stale && (
          <p className="goal-needs-peek">{withPhraseBreaks('このロードマップは、前の目標の文で作りました。')}</p>
        )}
      </header>

      {record.summary && <p className="goal-summary">{withPhraseBreaks(record.summary)}</p>}

      {roadmap.needs.length > 0 && (
        <section className="goal-sec" style={{ marginTop: 0 }} aria-labelledby="rm-needs">
          <h3 id="rm-needs" className="goal-sec-title">必要なこと</h3>
          <ul className="rm-list">
            {roadmap.needs.map((n) => (
              <li key={n.name}>
                <p className="rm-need-name">{withPhraseBreaks(n.name)}</p>
                {n.why && <p className="rm-need-why">{n.why}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {roadmap.issues.length > 0 && (
        <section className="goal-sec" aria-labelledby="rm-issues">
          <h3 id="rm-issues" className="goal-sec-title">今の課題</h3>
          <ul className="rm-list">
            {roadmap.issues.map((t) => <li key={t}><p className="rm-issue">{t}</p></li>)}
          </ul>
        </section>
      )}

      <section className="goal-sec" aria-labelledby="rm-road">
        <h3 id="rm-road" className="goal-sec-title">道のり</h3>
        <ol className="goal-road">
          {roadmap.phases.map((p, i) => {
            const spec = specs[i] || { label: `${i + 1}`, range: '' };
            const isHere = i === here;
            return (
              <li key={spec.label} aria-current={isHere ? 'step' : undefined}>
                <span className={`goal-dot${isHere ? ' is-here' : i < here ? ' is-set' : ''}`} aria-hidden="true" />
                <p className="goal-when">
                  <strong>{spec.label}</strong>
                  <span>{spec.range}</span>
                  {isHere && <span className="rm-here">いまここ</span>}
                </p>
                {p.focus && <p className="rm-phase-focus">{withPhraseBreaks(p.focus)}</p>}
                {p.todos.length > 0 && (
                  <ul className="rm-todos">
                    {p.todos.map((t) => {
                      const done = added.has(t);
                      return (
                        <li key={t} className="rm-todo">
                          <span className="rm-todo-text">{withPhraseBreaks(t)}</span>
                          <button
                            type="button"
                            className="rm-icon-btn"
                            aria-pressed={done}
                            aria-label={done ? '行動に追加しました' : `「${t}」を行動に追加`}
                            title={done ? '行動に追加しました' : '行動に追加'}
                            onClick={async () => {
                              if (done) return;
                              const ok = await onAddActionText?.(t);
                              if (ok) setAdded((s) => new Set(s).add(t));
                            }}
                          >
                            {done ? <Check size={20} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {p.books.length > 0 && (
                  <div className="rm-books">
                    {p.books.map((rb) => {
                      const b = byId.get(rb.bookId);
                      if (!b) return null;
                      return (
                        <button key={rb.bookId} type="button" className="rm-book" onClick={() => onOpenBook?.(b)}>
                          <MiniCover book={b} width={36} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <p className="rm-book-title">{withPhraseBreaks(`『${b.title}』`)}</p>
                            {rb.why && <p className="rm-book-why">{rb.why}</p>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {roadmap.missing.length > 0 && (
        <section className="goal-sec" aria-labelledby="rm-missing">
          <h3 id="rm-missing" className="goal-sec-title">本棚に、まだ無いテーマ</h3>
          <ul className="rm-list">
            {roadmap.missing.map((m) => (
              <li key={m.theme} className="rm-missing">
                <div>
                  <p className="rm-need-name">{withPhraseBreaks(m.theme)}</p>
                  {m.why && <p className="rm-need-why">{m.why}</p>}
                </div>
                <button type="button" style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', flexShrink: 0 }} onClick={() => onFindBooks?.(`${goal.text}。そのために「${m.theme}」の本を探したい`)}>
                  <Search size="1em" aria-hidden="true" />本を探す
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="goal-sec">
        {planBooks ? (
          <button type="button" style={btnPrimary} onClick={onPlan}>読書計画をカレンダーにする</button>
        ) : (
          <p className="plan-summary" style={{ marginTop: 0 }}>{withPhraseBreaks('本棚に、この目標に合う本がまだありません。「本を探す」で見つけた本を入れると、読書計画をつくれます。')}</p>
        )}
        <button type="button" style={{ ...btnLinkQuiet, marginTop: 'var(--space-2)' }} onClick={onRebuild}>つくり直す（約 25 トークン）</button>
        <p className="rm-footnote">{withPhraseBreaks('AI があなたの目標と答えから作った道のりです。合わないところは、つくり直すか、目標を書き直してください。')}</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 読書計画カレンダー
// ---------------------------------------------------------------------------
function PlanView({ goal, record, books, sessions, onOpenBook, onAddReadingActions }) {
  const toast = useToast();
  const today = toLocalYmd(appNow());
  const roadmap = useMemo(() => pruneRoadmapBooks(record.roadmap, books), [record.roadmap, books]);
  const specs = useMemo(() => phaseSpecs(goal.key, record.goalAt || goal.at), [goal.key, record.goalAt, goal.at]);
  const [minutes, setMinutes] = useState(record.plan?.minutesPerDay || PLAN_DEFAULT_MINUTES);
  const speed = useMemo(() => readingSpeedFactor(books, sessions), [books, sessions]);
  // 区切りの本は、その区切りが始まる日から（ロードマップと同じ時期に読む）。
  const phaseStarts = useMemo(() => specs.map((s) => `${s.startYm}-01`), [specs]);
  const items = useMemo(() => planItemsFromRoadmap(roadmap, books, { speed, sessions, phaseStarts }), [roadmap, books, speed, sessions, phaseStarts]);
  const year = Number(today.slice(0, 4));
  const schedule = useMemo(() => scheduleBooks(items, { minutesPerDay: minutes, start: today }), [items, minutes, today]);
  const months = useMemo(() => planMonths(schedule, today), [schedule, today]);
  const [mi, setMi] = useState(0);
  useEffect(() => { if (mi > months.length - 1) setMi(Math.max(0, months.length - 1)); }, [months.length, mi]);
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const nowItem = bookOnDay(schedule, today);
  const indexOf = useMemo(() => new Map(schedule.map((s, i) => [s.bookId, i])), [schedule]);
  const [adding, setAdding] = useState(false);
  const addedAt = record.plan?.actionsAddedAt || null;

  const savePlan = useCallback((patch) => {
    saveRoadmap(goal.key, { ...record, plan: { ...(record.plan || {}), ...patch } });
  }, [goal.key, record]);

  const pickMinutes = (m) => {
    setMinutes(m);
    savePlan({ minutesPerDay: m });
    track('reading_plan_minutes', { minutes: m });
  };

  const last = schedule[schedule.length - 1];
  const soon = schedule.filter((s) => s.start <= addDaysYmd(today, 90));

  const addActions = async () => {
    if (adding || !soon.length) return;
    setAdding(true);
    const n = await onAddReadingActions?.(soon.map((s) => ({ bookId: s.bookId, text: `『${byId.get(s.bookId)?.title || ''}』を読み始める`, deadline: s.start })));
    setAdding(false);
    if (n > 0) {
      savePlan({ minutesPerDay: minutes, actionsAddedAt: new Date().toISOString() });
      toast.success?.(`読み始める日を、行動に ${n} 件入れました`);
      track('reading_plan_actions', { count: n });
    }
  };

  if (!schedule.length) {
    return <ErrorMessage title="読む本がありません" description="ロードマップの本は、もう読み終えています。ロードマップの「本を探す」から次の本を入れてください。" />;
  }
  const m = months[mi] || months[0];
  // 今日より前の週は出さない（予定は今日から・空の週で場所を取らない）。
  const weeks = m ? monthWeeks(m.year, m.month).filter((w) => w[6].date >= today) : [];

  return (
    <>
      <header className="goal-head" style={{ marginBottom: 'var(--space-4)' }}>
        <p className="goal-when"><strong>{horizonOf(goal.key).label}</strong><span>{fmtGoalDeadline(goal.at, horizonOf(goal.key).years)}</span></p>
        <p className="goal-text">{withPhraseBreaks(goal.text)}</p>
      </header>

      <section aria-labelledby="plan-minutes">
        <h3 id="plan-minutes" className="goal-sec-title">1 日に読む時間</h3>
        <div className="plan-minutes" role="radiogroup" aria-label="1 日に読む時間">
          {PLAN_MINUTES.map((v) => (
            <Chip key={v} size="select" stretch active={minutes === v} role="radio" aria-checked={minutes === v} onClick={() => pickMinutes(v)}>{v} 分</Chip>
          ))}
        </div>
        <p className="plan-summary">
          {withPhraseBreaks(`${schedule.length} 冊を、${fmtMd(schedule[0].start, year)} から ${fmtMd(last.end, year)} まで。区切りの本は、その区切りが始まってから読みます。`)}
          {withPhraseBreaks(speed !== 1 ? 'これまでの読書の時間から、あなたの速さで計算しています。' : '1 ページ 2 分で計算しています。集中モードで読むと、あなたの速さに合っていきます。')}
        </p>
      </section>

      <section className="plan-cal" aria-label="読書計画のカレンダー">
        <div className="plan-cal-head">
          <h3 className="plan-cal-month" aria-live="polite">{m ? `${m.year} 年 ${m.month + 1} 月` : ''}</h3>
          <div className="plan-cal-nav">
            <button type="button" className="rm-icon-btn" onClick={() => setMi((i) => Math.max(0, i - 1))} disabled={mi === 0} aria-label="前の月"><ChevronLeft size={20} aria-hidden="true" /></button>
            <button type="button" className="rm-icon-btn" onClick={() => setMi((i) => Math.min(months.length - 1, i + 1))} disabled={mi >= months.length - 1} aria-label="次の月"><ChevronRight size={20} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="plan-dow" aria-hidden="true">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
        {weeks.map((week) => {
          const bands = weekBands(week, schedule);
          return (
            <div key={week[0].date} className="plan-week">
              <div className="plan-days">
                {week.map((d) => (
                  <div key={d.date} className={`plan-day${d.inMonth ? '' : ' is-out'}${d.date === today ? ' is-today' : ''}`}>
                    <span aria-label={d.date === today ? `今日 ${d.day} 日` : undefined}>{d.day}</span>
                  </div>
                ))}
              </div>
              <div className="plan-lane">
                {bands.map((b) => {
                  const book = byId.get(b.bookId);
                  const idx = indexOf.get(b.bookId) || 0;
                  const isNow = nowItem?.bookId === b.bookId;
                  const cls = `plan-band${isNow ? ' is-now' : idx % 2 ? ' is-alt' : ''}${b.head ? ' is-head' : ''}${b.tail ? ' is-tail' : ''}`;
                  return (
                    <button
                      key={b.bookId}
                      type="button"
                      className={cls}
                      onClick={() => book && onOpenBook?.(book)}
                      aria-label={`『${book?.title || ''}』`}
                      style={{
                        left: `calc(${b.col} / 7 * 100% + ${b.head ? 'var(--space-1)' : '0px'})`,
                        width: `calc(${b.span} / 7 * 100% - ${b.head ? 'var(--space-1)' : '0px'} - ${b.tail ? 'var(--space-1)' : '0px'})`,
                        border: 'none',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      {(b.head || b.col === 0) && b.span >= 2 && <span>{book?.title || ''}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <section className="goal-sec" aria-labelledby="plan-order">
        <h3 id="plan-order" className="goal-sec-title">読む順番</h3>
        <ol className="plan-order" id="plan-order-list">
          {schedule.map((s, i) => {
            const b = byId.get(s.bookId);
            if (!b) return null;
            const isNow = nowItem?.bookId === s.bookId;
            const showPhase = i === 0 || schedule[i - 1].phase !== s.phase;
            return (
              <li key={s.bookId}>
                {showPhase && specs[s.phase] && <p className="plan-phase-label">{specs[s.phase].label}（{specs[s.phase].range}）</p>}
                <button type="button" className="plan-row" onClick={() => onOpenBook?.(b)}>
                  <MiniCover book={b} width={40} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <p className="plan-row-title">{withPhraseBreaks(`『${b.title}』`)}</p>
                    <p className="plan-row-meta">
                      {isNow && <span className="plan-row-now">いま読む本 · </span>}
                      {`${fmtRange(s.start, s.end, year)} · ${fmtSpan(s.days)} · 合わせて ${fmtHoursMin(s.minutes)}`}
                    </p>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="goal-sec">
        <button type="button" style={adding || !soon.length ? btnPrimaryOff : btnPrimary} disabled={adding || !soon.length} onClick={addActions}>
          {adding ? '入れています…' : `読み始める日を行動に入れる（${soon.length} 件）`}
        </button>
        <p className="plan-summary">
          {withPhraseBreaks(addedAt
            ? `前に入れたのは ${fmtMd(toLocalYmd(new Date(addedAt)))} です。時間を変えたら、もう一度入れると新しい日付で足されます。`
            : 'これから 3 か月のうちに読み始める本を、行動リストに「『書名』を読み始める」として入れます。予定が過ぎても、時間を選び直せば今日から引き直します。')}
        </p>
      </div>
    </>
  );
}

function addDaysYmd(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return toLocalYmd(d);
}
