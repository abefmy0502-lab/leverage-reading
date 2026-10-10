// 🗺 視点の地図（2026-10-08・SPEC §4・DESIGN §5「視点の地図」・lib/viewpointMap.js）。
//
//   ViewpointMapCard   … 振り返り › 記録の区画。大分類ごとのまとまりに、タグごとのメモの件数を淡く見せる。
//                        押すとそのタグのメモの一覧（振り返り › メモの絞り込み）。地図のいちばん下に 1 つだけ文字ボタン
//                        「メモの少ない「お金」の本を探す」（いちばん少ない分野 1 つを AI 選書の下書きに・2026-10-09 にマスごとのボタンをやめた）。
//   ViewpointMapInvite … 地図を使っていない人に、記録の最後の控えめな 1 行。
//   ViewpointMapSheet  … 説明と「視点の地図を使う」／「使うのをやめる」を選ぶシート。
//
// 反ゲーミフィケーション: 点数・%・順位・「あと N 件」・「埋めよう」は出さない。色の濃さは控えめな 4 段だけ。
import { useState } from 'react';
import { ChevronRight, Info, MoreHorizontal, X } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ContextMenu from './ContextMenu';
import { withPhraseBreaks } from './TightBubble';
import { btnGhost, btnPrimary, btnLink, groupTitle } from '../styles/ui';
import { VIEWPOINT_MAP, fewViewpointTags, shadeLevel } from '../lib/viewpointMap';

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
// 同じ行のマスは高さをそろえる（stretch・0 件のマスもほかと同じ高さ）。
const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 8.5rem), 1fr))',
  alignItems: 'stretch',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-2)',
};
// タグの名前は本文の太さ（大分類・題より弱く）。
const tagNameStyle = {
  maxWidth: '100%',
  fontSize: 'var(--text-sub)', fontWeight: 400, color: 'var(--text)', lineHeight: 1.3,
  wordBreak: 'keep-all', overflowWrap: 'anywhere', textAlign: 'left',
};
const countStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', whiteSpace: 'nowrap',
  fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3,
};

function TagTile({ tag, count, onOpen }) {
  const canOpen = count > 0 && !!onOpen;
  const tile = {
    background: SHADES[shadeLevel(count)],
    border: '1px solid var(--separator)',
    borderRadius: 'var(--radius)',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    height: '100%',
    boxSizing: 'border-box',
  };
  // 1 行目＝名前、2 行目＝「メモ 3 件 ›」（どのマスも同じ位置・2026-10-08 ui-critic 第 2 回）。
  const head = (
    <>
      <span style={tagNameStyle}>{tag}</span>
      <span style={countStyle}>
        メモ {count} 件
        {canOpen && <ChevronRight size="1.1em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
      </span>
    </>
  );
  const headBox = {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)', minHeight: 44, flex: 1, boxSizing: 'border-box', width: '100%', textAlign: 'left',
  };
  return (
    <div style={tile}>
      {canOpen ? (
        <button
          type="button"
          onClick={() => onOpen(tag)}
          aria-label={`${tag}のメモ ${count} 件を見る`}
          style={{ ...headBox, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 'var(--radius)' }}
        >
          {head}
        </button>
      ) : (
        <div style={headBox}>{head}</div>
      )}
    </div>
  );
}

// map: lib/viewpointMap.js の buildViewpointMap の結果。
export function ViewpointMapCard({ map, onOpenTag, onFindBooks, onAbout, onStop }) {
  const [menu, setMenu] = useState(null);
  // 地図のタグがまだ 1 つも無い人には「メモの少ない「…」の本を探す」を出さず、付け方の 1 行だけ。
  const total = map.reduce((n, c) => n + c.groups.reduce((m, g) => m + g.tags.reduce((k, t) => k + t.count, 0), 0), 0);
  // いちばんメモの少ない分野を 1 つだけ（2026-10-09 決定・ボタンの言葉に分野の名前を入れる）。
  const fewest = fewViewpointTags(map, 1)[0] || '';
  return (
    <section style={cardStyle} aria-labelledby="viewpoint-map-title" data-viewpoint-map>
      {/* 題の行は文字 1 行の高さ（1.3em）。「…」の押せる範囲 44 は上下と右に負の余白で収める。 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-body)', margin: 'calc((1.3em - 44px) / 2) calc(-1 * var(--space-3)) calc((1.3em - 44px) / 2) 0' }}>
        <h3 id="viewpoint-map-title" style={{ ...cardTitle, lineHeight: 1.3 }}>視点の地図</h3>
        <button
          type="button"
          aria-label="視点の地図の操作"
          aria-haspopup="menu"
          style={moreBtn}
          // ContextMenu は x を中心として受け取る。
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left + r.width / 2, y: r.bottom + 4 }); }}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      </div>
      {total === 0 && (
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {withPhraseBreaks('メモに分野のタグを付けると、ここに数が出ます。保存したメモには')}<span style={{ whiteSpace: 'nowrap' }}>「合いそうなタグ」</span>{withPhraseBreaks('としてすすめます。')}
        </p>
      )}
      {map.map((c, ci) => (
        <div
          key={c.id}
          style={ci === 0
            ? { marginTop: 'var(--space-3)' }
            : { marginTop: 'var(--space-6)', paddingTop: 'var(--space-6)', borderTop: '1px solid var(--separator)' }}
        >
          <h4 style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)' }}>{c.name}</h4>
          {c.groups.map((g) => (
            <div key={g.id} style={{ marginTop: 'var(--space-3)' }} role="group" aria-label={`${c.name}・${g.name}`}>
              <p style={groupTitle}>{g.name}</p>
              <div style={gridStyle}>
                {g.tags.map((t) => (
                  <TagTile key={t.name} tag={t.name} count={t.count} onOpen={onOpenTag} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      {/* メモの少ない「お金」の本を探す: 地図のいちばん下に 1 つだけ（マスごとに並べない＝埋めたくなる形にしない・2026-10-09）。
          地図のタグがまだ 1 つも無い人には出さない（付け方の 1 行だけ）。 */}
      {total > 0 && fewest && onFindBooks && (
        <button
          type="button"
          onClick={() => onFindBooks(fewest)}
          aria-label={`メモの少ない「${fewest}」の本を探す（AI 選書）`}
          style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: 'var(--space-4)', marginLeft: 'calc(-1 * var(--space-1))', marginBottom: 'calc(-1 * var(--space-3))', textAlign: 'left', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
        >
          {/* 折り返したときも › が文の終わりに付くように、› は文の中に置く（「探す」の後ろで割らない）。 */}
          <span>{withPhraseBreaks('メモの少ない')}<span style={{ whiteSpace: 'nowrap' }}>「{fewest}」</span>{withPhraseBreaks('の本を')}<span style={{ whiteSpace: 'nowrap' }}>探す<ChevronRight size="1.2em" aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginLeft: 'var(--space-1)' }} /></span></span>
        </button>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: '視点の地図について', icon: <Info size="1.1em" aria-hidden="true" />, onClick: () => { setMenu(null); onAbout?.(); } },
            { label: '使うのをやめる', icon: <X size="1.1em" aria-hidden="true" />, onClick: () => { setMenu(null); onStop?.(); } },
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

export const VIEWPOINT_LEAD = 'メモに分野のタグを付けると、たまった視点を地図で見られます。';

// on: いま使っているか / onChoose(true|false)
export function ViewpointMapSheet({ on, busy = false, onChoose, onClose }) {
  const footer = on ? (
    <button type="button" style={{ ...btnGhost, width: '100%', opacity: 1 }} onClick={() => onChoose(false)} disabled={busy} aria-busy={busy || undefined}>{busy ? '保存しています…' : '使うのをやめる'}</button>
  ) : (
    <button type="button" style={{ ...btnPrimary, width: '100%', opacity: 1 }} onClick={() => onChoose(true)} disabled={busy} aria-busy={busy || undefined}>{busy ? '保存しています…' : '視点の地図を使う'}</button>
  );
  return (
    <BottomSheet title="視点の地図" onClose={onClose} footer={footer} dismissLabel={on ? '完了' : 'キャンセル'} dismissible={!busy}>
      <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks(VIEWPOINT_LEAD)}
      </p>
      <div style={{ ...cardStyle, marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {VIEWPOINT_MAP.map((c) => (
          <div key={c.id}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)' }}>{c.name}</h3>
            {/* 中分類（左）とタグ（右）の 2 列。タグは 1 つずつ割らない。 */}
            <dl style={{ display: 'grid', gridTemplateColumns: '5.5em 1fr', columnGap: 'var(--space-3)', rowGap: 'var(--space-2)', margin: 'var(--space-2) 0 0', fontSize: 'var(--text-sub)', lineHeight: 1.5 }}>
              {c.groups.map((g) => (
                <div key={g.id} style={{ display: 'contents' }}>
                  <dt style={{ color: 'var(--text)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{g.name}</dt>
                  <dd style={{ margin: 0, color: 'var(--text-2)', minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                    {g.tags.map((t, i) => (
                      <span key={t.name}>{i > 0 && '、'}<wbr /><span style={{ whiteSpace: 'nowrap' }}>{t.name}</span></span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p style={{ margin: 'var(--space-4) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {/* 注記は 1 行だけ（3 行の注記は読まれない・2026-10-10 ui-critic）。 */}
        {withPhraseBreaks('やめても、付けたタグは消えません。')}
      </p>
    </BottomSheet>
  );
}
