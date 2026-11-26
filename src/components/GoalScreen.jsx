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
import { autoGrowTextarea } from '../hooks/useComposerHeight';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUp, Plus, Search, X } from 'lucide-react';
import './goals.css';
import { AdvisorNavBar } from './AdvisorHistory';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { MiniCover } from './BookCards';
import SegThumb from './SegThumb';
import { withPhraseBreaks } from './TightBubble';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { btnPrimary, btnPrimaryOff, btnGhost, btnLink, btnLinkQuiet, input as uiInput } from '../styles/ui';
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack';
import { useReadingSessions } from '../hooks/useReadingSessions';
import { useGoals } from '../hooks/useGoals';
import { ensureAiConsent } from '../lib/aiConsent';
import { runGoalInterview, generateGoalRoadmap, chooseGoalPhaseBooks } from '../lib/ai';
import { interviewChips, toggleChoice, choiceSelected, OPT_OFF, OPT_UNSURE, OFF_PLACEHOLDER } from '../lib/advisorInterview';
import { GOAL_HORIZONS, GOAL_MAX, ALL_GOALS_KEY, horizonOf, fmtGoalDeadline, fmtGoalDeadlineNow, saveGoal, suggestHorizon, cleanGoalText, allGoalsSet, canBuildRoadmap, combinedGoal } from '../lib/goals';
import { advisorDraftFor, GOAL_ASK_LIMIT, ROADMAP_TOKENS_LABEL, PHASE_BOOKS_TOKENS_LABEL, phaseSpecs, currentPhaseIndex, saveRoadmap, pruneRoadmapBooks, phaseNeedsBooks, overdueGoals, isRoadmapStale, quarterPlanFor, historyText } from '../lib/goalRoadmap';
import {
  PLAN_MINUTES, PLAN_DEFAULT_MINUTES, readingSpeedFactor, planItemsFromRoadmap, planItemsFromOrder, scheduleBooks, monthWeeks, weekBands,
  planMonths, bookOnDay, fmtSpan, fmtMd, fmtRange, fmtHoursMin, parseYmd,
} from '../lib/readingPlan';
import { appNow } from '../lib/appNow';
import { displayTitle } from '../lib/bookTitle';
import { STATUS_LABEL } from '../lib/checkDuplicate';
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

// 文字の大きさの設定が大きいとき（ルート 22px 以上）。
const largeRootText = () => { try { return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 22; } catch { return false; } };

export default function GoalScreen({ start = null, books = [], onClose, onOpenBook, onAddActionText, onAddReadingActions, onFindBooks, onAddRecBook, onRead = null, onConsult = null }) {
  const { goals, roadmaps, purpose, loaded } = useGoals();
  const toast = useToast();
  const { rows: sessions } = useReadingSessions();
  const [view, setView] = useState(start?.view || 'goals');
  const [horizon, setHorizon] = useState(start?.horizon || null);
  const [editing, setEditing] = useState(null); // { key, text }
  const [scrolled, setScrolled] = useState(false);
  // 「達成するには？」を終えてロードマップをつくっている間は、題も「ロードマップ」（2026-11-23 ui-critic）。
  const [interviewBuilding, setInterviewBuilding] = useState(false);
  const scrollRef = useRef(null);

  // ロードマップは 3 つの目標をつなぐ 1 本だけ（'all'）。
  const goal = horizon === ALL_GOALS_KEY ? combinedGoal(goals) : null;
  const confirmGoal = useConfirm();
  // 「この目標で続ける」で 1 年後の期限を延ばしたら、ロードマップの起点も新しい期限に合わせる
  //   （起点が古いままで、いまの区切りが 1 年後の目標を過ぎた扱いになっていた・2026-11-25 点検）。
  //   区切りは 1 本の起点から並ぶので、3 年後・5 年後の期限も同じ起点にそろえる（1 年後だけ延ばすと「3 年後の目標」の印が
  //   区切りの日付とずれた・2026-11-25 点検）。そろえたら true（知らせで言う）。
  const realignRoadmap = async (nextGoals) => {
    const rec = roadmaps[ALL_GOALS_KEY];
    const at = combinedGoal(nextGoals)?.at;
    if (!rec?.roadmap || !at || at === rec.goalAt) return false;
    let goalsNow = nextGoals;
    let moved = false;
    for (const k of ['y3', 'y5']) {
      const g = goalsNow[k];
      if (!g?.text || !g.at || Date.parse(g.at) >= Date.parse(at)) continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await saveGoal(k, g.text);
      if (r) { goalsNow = r.goals; moved = true; }
    }
    try { await saveRoadmap(ALL_GOALS_KEY, { ...rec, goalAt: at, goals: { y1: goalsNow.y1, y3: goalsNow.y3, y5: goalsNow.y5 } }); } catch { /* 起点が合わなくても目標は保存してある */ }
    return moved;
  };
  const record = goal ? roadmaps[ALL_GOALS_KEY] : null;

  // 開いた元（ホーム／振り返り › 行動）から直接開いた画面は、1 回の戻るで元へ（読書計画 → ロードマップ → 目標 → と 3 回戻っていた・2026-11-17 点検）。
  //   行動のいちばん上の 1 行からロードマップを開いたときも「‹ 行動」（前は「‹ 目標」で 2 回戻る・2026-11-23 点検）。
  //   本を開いて戻ってきたときも、最初に開いた画面（base）を覚えておく（openBook が App に渡す）。
  const baseView = start?.base || start?.view || 'goals';
  const fromHome = start?.from === 'home';
  const originLabel = fromHome ? 'ホーム' : '行動';
  const direct = view === baseView;
  const back = useCallback(() => {
    if (direct) { onClose?.(); return; }
    if (view === 'plan') { setView('roadmap'); return; }
    if (view === 'roadmap' || view === 'interview') { setView('goals'); return; }
    onClose?.();
  }, [view, onClose, direct]);
  useEdgeSwipeBack({ onBack: back, enabled: !editing });
  useEffect(() => { scrollRef.current?.scrollTo?.({ top: 0 }); setScrolled(false); }, [view, horizon]);

  const open = (key, v) => { setHorizon(key); setView(v); };
  // 本を開いて戻ってきたら、同じ目標の同じ画面へ（App が覚えておく）。
  const openBook = (b) => onOpenBook?.(b, { view, horizon, base: baseView, ...(start?.from ? { from: start.from } : null) });

  // 1 年後の目標を書いたら（2026-11-22 オーナー承認・前は 3 つとも書いたときだけ）。ロードマップは 1 本＝無料プランもこの 1 本を作れる・トークンの量で守る。
  const startInterview = async () => {
    if (!canBuildRoadmap(goals)) return;
    if (!(await ensureAiConsent('goal_interview'))) return;
    track('goal_interview_start', { horizon: ALL_GOALS_KEY });
    open(ALL_GOALS_KEY, 'interview');
  };

  const backLabel = direct || view === 'goals' ? originLabel : view === 'plan' ? 'ロードマップ' : '目標';
  const navTitle = view === 'interview' && interviewBuilding ? NAV_TITLE.roadmap : NAV_TITLE[view];
  return (
    <div className="goal-screen" role="dialog" aria-modal="true" aria-label={navTitle}>
      <AdvisorNavBar backLabel={backLabel} title={navTitle} onBack={back} pushed scrolled={scrolled} />
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
              onExtend={async (key) => {
                const r = await saveGoal(key, goals[key]?.text || '');
                if (!r) { toast.error?.('目標を保存できませんでした。通信状況を確認して、もう一度押してください。'); return; }
                const moved = await realignRoadmap(r.goals);
                toast.success?.(`${horizonOf(key).label}の目標の期限を、${fmtGoalDeadline(r.goals[key].at, horizonOf(key).years)}延ばしました。${moved ? '3 年後・5 年後の期限も、同じだけ延ばしました。' : ''}`);
                track('goal_extended', { horizon: key });
              }}
            />
          )}
          {view === 'interview' && goal && (
            <InterviewView
              goal={goal}
              goals={goals}
              roadmaps={roadmaps}
              books={books}
              sessions={sessions}
              onDone={() => { setInterviewBuilding(false); setView('roadmap'); }}
              onCancel={() => { setInterviewBuilding(false); setView('goals'); }}
              onBuildingChange={setInterviewBuilding}
            />
          )}
          {view === 'roadmap' && goal && record?.roadmap && (
            <RoadmapView
              goal={goal}
              record={record}
              books={books}
              sessions={sessions}
              onOpenBook={openBook}
              onAddActionText={onAddActionText}
              onFindBooks={onFindBooks}
              onPlan={() => setView('plan')}
              onConsult={onConsult}
              onRebuild={startInterview}
              onEditGoals={() => setView('goals')}
              onExtend={async (keys) => {
                let r = null;
                for (const k of keys) {
                  // eslint-disable-next-line no-await-in-loop
                  r = await saveGoal(k, goals[k]?.text || '');
                  if (!r) break;
                }
                if (!r) { toast.error?.('目標を保存できませんでした。通信状況を確認して、もう一度押してください。'); return; }
                const moved = await realignRoadmap(r.goals);
                toast.success?.(`この目標で続けます。期限を延ばしました。${moved ? '3 年後・5 年後の期限も、同じだけ延ばしました。' : ''}`);
                track('goal_extended', { horizon: keys.join('+') });
              }}
              onChooseBooks={async ({ count, recentDone } = {}) => {
                if (!(await ensureAiConsent('goal_roadmap'))) return false;
                const next = await chooseGoalPhaseBooks({ goals, record, books, now: appNow(), nowCount: count, recentDone });
                await saveRoadmap(ALL_GOALS_KEY, { ...record, roadmap: next, prevRoadmap: record.roadmap });
                toast.success?.('この 3 か月に読む本を選びました。');
                track('goal_phase_books', {});
                return true;
              }}
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
                toast.info?.('ロードマップを、見直す前に戻しました。');
              }}
            />
          )}
          {/* 1 年後の目標を消したあと（ロードマップはあっても、はじまりの目標が無い）＝真っ白にしない（2026-11-25 点検）。 */}
          {(view === 'roadmap' || view === 'plan') && !goal && (
            <ErrorMessage title="1 年後の目標がありません" description="ロードマップは 1 年後の目標から始まります。書くと、また見られます。" actions={[{ label: '1 年後の目標を書く', variant: 'primary', onClick: () => { setView('goals'); setEditing({ key: 'y1', text: '' }); } }]} />
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
              onRead={onRead}
              onAddReadingActions={onAddReadingActions}
              onRoadmap={() => setView('roadmap')}
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
            // 書いてあった目標を消すときは確かめる（1 年後を消すとロードマップも見られなくなる・2026-11-25 点検）。
            if (!cleanGoalText(text) && cleanGoalText(editing.text)) {
              const ok = await confirmGoal({
                title: `${horizonOf(key).label}の目標を消しますか？`,
                message: key === 'y1' && roadmaps[ALL_GOALS_KEY]?.roadmap ? '1 年後の目標が無いあいだは、ロードマップを見られません。' : '消した目標は元に戻せません。',
                confirmLabel: '消す',
                cancelLabel: 'キャンセル',
                danger: true,
              });
              if (!ok) return false;
            }
            const r = await saveGoal(key, text);
            // 保存できなかったら、シートを開いたまま（書いた目標を消さない・2026-11-20）。
            if (!r) { toast.error?.('目標を保存できませんでした。通信状況を確認して、もう一度押してください。'); return false; }
            // まだ書いていない次の目標があれば、そのままその欄へ（はじめての人が 3 回開き直さなくていい・2026-11-16）。
            const next = cleanGoalText(text) ? nextEmptyAfter(r.goals, key) : null;
            setEditing(next ? { key: next.key, text: '' } : null);
            // つながっていなくて、この端末にだけ残ったとき（開き直すと前の目標に戻ることがある・2026-11-25 点検）。
            if (r.synced === false) toast.info?.('この端末には保存しました。つながったら、もう一度保存してください。');
            // 次の目標の欄へ進むときも、保存できたことは言う（キャンセルしたときに分からなかった・2026-11-25 点検）。
            else if (next) toast.success?.(`${horizonOf(key).label}の目標を保存しました。`);
            if (!next && canBuildRoadmap(r.goals) && !roadmaps[ALL_GOALS_KEY]?.roadmap) {
              setTimeout(() => { const el = scrollRef.current; if (el) el.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' }); }, 350);
            }
            track('goal_saved', { horizon: key, cleared: !cleanGoalText(text) });
            const rec = roadmaps[ALL_GOALS_KEY];
            if (r.synced === false || next) { /* 上で知らせた */ } else if (cleanGoalText(text) && rec?.roadmap && cleanGoalText(text) !== cleanGoalText(rec.goals?.[key]?.text || '')) {
              toast.success?.('目標を保存しました。');
            } else if (!rec?.roadmap && allGoalsSet(r.goals)) {
              toast.success?.('3 つの目標がそろいました。下の「ロードマップをつくる」から始められます。');
            } else if (!rec?.roadmap && key === 'y1' && cleanGoalText(text) && !next) {
              toast.success?.('目標を保存しました。下の「ロードマップをつくる」から始められます。');
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
function GoalsView({ goals, roadmaps, purpose, loaded, onEdit, onCarry, onInterview, onRoadmap, onExtend }) {
  const overdueKeys = new Set(overdueGoals(goals, appNow()).map((o) => o.key));
  const anyGoal = GOAL_HORIZONS.some((h) => goals[h.key]?.text);
  const rec = roadmaps[ALL_GOALS_KEY];
  const anyRoadmap = !!rec?.roadmap;
  const allSet = allGoalsSet(goals);
  const canBuild = canBuildRoadmap(goals);
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
      {/* 目標をまだ 1 つも書いていない間だけ（書いたら下の注記と重なる・2026-11-22 ui-critic）。 */}
      {!anyRoadmap && !anyGoal && <p className="goal-lead">{withPhraseBreaks('「達成するには？」を一緒に考えて、目標までの道のりと読む本を決めます。')}</p>}
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
        {/* 「いま」は、期限が過ぎた目標の下に（時間の順・2026-11-17 ui-critic）。 */}
        {[...GOAL_HORIZONS.filter((h) => overdueKeys.has(h.key)), 'now', ...GOAL_HORIZONS.filter((h) => !overdueKeys.has(h.key))].map((h) => {
          if (h === 'now') {
            return (
              <li key="now">
                <span className="goal-dot is-now" aria-hidden="true" />
                <p className="goal-now-label">いま</p>
              </li>
            );
          }
          const g = goals[h.key];
          return (
            <li key={h.key}>
              <span className={`goal-dot${g?.text ? (anyRoadmap ? ' is-here' : ' is-set') : ''}`} aria-hidden="true" />
              <p className="goal-when">
                <strong>{h.label}</strong>
                {g?.text && <span style={overdueKeys.has(h.key) ? { color: 'var(--warning)' } : undefined}>{fmtGoalDeadlineNow(g.at, h.years, appNow())}</span>}
              </p>
              {g?.text ? (
                <>
                  <p className="goal-text">{withPhraseBreaks(g.text)}</p>
                  <div className="goal-actions">
                    <button type="button" style={{ ...(overdueKeys.has(h.key) ? btnLink : btnLinkQuiet), marginLeft: 'calc(-1 * var(--space-1))' }} onClick={() => onEdit(h.key)}>書き直す</button>
                    {overdueKeys.has(h.key) && onExtend && (
                      <button type="button" style={btnLinkQuiet} onClick={() => onExtend(h.key)}>この目標で続ける</button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="goal-empty">{withPhraseBreaks(`例：${h.example}`)}</p>
                  <div className="goal-actions">
                    <button type="button" style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', padding: '0 var(--space-1) 0 0' }} onClick={() => onEdit(h.key)}>
                      <Plus size="1em" aria-hidden="true" />{h.label}の目標を書く
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>

      {/* 1 年後の目標を書いたら、つなぐロードマップを 1 本（2026-11-22 オーナー承認・前は 2026-11-16「すべて入れたら AI を動かす」）。 */}
      <section className="goal-cta" aria-label="ロードマップ">
        {anyRoadmap && canBuild && isRoadmapStale(rec, goals) ? (
          <>
            <button type="button" style={btnPrimary} onClick={onInterview}>新しい目標でつくり直す</button>
            <p className="plan-summary">{withPhraseBreaks(`目標が変わりました。「達成するには？」をもう一度聞いて、道のりをつくり直します（${ROADMAP_TOKENS_LABEL}）。`)}</p>
            <button type="button" style={{ ...btnLink, marginLeft: 'calc(-1 * var(--space-1))' }} onClick={onRoadmap}>いまのロードマップを見る</button>
          </>
        ) : anyRoadmap ? (
          <>
            {needs.length > 0 && <p className="goal-peek" style={{ marginTop: 0 }}>{withPhraseBreaks(`必要なこと：${needs.join('・')}`)}</p>}
            <button type="button" style={{ ...btnPrimary, marginTop: needs.length > 0 ? 'var(--space-3)' : 0 }} onClick={onRoadmap}>ロードマップを見る</button>
          </>
        ) : canBuild ? (
          <>
            <button type="button" style={btnPrimary} onClick={onInterview}>ロードマップをつくる</button>
            <p className="plan-summary">{withPhraseBreaks(allSet
              ? `「達成するには？」の問いに 2 つまで答えると、3 つの目標をつなぐ道のりと読む本の順番をつくります（${ROADMAP_TOKENS_LABEL}）。`
              : `「達成するには？」の問いに 2 つまで答えると、1 年後の目標までの道のりと読む本の順番をつくります（${ROADMAP_TOKENS_LABEL}）。`)}</p>
          </>
        ) : (
          <>
            <button type="button" style={btnPrimaryOff} disabled aria-describedby="goal-cta-note">ロードマップをつくる</button>
            <p id="goal-cta-note" className="plan-summary">{withPhraseBreaks('1 年後の目標を書くと、つくれます。')}</p>
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

// 書きかけのシートを閉じる前に確かめる（行動の追加と同じ言葉・2026-11-17 点検）。
// BottomSheet の beforeClose に渡す（閉じる前に確かめる＝「編集を続ける」でシートが見えないまま残らない・2026-11-20）。
function useGuardedClose(dirty, onClose, { message = '破棄すると、元に戻せません。' } = {}) {
  const confirm = useConfirm();
  return useCallback(async () => {
    if (!dirty) return true;
    return !!(await confirm({ title: '保存していない変更があります', message, confirmLabel: '破棄する', cancelLabel: '編集を続ける', danger: true }));
  }, [dirty, confirm, message]);
}

function GoalEditSheet({ horizonKey, initial, hasRoadmap, nextLabel, onClose, onSave }) {
  const h = horizonOf(horizonKey);
  const [text, setText] = useState(initial || '');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 250); return () => clearTimeout(t); }, []);
  const dirty = cleanGoalText(text) !== cleanGoalText(initial);
  const guardedClose = useGuardedClose(dirty, onClose, { message: initial ? '目標は元のまま残ります。' : '破棄すると、元に戻せません。' });
  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    try { await onSave(text); } catch { /* 呼び出し側が知らせる */ } finally { setSaving(false); }
  };
  return (
    <BottomSheet
      title={`${h.label}の目標`}
      onClose={onClose}
      beforeClose={guardedClose}
      dismissLabel="キャンセル"
      footer={(
        <button type="button" style={dirty && !saving ? btnPrimary : btnPrimaryOff} disabled={!dirty || saving} onClick={save}>
          {saving ? '保存中…' : nextLabel && !initial ? `保存して ${nextLabel}へ` : '保存'}
        </button>
      )}
    >
      <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6 }}>
        {withPhraseBreaks(`${h.label}に、どうなっていたいですか。どんな場面で何ができるようになりたいかまで書くと、道のりが具体的になります。`)}
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
// 目標 1 つだけのとき（「達成するには？」の上）。2 行で切れたら「全文を見る」で全文を読める（文字を大きくすると 1 年後の目標が … で読めなかった・2026-11-23 点検）。
function GoalSingleClamp({ h, when, text }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return undefined;
    const measure = () => { if (el.clientHeight > 0) setCut(el.scrollHeight - el.clientHeight > 1); };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, text]);
  return (
    <div className="goal-trio-single">
      {when(h)}
      <span ref={ref} className={`goal-text${open ? '' : ' goal-text-clamp'}`}>{withPhraseBreaks(text)}</span>
      {(cut || open) && (
        <button type="button" className="goal-single-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? '閉じる' : '全文を見る'}<ChevronDown size="1em" aria-hidden="true" style={open ? { transform: 'rotate(180deg)' } : undefined} />
        </button>
      )}
    </div>
  );
}

// 3 つの目標の見出し（深掘り・ロードマップ・読書計画の上）。compact は 1 行ずつ小さく。
// tight: 「達成するには？」の上（いちばん近い目標を 2 行まで・問いを最初の画面に・2026-11-23 ui-critic）。
function GoalTrio({ goals, compact = false, fold = false, tight = false, onEdit = null }) {
  const overdue = new Set(overdueGoals(goals, appNow()).map((o) => o.key));
  const set = GOAL_HORIZONS.filter((h) => goals?.[h.key]?.text);
  const when = (h) => (
    <p className="goal-when"><strong>{h.label}</strong><span style={overdue.has(h.key) ? { color: 'var(--warning)' } : undefined}>{fmtGoalDeadlineNow(goals[h.key].at, h.years, appNow())}</span></p>
  );
  // ロードマップの上では畳む（いちばん近い目標だけ・押すとほかの目標も・2026-11-17 ui-critic「いまの 3 か月を最初の画面に」）。
  //   期限が過ぎた目標があれば、その目標を見せる。
  if (fold && tight && set.length === 1) {
    return <GoalSingleClamp h={set[0]} when={when} text={goals[set[0].key].text} />;
  }
  if (fold && set.length > 1) {
    const first = set.find((h) => overdue.has(h.key)) || set[0];
    const rest = set.filter((h) => h.key !== first.key);
    return (
      <details className={`goal-trio-fold${tight ? ' is-tight' : ''}`}>
        <summary>
          <span className="goal-trio-first">
            {when(first)}
            {/* 文字が大きいときは切らない（3 行では数語しか見えず、畳みを開いても全文が出ると分からなかった・2026-11-23 点検）。 */}
            <span className={`goal-text${largeRootText() ? '' : ' goal-text-clamp'}`}>{withPhraseBreaks(goals[first.key].text)}</span>
          </span>
          <span className="goal-trio-more">{`${rest.map((h) => h.label).join('・')}の目標`}<ChevronDown className="fold-chevron" size="1em" aria-hidden="true" /></span>
        </summary>
        <ul className="goal-trio is-compact" aria-label="ほかの目標">
          {rest.map((h) => (
            <li key={h.key}>
              {when(h)}
              <p className="goal-text">{withPhraseBreaks(goals[h.key].text)}</p>
            </li>
          ))}
        </ul>
        {onEdit && <button type="button" style={{ ...btnLink, marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={onEdit}>目標を書き直す</button>}
      </details>
    );
  }
  return (
    <ul className={`goal-trio${compact ? ' is-compact' : ''}`} aria-label="3 つの目標">
      {GOAL_HORIZONS.filter((h) => goals?.[h.key]?.text).map((h) => (
        <li key={h.key}>
          <p className="goal-when"><strong>{h.label}</strong><span style={overdue.has(h.key) ? { color: 'var(--warning)' } : undefined}>{fmtGoalDeadlineNow(goals[h.key].at, h.years, appNow())}</span></p>
          <p className="goal-text">{withPhraseBreaks(goals[h.key].text)}</p>
        </li>
      ))}
    </ul>
  );
}

function InterviewView({ goal, goals, roadmaps, books, sessions, onDone, onCancel, onBuildingChange = null }) {
  // つくり直すときは、これまでの道のり（前のまとめ・課題・作ってから読み終えた本）を AI に渡す（何年使っても積み上がる・2026-11-17）。
  const prevRec = roadmaps?.[ALL_GOALS_KEY] || null;
  const history = useMemo(() => historyText(prevRec, books), [prevRec, books]);
  const [qa, setQa] = useState([]);
  const [step, setStep] = useState(null); // { question, options, summary }
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState(null); // { message, notice }
  const [answer, setAnswer] = useState('');
  const [off, setOff] = useState(false);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  const answerRef = useRef(null);
  const summaryRef = useRef('');
  // つくっている間（と、つくれなかったとき）は親の題を「ロードマップ」に。離れたら戻す。
  const buildStage = building || error?.stage === 'build';
  useEffect(() => { onBuildingChange?.(buildStage); }, [buildStage, onBuildingChange]);
  useEffect(() => () => onBuildingChange?.(false), [onBuildingChange]);

  const build = useCallback(async (finalQa) => {
    setBuilding(true);
    setError(null);
    if (!(await ensureAiConsent('goal_roadmap'))) { setBuilding(false); onCancel(); return; }
    try {
      const prev = roadmaps?.[ALL_GOALS_KEY];
      // 最初の 3 か月の冊数は、読むペースに合わせる（記録が無ければ 1 日に読む時間で読める分）。
      const q = quarterPlanFor({ at: goal.at, books, sessions, now: appNow(), minutesPerDay: prev?.plan?.minutesPerDay, usedBefore: !!prev?.roadmap });
      const { roadmap } = await generateGoalRoadmap({ goals, at: goal.at, qa: finalQa, summary: summaryRef.current, books, minutesPerDay: prev?.plan?.minutesPerDay, nowCount: Math.max(1, q.count), history });
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
      // つくっている間に「‹ 目標」で戻っていたら、画面を勝手にロードマップへ切り替えない（保存はしてある・2026-11-25 点検）。
      if (aliveRef.current) onDone();
    } catch (e) {
      setError({ message: e?.message || 'ロードマップをつくれませんでした。', notice: !!e?.notice, stage: 'build' });
      setBuilding(false);
    }
  }, [goal, goals, roadmaps, books, sessions, history, onDone, onCancel]);

  const ask = useCallback(async (nextQa) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    const round = nextQa.length + 1;
    const res = round > GOAL_ASK_LIMIT ? { done: true, summary: summaryRef.current } : await runGoalInterview({ goals, qa: nextQa, round, history });
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
  }, [goals, build, history]);

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
    autoGrowTextarea(answerRef.current);
  }, [answer, step]);

  const left = Math.max(0, GOAL_ASK_LIMIT - qa.length - 1);
  const chips = step ? interviewChips(step) : [];
  const starts = chips.filter((c) => c.kind === 'start');
  const labels = starts.map((c) => c.label);

  return (
    <>
      <header className="goal-head">
        <GoalTrio goals={goals} compact fold tight />
      </header>

      {error && (
        <ErrorMessage
          title={error.notice ? 'AI のトークンについて' : (error.stage === 'build' ? 'ロードマップをつくれませんでした' : '問いを用意できませんでした')}
          description={error.message}
          // 戻るは上の「‹ 目標」1 つ（同じ行き先のボタンを 2 つ並べない・2026-11-23 点検）。トークンを使い切ったときだけ「目標に戻る」。
          //   問いを用意できなかったときは、問いなしでもつくれる（「このくらいでつくる」と同じ・2026-11-23 ui-critic）。
          actions={error.notice ? [{ label: '目標に戻る', onClick: onCancel }] : [
            { label: 'もう一度', variant: 'primary', onClick: () => (error.stage === 'build' ? build(qa) : ask(error.qa || qa)) },
            ...(error.stage !== 'build' ? [{
              label: <>問いなしでつくる<span style={{ whiteSpace: 'nowrap' }}>{`（${ROADMAP_TOKENS_LABEL}）`}</span></>,
              ariaLabel: `問いなしでつくる（${ROADMAP_TOKENS_LABEL}）`,
              variant: 'ghost',
              onClick: finishNow,
            }] : []),
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
              placeholder={off ? OFF_PLACEHOLDER : (parseFloat(getComputedStyle(document.documentElement).fontSize) >= 22 ? '言葉で答える' : '自分の言葉で答える')}
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
          {/* 答えの候補（枠のチップ）と形を分けて、控えめな文字ボタンの 1 行に（2026-11-23 点検「候補の 1 つに見える」）。 */}
          <div className="goal-q-alt" role="group" aria-label="うまく答えられないとき">
            <button type="button" aria-pressed={off} style={{ ...btnLinkQuiet, ...(off ? { color: 'var(--accent)' } : null) }} onClick={() => { setOff((v) => !v); answerRef.current?.focus?.(); }}>{OPT_OFF}</button>
            <button type="button" style={btnLinkQuiet} onClick={() => submit('（まだ言葉にできない）')}>{OPT_UNSURE}</button>
          </div>
          <p className="goal-q-progress">
            {withPhraseBreaks(left > 0 ? 'あと 1 つ聞いたら、ロードマップをつくります' : '次で、ロードマップをつくります')}
          </p>
          {/* つくるときにトークンを使うことは、押す前にこのボタンの 1 か所だけで言う（同じ箱に 2 回書かない・「トー／クン」と割らない・2026-11-23 点検）。 */}
          <button type="button" style={{ ...btnLinkQuiet, marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))', justifyContent: 'flex-start', textAlign: 'left' }} onClick={finishNow}>
            <span>このくらいでつくる<span style={{ whiteSpace: 'nowrap' }}>{`（${ROADMAP_TOKENS_LABEL}）`}</span></span>
          </button>
        </div>
      )}
    </>
  );
}

// いまの区切りの見出し（「いまの 3 か月（11月〜1月）」・3 か月の区切りのときだけ実際の月を添える・数と「か月」は割らない）。
export function nowQuarterTitle(spec) {
  const base = 'いまの 3\u00a0か月';
  const m = /^(\d{4})-(\d{2})$/.exec(String(spec?.startYm || ''));
  if (!m || spec?.months !== 3) return base;
  const a = Number(m[2]);
  const b = ((a - 1 + 2) % 12) + 1;
  return `${base}（${a}月〜${b}月）`;
}

// 見出しの「（11月〜1月）」は 1 つの塊のまま（いちばん大きな文字で「（11月〜／1月）」と割れていた・2026-11-23 ui-critic）。
function quarterTitleNode(title) {
  const i = title.indexOf('（');
  if (i < 0) return withPhraseBreaks(title);
  return <>{withPhraseBreaks(title.slice(0, i))}<span style={{ whiteSpace: 'nowrap' }}>{title.slice(i)}</span></>;
}

// 相談に入れる下書き（送らない）。「1 年後の目標は「…」です。」＋いまの 3 か月に取り組むこと＋問い。
function consultDraftFor(goals, focus) {
  const g = String(goals?.y1?.text || '').replace(/[。．.\s]+$/u, '').replace(/。\s*/g, '、');
  const f = String(focus || '').replace(/[。．.\s]+$/u, '');
  const parts = [];
  if (g) parts.push(`1 年後の目標は「${g}」です。`);
  if (f) parts.push(`この 3 か月は「${f}」に取り組みます。`);
  parts.push('何から始めるとよいですか？');
  return parts.join('');
}

function clampAnswer(t) {
  return sanitizeForPrompt(String(t || '')).trim().slice(0, 400);
}

function Building({ building }) {
  return (
    <div className="goal-building" role="status" aria-live="polite">
      <p className="goal-building-note">{building ? 'ロードマップをつくっています。目標に合う本も探しています…' : '問いを考えています…'}</p>
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
function RoadmapView({ goal, record, books, sessions = [], onOpenBook, onAddActionText, onFindBooks, onPlan, onConsult = null, onRebuild, onUndoUpdate, onEditGoals, onSaveRoadmap, onAddRec, onChooseBooks, onExtend }) {
  // この 3 か月の本を選ぶ（区切りが進んで本が無くなったとき・2026-11-17）。
  const [choosing, setChoosing] = useState(false);
  const [chooseError, setChooseError] = useState(null);
  const choose = async (count) => {
    if (choosing || !onChooseBooks) return;
    setChoosing(true);
    setChooseError(null);
    try { await onChooseBooks({ count: Math.max(1, count || 1), recentDone: quarter.pace.doneBooks }); } catch (e) { setChooseError(e?.message || '本を選べませんでした。もう一度押してください。'); } finally { setChoosing(false); }
  };
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
  // 読むペース（前の 3 か月）と、次の 3 か月に選ぶ冊数（2026-11-17 オーナー「ペースがバラバラでも心地よく引き上げる」）。
  const quarter = useMemo(() => quarterPlanFor({ record, books, sessions, now: appNow() }), [record, books, sessions]);
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const planBooks = roadmap.phases.some((p) => p.books.some((b) => b.bookId && byId.get(b.bookId) && byId.get(b.bookId).status !== 'done'));
  // 本棚に読んでいない本があれば、ロードマップに本が無くても読書計画は自分で選んでつくれる（2026-11-16 オーナー「本棚の本がほぼない状態だとどうなる？」）。
  const hasUnread = books.some((b) => b.status !== 'done');
  const recsNow = (roadmap.phases[here]?.books || []).filter((b) => !b.bookId).length;
  // この 3 か月に読む本（読み終えていない本棚の本 → すすめた本・3 冊まで）を、いまの枠の中にも並べる
  //   （2026-11-26 点検「いまの 3 か月で、次に何を読むかが下の道のりまで行かないと分からない」）。
  const nowRank = (x) => (x.book ? ({ reading: 0, before: 1, want: 2 }[x.book.status] ?? 2) : 3);
  // 4 冊までは全部並べ、5 冊からは 3 冊＋「ほか N 冊を道のりで見る」（1 冊を隠すために 1 行を使わない）。
  const nowShownOf = (n) => (n <= 4 ? n : 3);
  const nowBooks = (roadmap.phases[here]?.books || []).map((rb) => {
    if (!rb.bookId) return { key: `t:${rb.title}`, rec: rb };
    const b = byId.get(rb.bookId);
    return b && b.status !== 'done' ? { key: b.id, book: b } : null;
  }).filter(Boolean).sort((a, b) => nowRank(a) - nowRank(b));
  // この 3 か月に読む本を AI 選書で探す下書き（送らない）。
  const nowShown = nowShownOf(nowBooks.length);
  const findDraft = advisorDraftFor(goal.goals, { focus: roadmap.phases[here]?.focus || '' });
  // 作ったときの目標の文と、いまの文が違えば（書き直した）。
  const stale = isRoadmapStale(record, goal.goals);
  // いまの区切りに読む本が無い（最初の 3 か月が過ぎた・読み終えた）＝この 3 か月の本を選ぶ。
  const needBooks = phaseNeedsBooks(roadmap, books, here);
  // 期限を過ぎた目標（1 年たった・2026-11-17）。書き直すと、そこから新しい 1 年の道のりをつくれる。
  const overdue = overdueGoals(goal.goals, appNow());
  // 期限の過ぎた目標の枠に主ボタンがあるときは、ここは文字のボタンだけ（塗りの主ボタンは 1 画面に 1 つ）。
  const quiet = overdue.length > 0 && !stale;
  // 縦に積む文字ボタン（行の中に並べると行の高さで間が広がるので、1 つずつ 1 行に）。
  const linkStyle = { ...btnLink, display: 'flex', width: 'fit-content', marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' };
  const primaryStyle = { ...btnPrimary, marginTop: 'var(--space-4)' };
  // 文字ボタンが 2 つ続くときの 2 つめは上の間を 0 に（押せる高さ 44 どうしが接して、見た目の間は文と同じくらい）。
  const second = { marginTop: 0 };
  const quietColor = { color: btnLinkQuiet.color };
  const isLink = (primary) => !primary || quiet;
  const chooseBtn = (primary, count, label, extra = null) => {
    const link = isLink(primary);
    // 選んでいる途中の文字ボタンは、押せないまま読める色で（薄くしない・2026-11-17 ui-critic）。
    const style = !link
      ? { ...(choosing ? btnPrimaryOff : btnPrimary), marginTop: 'var(--space-4)' }
      : choosing ? { ...linkStyle, color: 'var(--text-2)', opacity: 1, cursor: 'default', ...extra }
      : { ...linkStyle, ...(quiet && !primary ? quietColor : null), ...extra };
    return (
      <button type="button" className={link ? 'rm-link' : undefined} disabled={choosing} aria-busy={choosing || undefined} style={style} onClick={() => choose(count)}>
        {choosing ? '本を選んでいます…' : <>{chooseError ? 'もう一度選ぶ' : label}<span style={{ whiteSpace: 'nowrap' }}>{`（${PHASE_BOOKS_TOKENS_LABEL}）`}</span></>}
      </button>
    );
  };
  const planBtn = (primary, extra = null) => {
    const link = isLink(primary);
    return (
      <button type="button" className={link ? 'rm-link' : undefined} disabled={choosing} style={!link ? { ...(choosing ? btnPrimaryOff : btnPrimary), marginTop: 'var(--space-4)' } : choosing ? { ...linkStyle, color: 'var(--text-2)', opacity: 1, cursor: 'default', ...extra } : { ...linkStyle, ...(quiet && !primary ? quietColor : null), ...extra }} onClick={onPlan}><span style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('読書計画をカレンダーにする')}</span></button>
    );
  };
  // 次の 3 か月の決め方を 1 文で（数は「選ぶ冊数」の説明だけ・遅れ・%・あと N 冊は出さない）。
  const leftN = quarter.leftover.length;
  const paceLine = leftN > 0 && quarter.count === 0
    ? `前の区切りの『${displayTitle(quarter.leftover[0].title)}』${leftN > 1 ? `ほか ${leftN - 1} 冊` : ''}が残っています。この 3 か月は、まずその本から。`
    : quarter.mode === 'rest'
      ? 'この 3 か月は、読みやすい本を 1 冊選びます。'
      : quarter.mode === 'pace'
        ? (quarter.base > quarter.pace.doneCount
          ? `前の 3 か月より 1 冊だけ多い、${quarter.base} 冊を選びます${leftN > 0 ? `（残っている ${leftN} 冊と合わせて）` : ''}。`
          : `1 日 ${record.plan?.minutesPerDay || PLAN_DEFAULT_MINUTES} 分で読める分（${quarter.base} 冊）を選びます${leftN > 0 ? `（残っている ${leftN} 冊と合わせて）` : ''}。`)
        : `1 日 ${record.plan?.minutesPerDay || PLAN_DEFAULT_MINUTES} 分で読める分（${quarter.count} 冊まで）を選びます。`;

  return (
    <>
      <header className="goal-head">
        {/* 目標は畳む（押すとほかの目標と「目標を書き直す」）。期限が過ぎたときは下の枠に主ボタン。 */}
        <GoalTrio goals={goal.goals} compact fold onEdit={onEditGoals && !(overdue.length > 0 && !stale) ? onEditGoals : null} />
        {stale && (
          <p className="goal-peek">{withPhraseBreaks('このロードマップは、前の目標でつくりました。新しい目標に合わせるときは、下の「つくり直す」から。')}</p>
        )}
      </header>

      {overdue.length > 0 && !stale && (
        <section className="goal-box rm-overdue" aria-labelledby="rm-overdue">
          <h3 id="rm-overdue" className="rm-overdue-title">{withPhraseBreaks(`${overdue.map((o) => o.label).join('・')}の目標の期限が過ぎました`)}</h3>
                    {onEditGoals && <button type="button" style={{ ...btnPrimary, marginTop: 'var(--space-3)' }} onClick={onEditGoals}>目標を書き直す</button>}
          {onExtend && (
            <button type="button" className="rm-link" style={{ ...linkStyle, ...quietColor }} onClick={() => onExtend(overdue.map((o) => o.key))}>この目標で続ける</button>
          )}
        </section>
      )}

      {/* いまの 3 か月（はじめての人が最初の画面で「次に何をするか」が分かるように・2026-11-16）。 */}
      <section className="goal-box rm-now" aria-labelledby="rm-now">
        {/* 「いまの 3 か月 · 1〜3 か月目」は同じことを 2 回言っていた＝実際の月だけ添える（2026-11-23 点検）。 */}
        <p id="rm-now" className="goal-sec-title" style={{ margin: 0 }}>{quarterTitleNode(nowQuarterTitle(specs[here]))}</p>
        {roadmap.phases[here]?.focus && <p className="rm-phase-focus" style={{ marginTop: 'var(--space-1)' }}>{withPhraseBreaks(roadmap.phases[here].focus)}</p>}
        {!(needBooks && onChooseBooks) && nowBooks.length > 0 && (
          <div className="rm-books rm-now-books" aria-label="この 3 か月に読む本">
            {nowBooks.slice(0, nowShown).map(({ key, book, rec }) => (book ? (
              <button key={key} type="button" className="rm-book" onClick={() => onOpenBook?.(book)}>
                <MiniCover book={book} width={32} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="rm-book-title">{withPhraseBreaks(`『${displayTitle(book.title)}』`)}</span>
                  <span className="rm-book-author">{STATUS_LABEL[book.status] || ''}</span>
                </span>
                <ChevronRight size="1em" aria-hidden="true" style={{ alignSelf: 'center', color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
            ) : (
              <div key={key} className="rm-book rm-book-rec">
                <MiniCover book={{ id: `rec:${rec.title}`, title: rec.title, cover: rec.cover || '' }} width={32} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="rm-book-title">{withPhraseBreaks(`『${displayTitle(rec.title)}』`)}</span>
                  <span className="rm-book-author">すすめた本（下の道のりから本棚に入れられます）</span>
                </span>
              </div>
            )))}
            {nowBooks.length > nowShown && (
              // 残りは道のりの節へ送る（押せる文字ボタン・残りが 1 冊ならその本も並べる＝2026-11-26 ui-critic）。
              <button type="button" style={{ ...btnLinkQuiet, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }}
                onClick={() => document.getElementById('rm-road')?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
                {`ほか ${nowBooks.length - nowShown} 冊を道のりで見る`}<ChevronRight size="1em" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {needBooks && onChooseBooks ? (
          <>
            {/* 前の 3 か月（ふりかえり・記録があるときだけ）→ 次の 3 か月の決め方 → 選ぶ */}
            {quarter.hasHistory && (
              <dl className="rm-pace" aria-label="前の 3 か月">
                <div>
                  <dt>前の 3 か月に読み終えた本</dt>
                  <dd>{quarter.pace.doneCount > 0
                    ? <>{quarter.pace.doneBooks.slice(0, 3).map((b, i, arr) => <span key={b.id} style={{ display: 'block' }}>{`『${displayTitle(b.title)}』`}{i === arr.length - 1 && quarter.pace.doneCount > 3 ? ` ほか ${quarter.pace.doneCount - 3} 冊` : ''}</span>)}</>
                    : 'ありませんでした'}</dd>
                </div>
                {quarter.pace.minutes > 0 && (
                  <div>
                    <dt>読書の時間</dt>
                    <dd>{fmtHoursMin(quarter.pace.minutes)}</dd>
                  </div>
                )}
              </dl>
            )}
            <p className="rm-now-note">{withPhraseBreaks(paceLine)}</p>
            {chooseError && <p className="rm-now-note" role="alert" style={{ color: 'var(--error)' }}>{withPhraseBreaks(chooseError)}</p>}
            <p role="status" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{choosing ? '本を選んでいます' : ''}</p>
            {quarter.count === 0 ? (
              <>
                {planBtn(true)}
                {chooseBtn(false, 1, 'それでも新しい本を選ぶ', isLink(true) ? second : null)}
              </>
            ) : (
              <>
                {chooseBtn(true, quarter.count, 'この 3 か月の本を選ぶ')}
                {planBooks ? (choosing ? null : planBtn(false, isLink(true) ? second : null)) : hasUnread && !choosing && (
                  <button type="button" className="rm-link" disabled={choosing} style={{ ...linkStyle, ...(quiet ? quietColor : null), ...(isLink(true) ? second : null) }} onClick={onPlan}>本棚の本から選んで読書計画にする</button>
                )}
              </>
            )}
          </>
        ) : planBooks ? (
          planBtn(true)
        ) : (
          <>
            {recsNow > 0 ? (
              <p className="plan-summary">{withPhraseBreaks(`この 3 か月に読む本を ${recsNow} 冊すすめています。本棚に入れると、読書計画のカレンダーに並べられます。`)}</p>
            ) : (
              <>
                <p className="plan-summary">{withPhraseBreaks('この 3 か月に読む本は、まだ決まっていません。AI 選書で探しましょう。')}</p>
                <button type="button" style={{ ...(quiet ? linkStyle : { ...btnPrimary, marginTop: 'var(--space-3)' }), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }} onClick={() => onFindBooks?.(findDraft)}>
                  <Search size="1em" aria-hidden="true" />この 3 か月に読む本を探す
                </button>
              </>
            )}
            {hasUnread && (
              <button type="button" className="rm-link" style={linkStyle} onClick={onPlan}>本棚の本から選んで読書計画にする</button>
            )}
          </>
        )}
        {/* 💬 この 3 か月に取り組むことを相談へ（下書きを入れるだけ・送るまでトークンは使わない・2026-11-23 点検）。 */}
        {onConsult && roadmap.phases[here]?.focus && !choosing && (
          // 記録の「この結果を相談する」と同じ栗色の文字ボタン・左にそろえる（文字が大きいときも「3 か月」を割らない・2026-11-23 点検）。
          <button type="button" className="rm-link" style={{ ...linkStyle, justifyContent: 'flex-start', textAlign: 'left', wordBreak: 'keep-all', overflowWrap: 'anywhere' }} onClick={() => onConsult(consultDraftFor(goal.goals, roadmap.phases[here].focus))}>
            <span>{withPhraseBreaks('この 3\u00a0か月のことを相談する')}</span>
          </button>
        )}
      </section>

      {/* 受け取ったまとめ（作ったときの壁）は、いまの 3 か月の下に（いまの 3 か月を最初の画面に・2026-11-17）。 */}
      {/* AI のまとめは文節で止めずに流す（DESIGN §2・2026-11-18 ui-critic「2 行目が『話を』で止まって右が空いた」） */}
      {record.summary && <p className="goal-summary">{record.summary}</p>}

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
          <h3 id="rm-missing" className="goal-sec-title">ほかに学ぶとよいテーマ</h3>
          <ul className="rm-list">
            {roadmap.missing.map((m) => (
              <li key={m.theme} className="rm-missing">
                <div>
                  <p className="rm-need-name">{withPhraseBreaks(m.theme)}</p>
                  {m.why && <p className="rm-need-why">{m.why}</p>}
                </div>
                <button type="button" style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={() => onFindBooks?.(advisorDraftFor(goal.goals, { theme: m.theme }))}>
                  <Search size="1em" aria-hidden="true" />本を探す
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="goal-sec">
        {(planBooks || hasUnread) && (
          <button type="button" style={btnGhost} onClick={onPlan}><span style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('読書計画をカレンダーにする')}</span></button>
        )}
        <button type="button" style={{ ...btnLinkQuiet, marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={onRebuild}>{`つくり直す（${ROADMAP_TOKENS_LABEL}）`}</button>
        <p className="rm-footnote">{withPhraseBreaks('AI があなたの目標と答えからつくった道のりです。合わないところは「直す」で書き換えられます。')}</p>
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
    autoGrowTextarea(ref.current);
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
  const guardedClose = useGuardedClose(dirty, onClose, { message: 'ロードマップは元のまま残ります。' });
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
      beforeClose={guardedClose}
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
      {lim.max > 1 && <p className="plan-summary">{withPhraseBreaks(`${lim.max} つまで書けます。`)}</p>}
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// 読書計画カレンダー
// ---------------------------------------------------------------------------
function PlanView({ goal, record, books, sessions, onFindBooks, onOpenBook, onRead = null, onAddReadingActions, onRoadmap }) {
  const toast = useToast();
  const today = toLocalYmd(appNow());
  const year = Number(today.slice(0, 4));
  const roadmap = useMemo(() => pruneRoadmapBooks(record.roadmap, books), [record.roadmap, books]);
  const specs = useMemo(() => phaseSpecs(goal.key, record.goalAt || goal.at), [goal.key, record.goalAt, goal.at]);
  const here = currentPhaseIndex(goal.key, record.goalAt || goal.at, appNow());
  const [minutes, setMinutes] = useState(record.plan?.minutesPerDay || PLAN_DEFAULT_MINUTES);
  const speed = useMemo(() => readingSpeedFactor(books, sessions), [books, sessions]);
  // 区切りの始まりは目安（待たない・2026-11-22 点検＝前の本を読み終えたら次の区切りの本へ）。
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

  const savePlan = useCallback((patch) => {
    saveRoadmap(ALL_GOALS_KEY, { ...record, plan: { ...(record.plan || {}), ...patch } });
  }, [record]);

  const pickMinutes = (m) => {
    if (m === minutes) return;
    setMinutes(m);
    savePlan({ minutesPerDay: m });
    track('reading_plan_minutes', { minutes: m });
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
        toast.info?.('ロードマップの順番に戻しました。');
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
              ...(onRoadmap && phaseNeedsBooks(roadmap, books, here) ? [{ label: 'ロードマップで本を選ぶ', onClick: onRoadmap }] : []),
              ...(onFindBooks ? [{ label: 'AI 選書で探す', onClick: () => onFindBooks(advisorDraftFor(goal.goals)) }] : []),
            ]}
          />
        ) : (
          <ErrorMessage
            title="本棚に、まだ読む本がありません"
            description="AI 選書で、この 3 か月に読む本を探しましょう。本棚に入れたら、ここで選べます。"
            actions={[
              ...(onRoadmap && phaseNeedsBooks(roadmap, books, here) ? [{ label: 'ロードマップで本を選ぶ', variant: 'primary', onClick: onRoadmap }] : []),
              ...(onFindBooks ? [{ label: 'この 3 か月に読む本を探す', variant: onRoadmap && phaseNeedsBooks(roadmap, books, here) ? undefined : 'primary', onClick: () => onFindBooks(advisorDraftFor(goal.goals)) }] : []),
            ]}
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
          <p className="goal-peek">{withPhraseBreaks(`いまの 3 か月：${roadmap.phases[here].focus}`)}</p>
        )}
      </header>

      <section aria-labelledby="plan-minutes">
        <h3 id="plan-minutes" className="goal-sec-title">1 日に読む時間</h3>
        <SegChoice label="1 日に読む時間" options={PLAN_MINUTES.map((v) => [v, `${v} 分`])} value={minutes} onChange={pickMinutes} />
        <p className="plan-summary">{`${schedule.length} 冊 · ${fmtMd(last.end, year)} まで`}</p>
      </section>

      {todayBook && (
        <button type="button" className="plan-today" onClick={() => onOpenBook?.(todayBook)}>
          {/* 文字が大きいときは表紙を出さない（本文の列を広く・「『…／』」「まで」が割れていた・2026-11-18 文字最大の点検） */}
          {!largeRootText() && <MiniCover book={todayBook} width={32} />}
          <span className="plan-today-body">
            <span className="plan-today-label">{nowItem ? '今日の本' : `次の本 · ${fmtMd(nextItem.start, year)} から`}</span>
            <span className="plan-today-title">{withPhraseBreaks(`『\u2060${todayBook.title}\u2060』`, { scriptBreaks: true })}</span>
            <span className="plan-today-meta">{nowItem ? <><span style={{ whiteSpace: 'nowrap' }}>{`1 日 ${minutes} 分`}</span>{' · '}<span style={{ whiteSpace: 'nowrap' }}>{`${fmtMd(nowItem.end, year)} まで`}</span></> : withPhraseBreaks('今日は読む本の予定がありません')}</span>
          </span>
          <ChevronRight className="goal-entry-chev" size="1.1em" aria-hidden="true" style={{ marginRight: 'calc(-1 * var(--space-1))' }} />
        </button>
      )}
      {/* ⏱ 今日の本をそのまま読む（1 日に読む時間をタイマーに入れて・2026-11-22 点検＝前は本の詳細へ寄り道が要った）。 */}
      {todayBook && nowItem && onRead && (
        <button type="button" onClick={() => onRead(todayBook, minutes)} style={{ ...btnGhost, marginTop: 'var(--space-2)' }}>
          {`今日の ${minutes} 分を読む`}
        </button>
      )}

      <section className="plan-cal" aria-label="読書計画のカレンダー">
        <div className="plan-cal-head">
          <h3 className="plan-cal-month" aria-live="polite">{m ? `${m.year}\u00a0年 ${m.month + 1}\u00a0月` : ''}</h3>
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
                    const cls = `plan-band${isNow ? ' is-now' : idx % 2 ? ' is-alt' : ''}${b.head ? ' is-head' : ''}${b.tail ? ' is-tail' : ''}${b.head && b.span < 2 && !isNow ? ' is-solo' : ''}`;
                    return (
                      <button
                        key={b.bookId}
                        type="button"
                        className={cls}
                        onClick={() => book && onOpenBook?.(book)}
                        aria-label={`『${book?.title || ''}』 ${fmtRange(item.start, item.end, year)}${isNow ? '（今日の本）' : ''}`}
                        // 本と本の間だけ 4 空ける（週の端では空けない＝週ごとに帯の左端がずれていた・2026-11-18 ui-critic）。
                        style={{
                          left: `calc(${b.col} / 7 * 100% + ${b.head && b.col > 0 ? 'var(--space-1)' : '0px'})`,
                          width: `calc(${b.span} / 7 * 100% - ${b.head && b.col > 0 ? 'var(--space-1)' : '0px'} - ${b.tail && b.col + b.span < 7 ? 'var(--space-1)' : '0px'})`,
                        }}
                      >
                        {(b.head || b.col === 0) && b.span >= 2 && <span>{book?.title || ''}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* 1 日だけの帯は書名が入らないので、週の下に「17 日『書名』」を押せる形で（2026-11-17 点検）。 */}
              {bands.some((b) => b.head && b.span < 2) && (
                <p className="plan-week-note">
                  {bands.filter((b) => b.head && b.span < 2).map((b) => {
                    const book = byId.get(b.bookId);
                    return (
                      <button key={b.bookId} type="button" className="plan-week-note-btn" onClick={() => book && onOpenBook?.(book)}>
                        {`${week[b.col]?.day} 日『${book?.title || ''}』`}
                      </button>
                    );
                  })}
                </p>
              )}
            </div>
          );
        })}
        {!monthHasBooks && (
          <p className="plan-cal-empty">{withPhraseBreaks(nextAfterMonth ? `この月は読む本の予定がありません。次の本は ${fmtMd(nextAfterMonth.start, year)} から。` : 'この月は読む本の予定がありません。')}</p>
        )}
      </section>

      <section className="goal-sec" aria-labelledby="plan-order">
        <div className="plan-order-head">
          <h3 id="plan-order" className="goal-sec-title" style={{ margin: 0 }}>{customOrder ? '読む順番（自分で決めた順）' : '読む順番'}</h3>
          <button type="button" style={{ ...btnLink, fontSize: 'var(--text-meta)', paddingRight: 0 }} onClick={() => setOrdering(true)}>順番を変える</button>
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
                          <span>{x.days > 1 ? `${fmtSpan(x.days)} · 合わせて ${fmtHoursMin(x.minutes)}` : `残り ${fmtHoursMin(x.minutes)}`}</span>
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

      {/* 「読み始める日を行動に追加」は 2026-11-16 にやめた（オーナー「不要じゃない？」＝行動は読んで相談して決める）。 */}
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
  const guardedClose = useGuardedClose(dirty, onClose, { message: '読む順番は元のまま残ります。' });
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
      beforeClose={guardedClose}
      dismissLabel="キャンセル"
      footer={(
        <button type="button" style={dirty && order.length ? btnPrimary : btnPrimaryOff} disabled={!dirty || !order.length} onClick={() => onSave(order)}>保存</button>
      )}
    >
      <p className="plan-summary" style={{ marginTop: 0 }}>{withPhraseBreaks('上から順に、今日から読みます。')}</p>
      <ol className="plan-sort" aria-label="読む順番">
        {order.map((id, i) => {
          const b = byId.get(id);
          if (!b) return null;
          return (
            <li key={id} className="plan-sort-row">
              <MiniCover book={b} width={32} />
              <span className="plan-sort-title">{withPhraseBreaks(`『${b.title}』`)}</span>
              {/* 押す 4 つは書名の下の右にまとめる（横に並べると書名が「ファシリテータ／ー」と割れていた・2026-11-25）。 */}
              <span className="plan-sort-btns">
                {/* いちばん上へ 1 回で（6 冊目を先頭にするのに ↑ を 5 回押していた・2026-11-25 点検）。2 冊目までは ↑ で足りるので場所だけ取る。 */}
                <button type="button" className="rm-icon-btn" onClick={() => setOrder((o) => [id, ...o.filter((x) => x !== id)])} disabled={i < 2} style={i < 2 ? { visibility: 'hidden' } : undefined} aria-hidden={i < 2 || undefined} tabIndex={i < 2 ? -1 : undefined} aria-label={`『${b.title}』をいちばん上へ`}><ChevronsUp size={20} aria-hidden="true" /></button>
                <button type="button" className="rm-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`『${b.title}』を上へ`}><ChevronUp size={20} aria-hidden="true" /></button>
                <button type="button" className="rm-icon-btn" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`『${b.title}』を下へ`}><ChevronDown size={20} aria-hidden="true" /></button>
                <button type="button" className="rm-icon-btn" onClick={() => setOrder((o) => o.filter((x) => x !== id))} aria-label={`『${b.title}』を外す`}><X size={20} aria-hidden="true" /></button>
              </span>
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
