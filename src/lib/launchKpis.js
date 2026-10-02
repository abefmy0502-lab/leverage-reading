// 🚀 ローンチの 4 つの数字（2026-10-02 オーナー承認・2026 年 11 月ローンチ）。
//
// 運営ダッシュボードの「ローンチの 4 つの数字」カードの中身（RPC admin_launch_kpis の
// 返り値 → 画面に出す形）。集計は supabase_admin_launch_kpis.sql、定義と読み方は
// docs/launch-kpis.md。ここは数え方を持たない（並べ方・割合・目標との比べ方だけ）。

// 4 つの数字の定義（順番もこのまま画面に出す）。target は既定の目標（%）。
export const LAUNCH_KPIS = [
  {
    key: 'first_consult',
    col: ['初日に', '相談'], // 週ごとの表の列の見出し（2 行・390 幅に収める）
    label: '初日に相談を体験した人',
    short: '初日に相談',
    target: 50,
    basis: '登録から 24 時間以内に相談を送った人 ÷ 登録から 24 時間たった人',
    action: '初回の体験（オンボーディング）を直す: 初回ガイドの最後で相談に連れて行く・相談例を 1 タップで送れるように',
  },
  {
    key: 'memos10',
    col: ['メモ', '10 件'],
    label: '7 日でメモ 10 件の人',
    short: '7 日でメモ 10 件',
    target: 30,
    basis: '登録から 7 日以内にメモが 10 件以上になった人 ÷ 登録から 7 日たった人',
    action: '取り込み（ブクログ・読書メーター）と写真から書き起こしを前に出す: 初日クイックスタートとホームの「はじめの一歩」で案内',
  },
  {
    key: 'd30',
    col: ['30 日後', ''],
    label: '30 日後も使っている人',
    short: '30 日後も使う',
    target: 25,
    basis: '登録から 30〜37 日目に 1 回でも使った人 ÷ 登録から 37 日たった人',
    action: '思い出しカードと通知（思い出しの通知・行動の期限の通知）の許可を取りに行く・届く頻度を見直す',
  },
  {
    key: 'trial_paid',
    col: ['無料', '→有料'],
    label: '7 日間無料 → 有料の人',
    short: '7 日間無料 → 有料',
    target: 40,
    basis: '7 日間無料を始めて 8 日たった人のうち、有料に進んだ人',
    action: '有料プランの画面（ペイウォール）と価格を見直す: 無料期間中に相談の価値が届いているか・終わる前の案内',
  },
];

// これより少ない分母では、割合を「参考」として出す（1 人で大きく振れるため）。
export const MIN_DEN = 10;

// 目標（%）を端末に覚える（運営は 1 人・1 台なので ops_goals のような表は作らない）。
export const TARGETS_KEY = 'orime-ops-launch-targets';

export function defaultTargets() {
  return Object.fromEntries(LAUNCH_KPIS.map((k) => [k.key, k.target]));
}

function clampTarget(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(1, n));
}

// 保存された目標を既定とまぜる（壊れた値・範囲外は既定に戻す）。
export function mergeTargets(saved) {
  const base = defaultTargets();
  if (!saved || typeof saved !== 'object') return base;
  for (const k of Object.keys(base)) {
    const v = clampTarget(saved[k]);
    if (v != null) base[k] = v;
  }
  return base;
}

export function loadTargets(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(TARGETS_KEY);
    return mergeTargets(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultTargets();
  }
}

export function saveTargets(targets, storage = globalThis.localStorage) {
  const merged = mergeTargets(targets);
  try { storage?.setItem(TARGETS_KEY, JSON.stringify(merged)); } catch { /* 保存できなくても画面は動く */ }
  return merged;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

// 割合（%・整数）。分母が 0 なら null（＝データなし）。
export function pctOf(n, d) {
  const den = num(d);
  if (den === 0) return null;
  return Math.round((num(n) / den) * 100);
}

// 目標と比べた状態: 'nodata'（分母 0）/ 'few'（分母が MIN_DEN 未満＝参考）/ 'ok'（目標以上）/ 'below'（目標未満）。
export function kpiState(pct, den, target) {
  if (pct == null || num(den) === 0) return 'nodata';
  if (num(den) < MIN_DEN) return 'few';
  return pct >= target ? 'ok' : 'below';
}

// '2026-10-26' → '10/26'
export function weekLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return `${Number(m[2])}/${Number(m[3])}`;
}

// RPC の返り値 → 画面に出す形。data が無ければ null。
//   totals: [{ key, label, short, num, den, pending, pct, target, state, from, to, basis, action }]
//   cohorts: [{ week, label, signups, cells: { key: { num, den, pending, pct, started? } } }]（新しい週が先）
//   trialHistory: 契約の履歴（subscription_events）の表があるか
//   trialHasData: 7 日間無料を始めた記録が 1 件でもあるか（無ければ ④ は「データなし」）
export function normalizeLaunchKpis(data, targets = defaultTargets()) {
  if (!data || typeof data !== 'object') return null;
  const src = data.sources || {};
  const trialHistory = !!src.trial_history;
  const trialHasData = trialHistory && num(src.trial_starts) > 0;
  const totals = LAUNCH_KPIS.map((def) => {
    const t = (data.totals && data.totals[def.key]) || {};
    const noTrial = def.key === 'trial_paid' && !trialHasData;
    const den = noTrial ? 0 : num(t.den);
    const pct = noTrial ? null : pctOf(t.num, den);
    const target = targets[def.key] ?? def.target;
    return {
      ...def,
      num: noTrial ? 0 : num(t.num),
      den,
      pending: noTrial ? 0 : num(t.pending),
      pct,
      target,
      state: kpiState(pct, den, target),
      from: t.from || '',
      to: t.to || '',
      noTrialHistory: def.key === 'trial_paid' && !trialHistory,
    };
  });
  const cohorts = (Array.isArray(data.cohorts) ? data.cohorts : []).map((c) => {
    const cells = {};
    for (const def of LAUNCH_KPIS) {
      const v = c?.[def.key] || {};
      const noTrial = def.key === 'trial_paid' && !trialHasData;
      cells[def.key] = {
        num: noTrial ? 0 : num(v.num),
        den: noTrial ? 0 : num(v.den),
        pending: noTrial ? 0 : num(v.pending),
        pct: noTrial ? null : pctOf(v.num, v.den),
        ...(def.key === 'trial_paid' ? { started: noTrial ? 0 : num(v.started) } : {}),
      };
    }
    return { week: c?.week || '', label: weekLabel(c?.week), signups: num(c?.signups), cells };
  });
  return { totals, cohorts, trialHistory, trialHasData, generatedAt: data.generated_at || null };
}

// 表の 1 マス: 上の行（割合）と下の行（人数）。分母 0 で判定待ちがあれば「待ち」と待っている人数、
// 何も無ければ「—」。
export function cellText(cell) {
  if (!cell) return { main: '—', sub: '' };
  if (cell.den === 0) return cell.pending > 0 ? { main: '待ち', sub: `${cell.pending} 人` } : { main: '—', sub: '' };
  return { main: `${cell.pct}%`, sub: `${cell.num}/${cell.den}` };
}

// 目標に届いていない数字の「次にやること」（if-then）。分母が少ない間は出さない。
export function launchActions(totals) {
  return (totals || []).filter((t) => t.state === 'below').map((t) => ({ key: t.key, label: t.label, pct: t.pct, target: t.target, action: t.action }));
}
