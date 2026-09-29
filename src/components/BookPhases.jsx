// 📚 本のステータス別フォーム（Phase エディタ）— App.jsx から抽出（#9 分割）。
//
// want(読みたい) → before(積読/投資設計) → reading(読書中) → done(読了) の 4 段階、
// それぞれの編集 UI。App.jsx の詳細/編集ビューから呼ばれる。共通プリミティブ
// （Field / TagInput / Stars / スタイル定数等）は ./formPrimitives に集約済み。
// ドメイン処理（保存・AI 実行・行動追加）は props 経由で App.jsx が渡す。
//
// ⚠️ 挙動は抽出前と不変。識別子名・props も不変（App.jsx 側の呼び出しはそのまま）。

import { useState, useRef, useEffect, useId } from 'react';
import { todayLocal } from '../lib/dates';
import { ensureHttps } from '../lib/url';
import { toMessage } from '../lib/errors';
import {
  Search as IcSearch, Map as IcMap, ImagePlus as IcImagePlus,
  Target as IcTarget, ChevronDown as IcChevron, X as IcX,
} from 'lucide-react';
import { btnPrimary, btnGhost, btnGhostOff, btnText, btnLink, groupTitle } from '../styles/ui';
import { MiniCover } from './BookCards';
import { LIMITS } from '../lib/limits';
import { useBookCover } from '../hooks/useBookCover';
import { useToast } from './Toast';
import MarkdownSections from './MarkdownSections';
import {
  Field, SectionHeader, Stars, TagInput, Chip,
  inp, ta,
} from './formPrimitives';

/* ========== Phase Screens ========== */

// 積読・読書中・読了の編集画面で共通の小道具（DESIGN のトークンだけ）。
// 面・枠・見出しは本の詳細の畳む見出し（App.jsx の detailsStyle / summaryStyle）と同じ。
// ラベルに飾りのアイコンは付けない（DESIGN §3-2・見出しは文字だけ）。
const softBox = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-3) var(--space-4)',
  marginBottom: 'var(--space-6)',
  lineHeight: 'var(--leading-base)',
};
// 畳む見出し（details の summary）。押せると分かるよう右端にシェブロンを置く。
const foldSummary = {
  minHeight: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  listStyle: 'none',
  cursor: 'pointer',
  fontSize: 'var(--text-body)',
  fontWeight: 600,
  color: 'var(--text)',
};
// 空の日付欄は付随情報の色（未入力と分かる）。
const dateInp = (value) => ({ ...inp, color: value ? 'var(--text)' : 'var(--text-3)' });

// Phase 1: 読みたい → just register
// 本を追加するときのフォーム（検索結果を選んだ後・手動入力の両方）。既存の「読みたい」本の編集でも使う。
// DESIGN: 主ボタンは「保存」1 つ・説明の補足文なし・チップは 32/44・表紙は本の形（角丸 4）。

// 本の状態の選択肢。定義は GLOSSARY（読みたい=気になる本 / 積読=手元にあって、これから読む本）。
// 画面には説明文を出さず、title（長押し・ホバー）にだけ定義を持たせる。
const ADD_STATUSES = [
  { v: 'want', label: '読みたい', def: '気になる本' },
  { v: 'before', label: '積読', def: '手元にあって、これから読む本' },
  { v: 'reading', label: '読書中', def: 'いま読んでいる本' },
  { v: 'done', label: '読了', def: '読み終えた本' },
];
const COVER_W = 60;
const COVER_H = Math.round(COVER_W * 1.42); // MiniCover と同じ縦横比
const COVER_RADIUS = 4; // DESIGN §4 の例外: 本の表紙は本の形として角丸 4

export function WantPhase({ form, setForm, onSave, onSearchOpen, allTags, allFolders }) {
  const fileInputRef = useRef(null);
  const { uploadCover } = useBookCover();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const onPickCover = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      // uploadCover の中で validateImageFile（10MB / JPEG・PNG・WebP）を通す。
      const url = await uploadCover(file);
      if (url) setForm({ ...form, cover: url });
    } catch (err) {
      toast.error(toMessage(err, '画像のアップロードに失敗しました。もう一度お試しください。'));
    } finally {
      setUploading(false);
    }
  };

  const pickCover = () => fileInputRef.current?.click();
  const clearCover = () => setForm({ ...form, cover: '' });
  // 表紙の画像が本当に読めたときだけ「削除」を出す（読めない URL だと自動で作った表紙が出るので、
  // その下に「削除」があると消すものが無いのに赤い文字だけ見える・2026-09-27）。
  const [coverOk, setCoverOk] = useState(false);
  useEffect(() => {
    setCoverOk(false);
    if (!form.cover) return undefined;
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setCoverOk((img.naturalWidth || 0) > 1 && (img.naturalHeight || 0) > 1); };
    img.onerror = () => { if (alive) setCoverOk(false); };
    img.src = ensureHttps(form.cover);
    return () => { alive = false; };
  }, [form.cover]);
  const canSave = !!form.title.trim();
  // 書名が空で「保存」を押したとき: ボタンは薄くせず（白文字が読めなくなる）、書名の欄へ戻して 1 行で知らせる。
  const titleRef = useRef(null);
  const [titleMissing, setTitleMissing] = useState(false);
  const titleErrId = useId();
  const handleSaveClick = () => {
    if (!canSave) {
      setTitleMissing(true);
      try { titleRef.current?.focus(); } catch { /* ignore */ }
      return;
    }
    onSave();
  };

  return (
    <div>
      {/* 検索から来たとき（戻るが「‹ 検索」）は同じ操作を 2 か所に出さない。 */}
      {onSearchOpen && (
      <button type="button" onClick={onSearchOpen} style={{ ...btnGhost, marginBottom: 'var(--space-6)' }}>
        <IcSearch size={20} aria-hidden="true" />
        書名・著者・ISBN で探す
      </button>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: COVER_W }}>
          {form.cover ? (
            <>
              <button
                type="button"
                onClick={pickCover}
                disabled={uploading}
                aria-label="表紙写真を変更"
                style={{ display: 'block', padding: 0, border: 'none', background: 'none', borderRadius: COVER_RADIUS, cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}
              >
                <MiniCover book={{ id: form.id || 'new', title: form.title, cover: form.cover }} width={COVER_W} radius={COVER_RADIUS} />
              </button>
              {coverOk && (
                <button
                  type="button"
                  onClick={clearCover}
                  disabled={uploading}
                  aria-label="表紙写真を削除"
                  style={{ ...btnText, minHeight: 44, padding: '0 var(--space-2)', fontSize: 'var(--text-sub)', color: 'var(--error)' }}
                >
                  削除
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={pickCover}
              disabled={uploading}
              aria-label="表紙写真をアップロード"
              aria-busy={uploading || undefined}
              style={{
                width: COVER_W, height: COVER_H, borderRadius: COVER_RADIUS,
                border: '1px solid var(--border)', background: 'var(--fill)', color: 'var(--text-2)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
                padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-caption)', fontWeight: 600,
              }}
            >
              {uploading ? '…' : (<><IcImagePlus size={20} aria-hidden="true" />表紙</>)}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            /* capture を意図的に外す: iOS の標準アクションシート (写真を撮る /
               フォトライブラリ / ファイルを選択) を出すため。capture を指定
               するとカメラに直行してしまい、スクショや既存写真からの選択が
               できなくなる。 */
            onChange={onPickCover}
            style={{ display: 'none' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <input ref={titleRef} value={form.title} onChange={(e) => { setTitleMissing(false); setForm({ ...form, title: e.target.value }); }} placeholder="書名（必須）" aria-label="書名（必須）" aria-invalid={titleMissing || undefined} aria-describedby={titleMissing ? titleErrId : undefined} style={titleMissing ? { ...inp, borderColor: 'var(--error)' } : inp} maxLength={LIMITS.bookTitle} />
          {titleMissing && <p id={titleErrId} role="alert" style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--error)' }}>書名を入れてください</p>}
          <input value={form.author || ""} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="著者" aria-label="著者" style={inp} maxLength={LIMITS.bookAuthor} />
        </div>
      </div>


      {/* 📖 既読クイック追加: 「もう読んだ／読んでいる」本は、読みたい→読書前→
          読書中 の遷移や投資目的ゲートを経ずに、ここで状態を選んで直接
          読書中/読了で保存 → 保存後すぐ本詳細のメモ欄が開く（メモだけ残したい
          人の入口摩擦を無くす）。保存ボタンの文言（保存してメモを書く）がそれを伝える。 */}
      <Field label="この本の状態">
        {/* DESIGN §5「選ぶためのチップ」: 見た目も 44・15px。負の余白は使わない（見出し→チップ 8・チップ→保存 24）。
            390pt 幅でも 4 つが 1 行に収まるよう、横一列の等分チップは左右の余白を 8 にする。 */}
        <div role="radiogroup" aria-label="この本の状態" style={{ display: 'flex', columnGap: 'var(--space-2)' }}>
          {ADD_STATUSES.map((s) => {
            const active = (form.status || 'want') === s.v;
            return (
              <Chip
                key={s.v}
                size="select"
                stretch
                active={active}
                role="radio"
                aria-checked={active}
                title={s.def}
                onClick={() => {
                  const today = todayLocal();
                  setForm((f) => ({
                    ...f,
                    status: s.v,
                    startDate: (s.v === 'reading' || s.v === 'done') && !f.startDate ? today : f.startDate,
                    doneDate: s.v === 'done' && !f.doneDate ? today : f.doneDate,
                  }));
                }}
              >
                {s.label}
              </Chip>
            );
          })}
        </div>
      </Field>

      <button type="button" onClick={handleSaveClick} style={btnPrimary}>
        {(form.status === 'reading' || form.status === 'done') ? '保存してメモを書く' : '保存'}
      </button>

      {/* タグ・フォルダは任意なので、主ボタンより下に（最初の画面で「保存」が見えるように）。 */}
      <div style={{ marginTop: 'var(--space-8)' }}>
      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>
      <Field label="フォルダ">
        <TagInput tags={form.collections || []} onChange={(c) => setForm({ ...form, collections: c })} allTags={allFolders} placeholder="フォルダを追加" />
      </Field>
      </div>
    </div>
  );
}

// Phase 2: 読書前（投資設計）
export function BeforePhase({
  form,
  setForm,
  onSave,
  aiLoading,
  onRunStrategy,
  onRunStrategyEdit,
  onUndoStrategy,
  hasStrategyHistory,
  onAddRelatedBook,
  addingTitles,
  savedAsBefore = true, // 編集を始めたときにすでに積読だったか（そのときだけ保存で読書中に進む）
}) {
  const [editInstruction, setEditInstruction] = useState('');
  const submitEdit = () => {
    const v = editInstruction.trim();
    if (!v) return;
    onRunStrategyEdit?.(v).then(() => setEditInstruction(''));
  };

  const planReady = !!form.investPurpose?.trim();
  return (
    <div>
      <Field label="読書開始日">
        <input type="date" value={form.startDate || ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={dateInp(form.startDate)} />
      </Field>

      {/* ⚠️ 得たいこと〜読書計画シートは AI にゲートしない。AI を使わない / 月次上限 /
          オフラインのユーザーも、得たいことさえ書けば読書を開始できる（AI は任意の補助）。 */}

      <Field label="この本から得たいこと（必須）">
        <textarea
          value={form.investPurpose || ""}
          onChange={(e) => setForm({ ...form, investPurpose: e.target.value })}
          placeholder="例：営業成績を半年で1.5倍にする／物語をゆっくり味わう"
          rows={3}
          style={ta}
          maxLength={LIMITS.memoText}
        />
      </Field>
      {/* 得たいことを書き換えたあとでも、AI 選書で入力した内容へ戻せる */}
      {form.sourceQuery && (form.investPurpose || '').trim() !== form.sourceQuery.trim() && (
        <button
          type="button"
          onClick={() => setForm({ ...form, investPurpose: form.sourceQuery })}
          // 属する「得たいこと」の欄のすぐ下に付ける（Field の下の 24 を打ち消す）。左の 4 も打ち消して文字の端を 16 に。
          style={{ ...btnLink, alignSelf: 'flex-start', margin: 'calc(-1 * var(--space-6)) 0 var(--space-3) calc(-1 * var(--space-1))' }}
        >
          AI 選書で入力した内容に戻す
        </button>
      )}

      <Field label="現在の課題">
        <textarea
          value={form.currentChallenge || ""}
          onChange={(e) => setForm({ ...form, currentChallenge: e.target.value })}
          placeholder="例：初回商談で信頼構築に時間がかかる"
          rows={3}
          style={ta}
          maxLength={LIMITS.memoText}
        />
      </Field>

      <Field label="仮説">
        <textarea
          value={form.hypothesis || ""}
          onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
          placeholder="例：短時間で信頼を築くフレームワークが学べる"
          rows={3}
          style={ta}
          maxLength={LIMITS.memoText}
        />
      </Field>

      {form.bookReason && (
        <div style={softBox}>
          <p style={groupTitle}>AI の選書理由</p>
          <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 'var(--leading-base)', margin: 'var(--space-1) 0 0', whiteSpace: 'pre-wrap' }}>
            {form.bookReason}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onRunStrategy}
        disabled={!planReady || aiLoading}
        aria-busy={aiLoading || undefined}
        // 押せない（「得たいこと」が空・作成中）は薄くせず btnGhostOff（DESIGN §5）。作成中は文言でも示す。
        style={planReady && !aiLoading ? btnGhost : btnGhostOff}
      >
        <IcMap size={16} aria-hidden="true" />
        {aiLoading ? "作成中…" : (form.aiStrategy ? "読書計画シートを作り直す" : "読書計画シートを作る")}
      </button>
      {/* 作成中は点だけにしない（DESIGN §5）。ボタンの「作成中…」＋シートの形のスケルトン。 */}
      {aiLoading && !form.aiStrategy && (
        <div className="ai-skeleton" aria-hidden="true" style={{ marginTop: 'var(--space-3)' }}>
          <div className="ai-skeleton-line" style={{ width: '90%' }} />
          <div className="ai-skeleton-line" style={{ width: '76%' }} />
          <div className="ai-skeleton-line" style={{ width: '58%' }} />
        </div>
      )}
      {form.aiStrategy && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <p style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>
            読書計画シート
            {aiLoading && <span className="streaming-cursor" aria-hidden="true" style={{ marginLeft: 'var(--space-1)' }} />}
          </p>
          {/* aiLoading 中は onAddRelatedBook を渡さない — MarkdownSections は
              「関連書籍」見出しを通常の見出しとして描画し、関連書籍カードと
              「📚 読みたい」ボタンを出さない。途中の不完全な 『title』 を
              押されてもデータが壊れない。 */}
          <MarkdownSections
            text={form.aiStrategy}
            onAddRelatedBook={aiLoading ? undefined : onAddRelatedBook}
            addingTitles={addingTitles}
          />

          {/* 修正のお願い: 今のシート＋自由文の指示を AI に渡す。1 つ前は端末に残し、元に戻せる。 */}
          <div style={{ ...softBox, marginTop: 'var(--space-3)', marginBottom: 0 }}>
            <p style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>
              直したいところ
            </p>
            <textarea
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitEdit();
                }
              }}
              placeholder="例：もっと簡潔に / 営業視点を強化"
              rows={2}
              style={{ ...ta, minHeight: 64, maxHeight: 200 }}
              maxLength={LIMITS.memoText}
              aria-label="読書計画シートの修正指示"
              disabled={aiLoading}
            />
            <div style={{ display: "flex", gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={submitEdit}
                disabled={!editInstruction.trim() || aiLoading}
                aria-busy={aiLoading || undefined}
                // 押せないときは薄くせず btnGhostOff（DESIGN §5）。行の中の副ボタンなので 44・15。
                style={{ ...(editInstruction.trim() && !aiLoading ? btnGhost : btnGhostOff), width: 'auto', minHeight: 44, padding: '0 var(--space-4)', fontSize: 'var(--text-sub)' }}
              >
                {aiLoading ? "修正中…" : "修正する"}
              </button>
              {hasStrategyHistory && !aiLoading && (
                <button
                  type="button"
                  onClick={onUndoStrategy}
                  style={{ ...btnText, minHeight: 44, fontSize: 'var(--text-sub)' }}
                  aria-label="ひとつ前の読書計画シートに戻す"
                >
                  元に戻す
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 「AIで本を解析する」は 2026-09-27 に廃止（読書計画シートと役割が重なる・原価の節約）。
          以前に解析した本だけ、結果を畳んで残す（相談の材料＝著者の意図として使い続ける）。 */}
      {form.aiAnalysis && (
        <details style={{ ...softBox, padding: '0 var(--space-4)', marginTop: 'var(--space-6)', marginBottom: 0 }}>
          <summary style={foldSummary}>
            以前の AI 解析を見る
            <IcChevron size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </summary>
          <div style={{ paddingBottom: 'var(--space-4)' }}>
            <MarkdownSections
              text={form.aiAnalysis}
              onAddRelatedBook={aiLoading ? undefined : onAddRelatedBook}
              addingTitles={addingTitles}
            />
          </div>
        </details>
      )}

      {/* 保存は画面の下に固定（App.jsx の編集画面の footer・EditSaveBar）。
          得たいことが書けていれば保存と同時に読書中へ自動遷移する（handleSave と同じ条件・
          status='before' のみ）。読書計画シートは任意の補助で、遷移の条件には含めない。 */}
    </div>
  );
}

// 編集画面（積読・読書中・読了）の「保存」。画面の下に固定し、上に区切り線（iOS の作成画面の作法）。
// 本を追加する画面（WantPhase）は従来どおり本文中の主ボタン（タグ・フォルダより上）。
export function saveLabelFor(form, savedAsBefore) {
  const planReady = !!form?.investPurpose?.trim();
  return form?.status === 'before' && savedAsBefore && planReady ? '保存して読書を開始' : '保存';
}
export function EditSaveBar({ onSave, label = '保存' }) {
  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid var(--separator)', background: 'var(--bg)', padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px))' }}>
      <button type="button" onClick={onSave} style={btnPrimary}>{label}</button>
    </div>
  );
}

// Phase 3: 読書中（インプット）

export function ReadingPhase({ form, setForm, onSave, onSaveSummary, onMakeAction, allTags, allFolders }) {
  // 📖 読書進捗（ページ管理）は撤去（本田哲学=「作業量の可視化」は成果ではない／
  // 進捗を見て満足する病を生む）。totalPages は書誌メタとして裏で保持するのみで
  // UI には出さない。データ列は dormant（復活は容易・既存値は保持）。
  return (
    <div>
      {/* 2026-09-27: 編集画面は「本の情報・行動・タグ・フォルダ」だけ。メモ一覧・この本のまとめ・
          読書計画シートは本の詳細にあるので、ここに二重に置かない（SPEC §2）。
          並びは読了と同じ: 日付 → 行動 → タグ・フォルダ →（下に固定の）保存。 */}
      <Field label="読書開始日">
        <input type="date" value={form.startDate || ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={dateInp(form.startDate)} />
      </Field>

      <ActionsEditor form={form} setForm={setForm} title="この本から決めた行動" placeholder="例：明日の朝、学んだ手法を1つ試す" />

      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>
      <Field label="フォルダ">
        <TagInput tags={form.collections || []} onChange={(c) => setForm({ ...form, collections: c })} allTags={allFolders} placeholder="フォルダを追加" />
      </Field>
    </div>
  );
}

// Phase 4: 読了（投資回収）
export function DonePhase({ form, setForm, onSave, allTags, allFolders }) {
  return (
    <div>
      <Field label="読書完了日">
        <input type="date" value={form.doneDate || ""} onChange={(e) => setForm({ ...form, doneDate: e.target.value })} style={dateInp(form.doneDate)} />
      </Field>

      <Field label="評価（読んでよかった度）">
        {/* 星の押せる範囲（44）の中央に星があるので、左へ寄せて星の左端を他の欄の左端（16）にそろえる。
            上下も押せる範囲の余りぶん詰め、見出し・次の欄との間を他の欄とそろえる。 */}
        <div style={{ margin: 'calc(-1 * var(--space-2)) 0 calc(-1 * var(--space-2)) calc(-1 * var(--space-2))' }}>
          <Stars r={form.rating} onChange={(r) => setForm({ ...form, rating: r })} size={28} />
        </div>
      </Field>

      {/* 「この本の学びを分析」は 2026-09-27 に廃止（本詳細の「この本に相談する」と重なる）。
          以前に保存した分析は「この本のAI まとめ」に残り、編集できる。 */}
      {form.aiSummary?.trim() && (
        <Field label="以前の AI まとめ">
          <textarea value={form.aiSummary} onChange={(e) => setForm({ ...form, aiSummary: e.target.value })} rows={3} style={ta} maxLength={LIMITS.memoText} />
        </Field>
      )}

      <ActionsEditor form={form} setForm={setForm} title="この本から決めた行動" placeholder="例：営業会議で結論ファーストを実践" />

      <Field label="一番の収穫">
        <textarea
          value={form.roiSummary || ""}
          onChange={(e) => setForm({ ...form, roiSummary: e.target.value })}
          placeholder="1 行で（例：意思決定が速くなる思考法を獲得）"
          rows={2}
          style={ta}
          maxLength={LIMITS.memoText}
        />
      </Field>

      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>
      <Field label="フォルダ">
        <TagInput tags={form.collections || []} onChange={(c) => setForm({ ...form, collections: c })} allTags={allFolders} placeholder="フォルダを追加" />
      </Field>
    </div>
  );
}

// 🎯 行動の編集欄（読書中・読了で共通）。期限だけをここで決め、優先度・繰り返しは
// 「振り返り」→「行動」の編集に集約する（1 画面 1 アクション）。
function ActionsEditor({ form, setForm, title, placeholder }) {
  const actions = form.actions || [];
  const addAction = () => setForm({ ...form, actions: [...actions, { text: "", deadline: "", done: false }] });
  const updateAction = (i, key, val) => {
    const a = [...actions];
    a[i] = { ...a[i], [key]: val };
    setForm({ ...form, actions: a });
  };
  const removeAction = (i) => setForm({ ...form, actions: actions.filter((_, j) => j !== i) });
  return (
    <section style={{ marginBottom: 'var(--space-6)' }}>
      <SectionHeader icon={<IcTarget size={16} aria-hidden="true" />} title={title} />
      <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-3)' }}>
        {actions.map((a, i) => (
          // カードは DESIGN §5 のカード（--surface＋枠）。--fill だと暗い画面で中の入力欄がカードより暗くなる。
          <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--separator)", borderRadius: "var(--radius)", padding: "var(--space-3) var(--space-4)", display: 'flex', gap: 'var(--space-1)', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {/* 長い行動も全文見えるように 2 行の入力欄（1 行の欄だと途中で切れて見えなかった）。 */}
              <textarea rows={2} value={a.text} onChange={(e) => updateAction(i, "text", e.target.value)} placeholder={i === 0 ? placeholder : `行動 ${i + 1}`} style={{ ...ta, minHeight: 48 }} maxLength={LIMITS.actionText} aria-label={`行動 ${i + 1}`} />
              <label style={{ ...groupTitle, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                期限
                <input type="date" value={a.deadline || ""} onChange={(e) => updateAction(i, "deadline", e.target.value)} style={{ ...dateInp(a.deadline), fontWeight: 400, letterSpacing: 'normal' }} aria-label={`行動 ${i + 1} の期限`} />
              </label>
            </div>
            <button type="button" onClick={() => removeAction(i)} aria-label={`行動 ${i + 1} を削除`} style={{ background: "none", border: "none", color: 'var(--error)', cursor: "pointer", minWidth: 44, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <IcX size={18} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" onClick={addAction} style={btnGhost}>＋ 行動を追加</button>
      </div>
    </section>
  );
}
