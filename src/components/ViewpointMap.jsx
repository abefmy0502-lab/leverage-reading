// 🗺 視点の地図（2026-10-08・SPEC §4・DESIGN §5「視点の地図」・lib/viewpointMap.js）。
//
//   ViewpointMapCard   … 振り返り › 記録の区画。大分類ごとのまとまりに、タグごとのメモの件数を淡く見せる。
//                        押すとそのタグのメモの一覧（振り返り › メモの絞り込み）。0〜1 件のタグには「この分野の本を探す」。
//   ViewpointMapInvite … 地図を使っていない人に、記録の最後の控えめな 1 行。
//   ViewpointMapSheet  … 説明と「視点の地図を使う」／「使うのをやめる」を選ぶシート。
//
// 反ゲーミフィケーション: 点数・%・順位・「あと N 件」・「埋めよう」は出さない。色の濃さは控えめな 4 段だけ。
import { useState } from 'react';
import { ChevronRight, Info, MoreHorizontal, X } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ContextMenu from './ContextMenu';
import { withPhraseBreaks } from './TightBubble';
import { btnGhost, btnPrimary, groupTitle } from '../styles/ui';
import { VIEWPOINT_MAP, isFewMemos, shadeLevel } from '../lib/viewpointMap';

// 濃さの段（0 は面なし）。アクセント 1 色を面に混ぜる（記録の足あとと同じ作り・それより淡く）。
const SHADES = [
  'var(--surface)',
  'color-mix(in srgb, var(--accent) 7%, var(--surface))',
  'color-mix(in srgb, var(--accent) 13%, var(--surface))',
  'color-mix(in srgb, var(--accent) 20%, var(--surface))',
];

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
};
const cardTitle = { fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0, flex: 1, minWidth: 0 };
const moreBtn = {
  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  background: 'none', border: 'none', borderRadius: 999, padding: 0, cursor: 'pointer', color: 'var(--text-2)',
};
// タグのマスは文字の大きさに合わせて列の数が変わる（ふだん 2 列・文字の大きさの設定を 2 段ほど大きくすると 1 列＝rem で決める）。
const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 8.5rem), 1fr))',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-2)',
};
const tagNameStyle = {
  minWidth: 0,
  fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3,
  wordBreak: 'keep-all', overflowWrap: 'anywhere', textAlign: 'left',
};
const countStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 };

function TagTile({ tag, count, onOpen, onFindBooks }) {
  const few = isFewMemos(count) && !!onFindBooks;
  const tile = {
    background: SHADES[shadeLevel(count)],
    border: '1px solid var(--separator)',
    borderRadius: 'var(--radius)',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  };
  const head = (
    <>
      <span style={tagNameStyle}>{tag}</span>
      <span style={{ ...countStyle, whiteSpace: 'nowrap' }}>{count} 件</span>
    </>
  );
  // 名前と件数は 1 行（収まらなければ件数が次の行へ）。地図を縦に長くしない。
  const headBox = {
    display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 'var(--space-2)', rowGap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)', minHeight: 44, boxSizing: 'border-box', alignContent: 'center',
  };
  return (
    <div style={tile}>
      {count > 0 && onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(tag)}
          aria-label={`${tag}のメモ ${count} 件を見る`}
          style={{ ...headBox, width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 'var(--radius)' }}
        >
          {head}
        </button>
      ) : (
        <div style={headBox}>{head}</div>
      )}
      {few && (
        <button
          type="button"
          onClick={() => onFindBooks(tag)}
          aria-label={`${tag}の本を探す（AI 選書）`}
          style={{
            display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 var(--space-3)', marginTop: 'calc(-1 * var(--space-2))',
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--accent)', lineHeight: 1.3,
            wordBreak: 'keep-all', overflowWrap: 'anywhere',
          }}
        >
          {withPhraseBreaks('この分野の本を探す')}
        </button>
      )}
    </div>
  );
}

// map: lib/viewpointMap.js の buildViewpointMap の結果。
export function ViewpointMapCard({ map, onOpenTag, onFindBooks, onAbout, onStop }) {
  const [menu, setMenu] = useState(null);
  return (
    <section style={cardStyle} aria-labelledby="viewpoint-map-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 'calc((24px - 44px) / 2) calc(-1 * var(--space-3)) calc((24px - 44px) / 2) 0' }}>
        <h3 id="viewpoint-map-title" style={cardTitle}>視点の地図</h3>
        <button
          type="button"
          aria-label="視点の地図の操作"
          style={moreBtn}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 220, y: r.bottom + 4 }); }}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      </div>
      {map.map((c, ci) => (
        <div key={c.id} style={{ marginTop: ci === 0 ? 'var(--space-3)' : 'var(--space-6)' }}>
          <h4 style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)' }}>{c.name}</h4>
          {c.groups.map((g) => (
            <div key={g.id} style={{ marginTop: 'var(--space-3)' }} role="group" aria-label={`${c.name}・${g.name}`}>
              <p style={groupTitle}>{g.name}</p>
              <div style={gridStyle}>
                {g.tags.map((t) => (
                  <TagTile key={t.name} tag={t.name} count={t.count} onOpen={onOpenTag} onFindBooks={onFindBooks} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: '視点の地図について', icon: <Info size={16} aria-hidden="true" />, onClick: () => { setMenu(null); onAbout?.(); } },
            { label: '使うのをやめる', icon: <X size={16} aria-hidden="true" />, onClick: () => { setMenu(null); onStop?.(); } },
          ]}
        />
      )}
    </section>
  );
}

export function ViewpointMapInvite({ onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, width: '100%',
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks('メモのタグで、視点の地図を作れます')}</span>
      <ChevronRight size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </button>
  );
}

export const VIEWPOINT_LEAD = '本を 1 冊読むたびに、著者のものの見方が 1 つ増えます。メモに分野のタグを付けると、どの分野の視点がたまっているかを地図で見られます。';

// on: いま使っているか / onChoose(true|false)
export function ViewpointMapSheet({ on, busy = false, onChoose, onClose }) {
  const footer = on ? (
    <button type="button" style={{ ...btnGhost, width: '100%' }} onClick={() => onChoose(false)} disabled={busy}>使うのをやめる</button>
  ) : (
    <button type="button" style={{ ...btnPrimary, width: '100%', opacity: 1 }} onClick={() => onChoose(true)} disabled={busy} aria-busy={busy || undefined}>視点の地図を使う</button>
  );
  return (
    <BottomSheet title="視点の地図" onClose={onClose} footer={footer} dismissLabel={on ? '完了' : 'キャンセル'}>
      <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks(VIEWPOINT_LEAD)}
      </p>
      <div style={{ ...cardStyle, marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {VIEWPOINT_MAP.map((c) => (
          <div key={c.id}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)' }}>{c.name}</h3>
            {c.groups.map((g) => (
              <p key={g.id} style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                <span style={{ color: 'var(--text)' }}>{g.name}</span>
                {'　'}
                {g.tags.map((t, i) => (
                  <span key={t.name}>{i > 0 && '、'}<span style={{ whiteSpace: 'nowrap' }}>{t.name}</span></span>
                ))}
              </p>
            ))}
          </div>
        ))}
      </div>
      <p style={{ margin: 'var(--space-4) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks('タグは自分で付けます。保存したメモには「合いそうなタグ」としてすすめます。やめても、付けたタグは消えません。')}
      </p>
    </BottomSheet>
  );
}
