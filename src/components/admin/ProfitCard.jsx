// 💰 今月の売上と推定の粗利（運営ダッシュボード › 概況・目標のすぐ下・2026-10-22 オーナー「現在の売り上げと推定の粗利」）。
//
// 数は supabase_admin_profit.sql の admin_profit()（人数・追加トークン・AI の実原価）と lib/adminProfit.js の計算。
// 見せ方: 大きな数は「推定の粗利」1 つ（--text-title・700＝運営の数字のカードと同じ）。その下に 売上 → 手取り → AI の原価 → 固定費 を
// 「名前（短く 1 行）→ 数（600・右揃え・等幅の数字）→ 内訳（13/--text-3・文節で折り返す）」の同じ形で 4 行。
// 固定費は手入力（端末に保存）。閉じる入口は「完了」1 つ。SQL が無い間は「流すと出ます」の 1 行、通信の失敗は ErrorMessage、
// 読み込み中は SkeletonBlock（ほかの区画と同じ形）。見た目は DESIGN のトークンだけ（2026-10-22 ui-critic の直し）。
import { useMemo, useState } from 'react';
import { Coins, Pencil } from 'lucide-react';
import { btnGhost, btnLink, input } from '../../styles/ui';
import { SkeletonBlock } from '../Skeleton';
import ErrorMessage from '../ErrorMessage';
import { withPhraseBreaks } from '../TightBubble';
import {
  estimateProfit, loadFixed, saveFixed, yen, monthLabel,
  PRICE_MONTHLY_YEN, PRICE_ANNUAL_YEN, PRICE_FOUNDING_YEN, STORE_FEE_RATE, FIELDS_AI_YEN_PER_BOOK,
} from '../../lib/adminProfit';

const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const caption = { margin: 0, fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.4 };
const sub = { margin: 0, fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'break-word' };
const rowBox = { padding: 'var(--space-2) 0', borderTop: '1px solid var(--separator)' };
const rowHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-sub)', color: 'var(--text)', minHeight: 'calc(var(--text-sub) * 1.5)' };
const num = { fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
// 行の右の文字ボタン: 44 の押せる高さは保ち、行の高さは文字ぶんだけ（負の余白で吸収）。
const inlineLink = { ...btnLink, minWidth: 'var(--tap-min)', padding: '0 var(--space-2)', margin: 'calc((var(--tap-min) - var(--text-sub) * 1.5) / -2) 0 calc((var(--tap-min) - var(--text-sub) * 1.5) / -2) calc(-1 * var(--space-2))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)' };
const FIXED_LABELS = [['apple', 'Apple Developer'], ['supabase', 'Supabase'], ['vercel', 'Vercel'], ['other', 'そのほか']];

// 内訳の項目: 「・」で区切り、1 項目は途中で割らない（inline-block）。
function Parts({ items }) {
  const list = items.filter(Boolean);
  return list.map((t, i) => (
    <span key={t}>
      {i > 0 && '・'}
      <span style={{ display: 'inline-block' }}>{t}</span>
    </span>
  ));
}

function Row({ label, value, children }) {
  return (
    <div style={rowBox}>
      <div style={rowHead}>
        <span>{label}</span>
        <span style={num}>{value}</span>
      </div>
      {children && <p style={{ ...sub, marginTop: 'var(--space-1)' }}>{children}</p>}
    </div>
  );
}

// data: admin_profit() の返り値（null＝未取得）。missing: RPC が無い（SQL 未適用）。error: ほかの失敗（通信など）。onRetry: もう一度。
export default function ProfitCard({ data, missing = false, error = null, onRetry }) {
  const [fixed, setFixed] = useState(() => loadFixed());
  const [editing, setEditing] = useState(false);
  const p = useMemo(() => estimateProfit(data, fixed), [data, fixed]);
  const onFixed = (k, v) => {
    const next = { ...fixed, [k]: Math.max(0, Math.round(Number(v) || 0)) };
    setFixed(next);
    saveFixed(next);
  };
  const apiYen = (Number(data?.ai_cost_mjpy) || 0) / 1000;
  const aiShare = p.netYen > 0 ? Math.round((p.aiYen / p.netYen) * 100) : null;
  let body;
  if (missing) {
    body = <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{withPhraseBreaks('supabase_admin_profit.sql を流すと出ます（人数・追加トークン・AI の実原価から計算します）。')}</p>;
  } else if (error) {
    body = <ErrorMessage title="売上を読み込めませんでした" description="通信状況を確認して、もう一度お試しください。" actions={onRetry ? [{ label: 'もう一度', onClick: onRetry }] : []} />;
  } else if (!data) {
    body = (
      <div aria-busy="true" aria-label="売上と粗利を読み込んでいます" style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <SkeletonBlock width="55%" height={12} />
        <SkeletonBlock width="45%" height={28} />
        {[3, 1, 2, 1].map((lines, i) => (
          <div key={i} style={{ ...rowBox, display: 'grid', gap: 'var(--space-1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><SkeletonBlock width="30%" height={18} /><SkeletonBlock width="26%" height={18} /></div>
            {Array.from({ length: lines }, (_, k) => <SkeletonBlock key={k} width={k === lines - 1 ? '70%' : '100%'} height={13} />)}
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <>
        <p style={caption}>推定の粗利（月あたり・人件費を除く）</p>
        <p style={{ margin: 'var(--space-1) 0 var(--space-3)', fontSize: 'var(--text-title)', fontWeight: 700, color: p.grossYen < 0 ? 'var(--warning)' : 'var(--text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {p.grossYen < 0 ? `−${yen(-p.grossYen)}` : yen(p.grossYen)}
        </p>
        <Row label="売上" value={yen(p.revenueYen)}>
          <Parts items={[
            '税込',
            `月額 ${p.paid.monthly} 人 × ${yen(PRICE_MONTHLY_YEN)}`,
            `年額 ${p.paid.annual} 人 × ${yen(PRICE_ANNUAL_YEN)} ÷ 12`,
            p.paid.founding > 0 && `創業メンバー ${p.paid.founding} 人 × ${yen(PRICE_FOUNDING_YEN)} ÷ 12`,
            p.packs.count > 0 && `追加トークン ${p.packs.count} 件 ${yen(p.packs.yen)}`,
            p.paid.trial > 0 && `無料期間 ${p.paid.trial} 人は売上 0`,
          ]} />
        </Row>
        <Row label="手取り" value={yen(p.netYen)}>
          <Parts items={['税抜', `App Store の手数料 ${Math.round(STORE_FEE_RATE * 100)}% のあと`]} />
        </Row>
        <Row label="AI の原価" value={`−${yen(p.aiYen)}`}>
          <Parts items={[
            `相談などの実額 ${yen(apiYen)}`,
            Number(data?.fields_ai_calls) > 0 && `本の分野 ${data.fields_ai_calls} 冊 × ¥${FIELDS_AI_YEN_PER_BOOK}`,
            aiShare != null && `手取りの ${aiShare}%`,
            p.paid.total > 0 && `有料 1 人あたりの手残り ${yen(p.perPaidYen)}`,
          ]} />
        </Row>
        <div style={rowBox}>
          <div style={rowHead}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              固定費
              {!editing && (
                <button type="button" onClick={() => setEditing(true)} style={inlineLink}>
                  <Pencil size="1em" aria-hidden="true" />直す
                </button>
              )}
            </span>
            <span style={num}>−{yen(p.fixedYen)}</span>
          </div>
          {!editing && <p style={{ ...sub, marginTop: 'var(--space-1)' }}><Parts items={FIXED_LABELS.filter(([k]) => fixed[k] > 0).map(([k, l]) => `${l} ${yen(fixed[k])}`)} /></p>}
          {editing && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <p style={{ ...caption, marginBottom: 'var(--space-2)' }}>月あたり（円）</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
                {FIXED_LABELS.map(([k, label]) => (
                  <label key={k} style={{ display: 'grid', gap: 'var(--space-1)', minWidth: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {label}
                    <input type="number" inputMode="numeric" min="0" value={fixed[k]} onChange={(e) => onFixed(k, e.target.value)} style={{ ...input, width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => setEditing(false)} style={{ ...btnGhost, width: '100%', marginTop: 'var(--space-3)' }}>完了</button>
            </div>
          )}
        </div>
      </>
    );
  }
  return (
    <section aria-labelledby="profit-title" style={{ margin: 'var(--space-6) 0' }}>
      <p id="profit-title" style={{ ...caption, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <Coins size="1.2em" strokeWidth={2} aria-hidden="true" /> {monthLabel(data?.month)}の売上と推定の粗利
      </p>
      <div style={card}>{body}</div>
    </section>
  );
}
