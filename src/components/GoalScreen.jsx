// 🧭 目標とロードマップ・読書計画カレンダー（2026-11-15 オーナー「1 年後・3 年後・5 年後の目標を、達成するには？で深掘りして
//   ロードマップに。課題ややるべきことが見える」「本棚からいつまでにどの本をどの順番に読むのかをカレンダーに・読むスピードを調整」）。
//
// 画面（振り返り › 行動 のいちばん上の 1 行から開く・押し込まれた全画面）:
//   goals    … 道（いま → 1 年後 → 3 年後 → 5 年後）。目標を書く・書き直す。3 つとも書くと「ロードマップをつくる」
//             （2026-11-16 オーナー「すべて入れたら AI を動かす」＝目標ごとではなく、3 つをつなぐ 1 本だけ）
//   interview … 「達成するには？」の深掘り（3 つの目標について AI が 1 つずつ聞く・2 つまで・答えの候補はいくつでも選べる）
//   roadmap  … 必要なこと・今の課題・道のり（区切りごとにやること・読む本）・本棚に無いテーマ
//   plan     … 読書計画カレンダー（1 日に読む時間を選ぶと、今日から日付を割り振る・遅れは出さない）
// 言葉は GLOSSARY（目標・行動・積読・トークン）。%・連続日数・「あと N 冊」は出さない。
// 見た目は goals.css（トークンだけ）。

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Search, X } from 'lucide-react';
import './goals.css';
import { AdvisorNavBar } from './AdvisorHistory';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { MiniCover } from './BookCards';
import SegThumb from './SegThumb';
import { withPhraseBreaks } from './TightBubble';
import { useToast } from './Toast';
import { btnPrimary, btnPrimaryOff, btnGhost, btnLink, btnLinkQuiet, input as uiInput } from '../styles/ui';
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack';
import { useReadingSessions } from '../hooks/useReadingSessions';
import { useGoals } from '../hooks/useGoals';
import { ensureAiConsent } from '../lib/aiConsent';
import { runGoalInterview, generateGoalRoadmap } from '../lib/ai';
import { interviewChips, toggleChoice, choiceSelected, OPT_OFF, OPT_UNSURE, OFF_PLACEHOLDER } from '../lib/advisorInterview';
import { GOAL_HORIZONS, GOAL_MAX, ALL_GOALS_KEY, horizonOf, fmtGoalDeadline, saveGoal, suggestHorizon, cleanGoalText, allGoalsSet, combinedGoal } from '../lib/goals';
import { GOAL_ASK_LIMIT, ROADMAP_TOKENS_LABEL, phaseSpecs, currentPhaseIndex, saveRoadmap, pruneRoadmapBooks } from '../lib/goalRoadmap';
import {
  PLAN_MINUTES, PLAN_DEFAULT_MINUTES, readingSpeedFactor, planItemsFromRoadmap, planItemsFromOrder, scheduleBooks, monthWeeks, weekBands,
  planMonths, bookOnDay, fmtSpan, fmtMd, fmtRange, fmtHoursMin, parseYmd,
} from '../lib/readingPlan';
import { appNow } from '../lib/appNow';
import { toLocalYmd } from '../lib/dates';
import { sanitizeForPrompt } from '../lib/ai';
import { track } from '../lib/analytics';

const DOW = ['月', '火', '水', '木', '金', '土', '日'];
const NAV_TITLE = { goals: '目標', interview: '達成するには？', roadmap: 'ロードマップ', plan: '読書計画' };

// どれか 1 つを選ぶ（サブタブと同じ溝と面＝SegThumb・2026-11-15 ui-critic「単一選択に --accent-soft の面を使わない」）。
export function SegChoice({ label, options, value, onChange }) {
  return (
    <div className="sub-tabs__seg goal-seg" role="radiogroup" aria-label={label}>
      <SegThumb activeKey={String(value)} />
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={`sub-tab${value === v ? ' active' : ''}`} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

// 問いの終わりの「？」を前の 2 文字とつなぐ（行頭に「？」だけを残さない）。
function gluedEnd(text) {
  const t = String(text || '');
  const m = t.match(/^([\s\S]*?)([^\s]{2}[？?。！!]+)$/u);
  if (!m) return withPhraseBreaks(t);
  return <>{withPhraseBreaks(m[1])}<span style={{ whiteSpace: 'nowrap' }}>{m[2]}</span></>;
}

export default function GoalScreen({ start = null, books = [], onClose, onOpenBook, onAddActionText, onAddReadingActions, onFindBooks, onAddRecBook }) {
  const { goals, roadmaps, purpose, loaded } = useGoals();
  const toast = useToast();
  const { rows: sessions } = useReadingSessions();
  const [view, setView] = useState(start?.view || 'goals');
  const [horizon, setHorizon] = useState(start?.horizon || null);
  const [editing, setEditing] = useState(null); // { key, text }
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef(null);

  // ロードマップは 3 つの目標をつなぐ 1 本だけ（'all'）。
  const goal = horizon === ALL_GOALS_KEY ? combinedGoal(goals) : null;
  const record = goal ? roadmaps[ALL_GOALS_KEY] : null;

  const back = useCallback(() => {
    if (view === 'plan') { setView('roadmap'); return; }
    if (view === 'roadmap' || view === 'interview') { setView('goals'); return; }
    onClose?.();
  }, [view, onClose]);
  useEdgeSwipeBack({ onBack: back, enabled: !editing });
  useEffect(() => { scrollRef.current?.scrollTo?.({ top: 0 }); setScrolled(false); }, [view, horizon]);

  const open = (key, v) => { setHorizon(key); setView(v); };
  // 本を開いて戻ってきたら、同じ目標の同じ画面へ（App が覚えておく）。
  const openBook = (b) => onOpenBook?.(b, { view, horizon });

  // 3 つとも書いたときだけ（ロードマップは 1 本＝無料プランもこの 1 本を作れる・トークンの量で守る）。
  const startInterview = async () => {
    if (!allGoalsSet(goals)) return;
    if (!(await ensureAiConsent('goal_interview'))) return;
    track('goal_interview_start', { horizon: ALL_GOALS_KEY });
    open(ALL_GOALS_KEY, 'interview');
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
                if (r) toast.success?.(`${horizonOf(key).label}の目標に入れました。`);
              }}
              onInterview={startInterview}
              onRoadmap={() => open(ALL_GOALS_KEY, 'roadmap')}
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
              onOpenBook={openBook}
              onAddActionText={onAddActionText}
              onFindBooks={onFindBooks}
              onPlan={() => setView('plan')}
              onRebuild={startInterview}
              onEditGoals={() => setView('goals')}
              onAddRec={onAddRecBook ? async (rb) => {
                const saved = await onAddRecBook({ title: rb.title, author: rb.author, isbn: rb.isbn || '', cover: rb.cover || '', why: rb.why || '' }, {
                  sourceQuery: '', investPurpose: cleanGoalText(goals.y1?.text || ''), currentChallenge: '', hypothesis: '', bookReason: rb.why || '',
                });
                if (saved?.id) track('goal_rec_added', {});
              } : null}
              onSaveRoadmap={async (next) => {
                await saveRoadmap(ALL_GOALS_KEY, { ...record, roadmap: next, editedAt: new Date().toISOString() });
                toast.success?.('ロードマップを直しました。');
                track('goal_roadmap_edit', {});
              }}
              onUndoUpdate={async () => {
                await saveRoadmap(ALL_GOALS_KEY, { ...record, roadmap: record.prevRoadmap, prevRoadmap: null, updates: (record.updates || []).slice(1) });
                toast.show?.('ロードマップを、見直す前に戻しました。');
              }}
            />
          )}
          {view === 'roadmap' && goal && !record?.roadmap && (
            <ErrorMessage title="ロードマップがまだありません" description="「達成するには？」に答えると、ロードマップができます。" actions={[{ label: 'ロードマップをつくる', variant: 'primary', onClick: startInterview }]} />
          )}
          {view === 'plan' && goal && record?.roadmap && (
            <PlanView
              goal={goal}
              record={record}
              books={books}
              sessions={sessions}
              onFindBooks={onFindBooks}
              onOpenBook={openBook}
              onAddReadingActions={onAddReadingActions}
            />
          )}
        </div>
      </div>
      {editing && (
        <GoalEditSheet
          key={editing.key}
          horizonKey={editing.key}
          nextLabel={nextEmptyAfter(goals, editing.key)?.label || null}
          initial={editing.text}
          hasRoadmap={!!roadmaps[ALL_GOALS_KEY]?.roadmap}
          onClose={() => setEditing(null)}
          onSave={async (text) => {
            const key = editing.key;
            const r = await saveGoal(key, text);
            if (!r) { setEditing(null); toast.error?.('目標を保存できませんでした。通信状況を確認して、もう一度押してください。'); return; }
            // まだ書いていない次の目標があれば、そのままその欄へ（はじめての人が 3 回開き直さなくていい・2026-11-16）。
            const next = cleanGoalText(text) ? nextEmptyAfter(r.goals, key) : null;
            setEditing(next ? { key: next.key, text: '' } : null);
            if (!next && allGoalsSet(r.goals) && !roadmaps[ALL_GOALS_KEY]?.roadmap) {
              setTimeout(() => { const el = scrollRef.current; if (el) el.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' }); }, 350);
            }
            track('goal_saved', { horizon: key, cleared: !cleanGoalText(text) });
            const rec = roadmaps[ALL_GOALS_KEY];
            if (cleanGoalText(text) && rec?.roadmap && cleanGoalText(text) !== cleanGoalText(rec.goals?.[key]?.text || '')) {
              toast.show?.('目標を書き直しました。ロードマップは「つくり直す」で新しい目標に合わせられます。');
            } else if (!rec?.roadmap && allGoalsSet(r.goals)) {
              toast.success?.('3 つの目標がそろいました。下の「ロードマップをつくる」から始められます。');
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
  const rec = roadmaps[ALL_GOALS_KEY];
  const anyRoadmap = !!rec?.roadmap;
  const allSet = allGoalsSet(goals);
  const missing = GOAL_HORIZONS.filter((h) => !goals[h.key]?.text).map((h) => h.label);
  const needs = (rec?.roadmap?.needs || []).map((n) => n.name);
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
      {/* 説明は、まだロードマップが 1 つも無いあいだだけ（はじめて開いた人に・DESIGN §0-6 補足文を常に置かない）。 */}
      {!anyRoadmap && <p className="goal-lead">{withPhraseBreaks('1 年後・3 年後・5 年後の目標を書くと、「達成するには？」を一緒に考えて、3 つをつなぐやることと読む本の順番にします。')}</p>}
      {carryText && (
        <section className="goal-box" aria-label="はじめに書いた目標">
          <p className="goal-sec-title" style={{ margin: 0 }}>はじめに書いた目標</p>
          <p className="goal-quote">{withPhraseBreaks(carryText)}</p>
          <SegChoice label="入れる目標" options={GOAL_HORIZONS.map((h) => [h.key, h.label])} value={carryKey} onChange={setCarryKey} />
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
          return (
            <li key={h.key}>
              <span className={`goal-dot${g?.text ? (anyRoadmap ? ' is-here' : ' is-set') : ''}`} aria-hidden="true" />
              <p className="goal-when">
                <strong>{h.label}</strong>
                {g?.text && <span>{fmtGoalDeadline(g.at, h.years)}</span>}
              </p>
              {g?.text ? (
                <>
                  <p className="goal-text">{withPhraseBreaks(g.text)}</p>
                  <div className="goal-actions">
                    <button type="button" style={{ ...btnLinkQuiet, marginLeft: 'calc(-1 * var(--space-1))' }} onClick={() => onEdit(h.key)}>書き直す</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="goal-empty">{withPhraseBreaks(`例：${h.example}`)}</p>
                  <div className="goal-actions">
                    <button type="button" style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', paddingLeft: 0 }} onClick={() => onEdit(h.key)}>
                      <Plus size="1em" aria-hidden="true" />{h.label}の目標を書く
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>

      {/* 3 つとも書いたら、つなぐロードマップを 1 本（2026-11-16 オーナー「すべて入れたら AI を動かす」）。 */}
      <section className="goal-cta" aria-label="ロードマップ">
        {anyRoadmap ? (
          <>
            {needs.length > 0 && <p className="goal-peek" style={{ marginTop: 0 }}>{withPhraseBreaks(`必要なこと：${needs.join('・')}`)}</p>}
            <button type="button" style={btnPrimary} onClick={onRoadmap}>ロードマップを見る</button>
          </>
        ) : allSet ? (
          <>
            <button type="button" style={btnPrimary} onClick={onInterview}>ロードマップをつくる</button>
            <p className="plan-summary">{withPhraseBreaks(`「達成するには？」を 2 つまで聞いてから、3 つの目標をつなぐ道のりと読む本の順番をつくります（${ROADMAP_TOKENS_LABEL}）。`)}</p>
          </>
        ) : (
          <>
            <button type="button" style={btnPrimaryOff} disabled aria-describedby="goal-cta-note">ロードマップをつくる</button>
            <p id="goal-cta-note" className="plan-summary">{withPhraseBreaks(`3 つの目標を書くと、つくれます。まだ書いていない目標：${missing.join('・')}`)}</p>
          </>
        )}
      </section>
    </>
  );
}

// まだ書いていない、次の目標（1 年後 → 3 年後 → 5 年後の順・いまの欄より後ろ → 前）。
function nextEmptyAfter(goals, key) {
  const i = GOAL_HORIZONS.findIndex((h) => h.key === key);
  const order = [...GOAL_HORIZONS.slice(i + 1), ...GOAL_HORIZONS.slice(0, i)];
  return order.find((h) => !goals?.[h.key]?.text) || null;
}

function GoalEditSheet({ horizonKey, initial, hasRoadmap, nextLabel, onClose, onSave }) {
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
          {saving ? '保存中…' : nextLabel && !initial ? `保存して ${nextLabel}へ` : '保存'}
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
// 3 つの目標の見出し（深掘り・ロードマップ・読書計画の上）。compact は 1 行ずつ小さく。
function GoalTrio({ goals, compact = false }) {
  return (
    <ul className={`goal-trio${compact ? ' is-compact' : ''}`} aria-label="3 つの目標">
      {GOAL_HORIZONS.filter((h) => goals?.[h.key]?.text).map((h) => (
        <li key={h.key}>
          <p className="goal-when"><strong>{h.label}</strong><span>{fmtGoalDeadline(goals[h.key].at, h.years)}</span></p>
          <p className="goal-text">{withPhraseBreaks(goals[h.key].text)}</p>
        </li>
      ))}
    </ul>
  );
}

function InterviewView({ goal, goals, roadmaps, books, onDone, onCancel }) {
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
      const prev = roadmaps?.[ALL_GOALS_KEY];
      const { roadmap } = await generateGoalRoadmap({ goals, at: goal.at, qa: finalQa, summary: summaryRef.current, books, minutesPerDay: prev?.plan?.minutesPerDay });
      await saveRoadmap(ALL_GOALS_KEY, {
        goalText: cleanGoalText(goals.y1?.text || ''),
        goalAt: goal.at,
        goals: { y1: goals.y1, y3: goals.y3, y5: goals.y5 },
        qa: finalQa,
        summary: summaryRef.current,
        roadmap,
        plan: prev?.plan || null,
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
    const res = round > GOAL_ASK_LIMIT ? { done: true, summary: summaryRef.current } : await runGoalInterview({ goals, qa: nextQa, round });
    busyRef.current = false;
    setLoading(false);
    if (!res) { setError({ message: 'AI からの返事が届きませんでした。つながりを確かめて「もう一度」を押してください。', stage: 'ask', qa: nextQa }); return; }
    if (res.stop) { setError({ message: res.stop, notice: true, stage: 'ask' }); return; }
    if (res.summary) summaryRef.current = res.summary;
    if (res.done) { setStep(null); build(nextQa); return; }
    setStep(res);
    setAnswer('');
    setOff(false);
    setTimeout(() => answerRef.current?.focus?.({ preventScroll: true }), 50);
  }, [goals, build]);

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
        <GoalTrio goals={goals} compact />
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
function RoadmapView({ goal, record, books, onOpenBook, onAddActionText, onFindBooks, onPlan, onRebuild, onUndoUpdate, onEditGoals, onSaveRoadmap, onAddRec }) {
  const [addingRec, setAddingRec] = useState(null);
  const addRec = async (rb) => {
    if (addingRec) return;
    setAddingRec(rb.title);
    try { await onAddRec?.(rb); } finally { setAddingRec(null); }
  };
  const latest = record.updates?.[0] || null;
  // 自分の手で直す（2026-11-16 オーナー「目標や課題は定期的に変わるので、常に修正できるように」・AI もトークンも使わない）。
  const [editing, setEditing] = useState(null); // { kind: 'needs' | 'issues' | 'phase', index }
  const roadmap = useMemo(() => pruneRoadmapBooks(record.roadmap, books), [record.roadmap, books]);
  const specs = phaseSpecs(goal.key, record.goalAt || goal.at);
  const here = currentPhaseIndex(goal.key, record.goalAt || goal.at, appNow());
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const planBooks = roadmap.phases.some((p) => p.books.some((b) => byId.get(b.bookId)?.status !== 'done'));
  // 本棚に読んでいない本があれば、ロードマップに本が無くても読書計画は自分で選んでつくれる（2026-11-16 オーナー「本棚の本がほぼない状態だとどうなる？」）。
  const hasUnread = books.some((b) => b.status !== 'done');
  const recsNow = (roadmap.phases[here]?.books || []).filter((b) => !b.bookId).length;
  // この 3 か月に読む本を AI 選書で探す下書き（送らない）。
  const findDraft = `${goal.goals?.y1?.text || ''}。いまは「${roadmap.phases[here]?.focus || ''}」に取り組みたいので、この 3 か月に読む本を探したい`.replace(/^。/, '');
  // 作ったときの目標の文と、いまの文が違えば（書き直した）。
  const stale = GOAL_HORIZONS.some((h) => record.goals?.[h.key]?.text && cleanGoalText(record.goals[h.key].text) !== cleanGoalText(goal.goals?.[h.key]?.text || ''));

  return (
    <>
      <header className="goal-head">
        <GoalTrio goals={goal.goals} compact />
        {onEditGoals && (
          <button type="button" style={{ ...btnLink, marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={onEditGoals}>目標を書き直す</button>
        )}
        {stale && (
          <p className="goal-peek">{withPhraseBreaks('このロードマップは、前の目標の文で作りました。新しい目標に合わせるときは、下の「つくり直す」から。')}</p>
        )}
      </header>

      {record.summary && <p className="goal-summary">{withPhraseBreaks(record.summary)}</p>}

      {/* いまの 3 か月（はじめての人が最初の画面で「次に何をするか」が分かるように・2026-11-16）。 */}
      <section className="goal-box rm-now" aria-labelledby="rm-now">
        <p id="rm-now" className="goal-sec-title" style={{ margin: 0 }}>{`いまの 3 か月 · ${specs[here]?.label || ''}`}</p>
        {roadmap.phases[here]?.focus && <p className="rm-phase-focus" style={{ marginTop: 'var(--space-1)' }}>{withPhraseBreaks(roadmap.phases[here].focus)}</p>}
        {planBooks ? (
          <button type="button" style={{ ...btnPrimary, marginTop: 'var(--space-4)' }} onClick={onPlan}>読書計画をカレンダーにする</button>
        ) : (
          <>
            {recsNow > 0 ? (
              <p className="plan-summary">{withPhraseBreaks(`この 3 か月に読む本を ${recsNow} 冊すすめています。下の「本棚に入れる」で入れると、読書計画のカレンダーになります。`)}</p>
            ) : (
              <>
                <p className="plan-summary">{withPhraseBreaks('この 3 か月に読む本は、まだ決まっていません。AI 選書で探しましょう。')}</p>
                <button type="button" style={{ ...btnPrimary, marginTop: 'var(--space-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }} onClick={() => onFindBooks?.(findDraft)}>
                  <Search size="1em" aria-hidden="true" />この 3 か月に読む本を探す
                </button>
              </>
            )}
            {hasUnread && (
              <button type="button" style={{ ...btnLink, marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={onPlan}>本棚の本から選んで読書計画にする</button>
            )}
          </>
        )}
      </section>

      {/* 🔁 相談・AI 選書から見直したとき（いちばん新しい 1 回・見直す前に戻せる）。 */}
      {latest && (
        <section className="goal-sec" style={{ marginTop: 0, marginBottom: 'var(--space-8)' }} aria-labelledby="rm-update">
          <h3 id="rm-update" className="goal-sec-title">最近の見直し</h3>
          <div className="rm-list" style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <span className="rm-update-when">{`${fmtMd(toLocalYmd(new Date(latest.at)))} · ${latest.source === 'advisor' ? 'AI 選書' : '相談'}から`}</span>
            <p className="rm-update-line">{withPhraseBreaks(`新しく見えた課題：${(latest.newIssues || []).join(' / ')}`)}</p>
            {latest.note && <p className="rm-need-why">{withPhraseBreaks(latest.note)}</p>}
            {record.prevRoadmap && onUndoUpdate && (
              <button type="button" style={{ ...btnLinkQuiet, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={onUndoUpdate}>見直す前に戻す</button>
            )}
          </div>
        </section>
      )}

      <section className="goal-sec" style={{ marginTop: 0 }} aria-labelledby="rm-needs">
        <div className="rm-sec-head">
          <h3 id="rm-needs" className="goal-sec-title">必要なこと</h3>
          {onSaveRoadmap && <button type="button" className="rm-edit-link" aria-label="必要なことを直す" onClick={() => setEditing({ kind: 'needs' })}>直す</button>}
        </div>
        {roadmap.needs.length > 0 ? (
          <ul className="rm-list">
            {roadmap.needs.map((n) => (
              <li key={n.name}>
                <p className="rm-need-name">{withPhraseBreaks(n.name)}</p>
                {n.why && <p className="rm-need-why">{n.why}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="plan-summary" style={{ marginTop: 0 }}>まだありません。「直す」から足せます。</p>}
      </section>

      <section className="goal-sec" aria-labelledby="rm-issues">
        <div className="rm-sec-head">
          <h3 id="rm-issues" className="goal-sec-title">今の課題</h3>
          {onSaveRoadmap && <button type="button" className="rm-edit-link" aria-label="今の課題を直す" onClick={() => setEditing({ kind: 'issues' })}>直す</button>}
        </div>
        {roadmap.issues.length > 0 ? (
          <ul className="rm-list">
            {roadmap.issues.map((t) => <li key={t}><p className="rm-issue">{withPhraseBreaks(t)}</p></li>)}
          </ul>
        ) : <p className="plan-summary" style={{ marginTop: 0 }}>まだありません。「直す」から足せます。</p>}
      </section>

      <section className="goal-sec" aria-labelledby="rm-road">
        <h3 id="rm-road" className="goal-sec-title">道のり</h3>
        <p className="plan-summary" style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>{withPhraseBreaks('本は、この先 3 か月に読む分をすすめています。行動は、読んでメモした言葉から、相談しながら決めます。')}</p>
        <ol className="goal-road">
          {roadmap.phases.map((p, i) => {
            const spec = specs[i] || { label: `${i + 1}`, range: '' };
            const isHere = i === here;
            // その目標へ向かう最後の区切りの後ろに、目標そのもの（1 年後 → 3 年後 → 5 年後）。
            const mile = spec.goal && specs[i + 1]?.goal !== spec.goal ? horizonOf(spec.goal) : null;
            const mileGoal = mile ? goal.goals?.[mile.key] : null;
            return (
              <Fragment key={spec.label}>
              <li aria-current={isHere ? 'step' : undefined}>
                <span className={`goal-dot${isHere ? ' is-here' : i < here ? ' is-set' : ''}`} aria-hidden="true" />
                <p className="goal-when">
                  <strong>{spec.label}</strong>
                  <span>{spec.range}</span>
                  {isHere && <span className="rm-here">いまここ</span>}
                  {onSaveRoadmap && <button type="button" className="rm-edit-link rm-edit-inline" aria-label={`${spec.label}の取り組むことを直す`} onClick={() => setEditing({ kind: 'phase', index: i })}>直す</button>}
                </p>
                {p.focus && <p className="rm-phase-focus">{withPhraseBreaks(p.focus)}</p>}
                {/* やること（AI の一般論）は 2026-11-16 にやめた（オーナー「行動は本を読まないと見つけられない・一般的な考えで見つけるのはこのアプリを使う意味がない」）。
                    行動は、読んでメモして相談しながら決める（相談の「明日からできる一歩」→ 行動）。 */}
                {p.books.length > 0 && (
                  <div className="rm-books">
                    {p.books.map((rb) => {
                      // すすめた本（まだ本棚に無い）: 表紙・書名・著者・なぜ＋「本棚に入れる」（読みたいに入る・入れると読書計画に入る）。
                      if (!rb.bookId) {
                        const busy = addingRec === rb.title;
                        return (
                          <div key={`t:${rb.title}`} className="rm-book rm-book-rec">
                            <MiniCover book={{ id: `rec:${rb.title}`, title: rb.title, cover: rb.cover || '' }} width={36} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span className="rm-book-title">{withPhraseBreaks(`『${rb.title}』`)}</span>
                              {rb.author && <span className="rm-book-author">{rb.author}</span>}
                              {rb.why && <span className="rm-book-why">{rb.why}</span>}
                              {onAddRec && (
                                <button type="button" className="rm-add-btn rm-add-rec" disabled={busy} onClick={() => addRec(rb)}>
                                  <Plus size="1em" aria-hidden="true" />{busy ? '入れています…' : '本棚に入れる'}
                                </button>
                              )}
                            </span>
                          </div>
                        );
                      }
                      const b = byId.get(rb.bookId);
                      if (!b) return null;
                      return (
                        <button key={rb.bookId} type="button" className="rm-book" onClick={() => onOpenBook?.(b)}>
                          <MiniCover book={b} width={36} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span className="rm-book-title">{withPhraseBreaks(`『${b.title}』`)}</span>
                            {rb.why && <span className="rm-book-why">{rb.why}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
              {mileGoal && (
                <li className="rm-mile">
                  <span className="goal-dot is-goal" aria-hidden="true" />
                  <p className="goal-when"><strong>{`${mile.label}の目標`}</strong><span>{fmtGoalDeadline(mileGoal.at, mile.years)}</span></p>
                  <p className="rm-mile-text">{withPhraseBreaks(mileGoal.text)}</p>
                </li>
              )}
              </Fragment>
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
                <button type="button" style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={() => onFindBooks?.(`${goal.goals?.y1?.text || goal.text}。そのために「${m.theme}」の本を探したい`)}>
                  <Search size="1em" aria-hidden="true" />本を探す
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="goal-sec">
        {(planBooks || hasUnread) && (
          <button type="button" style={btnGhost} onClick={onPlan}>読書計画をカレンダーにする</button>
        )}
        <button type="button" style={{ ...btnLinkQuiet, marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={onRebuild}>{`つくり直す（${ROADMAP_TOKENS_LABEL}）`}</button>
        <p className="rm-footnote">{withPhraseBreaks('AI があなたの目標と答えから作った道のりです。合わないところは「直す」で自分の言葉に直せます（トークンは使いません）。')}</p>
      </div>
      {editing && (
        <RoadmapEditSheet
          editing={editing}
          roadmap={record.roadmap}
          specs={specs}
          onClose={() => setEditing(null)}
          onSave={async (next) => { setEditing(null); await onSaveRoadmap?.(next); }}
        />
      )}
    </>
  );
}

// 中身に合わせて伸びる欄（ロードマップを直すシート）。
function GrowTextarea(props) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

// ロードマップを自分の手で直す（必要なこと・今の課題・区切りの取り組むことと やること）。AI を使わない。
const EDIT_LIMITS = {
  needs: { title: '必要なこと', max: 6, len: 24, placeholder: '例：会議の進め方' },
  issues: { title: '今の課題', max: 3, len: 110, placeholder: '例：会議で結論が出ないまま終わる' },
  phase: { title: '取り組むこと', max: 1, len: 60, placeholder: '例：会議と 1on1 の型をつくる' },
};
function RoadmapEditSheet({ editing, roadmap, specs, onClose, onSave }) {
  const lim = EDIT_LIMITS[editing.kind];
  const phase = editing.kind === 'phase' ? roadmap.phases[editing.index] : null;
  const initial = editing.kind === 'needs' ? roadmap.needs.map((n) => n.name)
    : editing.kind === 'issues' ? [...roadmap.issues] : [phase?.focus || ''];
  const [rows, setRows] = useState(initial.length ? initial : ['']);
  const [saving, setSaving] = useState(false);
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const list = rows.map(clean).filter(Boolean);
  const dirty = list.join('\n') !== initial.map(clean).filter(Boolean).join('\n');
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    let next;
    if (editing.kind === 'needs') {
      const why = new Map(roadmap.needs.map((n) => [n.name, n.why]));
      next = { ...roadmap, needs: list.map((name) => ({ name, why: why.get(name) || '' })) };
    } else if (editing.kind === 'issues') {
      next = { ...roadmap, issues: list };
    } else {
      next = { ...roadmap, phases: roadmap.phases.map((p, i) => (i === editing.index ? { ...p, focus: list[0] || '', todos: [] } : p)) };
    }
    await onSave(next);
    setSaving(false);
  };
  const title = editing.kind === 'phase' ? `${specs[editing.index]?.label || ''}を直す` : `${lim.title}を直す`;
  return (
    <BottomSheet
      title={title}
      onClose={onClose}
      dismissLabel="キャンセル"
      footer={<button type="button" style={dirty && !saving ? btnPrimary : btnPrimaryOff} disabled={!dirty || saving} onClick={save}>{saving ? '保存中…' : '保存'}</button>}
    >
      <ul className="rm-edit-rows" aria-label={lim.title}>
        {rows.map((r, i) => (
          <li key={i} className="rm-edit-row">
            {/* 長い文も全部見えるように、文の長さで 1〜4 行（改行は入れない＝Enter は無視）。 */}
            <GrowTextarea
              value={r}
              onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? e.target.value.replace(/\n/g, ' ') : x)))}
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.preventDefault(); }}
              maxLength={lim.len}
              placeholder={lim.placeholder}
              aria-label={`${lim.title} ${i + 1}`}
              style={{ ...uiInput, flex: 1, minWidth: 0, resize: 'none', lineHeight: 1.6 }}
            />
            <button type="button" className="rm-icon-btn" aria-label={`${lim.title} ${i + 1} を消す`} onClick={() => setRows((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : ['']))}>
              <X size={20} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {rows.length < lim.max && (
        <button type="button" style={{ ...btnLink, marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }} onClick={() => setRows((xs) => [...xs, ''])}>
          <Plus size="1em" aria-hidden="true" />{`${lim.title}を足す`}
        </button>
      )}
      <p className="plan-summary">{withPhraseBreaks(`${lim.max > 1 ? `${lim.max} つまで。` : ''}AI は使わないので、トークンは減りません。`)}</p>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// 読書計画カレンダー
// ---------------------------------------------------------------------------
function PlanView({ goal, record, books, sessions, onFindBooks, onOpenBook, onAddReadingActions }) {
  const toast = useToast();
  const today = toLocalYmd(appNow());
  const year = Number(today.slice(0, 4));
  const roadmap = useMemo(() => pruneRoadmapBooks(record.roadmap, books), [record.roadmap, books]);
  const specs = useMemo(() => phaseSpecs(goal.key, record.goalAt || goal.at), [goal.key, record.goalAt, goal.at]);
  const here = currentPhaseIndex(goal.key, record.goalAt || goal.at, appNow());
  const [minutes, setMinutes] = useState(record.plan?.minutesPerDay || PLAN_DEFAULT_MINUTES);
  const speed = useMemo(() => readingSpeedFactor(books, sessions), [books, sessions]);
  // 区切りの本は、その区切りが始まる日から（ロードマップと同じ時期に読む）。
  const phaseStarts = useMemo(() => specs.map((x) => `${x.startYm}-01`), [specs]);
  // 本人が順番を決めていれば、その順に今日から（2026-11-16 オーナー「自由に本の順番も入れられるように」）。
  const customOrder = Array.isArray(record.plan?.order) && record.plan.order.length ? record.plan.order : null;
  const phaseOf = useMemo(() => {
    const m = new Map();
    roadmap.phases.forEach((p, i) => p.books.forEach((b) => { if (!m.has(b.bookId)) m.set(b.bookId, i); }));
    return m;
  }, [roadmap]);
  const items = useMemo(() => (customOrder
    ? planItemsFromOrder(customOrder, books, { speed, sessions, phaseOf, fallbackPhase: here })
    : planItemsFromRoadmap(roadmap, books, { speed, sessions, phaseStarts })), [customOrder, roadmap, books, speed, sessions, phaseStarts, phaseOf, here]);
  const [ordering, setOrdering] = useState(false);
  const schedule = useMemo(() => scheduleBooks(items, { minutesPerDay: minutes, start: today }), [items, minutes, today]);
  const months = useMemo(() => planMonths(schedule, today), [schedule, today]);
  const [mi, setMi] = useState(0);
  useEffect(() => { if (mi > months.length - 1) setMi(Math.max(0, months.length - 1)); }, [months.length, mi]);
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const nowItem = bookOnDay(schedule, today);
  const nextItem = nowItem ? null : schedule.find((x) => x.start > today) || null;
  const indexOf = useMemo(() => new Map(schedule.map((x, i) => [x.bookId, i])), [schedule]);
  const [adding, setAdding] = useState(false);
  const addedAt = record.plan?.actionsAddedAt || null;

  const savePlan = useCallback((patch) => {
    saveRoadmap(ALL_GOALS_KEY, { ...record, plan: { ...(record.plan || {}), ...patch } });
  }, [record]);

  const pickMinutes = (m) => {
    if (m === minutes) return;
    setMinutes(m);
    savePlan({ minutesPerDay: m });
    track('reading_plan_minutes', { minutes: m });
  };

  const soon = schedule.filter((x) => x.start <= addDaysYmd(today, 90));
  const addActions = async () => {
    if (adding || !soon.length) return;
    setAdding(true);
    const r = await onAddReadingActions?.(soon.map((x) => ({ bookId: x.bookId, text: `『${byId.get(x.bookId)?.title || ''}』を読み始める`, deadline: x.start })));
    setAdding(false);
    const added = r?.added || 0;
    const skipped = r?.skipped || 0;
    if (added > 0) {
      savePlan({ minutesPerDay: minutes, actionsAddedAt: new Date().toISOString() });
      toast.success?.(skipped ? `行動に ${added} 件追加しました（${skipped} 件は追加済み）。` : `読み始める日を、行動に ${added} 件追加しました。`);
      track('reading_plan_actions', { count: added });
    } else if (skipped > 0) {
      toast.show?.('どの本も、もう行動に入っています。');
    }
  };

  const orderSheet = ordering && (
    <PlanOrderSheet
      books={books}
      initial={items.map((x) => x.bookId)}
      custom={!!customOrder}
      onClose={() => setOrdering(false)}
      onSave={(order) => {
        savePlan({ minutesPerDay: minutes, order });
        setOrdering(false);
        toast.success?.('読む順番を保存しました。');
        track('reading_plan_order', { count: order.length });
      }}
      onReset={() => {
        savePlan({ minutesPerDay: minutes, order: null });
        setOrdering(false);
        toast.show?.('ロードマップの順番に戻しました。');
      }}
    />
  );

  if (!schedule.length) {
    return (
      <>
        {books.some((b) => b.status !== 'done') ? (
          <ErrorMessage
            title="読む本を選びましょう"
            description="本棚から、この 3 か月に読む本を選ぶと、1 日に読む時間に合わせて日付を割り振ります。"
            actions={[
              { label: '本棚から選ぶ', variant: 'primary', onClick: () => setOrdering(true) },
              ...(onFindBooks ? [{ label: 'AI 選書で探す', onClick: () => onFindBooks(`${goal.goals?.y1?.text || ''}。この 3 か月に読む本を探したい`.replace(/^。/, '')) }] : []),
            ]}
          />
        ) : (
          <ErrorMessage
            title="本棚に、まだ読む本がありません"
            description="AI 選書で、この 3 か月に読む本を探しましょう。本棚に入れたら、ここで選べます。"
            actions={onFindBooks ? [{ label: 'この 3 か月に読む本を探す', variant: 'primary', onClick: () => onFindBooks(`${goal.goals?.y1?.text || ''}。この 3 か月に読む本を探したい`.replace(/^。/, '')) }] : []}
          />
        )}
        {orderSheet}
      </>
    );
  }
  const last = schedule[schedule.length - 1];
  const m = months[mi] || months[0];
  // 今日より前の週は出さない（予定は今日から・空の週で場所を取らない）。
  const weeks = m ? monthWeeks(m.year, m.month).filter((w) => w[6].date >= today) : [];
  const monthHasBooks = weeks.some((w) => weekBands(w, schedule).length > 0);
  const nextAfterMonth = !monthHasBooks ? schedule.find((x) => m && x.start > `${m.year}-${String(m.month + 1).padStart(2, '0')}-31`) : null;
  const todayBook = nowItem ? byId.get(nowItem.bookId) : nextItem ? byId.get(nextItem.bookId) : null;
  const groups = [];
  // 自分で決めた順のときは区切りで分けない（区切りの名前と読む日がずれるので）。
  if (customOrder) groups.push({ phase: -1, items: schedule });
  else schedule.forEach((x) => {
    const g = groups[groups.length - 1];
    if (g && g.phase === x.phase) g.items.push(x); else groups.push({ phase: x.phase, items: [x] });
  });

  return (
    <>
      <header className="goal-head" style={{ marginBottom: 'var(--space-4)' }}>
        {roadmap.phases[here]?.focus && (
          <p className="goal-peek">{withPhraseBreaks(`いまの区切り（${specs[here]?.label}）：${roadmap.phases[here].focus}`)}</p>
        )}
      </header>

      <section aria-labelledby="plan-minutes">
        <h3 id="plan-minutes" className="goal-sec-title">1 日に読む時間</h3>
        <SegChoice label="1 日に読む時間" options={PLAN_MINUTES.map((v) => [v, `${v} 分`])} value={minutes} onChange={pickMinutes} />
        <p className="plan-summary">{`${schedule.length} 冊 · ${fmtMd(last.end, year)} まで`}</p>
      </section>

      {todayBook && (
        <button type="button" className="plan-today" onClick={() => onOpenBook?.(todayBook)}>
          <MiniCover book={todayBook} width={32} />
          <span className="plan-today-body">
            <span className="plan-today-label">{nowItem ? '今日の本' : `次の本 · ${fmtMd(nextItem.start, year)} から`}</span>
            <span className="plan-today-title">{withPhraseBreaks(`『${todayBook.title}』`)}</span>
            <span className="plan-today-meta">{nowItem ? `${minutes} 分 · ${fmtMd(nowItem.end, year)} まで` : '今日は読む本の予定がありません'}</span>
          </span>
          <ChevronRight className="goal-entry-chev" size={20} aria-hidden="true" />
        </button>
      )}

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
              <div className="plan-days" aria-hidden="true">
                {week.map((d) => (
                  <div key={d.date} className={`plan-day${d.inMonth ? '' : ' is-out'}${d.date < today ? ' is-past' : ''}${d.date === today ? ' is-today' : ''}`}>
                    <span>{d.day}</span>
                  </div>
                ))}
              </div>
              {bands.length > 0 && (
                <div className="plan-lane">
                  {bands.map((b) => {
                    const book = byId.get(b.bookId);
                    const item = schedule[indexOf.get(b.bookId) || 0];
                    const idx = indexOf.get(b.bookId) || 0;
                    const isNow = nowItem?.bookId === b.bookId;
                    const cls = `plan-band${isNow ? ' is-now' : idx % 2 ? ' is-alt' : ''}${b.head ? ' is-head' : ''}${b.tail ? ' is-tail' : ''}`;
                    return (
                      <button
                        key={b.bookId}
                        type="button"
                        className={cls}
                        onClick={() => book && onOpenBook?.(book)}
                        aria-label={`『${book?.title || ''}』 ${fmtRange(item.start, item.end, year)}${isNow ? '（今日の本）' : ''}`}
                        style={{
                          left: `calc(${b.col} / 7 * 100% + ${b.head ? 'var(--space-1)' : '0px'})`,
                          width: `calc(${b.span} / 7 * 100% - ${b.head ? 'var(--space-1)' : '0px'} - ${b.tail ? 'var(--space-1)' : '0px'})`,
                        }}
                      >
                        {(b.head || b.col === 0) && b.span >= 2 && <span>{book?.title || ''}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {!monthHasBooks && (
          <p className="plan-cal-empty">{withPhraseBreaks(nextAfterMonth ? `この月は読む本の予定がありません。ロードマップのやることを進める期間です。次の本は ${fmtMd(nextAfterMonth.start, year)} から。` : 'この月は読む本の予定がありません。')}</p>
        )}
      </section>

      <section className="goal-sec" aria-labelledby="plan-order">
        <div className="plan-order-head">
          <h3 id="plan-order" className="goal-sec-title" style={{ margin: 0 }}>{customOrder ? '読む順番（自分で決めた順）' : '読む順番'}</h3>
          <button type="button" style={{ ...btnLink, paddingRight: 0 }} onClick={() => setOrdering(true)}>順番を変える</button>
        </div>
        {groups.map((g) => (
          <div key={g.phase} className="plan-group" style={g === groups[0] ? { marginTop: 0 } : undefined}>
            {specs[g.phase] && <p className="plan-group-head">{specs[g.phase].label}<span>{`${specs[g.phase].range}${specs[g.phase].goal && specs[g.phase].goal !== specs[groups[groups.indexOf(g) - 1]?.phase]?.goal ? ` · ${horizonOf(specs[g.phase].goal).label}の目標へ` : ''}`}</span></p>}
            <ol className="plan-order">
              {g.items.map((x) => {
                const b = byId.get(x.bookId);
                if (!b) return null;
                const isNow = nowItem?.bookId === x.bookId;
                return (
                  <li key={x.bookId}>
                    <button type="button" className="plan-row" onClick={() => onOpenBook?.(b)}>
                      <MiniCover book={b} width={36} />
                      <span className="plan-row-body">
                        <span className="plan-row-title">{withPhraseBreaks(`『${b.title}』`)}</span>
                        <span className="plan-row-meta">
                          {isNow && <span className="plan-row-now">今日の本</span>}
                          <span>{fmtRange(x.start, x.end)}</span>
                          <span>{x.days > 1 ? `${fmtSpan(x.days)} · 合わせて ${fmtHoursMin(x.minutes)}` : fmtHoursMin(x.minutes)}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>

      <div className="goal-sec">
        <button type="button" style={adding || !soon.length ? btnPrimaryOff : btnPrimary} disabled={adding || !soon.length} onClick={addActions}>
          {adding ? '追加中…' : `読み始める日を行動に追加（${soon.length} 件）`}
        </button>
        <p className="plan-summary">
          {withPhraseBreaks(addedAt
            ? `前に追加したのは ${fmtMd(toLocalYmd(new Date(addedAt)), year)} です。まだ追加していない本だけを足します。`
            : 'これから 3 か月のうちに読み始める本を「『書名』を読み始める」として追加します。')}
        </p>
      </div>
      {orderSheet}
    </>
  );
}

// 読む順番を変える（↑↓ で並べ替え・× で外す・本棚から足す）。2026-11-16 オーナー「自由に本の順番も入れられるように」。
const STATUS_NAME = { reading: '読書中', before: '積読', want: '読みたい' };
function PlanOrderSheet({ books, initial, custom, onClose, onSave, onReset }) {
  const [order, setOrder] = useState(initial);
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const rest = books.filter((b) => b.status !== 'done' && !order.includes(b.id))
    .sort((a, b) => ({ reading: 0, before: 1, want: 2 }[a.status] ?? 3) - ({ reading: 0, before: 1, want: 2 }[b.status] ?? 3));
  const dirty = order.join() !== initial.join();
  const move = (i, d) => setOrder((o) => {
    const j = i + d;
    if (j < 0 || j >= o.length) return o;
    const n = [...o];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  return (
    <BottomSheet
      title="読む順番"
      onClose={onClose}
      dismissLabel="キャンセル"
      footer={(
        <button type="button" style={dirty && order.length ? btnPrimary : btnPrimaryOff} disabled={!dirty || !order.length} onClick={() => onSave(order)}>保存</button>
      )}
    >
      <p className="plan-summary" style={{ marginTop: 0 }}>{withPhraseBreaks('上から順に、今日から読みます。この先 3 か月に読む本を中心に並べてください。')}</p>
      <ol className="plan-sort" aria-label="読む順番">
        {order.map((id, i) => {
          const b = byId.get(id);
          if (!b) return null;
          return (
            <li key={id} className="plan-sort-row">
              <MiniCover book={b} width={32} />
              <span className="plan-sort-title">{withPhraseBreaks(`『${b.title}』`)}</span>
              <button type="button" className="rm-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`『${b.title}』を上へ`}><ChevronUp size={20} aria-hidden="true" /></button>
              <button type="button" className="rm-icon-btn" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`『${b.title}』を下へ`}><ChevronDown size={20} aria-hidden="true" /></button>
              <button type="button" className="rm-icon-btn" onClick={() => setOrder((o) => o.filter((x) => x !== id))} aria-label={`『${b.title}』を外す`}><X size={20} aria-hidden="true" /></button>
            </li>
          );
        })}
      </ol>
      {!order.length && <p className="plan-summary">{withPhraseBreaks('下の本棚から、読む本を足してください。')}</p>}
      {rest.length > 0 && (
        <>
          <h3 className="goal-sec-title" style={{ marginTop: 'var(--space-6)' }}>本棚から足す</h3>
          <ul className="plan-sort" aria-label="本棚の本">
            {rest.map((b) => (
              <li key={b.id} className="plan-sort-row">
                <MiniCover book={b} width={32} />
                <span className="plan-sort-title">
                  {withPhraseBreaks(`『${b.title}』`)}
                  <span className="plan-sort-meta">{STATUS_NAME[b.status] || ''}</span>
                </span>
                <button type="button" className="rm-icon-btn" onClick={() => setOrder((o) => [...o, b.id])} aria-label={`『${b.title}』を足す`}><Plus size={20} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        </>
      )}
      {custom && (
        <button type="button" style={{ ...btnLinkQuiet, marginTop: 'var(--space-4)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={onReset}>ロードマップの順番に戻す</button>
      )}
    </BottomSheet>
  );
}

function addDaysYmd(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return toLocalYmd(d);
}
