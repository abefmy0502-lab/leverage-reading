// 🗄 Supabase に流す SQL を 1 本にまとめる（2026-10-10 オーナー「これを見れば全てできる状態に」）。
//   node scripts/sql-bundle.mjs        → supabase_all_in_order.sql を書き直す
//   node scripts/sql-bundle.mjs --check → 書き直しが要るなら 1 で終わる（テストが使う）
// 並びは依存の順（表 → それを使う表・関数 → 運営の集計）。どのファイルも何度流しても壊れない（冪等）。
// 手順と、まとめに入れないファイルの理由は docs/sql-runbook.md。
// 新しい supabase_*.sql を足したら、ORDER か EXCLUDED のどちらかに必ず入れる（sqlBundle.test.js が確かめる）。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BUNDLE = 'supabase_all_in_order.sql';

// [ファイル, 何のため（手順書と同じ短い名前）]
export const ORDER = [
  // 1. 本・メモ
  ['supabase_books_isbn.sql', '本の ISBN・ASIN'],
  ['supabase_added_via.sql', '本の追加のしかた＋表紙の置き場'],
  ['supabase_book_covers_bucket.sql', '表紙の置き場の権限'],
  ['supabase_books_cover_isbn.sql', '表紙を取った ISBN'],
  ['supabase_normalize_urls.sql', '表紙の http を https に'],
  ['supabase_books_source_query.sql', 'AI 選書の相談を本に引き継ぐ'],
  ['supabase_books_setup_fields.sql', '課題・仮説・選書理由'],
  ['supabase_books_reading_progress.sql', 'ページ数（裏で使う）'],
  ['supabase_books_brief.sql', 'この本で学べること'],
  ['supabase_book_collections.sql', '本棚のフォルダ'],
  ['supabase_chat_messages.sql', '相談の会話'],
  ['supabase_recall_memory.sql', '思い出しカードの間隔'],
  ['supabase_core_indexes.sql', '本・メモの読み込みを速く'],
  ['supabase_advisor_sessions.sql', '過去の AI 選書'],
  ['supabase_theme_reports.sql', '（廃止した機能の保存先・書き出し用に残す）'],
  ['supabase_reading_sessions.sql', '読む（集中モード）の読書の時間'],
  // 2. 行動
  ['supabase_actions_full.sql', '行動の期限・繰り返し・ふりかえり'],
  ['supabase_actions_id_default.sql', '行動の id'],
  ['supabase_actions_completed_at_backfill.sql', '昔の完了日を埋める'],
  ['supabase_actions_scheduled.sql', '繰り返しの次回分'],
  // 3. 通知
  ['supabase_push_subscriptions.sql', '通知の登録'],
  ['supabase_push_native.sql', 'iPhone の通知'],
  ['supabase_push_deadline.sql', '行動の期限の通知'],
  // 4. 契約・お金
  ['supabase_subscriptions.sql', '契約'],
  ['supabase_subscriptions_provider.sql', 'App Store の契約'],
  ['supabase_subscriptions_provider_backfill.sql', '昔の契約の種類を埋める'],
  ['supabase_subscriptions_canceled_at.sql', '解約した日'],
  ['supabase_stripe_events.sql', 'Web の決済の二重処理を防ぐ'],
  ['supabase_revenuecat_events.sql', 'App Store の決済の二重処理を防ぐ'],
  ['supabase_subscription_events.sql', '契約の履歴（7 日間無料 → 有料）'],
  // 5. AI の量
  ['supabase_ai_usage.sql', 'AI の利用回数'],
  ['supabase_ai_usage_atomic.sql', 'AI の上限を同時に超えない'],
  ['supabase_ai_usage_release.sql', '答えられなかった回を返す'],
  ['supabase_ai_rate_limit.sql', 'AI の連打を止める'],
  ['supabase_ai_cost.sql', 'AI の原価をトークンで数える'],
  ['supabase_ai_token_credits.sql', 'トークンの買い足し'],
  // 6. 計測・問い合わせ・退会
  ['supabase_analytics_events.sql', '利用状況の記録'],
  ['supabase_feedback.sql', 'フィードバック'],
  ['supabase_feedback_hardening.sql', 'フィードバックの守り'],
  ['supabase_account_deletion.sql', '退会の申し込み'],
  ['supabase_account_deletion_hardening.sql', '退会の申し込みの守り'],
  ['supabase_lp_events.sql', '紹介ページの記録'],
  ['supabase_lp_waitlist.sql', '公開のお知らせの登録'],
  // 7. 守り（上の表がそろってから）
  ['supabase_security_hardening.sql', '本・メモ・行動・写真の権限'],
  // 8. 運営ダッシュボード（上の表をすべて使う・この順）
  ['supabase_admin_metrics.sql', '運営ダッシュボード（管理者の登録つき）'],
  ['supabase_admin_ops.sql', '目標・チケット'],
  ['supabase_admin_growth.sql', '継続率'],
  ['supabase_admin_exclude_admins.sql', '自分の利用を数えない'],
  ['supabase_admin_members_tasks.sql', '会員の内訳・売上'],
  ['supabase_ops_advisor.sql', '参謀の会話'],
  ['supabase_ops_floor.sql', '作戦司令室の報告'],
  ['supabase_ops_sales_metrics.sql', '営業の週の数字'],
  ['supabase_admin_launch_kpis.sql', 'ローンチの 4 つの数字'],
];

// まとめに入れないもの（理由は docs/sql-runbook.md §4）。
export const EXCLUDED = {
  'supabase_verify_rls.sql': '確かめるだけ（最後に別に流す）',
  'supabase_books_unique_isbn.sql': '先に重複を整理しないと失敗する（任意）',
  'supabase_books_cover_reset.sql': '表紙を消す一度きりの直し（流さない）',
  'supabase_migration_memo_texts.sql': '消した機能の表（流さない）',
};

// ── 前からある表に足りない列を足す（2026-10-10・本番の push_subscriptions が別の形で前から作られていて
//   「column "enabled" does not exist」で止まった）。CREATE TABLE IF NOT EXISTS は表があると何もしないので、
//   そのすぐ後ろに、定義にある列ごとの ADD COLUMN IF NOT EXISTS と、表の UNIQUE(…) の一意の索引を足す。
//   NOT NULL は DEFAULT があるときだけ残す（既にある行があると付けられない）。PRIMARY KEY・列の UNIQUE は外す。
const SKIP_FIRST = new Set(['constraint', 'unique', 'primary', 'check', 'foreign', 'exclude', 'like']);

function stripLineComments(sql) {
  return sql.split('\n').map((l) => {
    let inStr = false;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === "'") inStr = !inStr;
      else if (!inStr && l[i] === '-' && l[i + 1] === '-') return l.slice(0, i);
    }
    return l;
  }).join('\n');
}

function splitTopLevel(body) {
  const parts = []; let depth = 0; let cur = ''; let inStr = false;
  for (const ch of body) {
    if (ch === "'") inStr = !inStr;
    if (!inStr) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function columnBackfill(table, body) {
  const out = [];
  const bare = table.replace(/^.*\./, '').replace(/"/g, '');
  for (const part of splitTopLevel(stripLineComments(body))) {
    const first = part.split(' ')[0].toLowerCase();
    if (first === 'unique') {
      const m = part.match(/^unique\s*\(([^)]+)\)/i);
      if (m) {
        const cols = m[1].split(',').map((c) => c.trim());
        out.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${bare}_${cols.join('_')}_bundle_uq ON ${table} (${cols.join(', ')});`);
      }
      continue;
    }
    if (SKIP_FIRST.has(first)) continue;
    const name = part.split(' ')[0];
    let def = part.slice(name.length).trim()
      .replace(/\bprimary key\b/ig, '')
      .replace(/\bunique\b(?!\s*\()/ig, '');
    if (!/\bdefault\b/i.test(def)) def = def.replace(/\bnot null\b/ig, '');
    def = def.replace(/\s+/g, ' ').trim();
    out.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${def};`);
  }
  return out;
}

export function withColumnBackfill(sql) {
  const re = /create\s+table\s+if\s+not\s+exists\s+([\w."]+)\s*\(/ig;
  let result = ''; let last = 0; let m;
  while ((m = re.exec(sql))) {
    // 閉じかっこを探す（文字列とコメントの中のかっこは数えない）
    let i = re.lastIndex; let depth = 1; let inStr = false;
    for (; i < sql.length && depth > 0; i++) {
      const ch = sql[i];
      if (!inStr && ch === '-' && sql[i + 1] === '-') { const nl = sql.indexOf('\n', i); i = nl < 0 ? sql.length : nl; continue; }
      if (ch === "'") inStr = !inStr;
      else if (!inStr && ch === '(') depth++;
      else if (!inStr && ch === ')') depth--;
    }
    const body = sql.slice(re.lastIndex, i - 1);
    const semi = sql.indexOf(';', i);
    if (semi < 0) continue;
    const lines = columnBackfill(m[1], body);
    result += sql.slice(last, semi + 1);
    if (lines.length) result += `\n-- （まとめが自動で足した: 前からある表に足りない列を足す）\n${lines.join('\n')}`;
    last = semi + 1;
    re.lastIndex = semi + 1;
  }
  return result + sql.slice(last);
}

export function buildBundle(read = (f) => readFileSync(join(ROOT, f), 'utf8')) {
  const head = [
    '-- ============================================================',
    '-- Orime: Supabase に流す SQL をすべて、流す順に 1 本にまとめたもの（自動で作る・手で直さない）',
    '-- 作り方: node scripts/sql-bundle.mjs ／ 手順と注意: docs/sql-runbook.md',
    '-- 何度流しても壊れない（前に流したものが混ざっていてもよい）。',
    '-- Supabase → SQL Editor に全部貼って Run。途中で失敗したら、そこまでの変更も入らない。',
    '-- ============================================================',
    '',
  ];
  const parts = ORDER.map(([f, what], i) => [
    '',
    `-- ############################################################`,
    `-- ${String(i + 1).padStart(2, '0')}. ${f} — ${what}`,
    `-- ############################################################`,
    withColumnBackfill(read(f)).trimEnd(),
    '',
  ].join('\n'));
  return head.join('\n') + parts.join('\n');
}

export function listSqlFiles() {
  return readdirSync(ROOT).filter((f) => /^supabase_.*\.sql$/.test(f) && f !== BUNDLE).sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = buildBundle();
  const path = join(ROOT, BUNDLE);
  if (process.argv.includes('--check')) {
    let cur = '';
    try { cur = readFileSync(path, 'utf8'); } catch { /* 無い */ }
    if (cur !== out) { console.error(`${BUNDLE} が古いです。node scripts/sql-bundle.mjs を流してください。`); process.exit(1); }
    console.log(`${BUNDLE} は最新です。`);
  } else {
    writeFileSync(path, out);
    console.log(`${BUNDLE} を書きました（${ORDER.length} 本）。`);
  }
}
