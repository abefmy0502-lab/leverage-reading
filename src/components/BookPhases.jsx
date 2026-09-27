// 📚 本のステータス別フォーム（Phase エディタ）— App.jsx から抽出（#9 分割）。
//
// want(読みたい) → before(積読/投資設計) → reading(読書中) → done(読了) の 4 段階、
// それぞれの編集 UI。App.jsx の詳細/編集ビューから呼ばれる。共通プリミティブ
// （Field / TagInput / Stars / スタイル定数等）は ./formPrimitives に集約済み。
// ドメイン処理（保存・AI 実行・行動追加）は props 経由で App.jsx が渡す。
//
// ⚠️ 挙動は抽出前と不変。識別子名・props も不変（App.jsx 側の呼び出しはそのまま）。

import { useState, useRef } from 'react';
import { todayLocal } from '../lib/dates';
import { toMessage } from '../lib/errors';
import {
  Search as IcSearch, Map as IcMap,
  BarChart3 as IcBar, AlertTriangle as IcAlert, Lightbulb as IcBulb, Bot as IcBot,
  CalendarDays as IcCal, ImagePlus as IcImagePlus,
  Target as IcTarget, ChevronDown as IcChevron, PencilLine as IcPencil, X as IcX,
} from 'lucide-react';
import { btnPrimary, btnGhost, btnText } from '../styles/ui';
import { MiniCover } from './BookCards';
import { LIMITS } from '../lib/limits';
import { useBookCover } from '../hooks/useBookCover';
import { useToast } from './Toast';
import MarkdownSections from './MarkdownSections';
import BookMemoList from './BookMemoList';
import {
  Field, SectionHeader, Dots, Stars, TagInput, Chip,
  inp, ta,
} from './formPrimitives';

/* ========== Phase Screens ========== */

// 積読・読書中・読了の編集画面で共通の小道具（DESIGN のトークンだけ）。
const labelIcon = { verticalAlign: '-2px', marginRight: 'var(--space-1)' };
const softBox = {
  background: 'var(--fill)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-3) var(--space-4)',
  marginBottom: 'var(--space-3)',
  fontSize: 'var(--text-meta)',
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
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  color: 'var(--text-2)',
};

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
  const canSave = !!form.title.trim();
  // 書名が空で「保存」を押したとき: ボタンは薄くせず（白文字が読めなくなる）、書名の欄へ戻して 1 行で知らせる。
  const titleRef = useRef(null);
  const [titleMissing, setTitleMissing] = useState(false);
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
      <button type="button" onClick={onSearchOpen} style={{ ...btnGhost, marginBottom: 'var(--space-6)' }}>
        <IcSearch size={20} aria-hidden="true" />
        書名・著者・ISBN で探す
      </button>

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
              <button
                type="button"
                onClick={clearCover}
                disabled={uploading}
                aria-label="表紙写真を削除"
                style={{ ...btnText, minHeight: 44, padding: '0 var(--space-2)', fontSize: 'var(--text-sub)', color: 'var(--error)' }}
              >
                削除
              </button>
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
          <input ref={titleRef} value={form.title} onChange={(e) => { setTitleMissing(false); setForm({ ...form, title: e.target.value }); }} placeholder="書名（必須）" aria-label="書名（必須）" aria-invalid={titleMissing || undefined} style={inp} maxLength={LIMITS.bookTitle} />
          {titleMissing && <p role="alert" style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--error)' }}>書名を入れてください</p>}
          <input value={form.author || ""} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="著者" aria-label="著者" style={inp} maxLength={LIMITS.bookAuthor} />
        </div>
      </div>


      {/* 📖 既読クイック追加: 「もう読んだ／読んでいる」本は、読みたい→読書前→
          読書中 の遷移や投資目的ゲートを経ずに、ここで状態を選んで直接
          読書中/読了で保存 → 保存後すぐ本詳細のメモ欄が開く（メモだけ残したい
          人の入口摩擦を無くす）。保存ボタンの文言（保存してメモを書く）がそれを伝える。 */}
      <Field label="この本の状態">
        <div role="radiogroup" style={{ display: 'flex', columnGap: 'var(--space-2)' }}>
          {ADD_STATUSES.map((s) => {
            const active = (form.status || 'want') === s.v;
            return (
              <Chip
                key={s.v}
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
      <Field label={<><IcCal size={13} aria-hidden="true" style={labelIcon} />読書開始日</>}>
        <input type="date" value={form.startDate || ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inp} />
      </Field>

      {/* ⚠️ 得たいこと〜読書計画シートは AI にゲートしない。AI を使わない / 月次上限 /
          オフラインのユーザーも、得たいことさえ書けば読書を開始できる（AI は任意の補助）。 */}
      {/* AI 選書から引き継いだ本は、「なぜ既に文字が入っているのか」を 1 行で示す。 */}
      {(form.bookReason || form.sourceQuery) && (
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: '0 0 var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <IcBot size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
          AI 選書の相談から入力しました
        </p>
      )}

      <Field label={<><IcBar size={13} aria-hidden="true" style={labelIcon} />この本から得たいこと（必須）</>}>
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
          style={{ ...btnText, minHeight: 44, fontSize: 'var(--text-meta)', padding: '0 var(--space-1)', margin: 'calc(-1 * var(--space-2)) 0 var(--space-3)' }}
        >
          AI 選書で入力した内容に戻す
        </button>
      )}

      <Field label={<><IcAlert size={13} aria-hidden="true" style={labelIcon} />現在の課題</>}>
        <textarea
          value={form.currentChallenge || ""}
          onChange={(e) => setForm({ ...form, currentChallenge: e.target.value })}
          placeholder="例：初回商談で信頼構築に時間がかかる"
          rows={3}
          style={ta}
          maxLength={LIMITS.memoText}
        />
      </Field>

      <Field label={<><IcBulb size={13} aria-hidden="true" style={labelIcon} />仮説</>}>
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
          <p style={{ fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>
            <IcBot size={13} aria-hidden="true" style={labelIcon} />
            AI の選書理由
          </p>
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
        // 押せないのは「得たいこと」が空のときだけ薄くする。作成中は文言で示す（薄くしない）。
        style={{ ...btnGhost, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', opacity: planReady ? 1 : 0.5, cursor: planReady && !aiLoading ? 'pointer' : 'default' }}
      >
        <IcMap size={16} aria-hidden="true" />
        {aiLoading ? "作成中…" : (form.aiStrategy ? "読書計画シートを作り直す" : "読書計画シートを作成")}
      </button>
      {aiLoading && !form.aiStrategy && <Dots />}
      {form.aiStrategy && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <p style={{ fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-1)' }}>
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
          <div style={{ ...softBox, marginTop: 'var(--space-3)' }}>
            <p style={{ fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text-2)', margin: '0 0 var(--space-2)' }}>
              <IcPencil size={13} aria-hidden="true" style={labelIcon} />
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
                style={{ ...btnGhost, width: 'auto', minHeight: 44, padding: '0 var(--space-4)', fontSize: 'var(--text-sub)', opacity: editInstruction.trim() ? 1 : 0.5 }}
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
        <details style={{ marginTop: 'var(--space-6)' }}>
          <summary style={foldSummary}>
            以前の AI 解析を見る
            <IcChevron size={18} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </summary>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <MarkdownSections
              text={form.aiAnalysis}
              onAddRelatedBook={aiLoading ? undefined : onAddRelatedBook}
              addingTitles={addingTitles}
            />
          </div>
        </details>
      )}

      {/* 得たいことが書けていれば保存と同時に読書中へ自動遷移する（handleSave と同じ条件・
          status='before' のみ）。読書計画シートは任意の補助で、遷移の条件には含めない。 */}
      <button onClick={onSave} style={{ ...btnPrimary, marginTop: 'var(--space-6)' }}>
        {form.status === 'before' && savedAsBefore && planReady ? '保存して読書を開始' : '保存'}
      </button>
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
      {/* 読書計画シートは畳んでおき、迷ったときに開く（詳細画面と同じ様式）。 */}
      {form.aiStrategy && (
        <details style={{ ...softBox, padding: '0 var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <summary style={foldSummary}>
            読書計画シートを見る
            <IcChevron size={18} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </summary>
          <div style={{ paddingBottom: 'var(--space-3)' }}>
            <MarkdownSections text={form.aiStrategy} />
          </div>
        </details>
      )}

      <Field label="メモ・感想">
        <BookMemoList
          bookId={form.id}
          bookTitle={form.title}
          bookAuthor={form.author || ""}
          summaryText={form.leverageMemo || ""}
          onSaveSummary={onSaveSummary}
          onMakeAction={onMakeAction}
        />
      </Field>

      {/* 「この本の学びを分析」は 2026-09-27 に廃止（本詳細の「この本に相談する」と重なる）。
          並びは読了と同じ: メモ → 行動 → タグ・フォルダ → 保存。 */}
      <ActionsEditor form={form} setForm={setForm} title="この本から決めた行動" placeholder="例：明日の朝、学んだ手法を1つ試す" />

      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>
      <Field label="フォルダ">
        <TagInput tags={form.collections || []} onChange={(c) => setForm({ ...form, collections: c })} allTags={allFolders} placeholder="フォルダを追加" />
      </Field>

      <button onClick={onSave} style={{ ...btnPrimary, marginTop: 'var(--space-6)' }}>保存</button>
    </div>
  );
}

// Phase 4: 読了（投資回収）
export function DonePhase({ form, setForm, onSave, allTags, allFolders }) {
  return (
    <div>
      <Field label={<><IcCal size={13} aria-hidden="true" style={labelIcon} />読書完了日</>}>
        <input type="date" value={form.doneDate || ""} onChange={(e) => setForm({ ...form, doneDate: e.target.value })} style={inp} />
      </Field>

      <Field label="評価（読んでよかった度）">
        <div style={{ padding: "var(--space-1) 0" }}>
          <Stars r={form.rating} onChange={(r) => setForm({ ...form, rating: r })} size={28} />
        </div>
      </Field>

      {/* 「この本の学びを分析」は 2026-09-27 に廃止（本詳細の「この本に相談する」と重なる）。
          以前に保存した分析は「この本のAI まとめ」に残り、編集できる。 */}
      {form.aiSummary?.trim() && (
        <Field label={<><IcBot size={13} aria-hidden="true" style={labelIcon} />この本の AI まとめ</>}>
          <textarea value={form.aiSummary} onChange={(e) => setForm({ ...form, aiSummary: e.target.value })} rows={3} style={ta} maxLength={LIMITS.memoText} />
        </Field>
      )}

      <ActionsEditor form={form} setForm={setForm} title="この本から決めた行動" placeholder="例：営業会議で結論ファーストを実践" />

      <section style={{ marginBottom: 'var(--space-6)' }}>
        <SectionHeader icon={<IcBulb size={16} aria-hidden="true" />} title="一番の収穫（1行）" />
        <textarea
          value={form.roiSummary || ""}
          onChange={(e) => setForm({ ...form, roiSummary: e.target.value })}
          placeholder="例：意思決定が速くなる思考法を獲得"
          rows={2}
          style={ta}
          maxLength={LIMITS.memoText}
          aria-label="一番の収穫（1行）"
        />
      </section>

      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>
      <Field label="フォルダ">
        <TagInput tags={form.collections || []} onChange={(c) => setForm({ ...form, collections: c })} allTags={allFolders} placeholder="フォルダを追加" />
      </Field>

      <button onClick={onSave} style={{ ...btnPrimary, marginTop: 'var(--space-6)' }}>保存</button>
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
          <div key={i} style={{ background: "var(--fill)", borderRadius: "var(--radius)", padding: "var(--space-3) var(--space-4)", display: 'flex', gap: 'var(--space-1)', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <input value={a.text} onChange={(e) => updateAction(i, "text", e.target.value)} placeholder={i === 0 ? placeholder : `行動 ${i + 1}`} style={inp} maxLength={LIMITS.actionText} aria-label={`行動 ${i + 1}`} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-caption)', color: 'var(--text-2)' }}>
                期限
                <input type="date" value={a.deadline || ""} onChange={(e) => updateAction(i, "deadline", e.target.value)} style={inp} aria-label={`行動 ${i + 1} の期限`} />
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
