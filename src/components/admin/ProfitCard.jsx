// 💰 今月の売上と推定の粗利（運営ダッシュボード › 概況・目標のすぐ下・2026-10-22 オーナー「現在の売り上げと推定の粗利」）。
//
// 数は supabase_admin_profit.sql の admin_profit()（人数・追加トークン・AI の実原価）と lib/adminProfit.js の計算。
// 見せ方: 大きな数は「推定の粗利」1 つ。その上に 売上（月あたり）→ 手取り → AI の原価 → 固定費 の流れを 1 行ずつ。
// 固定費は手入力（端末に保存）。SQL が無い間は「流すと出ます」の 1 行（ほかの区画は動く）。
// 見た目は DESIGN のトークンだけ。%・順位・バッジは運営の画面なので割合だけ小さく添える。
import { useMemo, useState } from 'react';
import { Coins, Pencil } from 'lucide-react';
import { btnGhost, btnLink, input } from '../../styles/ui';
import {
  estimateProfit, loadFixed, saveFixed, yen, monthLabel,
  PRICE_MONTHLY_YEN, PRICE_ANNUAL_YEN, PRICE_FOUNDING_YEN, STORE_FEE_RATE, FIELDS_AI_YEN_PER_BOOK,
} from '../../lib/adminProfit';

const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const caption = { margin: 0, fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.4 };
const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, overflowWrap: 'anywhere' };
const row = { display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderTop: '1px solid var(--separator)', fontSize: 'var(--text-sub)', color: 'var(--text)' };
const FIXED_LABELS = [['apple', 'Apple Developer'], ['supabase', 'Supabase'], ['vercel', 'Vercel'], ['other', 'そのほか']];

// data: admin_profit() の返り値（null＝未取得）。missing: RPC が無い（SQL 未適用）。
export default function ProfitCard({ data, missing = false }) {
  const [fixed, setFixed] = useState(() => loadFixed());
  const [editing, setEditing] = useState(false);
  const p = useMemo(() => estimateProfit(data, fixed), [data, fixed]);
  const onFixed = (k, v) => {
    const next = { ...fixed, [k]: Math.max(0, Math.round(Number(v) || 0)) };
    setFixed(next);
    saveFixed(next);
  };
  return (
    <section aria-labelledby="profit-title" style={{ marginBottom: 'var(--space-6)' }}>
      <p id="profit-title" style={{ ...caption, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <Coins size={15} strokeWidth={2} aria-hidden="true" /> {monthLabel(data?.month)}の売上と推定の粗利
      </p>
      <div style={card}>
        {missing ? (
          <p style={meta}>supabase_admin_profit.sql を流すと出ます（人数・追加トークン・AI の実原価から計算します）。</p>
        ) : !data ? (
          <p style={meta}>読み込んでいます…</p>
        ) : (
          <>
            <p style={{ ...caption, color: 'var(--text-3)' }}>推定の粗利（月あたり・人件費を除く）</p>
            <p style={{ margin: 'var(--space-1) 0 var(--space-3)', fontSize: 'var(--text-display-2)', fontWeight: 700, color: p.grossYen < 0 ? 'var(--warning)' : 'var(--text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {p.grossYen < 0 ? `−${yen(-p.grossYen)}` : yen(p.grossYen)}
            </p>
            <div style={row}>
              <span>売上（税込・月あたりに均す）</span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{yen(p.revenueYen)}</strong>
            </div>
            <p style={{ ...meta, margin: '0 0 var(--space-2)' }}>
              月額 {p.paid.monthly} 人 × {yen(PRICE_MONTHLY_YEN)}・年額 {p.paid.annual} 人 × {yen(PRICE_ANNUAL_YEN)} ÷ 12
              {p.paid.founding > 0 ? `・創業メンバー ${p.paid.founding} 人 × ${yen(PRICE_FOUNDING_YEN)} ÷ 12` : ''}
              {p.packs.count > 0 ? `・追加トークン ${p.packs.count} 件 ${yen(p.packs.yen)}` : ''}
              {p.paid.trial > 0 ? `（無料期間 ${p.paid.trial} 人は売上 0）` : ''}
            </p>
            <div style={row}>
              <span>手取り（税抜・App Store の手数料 {Math.round(STORE_FEE_RATE * 100)}% のあと）</span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{yen(p.netYen)}</strong>
            </div>
            <div style={row}>
              <span>AI の原価（実額）</span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>−{yen(p.aiYen)}</strong>
            </div>
            <p style={{ ...meta, margin: '0 0 var(--space-2)' }}>
              相談などの API の実額 {yen((Number(data?.ai_cost_mjpy) || 0) / 1000)}
              {Number(data?.fields_ai_calls) > 0 ? `・本の分野 ${data.fields_ai_calls} 冊 × ¥${FIELDS_AI_YEN_PER_BOOK}` : ''}
              {p.paid.total > 0 ? `・有料 1 人あたりの手残り ${yen(p.perPaidYen)}` : ''}
            </p>
            <div style={{ ...row, alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                固定費
                <button type="button" onClick={() => setEditing((v) => !v)} style={{ ...btnLink, fontSize: 'var(--text-meta)', minHeight: 0, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-expanded={editing}>
                  <Pencil size={12} aria-hidden="true" />{editing ? '閉じる' : '直す'}
                </button>
              </span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>−{yen(p.fixedYen)}</strong>
            </div>
            {editing && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)', margin: 'var(--space-2) 0' }}>
                {FIXED_LABELS.map(([k, label]) => (
                  <label key={k} style={{ fontSize: 'var(--text-caption)', color: 'var(--text-2)', fontWeight: 600 }}>
                    {label}（円／月）
                    <input type="number" inputMode="numeric" min="0" value={fixed[k]} onChange={(e) => onFixed(k, e.target.value)} style={{ ...input, marginTop: 4 }} />
                  </label>
                ))}
                <button type="button" onClick={() => setEditing(false)} style={{ ...btnGhost, gridColumn: '1 / -1' }}>完了</button>
              </div>
            )}
            <p style={{ ...meta, marginTop: 'var(--space-2)' }}>
              年額・創業メンバーは前払いなので月あたりに均しています（入金の月はもっと多く、ほかの月は 0）。価格の真実はストア。
              {p.marginBeforeFixed != null ? ` 手取りに対する AI を引いたあとの割合 ${Math.round(p.marginBeforeFixed * 100)}%。` : ''}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
