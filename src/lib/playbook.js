// 📕 playbook.js — 営業プレイブックの正典コード化（純関数のみ・副作用なし）。
//
// company/sales-playbook-owner.md の「曜日台本 / if-thenルール / 凍結ゲート /
// 出荷チェックリスト / 最小標本ゲート」をデータ駆動で評価できる形にしたもの。
// ダッシュボード（AdminDashboard / TodayCard）はここを消費するだけで、
// 判定ロジックを UI 側に書かない。文書を改訂したらこのファイルも更新する。
//
// 設計原則（19エージェント設計・レッドチーム裁定済み）:
//   - n 不足の率は計算しない（「x/n 収集中」を返す）。0% と「データ無し」を混同しない。
//   - todayAction は決定的（同じ入力 → 同じ出力。ランダム・時刻依存の揺らぎ禁止）。
//   - 司令が空になる状態は構造的に無い（L4 曜日台本が常に存在する）。

// ── 最小標本ゲート。これ未満の分母で「率」を語らない（統計ノイズで誤誘導するため）。
export const MIN_N = {
  cvr: 200,        // CVR 判断に必要な paywall_viewed
  recall: 20,      // 初週想起体験率に必要な週間登録者
  churn: 20,       // チャーンに必要な月初有料会員
  annual: 10,      // 年額比率に必要な課金者
  pace: 10,        // マイルストーンペース% を出すのに必要な有料会員
};

// ── 曜日台本（週6.5時間の配分）。dayIdx = Date#getDay()（0=日）。
export function weekdayScript(dayIdx) {
  if (dayIdx === 0) {
    return [
      { time: '任意', title: 'note 1本（下書き85分＋推敲25分）', mins: 110 },
      { time: '夜', title: '営業タブに今週のKPIを入力', mins: 10 },
    ];
  }
  if (dayIdx === 6) {
    return [
      { time: '任意', title: '来週の平日X 5本を下書き（実数のみ・立証できない数字は書かない）', mins: 60 },
      { time: '任意', title: 'スプリント枠 or note推敲・裏取り・翌週仕込み', mins: 60 },
    ];
  }
  return [
    { time: '7:25', title: '前夜の下書きを投稿', mins: 5 },
    { time: '21:30', title: 'リプ営業（日替わり検索語→悩みポストに経験談リプ最大5件・リンク禁止・固有の一文必須）', mins: 15 },
    { time: '21:45', title: '翌朝の下書き1本（月水金=読書実践/火=build in public/木=読みっぱなし言語化）', mins: 10 },
  ];
}

// リプ営業の日替わり検索語（プレイブック §B）。dayIdx で決定的にローテーション。
export const REPLY_SEARCH_TERMS = ['本 忘れる', '読書メモ 続かない', '積読 罪悪感', '読書 身につかない', '本 内容 思い出せない'];
export function replyTermOf(date) {
  // 決定的: 年内通算日でローテーション（同じ日は常に同じ語）。
  const start = new Date(date.getFullYear(), 0, 0);
  const doy = Math.floor((date - start) / 86400000);
  return REPLY_SEARCH_TERMS[doy % REPLY_SEARCH_TERMS.length];
}

// ── 出荷チェックリスト（配信前モードの主役）。id は localStorage のチェック保存キー。
export const SHIP_CHECKLIST = [
  { id: 'sbp', title: 'Small Business Program 加入確認（未加入なら即申請 — 手残り¥800→¥910/人）' },
  { id: 'price_env', title: 'Vercel env: 価格ラベル3変数（VITE_PRICE_MONTHLY_LABEL 等）を実価格に設定' },
  { id: 'grace', title: 'App Store Connect: Billing Grace Period を ON' },
  { id: 'demo_account', title: '審査用デモアカウントを用意（App Review 情報に記載）' },
  { id: 'apns_prod', title: 'APNS_PRODUCTION=true へ切替（本番プッシュ）' },
  { id: 'store_url', title: 'VITE_APP_STORE_URL を実 URL に差替（LP/Paywall/設定の導線）' },
  { id: 'verify_rls', title: 'supabase_verify_rls.sql を実行し RLS 全テーブル有効を確認' },
  { id: 'email_confirm', title: 'Supabase: Email confirmation / Secure email change を ON' },
  { id: 'rc_webhook', title: 'RevenueCat webhook の本番疎通確認（テスト購入→subscriptions 反映）' },
  { id: 'export_delete', title: 'データエクスポート / アカウント削除を実機で最終確認' },
  { id: 'sales_sql', title: 'supabase_ops_sales_metrics.sql / canceled_at.sql を本番 DB に適用' },
  { id: 'launch_thread', title: 'X 固定スレッド5連を実数で完成（素材集③）・note末尾CTA定型を保存' },
];

// ── ローンチスプリント W1〜W4（配信直後の土日 240分×2 の割当）。
export const SPRINT_WEEKS = [
  { week: 'W1', items: ['配信前4点の残り消化', 'paywall 計測の実機確認（60分）', '年額ファースト Paywall + deploy（90分）', 'X 下書き（30分）'] },
  { week: 'W2', items: ['通知の二段プロンプト（60分）', '当日夜・即席想起の特例（120分）', 'recall 計測確認（30分）', 'X 下書き（30分）'] },
  { week: 'W3', items: ['note 復帰 1本（110分）', 'キャンペーンリンク統一（30分）', 'X 固定スレッド公開（45分）', 'X 下書き（55分）'] },
  { week: 'W4', items: ['note 1本（110分）', 'KGI 追補・Intro ルール文書化（40分）', 'CTA 定型・キーワード実測（ラッコキーワード＋Google 1ページ目実査・40分）', 'X 下書き（50分）'] },
];

// ── 凍結ゲート（数値到達で解凍する施策）。paid = 現在の有料会員数。
export function freezeGates(paid) {
  return [
    { id: 'paid_note', title: '有料note（10/1判定: 30人以上→透明性型¥980 / 未満→読書法型）', gate: 30, unlocked: paid >= 30 },
    { id: 'churn_push', title: '解約者への情報提供プッシュ・月次読書脳レポート', gate: 30, unlocked: paid >= 30 },
    { id: 'video', title: '動画テスト外注（3人×3本・¥36,000）', gate: 150, unlocked: paid >= 150 },
    { id: 'referral', title: '紹介プログラム実装（D30実測も必要）', gate: 150, unlocked: paid >= 150 },
  ];
}

// ── if-then ルールをデータ駆動で評価する。
// 入力 data:
//   phase: 'prelaunch' | 'live'
//   weekly: ops_sales_metrics の行（新しい順）
//   paid: 有料会員数 / events: 累計イベント数 {paywall_viewed, checkout_completed, ...}
// 出力: [{ id, state: 'fired'|'ok'|'insufficient'|'prelaunch', text, action }]
//   fired = 発火（処方箋を実行）/ ok = 正常 / insufficient = 分母不足で判定保留。
export function evaluateRules({ phase, weekly = [], paid = 0, events = {} }) {
  const out = [];
  const push = (id, state, text, action) => out.push({ id, state, text, action });
  const rows = [...weekly].sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)));
  const sum = (arr, k) => arr.reduce((a, r) => a + (Number.isFinite(r?.[k]) ? r[k] : 0), 0);

  if (phase === 'prelaunch') {
    // 配信前はメトリクスルールを一切評価しない（0 データで誤発火させない）。
    push('prelaunch', 'prelaunch', '配信前 — メトリクスの判定は配信後に自動で始まります', '出荷チェックリストを消化する');
    return out;
  }

  // R-CVR: paywall_view 累計 < 200 → CVR 判断・Paywall 大改修を禁止（vetoでもある）。
  const pv = events.paywall_viewed || 0;
  const cc = events.checkout_completed || 0;
  if (pv < MIN_N.cvr) {
    push('cvr', 'insufficient', `CVR は判定保留（paywall表示 ${pv}/${MIN_N.cvr} 収集中）`, 'CVR を理由にした Paywall 変更をしない。計測を続ける');
  } else {
    const cvr = cc / pv;
    if (cvr >= 0.05) push('cvr', 'fired', `CVR ${(cvr * 100).toFixed(1)}%（≥5%・十分高い）`, 'オファー変更禁止。週末開発枠を流入側（note/X/ASO）に全振り');
    else if (cvr < 0.02) push('cvr', 'fired', `CVR ${(cvr * 100).toFixed(1)}%（<2%）`, '価値プレビュー改善 → 改善しなければ年額のみ初年度¥9,800 Intro Offer を検討（月額intro・無料トライアル・期間煽りは禁止）');
    else push('cvr', 'ok', `CVR ${(cvr * 100).toFixed(1)}%（2〜5%）`, '凍結中のUI改善を順に解凍: ①3コマ価値プレビュー ②オンボ1行メモ体験');
  }

  // R-新規ペース: 直近4週の新規課金 < 今月マイルストーン増分の50%。
  const last4 = rows.slice(0, 4);
  const paid4 = sum(last4, 'new_paid');
  if (rows.length >= 2) {
    const need = monthlyMilestoneNeed(new Date());
    if (need > 0 && paid4 < need * 0.5) {
      push('newpaid', 'fired', `新規課金が直近4週 ${paid4}人 — 今月目標増分 ${need}人の50%未満`, '翌月は比較記事（最も課金に近い）を月2本に増やし、ストーリー記事を1回休む');
    } else if (need > 0) {
      push('newpaid', 'ok', `新規課金ペース: 直近4週 ${paid4}人 / 今月目標増分 ${need}人`, '');
    }
  } else {
    push('newpaid', 'insufficient', `週次実績が ${rows.length}/2 週分 — 収集中`, '日曜のKPI入力を続ける');
  }

  // R-note CTR: 2週連続 lp_clicks/note_pv < 2%（分母が小さすぎる週は無効）。
  const ctr = (r) => (r?.note_pv >= 100 && r?.lp_clicks != null ? r.lp_clicks / r.note_pv : null);
  const c0 = ctr(rows[0]); const c1 = ctr(rows[1]);
  if (c0 != null && c1 != null) {
    if (c0 < 0.02 && c1 < 0.02) push('notectr', 'fired', `note→LP クリック率が2週連続2%未満（${(c0 * 100).toFixed(1)}% / ${(c1 * 100).toFixed(1)}%）`, 'CTA を記事末→中間にも追加し、文言を「悩み文脈」に書き換える');
    else push('notectr', 'ok', `note CTR 直近 ${(c0 * 100).toFixed(1)}%`, '');
  } else {
    push('notectr', 'insufficient', 'note CTR は判定保留（週PV 100未満 or 未入力）', '');
  }

  // R-install→課金: 直近4週合計 installs≥30 で 3% 未満。
  const inst4 = sum(last4, 'installs');
  if (inst4 >= 30) {
    const r = paid4 / inst4;
    if (r < 0.03) push('inst2paid', 'fired', `install→課金が直近4週 ${(r * 100).toFixed(1)}%（基準3%）`, 'ペイウォール手前の価値プレビュー改善 → 7日無料（Intro）の AB を検討');
    else push('inst2paid', 'ok', `install→課金 ${(r * 100).toFixed(1)}%`, '');
  } else {
    push('inst2paid', 'insufficient', `install→課金は判定保留（install ${inst4}/30 収集中）`, '');
  }

  // R-note PV 横ばい: 8週分そろってから。
  const pv4 = sum(rows.slice(0, 4), 'note_pv'); const pvPrev4 = sum(rows.slice(4, 8), 'note_pv');
  if (rows.length >= 8 && pvPrev4 > 0) {
    if (pv4 <= pvPrev4) push('notepv', 'fired', `note PV 横ばい（直近4週 ${pv4} ≤ 前4週 ${pvPrev4}）`, 'SEO キーワード再選定（検索ボリュームのある悩み語へ）');
    else push('notepv', 'ok', `note PV 成長中（${pvPrev4} → ${pv4}）`, '');
  }

  // R-凍結ゲート情報（発火ではなく到達通知）。
  freezeGates(paid).forEach((g) => {
    if (g.unlocked) push(`gate_${g.id}`, 'fired', `凍結解除: ${g.title}（有料 ${paid}人 ≥ ${g.gate}人）`, 'プレイブックの解凍手順に着手');
  });

  return out;
}

// 今月のマイルストーン増分（月次目標 − 前月目標）。戦略文書を改訂したらここも更新。
export const SALES_MILESTONES = [
  ['2026-07', 5], ['2026-08', 15], ['2026-09', 30], ['2026-10', 50], ['2026-11', 75], ['2026-12', 100],
  ['2027-03', 150], ['2027-06', 300], ['2027-09', 550], ['2027-12', 1000],
];
export function monthlyMilestoneNeed(date) {
  const ymKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const idx = SALES_MILESTONES.findIndex(([k]) => k === ymKey);
  if (idx < 0) return 0;
  const prev = idx > 0 ? SALES_MILESTONES[idx - 1][1] : 0;
  return Math.max(0, SALES_MILESTONES[idx][1] - prev);
}

// 週の起点（月曜）を YYYY-MM-DD で。ops_sales_metrics のキーと同一規約。
export function weekStartISO(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 配信からの経過でスプリント週（W1〜W4）を判定。それ以降・未配信は null。
export function sprintWeekOf(launchDate, today = new Date()) {
  if (!launchDate) return null;
  const start = new Date(`${launchDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || today < start) return null;
  const w = Math.floor((today - start) / (7 * 86400000));
  return w >= 0 && w < SPRINT_WEEKS.length ? SPRINT_WEEKS[w] : null;
}

// ── 🎯 今日の一手（Next Best Action）。決定的な優先順位ラティス。
//   L0 ⛔禁止（司令ではなく表示のみ）→ L1 観測欠損 → L2 if-then発火 → L3 フェーズ →
//   L4 曜日台本（常に存在＝司令が空になることは無い）。
// ctx: { today: Date, phase, launchDate, weekly, rules, shipChecks: {id:bool}, salesInputStale }
export function todayAction(ctx) {
  const { today, phase, launchDate, rules = [], shipChecks = {}, weekly = [] } = ctx;
  const dayIdx = today.getDay();
  const script = weekdayScript(dayIdx);

  // L0: ⛔ 禁止事項（vetoes）。司令にはならないが常に添える。
  const vetoes = rules.filter((r) => r.state === 'insufficient' && r.id === 'cvr').map(() => 'CVR を理由にした Paywall 変更（view 200未満）');
  const cvrHigh = rules.find((r) => r.id === 'cvr' && r.state === 'fired' && r.text.includes('≥5%'));
  if (cvrHigh) vetoes.push('オファー変更（CVR≥5% — 触らない）');

  // L3(prelaunch): 出荷チェックリスト未完了の先頭 1 件が最優先。
  if (phase === 'prelaunch') {
    const next = SHIP_CHECKLIST.find((c) => !shipChecks[c.id]);
    if (next) {
      return { headline: next.title, mins: null, why: `出荷チェックリスト（残り ${SHIP_CHECKLIST.filter((c) => !shipChecks[c.id]).length} 件）— 配信が全ての前提`, vetoes, script, source: 'ship' };
    }
    return { headline: '出荷チェックリスト完了。審査提出 → 配信日を設定して「配信開始」に切替', mins: null, why: '配信前の準備は完了', vetoes, script, source: 'ship' };
  }

  // L1: 観測欠損 — 当週 KPI 未入力のまま日曜夜 or 週越え。
  const curWeek = weekStartISO(today);
  const hasCurrent = weekly.some((r) => r.week_start === curWeek && r.new_paid != null);
  const lastWeekMonday = weekStartISO(new Date(today.getTime() - 7 * 86400000));
  const hasLast = weekly.some((r) => r.week_start === lastWeekMonday);
  if ((dayIdx === 0 && today.getHours() >= 21 && !hasCurrent) || (!hasLast && weekly.length > 0)) {
    return { headline: '営業タブに今週のKPI 5つを入力する（10分）', mins: 10, why: '観測が欠けると全ての判定が止まる', vetoes, script, source: 'kpi' };
  }

  // L2: if-then 発火（固定優先順: チャーン > CVR > 想起 > install > 年額 > その他）。
  const order = ['churn', 'cvr', 'recall', 'inst2paid', 'newpaid', 'notectr', 'notepv'];
  const fired = rules
    .filter((r) => r.state === 'fired' && !r.id.startsWith('gate_') && r.action)
    .sort((a, b) => {
      const ia = order.indexOf(a.id); const ib = order.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  // CVR≥5% の fired は「順調・全振り」情報なので司令はスプリント/台本へ流す。
  const actionable = fired.find((r) => !(r.id === 'cvr' && r.text.includes('≥5%')));
  if (actionable) {
    return { headline: actionable.action, mins: null, why: `${actionable.text}（ルール: ${actionable.id}）`, vetoes, script, source: 'rule' };
  }

  // L3(live): スプリント週のタスク。
  const sprint = sprintWeekOf(launchDate, today);
  if (sprint && (dayIdx === 0 || dayIdx === 6)) {
    return { headline: `${sprint.week} スプリント: ${sprint.items.join(' / ')}`, mins: 240, why: 'ローンチスプリント（土日枠）', vetoes, script, source: 'sprint' };
  }

  // L4: 曜日台本（常に存在）。
  const first = script[0];
  return { headline: `台本どおり: ${first.title}`, mins: script.reduce((a, s) => a + s.mins, 0), why: '発火中の警告なし。異常なし、台本どおりに', vetoes, script, source: 'script' };
}
