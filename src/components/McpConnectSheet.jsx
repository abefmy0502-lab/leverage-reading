// 🔌 AI と連携（MCP）のシート（2026-11-07 オーナー「アプリと AI が繋がるようにしたい」）。設定 →「AI と連携」から開く。
//
// 組み立て（BottomSheet・題「AI と連携」・SPEC §1-5c）:
//   ① 導入の 1 行（15/--text-2・何ができるか）。守り（読めるのは自分のものだけ・トークンは使わない）はヘルプと作った直後の補足に
//   ② 接続キーを作る（名前＝どの AI につなぐか・空なら「Claude」・主ボタン「接続キーを作る」・5 つまで）
//   ③ できあがり＝その場だけ見せる URL（写す箱＝DESIGN §5・「URL をコピー」）＋ つなぎ方（溝の切り替え・Claude／ChatGPT／Claude Code）
//   ④ つないでいる AI（名前・作った日・最後に使った日・「取り消す」）。空は EmptyState
// SQL（supabase_mcp_tokens.sql）が未適用なら ErrorMessage「まだ使えません」。AI は使わない（トークンを使わない）。
import { useEffect, useState } from 'react';
import { Copy, Check, Plug } from 'lucide-react';
import BottomSheet from './BottomSheet';
import SegThumb from './SegThumb';
import ErrorMessage from './ErrorMessage';
import EmptyState from './EmptyState';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { toMessage } from '../lib/errors';
import { track } from '../lib/analytics';
import { listKeys, createKey, deleteKey, connectUrl, claudeCodeCommand, jsonConfigSnippet, lastUsedLabel, cleanKeyName, KEY_NAME_MAX, MAX_KEYS } from '../lib/mcpTokens';
import { btnPrimary, btnPrimaryOff, btnGhost, btnLink, btnLinkQuiet, groupTitle, fieldNote, input as uiInput } from '../styles/ui';

const DEFAULT_NAME = 'Claude';
const body = { margin: 0, fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const lead = { margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const h = { margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 };
const section = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };
// 写す箱（DESIGN §5・2026-11-07）: 人が写して使う文字列だけ等幅。押すと全部選ぶ。
const codeBox = { margin: 0, padding: 'var(--space-3)', background: 'var(--fill)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-meta)', lineHeight: 1.5, color: 'var(--text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'all' };
const row = { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', padding: 'var(--space-3) 0' };
const divider = { borderTop: '1px solid var(--separator)' };
const steps = { ...body, paddingLeft: '1.5em', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' };
const fmtDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };

function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch { /* 下へ */ }
  return Promise.resolve(false);
}

function CopyButton({ text, label, style = btnGhost }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return undefined; const t = setTimeout(() => setDone(false), 1500); return () => clearTimeout(t); }, [done]);
  return (
    <button type="button" style={style} onClick={async () => { const ok = await copyText(text); if (ok) { setDone(true); toast.success('コピーしました'); } else toast.error('コピーできませんでした。箱を押して選び、長押しでコピーしてください。'); }}>
      {done ? <Check size="1.1em" aria-hidden="true" /> : <Copy size="1.1em" aria-hidden="true" />}
      <span style={{ marginLeft: 'var(--space-2)' }}>{label}</span>
    </button>
  );
}

const HOW_TO = [['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['code', 'Claude Code']];

export default function McpConnectSheet({ onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [keys, setKeys] = useState(undefined); // undefined＝読み込み中
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null); // { token, row }＝いま作ったキー（閉じるまで）
  const [howTo, setHowTo] = useState('claude');

  const load = async () => {
    setLoadError(null);
    const r = await listKeys(supabase);
    if (r.error) { if (r.missing) setMissing(true); else setLoadError(r.error); setKeys([]); return; }
    setKeys(r.rows);
  };
  useEffect(() => { load(); track('mcp_connect', { action: 'open' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await createKey(supabase, { userId: user?.id, name: cleanKeyName(name) || DEFAULT_NAME });
      if (r.error) { if (r.missing) setMissing(true); else toast.error(toMessage(r.error, '接続キーを作れませんでした。通信状況を確かめて、もう一度お試しください。')); return; }
      setFresh(r);
      setName('');
      setKeys((prev) => [r.row, ...(prev || [])]);
      track('mcp_connect', { action: 'create' });
    } finally { setBusy(false); }
  };

  const remove = async (k) => {
    const ok = await confirm({ title: `「${k.name || DEFAULT_NAME}」の接続を取り消しますか？`, message: 'この接続キーを使っている AI は、すぐに読み書きできなくなります。もう一度つなぐには、新しいキーを作ります。', confirmLabel: '取り消す', cancelLabel: 'キャンセル', destructive: true });
    if (!ok) return;
    const { error } = await deleteKey(supabase, k.id);
    if (error) { toast.error(toMessage(error, '取り消せませんでした。通信状況を確かめて、もう一度お試しください。')); return; }
    setKeys((prev) => (prev || []).filter((x) => x.id !== k.id));
    if (fresh?.row?.id === k.id) setFresh(null);
    track('mcp_connect', { action: 'revoke' });
  };

  const atMax = (keys?.length || 0) >= MAX_KEYS;
  const freshName = fresh?.row?.name || DEFAULT_NAME;

  return (
    <BottomSheet title="AI と連携" onClose={onClose} layer="dialog">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', padding: 'var(--space-2) 0 var(--space-6)' }}>
        {/* 導入は 1 行だけ（作ったあとは URL を上に）。守りの説明はヘルプ（billing）と、作った直後の補足に。 */}
        {!fresh && <p style={lead}>{withPhraseBreaks('いつもの Claude や ChatGPT が、あなたの本・メモ・行動を読めるようになります。')}</p>}

        {missing ? (
          <ErrorMessage title="まだ使えません" description="この機能の準備がまだです。しばらくしてから、もう一度お試しください。" />
        ) : fresh ? (
          <div style={section}>
            <h3 style={h}>「{freshName}」の接続 URL</h3>
            <p style={meta}>{withPhraseBreaks('この URL は今だけ見られます。先にコピーして AI に登録してください。URL を知っている人はあなたのメモを読めるので、人に送らないでください。読めるのは自分のものだけで、Orime のトークンは使いません。')}</p>
            <pre style={codeBox}>{connectUrl(fresh.token)}</pre>
            <CopyButton text={connectUrl(fresh.token)} label="URL をコピー" style={btnPrimary} />
            <h3 style={{ ...h, marginTop: 'var(--space-2)' }} id="mcp-howto-title">つなぎ方</h3>
            {/* 切り替えは振り返り・相談と同じ溝の形（.sub-tabs__seg＋SegThumb）。塗りの主ボタンは「URL をコピー」1 つだけ。 */}
            <div className="sub-tabs__seg" role="tablist" aria-labelledby="mcp-howto-title">
              <SegThumb activeKey={howTo} />
              {HOW_TO.map(([k, label]) => (
                <button key={k} type="button" role="tab" id={`mcp-tab-${k}`} aria-selected={howTo === k} aria-controls="mcp-howto-panel" className={`sub-tab${howTo === k ? ' active' : ''}`} onClick={() => setHowTo(k)}>{label}</button>
              ))}
            </div>
            <div key={howTo} id="mcp-howto-panel" role="tabpanel" aria-labelledby={`mcp-tab-${howTo}`} className="sub-panel" style={section}>
              {howTo === 'claude' && (
                <ol style={steps}>
                  <li>{withPhraseBreaks('Claude の設定の「コネクタ」で「カスタムコネクタを追加」を開く')}</li>
                  <li>{withPhraseBreaks('名前に「Orime」、URL に上の URL を貼る（OAuth の欄は空のまま）')}</li>
                  <li>{withPhraseBreaks('会話で Orime を有効にして「最近のメモを見せて」と聞く')}</li>
                </ol>
              )}
              {howTo === 'chatgpt' && (
                <ol style={steps}>
                  <li>{withPhraseBreaks('ChatGPT の設定の「コネクタ」（開発者モード）で「作成」を開く')}</li>
                  <li>{withPhraseBreaks('名前に「Orime」、MCP サーバーの URL に上の URL を貼る。認証は「なし」')}</li>
                  <li>{withPhraseBreaks('会話で Orime を選んで「読了した本を一覧して」と聞く')}</li>
                </ol>
              )}
              {howTo === 'code' && (
                <>
                  <p style={meta}>{withPhraseBreaks('ターミナルで 1 行貼ります。')}</p>
                  <pre style={codeBox}>{claudeCodeCommand(fresh.token)}</pre>
                  <CopyButton text={claudeCodeCommand(fresh.token)} label="コマンドをコピー" />
                  <details>
                    <summary style={{ ...meta, cursor: 'pointer', minHeight: 'var(--tap-min)', display: 'flex', alignItems: 'center' }}>Cursor などの設定ファイルに貼る形</summary>
                    <div style={{ ...section, paddingTop: 'var(--space-3)' }}>
                      <pre style={codeBox}>{jsonConfigSnippet(fresh.token)}</pre>
                      <CopyButton text={jsonConfigSnippet(fresh.token)} label="設定をコピー" />
                    </div>
                  </details>
                </>
              )}
            </div>
            {/* 次の一歩は上の「URL をコピー」なので、閉じるは控えめな文字ボタン（左端を 16 に）。 */}
            <button type="button" style={{ ...btnLinkQuiet, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }} onClick={() => setFresh(null)}>登録しました（閉じる）</button>
          </div>
        ) : (
          <div style={section}>
            <h3 style={h}>接続キーを作る</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <label htmlFor="mcp-key-name" style={groupTitle}>どの AI につなぎますか？ <span style={fieldNote}>（任意）</span></label>
              <input id="mcp-key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={KEY_NAME_MAX} placeholder={`例：${DEFAULT_NAME}`} style={uiInput} disabled={atMax} />
            </div>
            <button type="button" style={busy || atMax ? btnPrimaryOff : btnPrimary} disabled={busy || atMax} onClick={create}>
              {busy ? '作っています…' : '接続キーを作る'}
            </button>
            {atMax && <p style={meta}>{withPhraseBreaks(`接続キーは ${MAX_KEYS} つまでです。使っていないものを取り消してください。`)}</p>}
          </div>
        )}

        {!missing && (
          <div style={section}>
            {/* 空のときは EmptyState の題が見出しを兼ねる（15/600 の見出しの下に 20/700 の題を重ねない） */}
            {!(Array.isArray(keys) && keys.length === 0 && !loadError) && <h3 style={h}>つないでいる AI</h3>}
            {keys === undefined ? (
              // 本物の行（17 の 1 行＋13 の 1 行＋上下 12）と同じ高さ
              <div style={row}><SkeletonBlock width={20} height={20} /><span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}><SkeletonBlock width="40%" height={17} /><SkeletonBlock width="70%" height={13} /></span></div>
            ) : loadError ? (
              <ErrorMessage title="読み込めませんでした" description={toMessage(loadError, '通信状況を確かめて、もう一度お試しください。')} actions={[{ label: 'もう一度', variant: 'secondary', onClick: load }]} />
            ) : keys.length === 0 ? (
              <EmptyState titleAs="h4" title="まだつないでいません" description="上で接続キーを作ると、ここに並びます。" />
            ) : (
              <div>
                {keys.map((k, i) => (
                  <div key={k.id} style={{ ...row, ...(i ? divider : {}) }}>
                    <Plug size="1.25em" aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...body, display: 'block' }}>{k.name || DEFAULT_NAME}</span>
                      <span style={{ ...meta, display: 'block' }}>{fmtDate(k.created_at)} に作成 · {lastUsedLabel(k.last_used_at)}</span>
                    </span>
                    {/* 文字ボタンの右端を画面の余白 16 に（DESIGN §5 文字ボタン） */}
                    <button type="button" style={{ ...btnLink, color: 'var(--error)', minHeight: 'var(--tap-min)', flexShrink: 0, marginRight: 'calc(-1 * var(--space-1))' }} onClick={() => remove(k)} aria-label={`「${k.name || DEFAULT_NAME}」の接続を取り消す`}>取り消す</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
