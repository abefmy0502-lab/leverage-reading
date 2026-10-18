// 📖 メモを通して読む（2026-10-18 オーナー）。
//
// 1 冊に残したメモを、ページ順に 1 枚の紙のように通して読む。カードを 1 枚ずつ開かなくても、
// 読み返すだけで本の要点がよみがえる（何度も読み返すほど、自分の中に残る）。
// 並び: ページ番号のあるメモをページ順 → ページの無いメモを書いた順。上に「この本から得たいこと」、下に「この本のまとめ」（あれば）。
// 「すべてコピー」で同じ並びの文にして写せる（メモ帳・印刷・ほかのアプリへ）。AI は使わない。
// 見た目は BottomSheet（題「メモを通して読む」・上の小さな行に『書名』）。本文は読む文の組み（明朝 --text-read・行間 1.6＝DESIGN §2）。区切りは 24（線の上下 12）。
import { createPortal } from 'react-dom';
import { Copy } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { useToast } from './Toast';
import { fmtDateJa } from '../lib/dates';
import { btnLink, groupTitle } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';

const timeOf = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };

// ページ順（ページの無いメモは後ろに書いた順）。本文の無いメモ（写真だけ）は入れない。
export function readThroughOrder(memos) {
  const list = (Array.isArray(memos) ? memos : []).filter((m) => String(m?.text || '').trim());
  const paged = list.filter((m) => Number.isFinite(m.pageNumber)).sort((a, b) => a.pageNumber - b.pageNumber || timeOf(a.createdAt) - timeOf(b.createdAt));
  const rest = list.filter((m) => !Number.isFinite(m.pageNumber)).sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));
  return [...paged, ...rest];
}

// 写すときの文（『書名』→ 得たいこと → p.12 本文 … → この本のまとめ）。
export function readThroughText({ title = '', purpose = '', memos = [], summary = '' }) {
  const out = [];
  if (title) out.push(`『${title}』`, '');
  if (String(purpose).trim()) out.push('この本から得たいこと', String(purpose).trim(), '');
  readThroughOrder(memos).forEach((m) => {
    const page = Number.isFinite(m.pageNumber) ? `p.${m.pageNumber}　` : '';
    out.push(`${page}${String(m.text).trim()}`, '');
  });
  if (String(summary).trim()) out.push('この本のまとめ', String(summary).trim(), '');
  return out.join('\n').trim();
}

const label = { ...groupTitle, display: 'block' };
const readText = { margin: 0, fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6, letterSpacing: '0.02em', color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'normal', lineBreak: 'strict', overflowWrap: 'anywhere', textWrap: 'pretty' };

export default function MemoReadThrough({ title = '', purpose = '', memos = [], summary = '', onClose }) {
  const toast = useToast();
  const ordered = readThroughOrder(memos);
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(readThroughText({ title, purpose, memos, summary }));
      toast.success('コピーしました。');
    } catch {
      toast.error('コピーできませんでした。');
    }
  };
  return createPortal(
    <BottomSheet title="メモを通して読む" eyebrow={title ? `『${title}』` : ''} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', margin: 'calc(-1 * var(--space-2)) 0 calc(-1 * var(--space-3))' }}>
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>メモ {ordered.length} 件 · ページ順</span>
          <button type="button" onClick={copyAll} style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', marginRight: 'calc(-1 * var(--space-1))' }}>
            <Copy size="1.1em" aria-hidden="true" />すべてコピー
          </button>
        </div>
        {String(purpose).trim() && (
          <section style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--fill)', borderRadius: 'var(--radius)' }}>
            <span style={label}>この本から得たいこと</span>
            {/* 得たいことは短い 1 文なので文節で折り返す（「伸ばし／たい」と割らない）。長いメモとまとめは流す */}
            <p style={{ ...readText, marginTop: 'var(--space-1)', wordBreak: 'keep-all', textWrap: 'pretty' }}>{withPhraseBreaks(String(purpose).trim())}</p>
          </section>
        )}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {ordered.map((m, i) => {
            const meta = [Number.isFinite(m.pageNumber) ? `p.${m.pageNumber}` : '', fmtDateJa(m.createdAt)].filter(Boolean).join(' · ');
            return (
              <li key={m.id || i} style={{ padding: `${i === 0 ? '0' : 'var(--space-3)'} 0 var(--space-3)`, borderTop: i === 0 ? 'none' : '1px solid var(--separator)' }}>
                {meta && <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)', marginBottom: 'var(--space-1)', fontVariantNumeric: 'tabular-nums' }}>{meta}</span>}
                <p style={readText}>{String(m.text).trim()}</p>
              </li>
            );
          })}
        </ol>
        {String(summary).trim() && (
          <section style={{ borderTop: '1px solid var(--separator)', paddingTop: 'var(--space-3)', marginTop: 'calc(-1 * var(--space-6))' }}>
            <span style={label}>この本のまとめ</span>
            <p style={{ ...readText, marginTop: 'var(--space-2)' }}>{String(summary).trim()}</p>
          </section>
        )}
      </div>
    </BottomSheet>,
    document.body,
  );
}
