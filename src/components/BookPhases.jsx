// 📚 本のステータス別フォーム（Phase エディタ）— App.jsx から抽出（#9 分割）。
//
// want(読みたい) → before(積読/投資設計) → reading(読書中) → done(読了) の 4 段階、
// それぞれの編集 UI。App.jsx の詳細/編集ビューから呼ばれる。共通プリミティブ
// （Field / TagInput / Stars / スタイル定数等）は ./formPrimitives に集約済み。
// ドメイン処理（保存・AI 実行・行動追加）は props 経由で App.jsx が渡す。
//
// ⚠️ 挙動は抽出前と不変。識別子名・props も不変（App.jsx 側の呼び出しはそのまま）。

import { useState, useRef } from 'react';
import {
  BookOpen as IcBook, Ruler as IcRuler, Search as IcSearch, Map as IcMap,
  BarChart3 as IcBar, AlertTriangle as IcAlert, Lightbulb as IcBulb, Bot as IcBot,
  Zap as IcZap, CalendarDays as IcCal, CheckCircle2 as IcCheck,
} from 'lucide-react';
import { LIMITS } from '../lib/limits';
import { ensureHttps } from '../lib/url';
import { useBookCover } from '../hooks/useBookCover';
import { useToast } from './Toast';
import MarkdownSections from './MarkdownSections';
import BookMemoList from './BookMemoList';
import BookLearningAnalysis from './BookLearningAnalysis';
import {
  Field, SectionHeader, Dots, Stars, TagInput,
  inp, ta, btnS, btnO, aiB, phaseDesc,
} from './formPrimitives';

/* ========== Phase Screens ========== */

// Phase 1: 読みたい → just register
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
      const url = await uploadCover(file);
      if (url) setForm({ ...form, cover: url });
    } catch (err) {
      toast.error(err?.message || '画像のアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  const clearCover = () => setForm({ ...form, cover: '' });

  return (
    <div>
      <p style={phaseDesc}><IcBook size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読みたい本を追加しましょう</p>
      <button onClick={onSearchOpen} style={{ ...btnO, width: "100%", padding: "14px 0", borderStyle: "dashed", fontSize: 14, marginBottom: 12 }}>
        🔍 タイトル・ISBNで検索して追加
      </button>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {form.cover ? (
            <img src={ensureHttps(form.cover)} alt="" style={{ width: 60, height: 84, objectFit: "cover", borderRadius: 6, border: "1px solid var(--c-hairline-strong)" }} />
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                width: 60,
                height: 84,
                borderRadius: 6,
                border: '1px dashed #c4b8a6',
                background: '#f5efde',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                color: 'var(--c-ink-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1.3,
                padding: 4,
                textAlign: 'center',
              }}
              aria-label="表紙写真をアップロード"
            >
              {uploading ? '...' : '📷\n表紙'}
            </button>
          )}
          {form.cover && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--color-accent)', cursor: 'pointer', padding: 2, fontFamily: 'inherit' }}
              >
                変更
              </button>
              <button
                type="button"
                onClick={clearCover}
                style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--c-critical)', cursor: 'pointer', padding: 2, fontFamily: 'inherit' }}
              >
                削除
              </button>
            </div>
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="タイトル *" style={inp} maxLength={LIMITS.bookTitle} />
          <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="著者" style={inp} maxLength={LIMITS.bookAuthor} />
        </div>
      </div>
      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>
      <Field label="フォルダ" sub="本棚をグループ分け（任意・複数可）">
        <TagInput tags={form.collections || []} onChange={(c) => setForm({ ...form, collections: c })} allTags={allFolders} />
      </Field>

      {/* 📖 既読クイック追加: 「もう読んだ／読んでいる」本は、読みたい→読書前→
          読書中 の遷移や投資目的ゲートを経ずに、ここで状態を選んで直接
          読書中/読了で保存 → 保存後すぐ本詳細のメモ欄が開く（メモだけ残したい
          人の入口摩擦を無くす）。 */}
      <Field label="この本の状態" sub="もう読んだ本は「読了」を選ぶと、保存後すぐメモを書けます">
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { v: 'want', label: '読みたい' },
            { v: 'reading', label: '読書中' },
            { v: 'done', label: '読了' },
          ].map((s) => {
            const active = (form.status || 'want') === s.v;
            return (
              <button
                key={s.v}
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  setForm((f) => ({
                    ...f,
                    status: s.v,
                    startDate: (s.v === 'reading' || s.v === 'done') && !f.startDate ? today : f.startDate,
                    doneDate: s.v === 'done' && !f.doneDate ? today : f.doneDate,
                  }));
                }}
                style={{
                  flex: 1, minHeight: 44, padding: '8px 6px', borderRadius: 10,
                  border: active ? '1.5px solid var(--c-brand)' : '1px solid var(--c-hairline-strong)',
                  background: active ? 'var(--c-soft-2)' : '#fff',
                  color: active ? 'var(--c-ink)' : 'var(--c-brand)',
                  fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </Field>

      <button onClick={onSave} disabled={!form.title.trim()} style={{ ...btnS, width: "100%", marginTop: 8, opacity: form.title.trim() ? 1 : 0.5 }}>
        {(form.status === 'reading' || form.status === 'done') ? '保存してメモを書く' : '保存'}
      </button>
    </div>
  );
}

// Phase 2: 読書前（投資設計）
export function BeforePhase({
  form,
  setForm,
  onSave,
  aiLoading,
  onRunAnalysis,
  onRunStrategy,
  onRunStrategyEdit,
  onUndoStrategy,
  hasStrategyHistory,
  onAddRelatedBook,
  addingTitles,
}) {
  const [editInstruction, setEditInstruction] = useState('');
  const submitEdit = () => {
    const v = editInstruction.trim();
    if (!v) return;
    onRunStrategyEdit?.(v).then(() => setEditInstruction(''));
  };

  return (
    <div>
      <p style={phaseDesc}><IcRuler size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読む前に、投資目的を決めましょう</p>

      <Field label="読書開始日">
        <input type="date" value={form.startDate || ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inp} />
      </Field>

      <SectionHeader icon={<IcSearch size={16} />} title="AI本の解析" />
      <p style={{ fontSize: 11, color: "var(--c-ink-2)", marginBottom: 10, lineHeight: 1.5 }}>ボタンを押すとAIが本の核心・構造・著者の視点を分析します</p>
      <button onClick={onRunAnalysis} disabled={!form.title.trim() || aiLoading} style={{ ...aiB, opacity: !form.title.trim() || aiLoading ? 0.5 : 1 }}>
        {aiLoading && !form.aiAnalysis ? "分析中..." : "🔍 AIで本を解析する"}
      </button>
      {aiLoading && !form.aiAnalysis && <Dots />}
      {form.aiAnalysis && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-accent)", marginBottom: 4 }}>
            解析結果
            {aiLoading && !form.aiStrategy && <span className="streaming-cursor" aria-hidden="true" style={{ marginLeft: 6 }} />}
          </p>
          <MarkdownSections
            text={form.aiAnalysis}
            onAddRelatedBook={aiLoading ? undefined : onAddRelatedBook}
            addingTitles={addingTitles}
          />
        </div>
      )}

      {/* ⚠️ 投資目的〜読書計画は AI 解析の実行にゲートしない。AI を使わない /
          月次上限 / オフラインのユーザーも、投資目的さえ書けば読書を開始できる
          （「目的なき読書はしない」は投資目的の必須化で守る。AI は任意の補助）。 */}
      <>
          <SectionHeader icon={<IcMap size={16} />} title="読書戦略の作成" />
          {/* AI 選書から構造化要約 / source_query を引き継ぎ済みなら、ユーザーが
              「あれ、なんで既に文字が入ってるの？」と戸惑わないように
              バナーで明示する。bookReason があれば「会話を要約しました」、
              無ければ旧来の「AI 選書で入力した内容」表現を使い分ける。 */}
          {(form.bookReason || form.sourceQuery) && (
            <div
              style={{
                background: 'var(--color-warning-soft)',
                border: '1px solid #e0c878',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 12,
                marginBottom: 12,
                color: '#5D4037',
                lineHeight: 1.7,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
              }}
            >
              <IcBulb size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {form.bookReason
                  ? 'AI 選書で話した内容を元に、AI が読書計画を作成しました。編集して自分の言葉に直すと、より効果的です。'
                  : 'AI 選書で入力した内容を引き継ぎました。必要に応じて編集してください。'}
              </span>
            </div>
          )}

          <Field label={<><IcBar size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />投資目的（必須）</>} sub="何のためにこの本を読むか（1〜2 文）。これが読書のリターンを決めます">
            <textarea
              value={form.investPurpose || ""}
              onChange={(e) => setForm({ ...form, investPurpose: e.target.value })}
              placeholder="例：営業成績を半年で 1.5 倍にする"
              rows={3}
              style={ta}
              maxLength={LIMITS.memoText}
            />
          </Field>
          {/* sourceQuery が違うなら「↩ AI 選書で入力した内容に戻す」 */}
          {form.sourceQuery && (form.investPurpose || '').trim() !== form.sourceQuery.trim() && (
            <button
              type="button"
              onClick={() => setForm({ ...form, investPurpose: form.sourceQuery })}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-accent)',
                fontSize: 11,
                padding: '0 0 8px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              ↩ AI 選書で入力した内容に戻す
            </button>
          )}

          <Field label={<><IcAlert size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />現在の課題</>} sub="今直面している具体的な問題">
            <textarea
              value={form.currentChallenge || ""}
              onChange={(e) => setForm({ ...form, currentChallenge: e.target.value })}
              placeholder="例：初回商談で信頼構築に時間がかかる"
              rows={3}
              style={ta}
              maxLength={LIMITS.memoText}
            />
          </Field>

          <Field label={<><IcBulb size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />仮説</>} sub="この本を読むとどう変わると考えているか">
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
            <div
              style={{
                marginTop: 4,
                marginBottom: 12,
                padding: '10px 12px',
                background: 'var(--c-soft)',
                border: '1px solid var(--c-hairline)',
                borderRadius: 10,
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-brand)', margin: 0 }}>
                <IcBot size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
                AI の選書理由
              </p>
              <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', lineHeight: 1.7, margin: '6px 0 4px', whiteSpace: 'pre-wrap' }}>
                {form.bookReason}
              </p>
              <small style={{ fontSize: 10, color: 'var(--c-ink-2)' }}>※ この内容は AI 選書時の判断です。編集できません。</small>
            </div>
          )}

          <button onClick={onRunStrategy} disabled={!form.investPurpose?.trim() || aiLoading} style={{ ...aiB, opacity: !form.investPurpose?.trim() || aiLoading ? 0.5 : 1 }}>
            {aiLoading && form.aiAnalysis ? "作成中..." : "🗺️ 読書計画シートを作成"}
          </button>
          {aiLoading && form.aiAnalysis && !form.aiStrategy && <Dots />}
          {form.aiStrategy && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-accent)", marginBottom: 4 }}>
読書計画シート
                {aiLoading && <span className="streaming-cursor" aria-hidden="true" style={{ marginLeft: 6 }} />}
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

              {/* Refinement: send the existing sheet + a free-form instruction
                  to the AI. Keeps a 1-step history in localStorage so the
                  user can undo. */}
              <div style={{ marginTop: 12, padding: "12px 14px", background: "#f5efde", border: "1px solid #e0d0a8", borderRadius: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--c-brand)", margin: 0 }}>
                  📝 修正リクエスト
                </p>
                <p style={{ fontSize: 11, color: "var(--c-ink-2)", margin: "4px 0 8px", lineHeight: 1.6 }}>
                  例：もっと簡潔に / 営業視点を強化 / 章番号を増やして
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
                  placeholder="修正したい点を入力"
                  rows={2}
                  style={{ ...ta, minHeight: 60, maxHeight: 200 }}
                  maxLength={LIMITS.memoText}
                  aria-label="読書計画シートの修正指示"
                  disabled={aiLoading}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={submitEdit}
                    disabled={!editInstruction.trim() || aiLoading}
                    style={{
                      ...btnS,
                      padding: "10px 18px",
                      fontSize: 13,
                      opacity: !editInstruction.trim() || aiLoading ? 0.5 : 1,
                    }}
                  >
                    {aiLoading ? "修正中..." : "🔧 修正する"}
                  </button>
                  {hasStrategyHistory && !aiLoading && (
                    <button
                      type="button"
                      onClick={onUndoStrategy}
                      style={{
                        ...btnO,
                        padding: "10px 14px",
                        fontSize: 12,
                      }}
                      aria-label="ひとつ前の読書計画シートに戻す"
                    >
                      ↶ 元に戻す
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
      </>

      {/* 投資目的が書けていれば保存と同時に読書中へ自動遷移する。
          handleSave 側で同じ条件 (form.investPurpose) を見て status='reading'
          に切替 + setView('detail') を行う。AI 解析/計画シートは任意の補助で、
          自動遷移の条件には含めない（AI 不使用でも読書を始められる）。
          条件が揃っていない場合は通常の「保存」(その場で留まる)。 */}
      {(() => {
        // handleSave の自動遷移条件と一致させる（status='before' のみ）。
        // 読書中/読了の本を openSetup で開いた時に「読書を開始する」と
        // 誤表示しない。
        const setupReady =
          form.status === 'before' &&
          (form.investPurpose && form.investPurpose.trim());
        return (
          <button onClick={onSave} style={{ ...btnS, width: "100%", marginTop: 20 }}>
            {setupReady ? '💾 保存して読書を開始する' : '💾 保存'}
          </button>
        );
      })()}
    </div>
  );
}

// Phase 3: 読書中（インプット）
// ページ入力を「0〜10万の整数」にクランプ。NaN / 負 / 巨大値を弾く。
// 空入力は 0（＝未設定）に倒す。保存時に useBooks 側でも null 正規化される。
const clampPage = (v) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 100000);
};

export function ReadingPhase({ form, setForm, onSave, onSaveSummary, onPersistAnalysis, onMakeAction, allTags, allFolders }) {
  // 📖 読書進捗（ページ管理）は撤去（本田哲学=「作業量の可視化」は成果ではない／
  // 進捗を見て満足する病を生む）。totalPages は書誌メタとして裏で保持するのみで
  // UI には出さない。データ列は dormant（復活は容易・既存値は保持）。
  const addAction = () => setForm({ ...form, actions: [...(form.actions || []), { text: "", deadline: "", done: false }] });
  const updateAction = (i, key, val) => {
    const a = [...(form.actions || [])];
    a[i] = { ...a[i], [key]: val };
    setForm({ ...form, actions: a });
  };
  const removeAction = (i) => setForm({ ...form, actions: (form.actions || []).filter((_, j) => j !== i) });
  return (
    <div>
      <p style={phaseDesc}><IcBook size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読書中のインプットを記録しましょう</p>

      {form.aiStrategy && (
        <div style={{ background: "var(--c-soft)", borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#7a5080", marginBottom: 4 }}>📋 読書計画シート要約</p>
          <p style={{ fontSize: 12, color: "var(--c-ink-soft)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto", paddingRight: 8, margin: 0 }}>
            {form.aiStrategy}
          </p>
        </div>
      )}

      <Field label="メモ・感想" sub="気づきや感想を、気軽に。1メモ=1カードで残すか、1冊まるごと1つのテキストにまとめるか、タブで選べます。">
        <BookMemoList
          bookId={form.id}
          bookTitle={form.title}
          bookAuthor={form.author || ""}
          summaryText={form.leverageMemo || ""}
          onSaveSummary={onSaveSummary}
          onMakeAction={onMakeAction}
        />
      </Field>

      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>
      <Field label="フォルダ" sub="本棚をグループ分け（任意・複数可）">
        <TagInput tags={form.collections || []} onChange={(c) => setForm({ ...form, collections: c })} allTags={allFolders} />
      </Field>

      {/* 📊 読書中でも：メモ→目的照合→学び/視点→行動提案（AI がタスク作成を支援） */}
      {form.id && (
        <div style={{ marginBottom: 14 }}>
          <BookLearningAnalysis
            book={form}
            onAddToActions={(text) => setForm((f) => ({ ...f, actions: [...(f.actions || []), { text, deadline: "", done: false }] }))}
            onSaveToBook={onPersistAnalysis}
          />
        </div>
      )}

      <SectionHeader icon={<IcZap size={16} />} title="この本から決めた行動" />
      <p style={{ fontSize: 11, color: "var(--c-ink-2)", marginBottom: 10, lineHeight: 1.5 }}>読みながら「やってみよう」と思ったことを、行動にしておきましょう。</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(form.actions || []).map((a, i) => (
          <div key={i} style={{ background: "#f7f3ec", borderRadius: 10, padding: "12px 14px", display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={a.text} onChange={(e) => updateAction(i, "text", e.target.value)} placeholder={i === 0 ? "例：明日の朝、学んだ手法を1つ試す" : `行動 ${i + 1}`} style={{ ...inp, flex: 1 }} maxLength={LIMITS.actionText} />
              <button onClick={() => removeAction(i)} aria-label={`行動 ${i + 1} を削除`} style={{ background: "none", border: "none", fontSize: 16, color: "#c4a0a0", cursor: "pointer", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", margin: "-8px -10px -8px -4px" }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--c-ink-2)", minWidth: 56 }}><IcCal size={12} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />期限</span>
              <input type="date" value={a.deadline || ""} onChange={(e) => updateAction(i, "deadline", e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
          </div>
        ))}
        <button onClick={addAction} style={{ ...btnO, padding: "10px 0", fontSize: 12, borderStyle: "dashed" }}>＋ 行動を追加</button>
      </div>

      <button onClick={onSave} style={{ ...btnS, width: "100%", marginTop: 16 }}>保存</button>
    </div>
  );
}

// Phase 4: 読了（投資回収）
export function DonePhase({ form, setForm, onSave, onPersistAnalysis, allTags, allFolders }) {
  const addAction = () => setForm({ ...form, actions: [...(form.actions || []), { text: "", deadline: "", done: false }] });
  const updateAction = (i, key, val) => {
    const a = [...(form.actions || [])];
    a[i] = { ...a[i], [key]: val };
    setForm({ ...form, actions: a });
  };
  const removeAction = (i) => setForm({ ...form, actions: (form.actions || []).filter((_, j) => j !== i) });

  return (
    <div>
      <p style={phaseDesc}><IcCheck size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />読み終えて、振り返りましょう</p>

      <Field label="読書完了日">
        <input type="date" value={form.doneDate || ""} onChange={(e) => setForm({ ...form, doneDate: e.target.value })} style={inp} />
      </Field>

      <Field label="評価（投資対効果）">
        <div style={{ padding: "4px 0" }}>
          <Stars r={form.rating} onChange={(r) => setForm({ ...form, rating: r })} size={28} />
        </div>
      </Field>

      {/* 📊 本の AI synthesis は「学びを分析」に一本化（旧「AIでメモを要約」は統合・撤去）。
          メモ→目的照合→学び/視点→行動提案。提案はタップで行動化、保存で全体に還流。 */}
      {form.id && (
        <div style={{ marginBottom: 14 }}>
          <BookLearningAnalysis
            book={form}
            onAddToActions={(text) => setForm((f) => ({ ...f, actions: [...(f.actions || []), { text, deadline: "", done: false }] }))}
            onSaveToBook={onPersistAnalysis}
          />
        </div>
      )}

      {/* この本の AI まとめ（学び分析の保存先・編集可・全体に活かされる） */}
      {form.aiSummary?.trim() && (
        <Field label={<><IcBot size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />この本のAI まとめ</>} sub="「学びを分析」で保存した内容です。自由に編集でき、マイ読書脳・テーマまとめ・振り返りに活かされます。">
          <textarea value={form.aiSummary} onChange={(e) => setForm({ ...form, aiSummary: e.target.value })} rows={5} style={ta} maxLength={LIMITS.memoText} />
        </Field>
      )}

      <SectionHeader icon={<IcZap size={16} />} title="次の 1 週間でやる行動" />
      <p style={{ fontSize: 11, color: "var(--c-ink-2)", marginBottom: 10, lineHeight: 1.5 }}>本を読みっぱなしにしないために、具体的な行動を 1〜3 つ書きましょう。</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(form.actions || []).map((a, i) => (
          <div key={i} style={{ background: "#f7f3ec", borderRadius: 10, padding: "12px 14px", display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={a.text} onChange={(e) => updateAction(i, "text", e.target.value)} placeholder={i === 0 ? "例：営業会議で結論ファーストを実践" : `行動 ${i + 1}`} style={{ ...inp, flex: 1 }} maxLength={LIMITS.actionText} />
              <button onClick={() => removeAction(i)} aria-label={`行動 ${i + 1} を削除`} style={{ background: "none", border: "none", fontSize: 16, color: "#c4a0a0", cursor: "pointer", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", margin: "-8px -10px -8px -4px" }}>×</button>
            </div>
            {/* 期限のみをインラインで。優先度・繰り返しなどの詳細は「行動」タブの
                編集（ActionEditModal）に集約し、本詳細はまず"何をやるか"を素早く
                捉える1画面に絞る（本田: 1画面1アクション）。 */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--c-ink-2)", minWidth: 56 }}><IcCal size={12} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />期限</span>
              <input type="date" value={a.deadline || ""} onChange={(e) => updateAction(i, "deadline", e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
          </div>
        ))}
        <button onClick={addAction} style={{ ...btnO, padding: "10px 0", fontSize: 12, borderStyle: "dashed" }}>＋ 行動を追加</button>
        {(form.actions || []).length > 0 && (
          <p style={{ fontSize: 11, color: "var(--c-ink-3)", margin: "2px 2px 0", lineHeight: 1.6 }}>
            優先度・繰り返しは、追加後に「振り返り」タブ →「行動」で設定できます。
          </p>
        )}
      </div>

      <Field label={<><IcBulb size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />一番の収穫（1行）</>} sub="この本から得た一番大きな価値を 1 行で">
        {/* input → textarea (rows=3) に変更。シングルライン input だと placeholder が
            画面幅で見切れる問題があった。placeholder も短く具体的に。 */}
        <textarea
          value={form.roiSummary || ""}
          onChange={(e) => setForm({ ...form, roiSummary: e.target.value })}
          placeholder="例：意思決定が速くなる思考法を獲得"
          rows={3}
          style={{ ...ta, minHeight: 84 }}
          maxLength={LIMITS.memoText}
        />
      </Field>

      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>
      <Field label="フォルダ" sub="本棚をグループ分け（任意・複数可）">
        <TagInput tags={form.collections || []} onChange={(c) => setForm({ ...form, collections: c })} allTags={allFolders} />
      </Field>

      <button onClick={onSave} style={{ ...btnS, width: "100%", marginTop: 8 }}>保存</button>
    </div>
  );
}
