import { useAuth } from './hooks/useAuth';
import { useBooks } from './hooks/useBooks';
import { callClaude } from './lib/ai';
import AuthScreen from './components/auth/AuthScreen';
import AuthCallback from './components/auth/AuthCallback';
import BookMemoList from './components/BookMemoList';
import BookMemoEditor from './components/BookMemoEditor';
import QuickMemoSheet from './components/QuickMemoSheet';
import Onboarding, { isOnboardingCompleted, clearOnboardingCompletion } from './components/Onboarding';
import HelpModal from './components/HelpModal';
import Review from './components/Review';
import MyBookBrain from './components/MyBookBrain';
import AccountSettings from './components/AccountSettings';
import SplashScreen from './components/SplashScreen';
import Spinner from './components/Spinner';
import { BookListSkeleton } from './components/Skeleton';
import { fireConfetti } from './lib/confetti';
import { useToast } from './components/Toast';
import { useConfirm } from './components/ConfirmDialog';
import { toMessage, fieldRequiredMessage } from './lib/errors';
import { LIMITS } from './lib/limits';
import { ensureHttps } from './lib/url';
import { useBookMemos } from './hooks/useBookMemos';
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const STAR = "★";
const EMPTY_STAR = "☆";
const STORAGE_KEY = "leverage-reading-data";

const STATUSES = [
  { key: "want", label: "読みたい", emoji: "🔖", bg: "#f0e8d8", color: "#8a7040" },
  { key: "before", label: "読書前", emoji: "📐", bg: "#f0e0f0", color: "#7a5080" },
  { key: "reading", label: "読書中", emoji: "📖", bg: "#dde8f0", color: "#4a6e8a" },
  { key: "done", label: "読了", emoji: "✅", bg: "#e2ecd8", color: "#5a7a48" },
];
const getSt = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];

/* ========== Storage ========== */
function loadData() {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {}
  return { books: [], collections: [], goal: 24, readingPlans: {} };
}
function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

/* ========== AI ========== */
const AI_SYS = "レバレッジ・リーディング専門メンター。本田直之氏の哲学に基づき読書ROIを最大化。本は投資、重要20%で80%成果、目的なき読書はしない、行動が全て。マークダウン不使用、見出しは【】で囲む。日本語で回答。";

const ANALYSIS_PROMPT = (t, a) =>
  `「${t}」（${a || "著者不明"}）を分析してください。\n\n【本の核心】この本が伝える最も重要なメッセージを1行で。\n【パラダイムシフト】この本が覆そうとしている古い常識。\n【著者のポジション】著者の強み・偏り・立場。\n【構造マップ】全体の論理展開。重要な20%がどこに集中しているかの示唆を含めて。`;

const STRATEGY_PROMPT = (t, a, analysis, purpose) =>
  `本：「${t}」（${a || "著者不明"}）\n\n【本の解析結果】\n${analysis}\n\n【読者の投資目的・課題・仮説】\n${purpose}\n\nレバレッジ・リーディングの原則に基づいた読書戦略を作成してください。\n\n【投資戦略】この読書で得るべきリターンの再定義。重点的に読む箇所（20%）と流し読みでよい箇所。\n【検証すべき3つの問い】読みながら答えを探す、投資回収に直結する問い。\n【事前インストール】読む前に頭に入れておくべき概念（3〜5個）。\n【回収ゴール】読了後「誰に何をどう説明できれば投資成功か」を1文で。`;

const SUMMARY_PROMPT = (t, memos) =>
  `「${t}」のレバレッジメモを要約・整理してください。重複を省き、3〜5個の重要ポイントに凝縮してください。\n\n【レバレッジメモ（原文）】\n${memos}`;

// Amazon affiliate tag - ここにあなたのAmazonアソシエイトIDを入れてください
const AMAZON_TAG = "leveragereadi-22";

function amazonLink(title, author) {
  const q = encodeURIComponent(`${title} ${author}`.trim());
  return `https://www.amazon.co.jp/s?k=${q}&tag=${AMAZON_TAG}`;
}

const ADVISOR_SYSTEM = `あなたは「読書投資アドバイザー」です。ユーザーの課題・目標・悩みをヒアリングし、最適な本を選書します。

あなたの役割：
1. まずユーザーの状況を理解するために1〜2回質問する（いきなり本を推薦しない）
2. 状況が把握できたら、3冊の本を推薦する
3. 推薦する時は必ず以下のJSON形式で出力する

ヒアリング中は自然な日本語で会話してください。
推薦する準備ができたら、以下の形式で回答してください（他のテキストは含めない）：

RECOMMENDATIONS_START
[
  {"title": "本のタイトル", "author": "著者名", "reason": "この本を推薦する理由（2〜3文）"},
  {"title": "本のタイトル", "author": "著者名", "reason": "この本を推薦する理由（2〜3文）"},
  {"title": "本のタイトル", "author": "著者名", "reason": "この本を推薦する理由（2〜3文）"}
]
RECOMMENDATIONS_END

推薦する本は実在する本のみ。架空の本は絶対に推薦しない。日本語で読める本を優先する。`;


/* ========== ISBN / Search ========== */
async function lookupISBN(isbn) {
  try {
    const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    const d = await r.json();
    if (d?.[0]?.summary) { const s = d[0].summary; return { title: s.title || "", author: s.author || "", cover: s.cover || "" }; }
  } catch {}
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const d = await r.json();
    if (d.items?.[0]?.volumeInfo) { const v = d.items[0].volumeInfo; return { title: v.title || "", author: (v.authors || []).join(", "), cover: v.imageLinks?.thumbnail || "" }; }
  } catch {}
  return null;
}

async function searchBooksAPI(q) {
  // Try OpenBD first for Japanese books
  try {
    const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(q)}`);
    const d = await r.json();
    if (d?.[0]?.summary?.title) {
      const s = d[0].summary;
      return [{ title: s.title, author: s.author || "", cover: s.cover || "", pages: 0 }];
    }
  } catch {}
  // Google Books without langRestrict (it blocks too many Japanese results)
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10`);
    if (!r.ok) throw new Error("API error");
    const d = await r.json();
    if (!d.items || d.items.length === 0) return [];
    return d.items.map((i) => {
      const v = i.volumeInfo;
      return { title: v.title || "", author: (v.authors || []).join(", "), cover: v.imageLinks?.thumbnail || "", pages: v.pageCount || 0 };
    });
  } catch { return []; }
}

/* ========== Book Search Modal ========== */
function BookSearchModal({ onSelect, onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const isISBN = (str) => /^[\d]{10,13}$/.test(str);

  const doSearch = async () => {
    if (!q.trim()) return;
    setSearching(true); setNotFound(false); setResults([]);
    const cleaned = q.replace(/[-\s]/g, "");
    if (isISBN(cleaned)) {
      const info = await lookupISBN(cleaned);
      if (info && info.title) { setResults([{ title: info.title, author: info.author, cover: info.cover, pages: 0 }]); }
      else { setNotFound(true); }
      setSearching(false); return;
    }
    const res = await searchBooksAPI(q);
    setResults(res);
    if (res.length === 0) setNotFound(true);
    setSearching(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: "#3d362c" }}>🔍 本を検索</h3>
        <button onClick={onClose} style={closeBtn}>×</button>
      </div>
      <p style={{ fontSize: 11, color: "#a89e8c", lineHeight: 1.5 }}>タイトル・著者名・ISBNで検索できます</p>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="タイトル、著者名、ISBN" style={{ ...inp, flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); doSearch(); } }} autoFocus />
        <button onClick={doSearch} style={{ ...btnS, padding: "8px 14px", fontSize: 12 }}>検索</button>
      </div>
      {searching && <Dots />}
      {notFound && <p style={{ fontSize: 12, color: "#a05040", textAlign: "center", padding: 16 }}>見つかりませんでした</p>}
      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
          {results.map((b, i) => (
            <button key={i} onClick={() => onSelect(b)} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 10, border: "1px solid #e4ddd0", background: "#faf6f0", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              {b.cover ? <img src={ensureHttps(b.cover)} alt="" style={{ width: 32, height: 44, objectFit: "cover", borderRadius: 4 }} /> : <BookIcon />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#3d362c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                {b.author && <div style={{ fontSize: 11, color: "#9a8e7a" }}>{b.author}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========== Primitives ========== */
function Stars({ r, onChange, size = 18 }) {
  return (
    <span style={{ cursor: onChange ? "pointer" : "default", userSelect: "none" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} onClick={() => onChange?.(r === n ? 0 : n)} style={{ fontSize: size, color: n <= r ? "#d4a040" : "#d0c8b8", marginRight: 2 }}>
          {n <= r ? STAR : EMPTY_STAR}
        </span>
      ))}
    </span>
  );
}

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(30,25,20,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#faf6f0", borderRadius: 14, padding: "22px 20px", width: "min(420px,92vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 16px 48px rgba(30,25,20,0.16)", animation: "slideUp .25s" }}>
        {children}
      </div>
    </div>
  );
}

function Dots() {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 4, padding: "12px 0" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: "#d4a040", animation: `pulse 1s infinite ${i * 0.2}s` }} />
      ))}
    </div>
  );
}

function Field({ label, sub, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, color: "#5c5548", fontWeight: 500, display: "block", marginBottom: sub ? 2 : 5 }}>{label}</label>
      {sub && <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 5, lineHeight: 1.5 }}>{sub}</p>}
      {children}
    </div>
  );
}

function Card({ label, text, bg }) {
  return (
    <div style={{ background: bg || "#f7f3ec", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#8a7040", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 13, color: "#4a4036", lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto", paddingRight: 8, margin: 0 }}>{text}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = getSt(status);
  return (
    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.color, fontWeight: 600, letterSpacing: 0.3, display: "inline-flex", alignItems: "center", gap: 3 }}>
      {s.emoji} {s.label}
    </span>
  );
}

function BookIcon() {
  return (
    <div style={{ width: 32, height: 44, background: "#e8e2d6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📕</div>
  );
}

function TagInput({ tags, onChange, allTags }) {
  const [input, setInput] = useState("");
  const add = (t) => { const tag = (t || input).trim(); if (tag && !tags.includes(tag)) onChange([...tags, tag]); setInput(""); };
  const suggestions = (allTags || []).filter((t) => !tags.includes(t));
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: tags.length ? 6 : 0 }}>
        {tags.map((t, i) => (
          <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#eae3d6", color: "#7a6e58", display: "flex", alignItems: "center", gap: 4 }}>
            {t}
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} style={{ background: "none", border: "none", fontSize: 12, color: "#a89e8c", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: "#b5aa96", lineHeight: "22px" }}>過去のタグ:</span>
          {suggestions.map((t) => (
            <button key={t} onClick={() => add(t)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, border: "1px dashed #d4ccbe", background: "transparent", color: "#8a7e6b", cursor: "pointer", fontFamily: "inherit" }}>+ {t}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="タグを追加" style={{ ...inp, flex: 1 }} maxLength={LIMITS.tag} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
        <button onClick={() => add()} style={{ ...btnO, padding: "6px 12px", fontSize: 12 }}>追加</button>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <h3 style={{ fontSize: 15, fontWeight: 500, color: "#3d362c", marginBottom: 12, marginTop: 24 }}>
      {icon} {title}
    </h3>
  );
}

/* ========== Data ========== */
const emptyBook = () => ({
  id: "", title: "", author: "", cover: "", rating: 0, status: "want",
  startDate: "", doneDate: "", tags: [], currentPage: 0, totalPages: 0,
  investPurpose: "", aiAnalysis: "", aiStrategy: "",
  leverageMemo: "", aiSummary: "",
  actions: [], roiSummary: "",
});

/* ========== Phase Screens ========== */

// Phase 1: 読みたい → just register
function WantPhase({ form, setForm, onSave, onSearchOpen, allTags }) {
  return (
    <div>
      <p style={phaseDesc}>📖 読みたい本を登録しましょう</p>
      <button onClick={onSearchOpen} style={{ ...btnO, width: "100%", padding: "14px 0", borderStyle: "dashed", fontSize: 14, marginBottom: 12 }}>
        🔍 タイトル・ISBNで検索して登録
      </button>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
        {form.cover && <img src={ensureHttps(form.cover)} alt="" style={{ width: 50, height: 70, objectFit: "cover", borderRadius: 6, border: "1px solid #e0d8c8", flexShrink: 0 }} />}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="タイトル *" style={inp} maxLength={LIMITS.bookTitle} />
          <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="著者" style={inp} maxLength={LIMITS.bookAuthor} />
        </div>
      </div>
      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>
      <button onClick={onSave} disabled={!form.title.trim()} style={{ ...btnS, width: "100%", marginTop: 8, opacity: form.title.trim() ? 1 : 0.5 }}>
        保存
      </button>
    </div>
  );
}

// Phase 2: 読書前（投資設計）
function BeforePhase({ form, setForm, onSave, aiLoading, onRunAnalysis, onRunStrategy }) {
  return (
    <div>
      <p style={phaseDesc}>📐 読書の投資設計をしましょう</p>

      <Field label="読書開始日">
        <input type="date" value={form.startDate || ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inp} />
      </Field>

      <SectionHeader icon="🔍" title="AI本の解析" />
      <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 10, lineHeight: 1.5 }}>ボタンを押すとAIが本の核心・構造・著者の視点を分析します</p>
      <button onClick={onRunAnalysis} disabled={!form.title.trim() || aiLoading} style={{ ...aiB, opacity: !form.title.trim() || aiLoading ? 0.5 : 1 }}>
        {aiLoading && !form.aiAnalysis ? "分析中..." : "🔍 AIで本を解析する"}
      </button>
      {aiLoading && !form.aiAnalysis && <Dots />}
      {form.aiAnalysis && <Card label="解析結果" text={form.aiAnalysis} />}

      {form.aiAnalysis && (
        <>
          <SectionHeader icon="🗺️" title="読書戦略の作成" />
          <Field label="投資目的・現在の課題・仮説" sub="この本に何を期待するか？">
            <textarea value={form.investPurpose || ""} onChange={(e) => setForm({ ...form, investPurpose: e.target.value })}
              placeholder={"・目的：\n・課題：\n・仮説："} rows={4} style={ta} maxLength={LIMITS.memoText} />
          </Field>
          <button onClick={onRunStrategy} disabled={!form.investPurpose?.trim() || aiLoading} style={{ ...aiB, opacity: !form.investPurpose?.trim() || aiLoading ? 0.5 : 1 }}>
            {aiLoading && form.aiAnalysis ? "作成中..." : "🗺️ セットアップシートを作成"}
          </button>
          {aiLoading && form.aiAnalysis && !form.aiStrategy && <Dots />}
          {form.aiStrategy && <Card label="読書前セットアップシート" text={form.aiStrategy} />}
        </>
      )}

      <button onClick={onSave} style={{ ...btnS, width: "100%", marginTop: 20 }}>保存</button>
    </div>
  );
}

// Phase 3: 読書中（インプット）
function ReadingPhase({ form, setForm, onSave, onSaveSummary, allTags }) {
  const pct = form.totalPages > 0 ? Math.min(Math.round((form.currentPage / form.totalPages) * 100), 100) : 0;
  return (
    <div>
      <p style={phaseDesc}>📖 読書中のインプットを記録しましょう</p>

      {form.aiStrategy && (
        <div style={{ background: "#f0ebe2", borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "#7a5080", marginBottom: 4 }}>📋 セットアップシート要約</p>
          <p style={{ fontSize: 12, color: "#5c5548", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto", paddingRight: 8, margin: 0 }}>
            {form.aiStrategy}
          </p>
        </div>
      )}

      <Field label="読書進捗">
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input type="number" value={form.currentPage || ""} onChange={(e) => setForm({ ...form, currentPage: parseInt(e.target.value) || 0 })} placeholder="現在" style={{ ...inp, width: 80, textAlign: "center" }} />
          <span style={{ color: "#b5aa96" }}>/</span>
          <input type="number" value={form.totalPages || ""} onChange={(e) => setForm({ ...form, totalPages: parseInt(e.target.value) || 0 })} placeholder="総ページ" style={{ ...inp, width: 80, textAlign: "center" }} />
          <span style={{ fontSize: 12, color: "#8a7e6b" }}>ページ</span>
        </div>
        {form.totalPages > 0 && (
          <div>
            <div style={{ height: 8, background: "#e0d8c8", borderRadius: 4 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#5a7a48" : "#4a6e8a", borderRadius: 4, transition: "width .3s" }} />
            </div>
            <p style={{ fontSize: 11, color: "#9a8e7a", marginTop: 4, textAlign: "right" }}>{pct}%</p>
          </div>
        )}
      </Field>

      <Field label="レバレッジメモ" sub="📇 カード式（1メモ=1カード、ページ番号・写真・タグ）と 📝 まとめ式（1冊1テキスト）をタブで切替。">
        <BookMemoList
          bookId={form.id}
          bookTitle={form.title}
          summaryText={form.leverageMemo || ""}
          onSaveSummary={onSaveSummary}
        />
      </Field>

      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>

      <button onClick={onSave} style={{ ...btnS, width: "100%", marginTop: 8 }}>保存</button>
    </div>
  );
}

// Phase 4: 読了（投資回収）
function DonePhase({ form, setForm, onSave, aiLoading, onRunSummary, allTags }) {
  const addAction = () => setForm({ ...form, actions: [...(form.actions || []), { text: "", deadline: "", done: false }] });
  const updateAction = (i, key, val) => {
    const a = [...(form.actions || [])];
    a[i] = { ...a[i], [key]: val };
    setForm({ ...form, actions: a });
  };
  const removeAction = (i) => setForm({ ...form, actions: (form.actions || []).filter((_, j) => j !== i) });

  return (
    <div>
      <p style={phaseDesc}>💰 投資回収をまとめましょう</p>

      <Field label="読書完了日">
        <input type="date" value={form.doneDate || ""} onChange={(e) => setForm({ ...form, doneDate: e.target.value })} style={inp} />
      </Field>

      <Field label="評価（ROI）">
        <div style={{ padding: "4px 0" }}>
          <Stars r={form.rating} onChange={(r) => setForm({ ...form, rating: r })} size={28} />
        </div>
      </Field>

      {form.leverageMemo?.trim() && (
        <>
          <SectionHeader icon="🤖" title="AIメモ要約" />
          <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 10, lineHeight: 1.5 }}>レバレッジメモをAIが3〜5個のポイントに凝縮します</p>
          <button onClick={onRunSummary} disabled={aiLoading} style={{ ...aiB, opacity: aiLoading ? 0.5 : 1 }}>
            {aiLoading ? "要約中..." : "🤖 AIでメモを要約・整理"}
          </button>
          {aiLoading && <Dots />}
          {form.aiSummary && <Card label="要約結果" text={form.aiSummary} bg="#e2ecd8" />}
          {form.aiSummary && (
            <Field label="要約の編集" sub="AIの要約を自由に修正できます">
              <textarea value={form.aiSummary} onChange={(e) => setForm({ ...form, aiSummary: e.target.value })} rows={5} style={ta} />
            </Field>
          )}
        </>
      )}

      <SectionHeader icon="⚡" title="行動リスト" />
      <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 10, lineHeight: 1.5 }}>この本から得た学びを具体アクションに変換。期限を自由に設定。</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(form.actions || []).map((a, i) => (
          <div key={i} style={{ background: "#f7f3ec", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <input value={a.text} onChange={(e) => updateAction(i, "text", e.target.value)} placeholder={`行動 ${i + 1}`} style={{ ...inp, flex: 1 }} />
              <button onClick={() => removeAction(i)} style={{ background: "none", border: "none", fontSize: 16, color: "#c4a0a0", cursor: "pointer" }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#9a8e7a" }}>期限:</span>
              <input type="date" value={a.deadline || ""} onChange={(e) => updateAction(i, "deadline", e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
          </div>
        ))}
        <button onClick={addAction} style={{ ...btnO, padding: "10px 0", fontSize: 12, borderStyle: "dashed" }}>＋ 行動を追加</button>
      </div>

      <Field label="ROI一言まとめ" sub="この本の投資リターンを一言で">
        <input value={form.roiSummary || ""} onChange={(e) => setForm({ ...form, roiSummary: e.target.value })} placeholder="例：意思決定スピードが2倍になる思考法を得た" style={inp} maxLength={LIMITS.memoText} />
      </Field>

      <Field label="タグ">
        <TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} allTags={allTags} />
      </Field>

      <button onClick={onSave} style={{ ...btnS, width: "100%", marginTop: 8 }}>保存</button>
    </div>
  );
}

/* ========== Tab: Today ========== */
function TodayTab({ books }) {
  const cards = useMemo(() => {
    const all = [];
    books.forEach((b) => {
      if (b.leverageMemo?.trim()) all.push({ type: "memo", title: b.title, author: b.author, cover: b.cover, text: b.leverageMemo, tags: b.tags || [] });
      if (b.aiSummary?.trim()) all.push({ type: "summary", title: b.title, text: b.aiSummary });
      if (b.roiSummary?.trim()) all.push({ type: "roi", title: b.title, text: b.roiSummary });
      (b.actions || []).filter((a) => a.text?.trim()).forEach((a) => all.push({ type: "action", title: b.title, text: a.text, done: a.done }));
    });
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all;
  }, [books]);

  const [idx, setIdx] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const next = () => setIdx((i) => (i + 1) % cards.length);
  const prev = () => setIdx((i) => (i - 1 + cards.length) % cards.length);
  const safeIdx = Math.min(idx, Math.max(0, cards.length - 1));

  if (!cards.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 48, marginBottom: 12 }}>📚</p>
        <p style={{ fontSize: 15, color: "#5c5548", fontWeight: 500 }}>学びを蓄積しよう</p>
        <p style={{ fontSize: 12, color: "#a89e8c", marginTop: 6, lineHeight: 1.6 }}>本を読んでメモを記録すると、<br />毎日ここに学びが表示されます。</p>
      </div>
    );
  }

  const c = cards[safeIdx];
  const typeLabel = { memo: "メモ", summary: "要約", roi: "ROI", action: "行動" };
  const typeBg = { memo: "#f0e8d8", summary: "#e2ecd8", roi: "#f0e8d8", action: "#dde8f0" };
  const typeColor = { memo: "#8a7040", summary: "#5a7a48", roi: "#8a7040", action: "#4a6e8a" };

  return (
    <div style={{ padding: "0 20px" }}
      onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={(e) => { if (touchStart === null) return; const diff = e.changedTouches[0].clientX - touchStart; if (Math.abs(diff) > 50) { diff < 0 ? next() : prev(); } setTouchStart(null); }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 11, color: "#a89e8c", letterSpacing: 3, fontWeight: 500 }}>TODAY'S LEVERAGE</p>
        <p style={{ fontSize: 11, color: "#c4b8a6", marginTop: 2 }}>{safeIdx + 1} / {cards.length}</p>
      </div>
      <div key={safeIdx} style={{ background: "#faf6f0", borderRadius: 16, padding: "20px 18px", border: "1px solid #e4ddd0", minHeight: 160, animation: "fadeIn .3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {c.cover && <img src={ensureHttps(c.cover)} alt="" style={{ width: 28, height: 40, objectFit: "cover", borderRadius: 4 }} />}
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "#3d362c" }}>{c.title}</p>
            {c.author && <p style={{ fontSize: 11, color: "#9a8e7a" }}>{c.author}</p>}
          </div>
          <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 8, background: typeBg[c.type], color: typeColor[c.type] }}>
            {typeLabel[c.type]}
          </span>
        </div>
        <p style={{ fontSize: 14, color: "#3d362c", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{c.text}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
        <button onClick={prev} style={navBtn}>← 前へ</button>
        <button onClick={next} style={{ ...navBtn, background: "#5c5043", color: "#faf6f0", border: "none" }}>次へ →</button>
      </div>
      <p style={{ textAlign: "center", fontSize: 10, color: "#c4b8a6", marginTop: 8 }}>← スワイプで移動 →</p>
    </div>
  );
}

/* ========== Tab: Memos ========== */
function MemosTab({ books, collections, onUpdateCollections }) {
  const [subTab, setSubTab] = useState("search");
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [newColName, setNewColName] = useState("");
  const [editCol, setEditCol] = useState(null);

  // Reset scroll when switching sub-tabs.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [subTab]);

  const allMemos = useMemo(() => {
    const memos = [];
    books.forEach((b) => {
      if (b.leverageMemo?.trim()) {
        b.leverageMemo.split("\n").filter((l) => l.trim()).forEach((line) => {
          memos.push({ text: line.trim(), title: b.title, tags: b.tags || [] });
        });
      }
    });
    return memos;
  }, [books]);

  const allTags = useMemo(() => { const s = new Set(); books.forEach((b) => (b.tags || []).forEach((t) => s.add(t))); return [...s]; }, [books]);

  const filtered = useMemo(() => allMemos.filter((m) => {
    if (tagFilter && !m.tags.includes(tagFilter)) return false;
    if (q) { const ql = q.toLowerCase(); return m.text.toLowerCase().includes(ql) || m.title.toLowerCase().includes(ql) || m.tags.some((t) => t.toLowerCase().includes(ql)); }
    return true;
  }), [allMemos, q, tagFilter]);

  const addCollection = () => { if (!newColName.trim()) return; onUpdateCollections([...collections, { id: Date.now().toString(), name: newColName.trim(), memoTexts: [] }]); setNewColName(""); };
  const deleteCol = (id) => onUpdateCollections(collections.filter((c) => c.id !== id));
  const toggleMemoInCol = (colId, memoText) => {
    onUpdateCollections(collections.map((c) => {
      if (c.id !== colId) return c;
      const has = c.memoTexts.includes(memoText);
      return { ...c, memoTexts: has ? c.memoTexts.filter((t) => t !== memoText) : [...c.memoTexts, memoText] };
    }));
  };

  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ display: "flex", marginBottom: 16, borderBottom: "1px solid #e0d8c8" }}>
        {[{ k: "search", l: "🔍 メモ検索" }, { k: "collections", l: "📂 コレクション" }].map((t) => (
          <button key={t.k} onClick={() => setSubTab(t.k)} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontFamily: "inherit", cursor: "pointer", background: "none", border: "none", borderBottom: subTab === t.k ? "2px solid #5c5043" : "2px solid transparent", color: subTab === t.k ? "#3d362c" : "#a89e8c", fontWeight: subTab === t.k ? 500 : 400 }}>{t.l}</button>
        ))}
      </div>
      {subTab === "search" && (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="メモを横断検索..." style={{ ...inp, background: "#faf6f0", marginBottom: 8 }} />
          {allTags.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
              <button onClick={() => setTagFilter("")} style={{ ...tagBtn, ...(tagFilter === "" ? tagBtnActive : {}) }}>すべて</button>
              {allTags.map((t) => (
                <button key={t} onClick={() => setTagFilter(tagFilter === t ? "" : t)} style={{ ...tagBtn, ...(tagFilter === t ? tagBtnActive : {}) }}>#{t}</button>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 8 }}>{filtered.length}件</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.slice(0, 50).map((m, i) => (
              <div key={i} style={{ background: "#faf6f0", borderRadius: 10, padding: "10px 12px", border: "1px solid #e4ddd0" }}>
                <p style={{ fontSize: 13, color: "#3d362c", lineHeight: 1.7 }}>{m.text}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "#9a8e7a" }}>📕 {m.title}</span>
                  {m.tags.map((t, j) => (<span key={j} style={{ fontSize: 9, background: "#eae3d6", color: "#7a6e58", padding: "1px 5px", borderRadius: 6 }}>#{t}</span>))}
                  {collections.length > 0 && (
                    <select onChange={(e) => { if (e.target.value) toggleMemoInCol(e.target.value, m.text); e.target.value = ""; }} style={{ fontSize: 16, border: "1px solid #d4ccbe", borderRadius: 6, padding: "2px 4px", color: "#8a7e6b", background: "transparent", fontFamily: "inherit", marginLeft: "auto" }} defaultValue="">
                      <option value="">+📂</option>
                      {collections.map((c) => (<option key={c.id} value={c.id}>{c.memoTexts.includes(m.text) ? "✓ " : ""}{c.name}</option>))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && <p style={{ textAlign: "center", padding: 30, color: "#b5aa96", fontSize: 13 }}>メモがありません</p>}
        </>
      )}
      {subTab === "collections" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="新しいコレクション名" style={{ ...inp, flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addCollection(); } }} />
            <button onClick={addCollection} style={{ ...btnS, padding: "8px 14px", fontSize: 12 }}>作成</button>
          </div>
          {collections.length === 0 ? (
            <p style={{ textAlign: "center", padding: 30, color: "#b5aa96", fontSize: 13 }}>テーマ別コレクションを作成しよう</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {collections.map((col) => (
                <div key={col.id} style={{ background: "#faf6f0", borderRadius: 12, border: "1px solid #e4ddd0", overflow: "hidden" }}>
                  <div onClick={() => setEditCol(editCol === col.id ? null : col.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", cursor: "pointer" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: "#3d362c" }}>📂 {col.name}</p>
                      <p style={{ fontSize: 11, color: "#9a8e7a" }}>{col.memoTexts.length}件</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={(e) => { e.stopPropagation(); deleteCol(col.id); }} style={{ background: "none", border: "none", fontSize: 14, color: "#c4a0a0", cursor: "pointer" }}>×</button>
                      <span style={{ fontSize: 12, color: "#c4b8a6" }}>{editCol === col.id ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {editCol === col.id && (
                    <div style={{ padding: "0 14px 12px", borderTop: "1px solid #e8e2d6" }}>
                      {col.memoTexts.length === 0 ? <p style={{ fontSize: 12, color: "#b5aa96", padding: "12px 0" }}>メモ検索から追加</p>
                        : col.memoTexts.map((t, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: i < col.memoTexts.length - 1 ? "1px solid #f0ebe2" : "none" }}>
                            <p style={{ fontSize: 12, color: "#4a4036", lineHeight: 1.6, flex: 1 }}>{t}</p>
                            <button onClick={() => toggleMemoInCol(col.id, t)} style={{ background: "none", border: "none", fontSize: 12, color: "#c4a0a0", cursor: "pointer", flexShrink: 0, marginLeft: 8 }}>×</button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ========== Tab: Actions ========== */
function ActionsTab({ books, onToggleAction }) {
  const allActions = useMemo(() => {
    const a = [];
    books.forEach((b) => (b.actions || []).forEach((act, i) => {
      if (act.text?.trim()) a.push({ ...act, bookTitle: b.title, bookId: b.id, actionIdx: i });
    }));
    return a;
  }, [books]);
  const done = allActions.filter((a) => a.done).length;
  const pct = allActions.length ? Math.round((done / allActions.length) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ background: "#faf6f0", borderRadius: 12, padding: "16px", border: "1px solid #e4ddd0", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#3d362c" }}>実行率</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: pct >= 80 ? "#5a7a48" : pct >= 50 ? "#d4a040" : "#a05040" }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: "#e0d8c8", borderRadius: 4 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "#5a7a48" : pct >= 50 ? "#d4a040" : "#a05040", borderRadius: 4, transition: "width .4s" }} />
        </div>
        <p style={{ fontSize: 11, color: "#9a8e7a", marginTop: 6 }}>{done} / {allActions.length} 完了</p>
      </div>
      {allActions.length === 0 ? (
        <p style={{ textAlign: "center", padding: 30, color: "#b5aa96", fontSize: 13 }}>行動リストなし</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {allActions.map((a, i) => {
            const overdue = a.deadline && a.deadline < today && !a.done;
            return (
              <div key={i} onClick={() => onToggleAction(a.bookId, a.actionIdx)} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: a.done ? "#f0ebe2" : overdue ? "#fdf0ed" : "#faf6f0", border: `1px solid ${overdue ? "#e0b0a0" : "#e4ddd0"}`, cursor: "pointer" }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{a.done ? "✅" : "⬜"}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, color: a.done ? "#9a8e7a" : "#3d362c", textDecoration: a.done ? "line-through" : "none" }}>{a.text}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: "#b5aa96" }}>📕 {a.bookTitle}</span>
                    {a.deadline && <span style={{ fontSize: 10, color: overdue ? "#a05040" : "#9a8e7a" }}>{overdue ? "⚠️ " : "📅 "}{a.deadline}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ========== AI Book Advisor ========== */
function BookAdvisor({ onAddBook, onClose }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "こんにちは！読書投資アドバイザーです。\n\nあなたの課題や叶えたいこと、悩みを教えてください。最適な本を選書します。\n\n例：\n・営業成績を上げたい\n・チームマネジメントに悩んでいる\n・自分に自信が持てない" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const messagesEndRef = (el) => { if (el) el.scrollIntoView({ behavior: "smooth" }); };

  const parseRecommendations = (text) => {
    const match = text.match(/RECOMMENDATIONS_START\s*([\s\S]*?)\s*RECOMMENDATIONS_END/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { return null; }
    }
    return null;
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    const newHistory = [...chatHistory, { role: "user", content: userMsg }];
    setChatHistory(newHistory);

    try {
      const aiText = await callClaude(newHistory, {
        system: ADVISOR_SYSTEM,
        max_tokens: 4096,
        model: "claude-sonnet-4-20250514",
      });

      const recs = parseRecommendations(aiText);
      if (recs) {
        setRecommendations(recs);
        setMessages((prev) => [...prev, { role: "assistant", text: "あなたの状況を踏まえて、3冊選びました！" }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: aiText }]);
        setChatHistory([...newHistory, { role: "assistant", content: aiText }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "通信エラーが発生しました。" }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "75vh", maxHeight: 600 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "1px solid #e0d8c8", marginBottom: 12, flexShrink: 0 }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: "#3d362c" }}>🤖 AI選書アドバイザー</h3>
        <button onClick={onClose} style={closeBtn}>×</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px", borderRadius: 14,
              background: m.role === "user" ? "#5c5043" : "#f7f3ec",
              color: m.role === "user" ? "#faf6f0" : "#3d362c",
              fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
              borderBottomRightRadius: m.role === "user" ? 4 : 14,
              borderBottomLeftRadius: m.role === "user" ? 14 : 4,
            }}>
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: 14, background: "#f7f3ec", borderBottomLeftRadius: 4 }}>
              <Dots />
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeIn .3s" }}>
            {recommendations.map((rec, i) => (
              <div key={i} style={{ background: "#faf6f0", borderRadius: 12, border: "1px solid #e4ddd0", padding: "14px 14px", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: "#3d362c" }}>{rec.title}</p>
                    <p style={{ fontSize: 12, color: "#8a7e6b", marginTop: 2 }}>{rec.author}</p>
                  </div>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>📕</span>
                </div>
                <p style={{ fontSize: 12, color: "#5c5548", lineHeight: 1.6, marginTop: 8 }}>{rec.reason}</p>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <a href={amazonLink(rec.title, rec.author)} target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, background: "#f0970e", color: "#fff", fontSize: 12, fontFamily: "inherit", textAlign: "center", textDecoration: "none", fontWeight: 500 }}>
                    Amazonで見る
                  </a>
                  <button onClick={() => onAddBook(rec)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #d4ccbe", background: "transparent", color: "#5c5043", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
                    📚 読みたいに追加
                  </button>
                </div>
              </div>
            ))}
            <button onClick={() => { setRecommendations(null); setMessages((prev) => [...prev, { role: "assistant", text: "他にお探しの本のジャンルや悩みはありますか？" }]); }}
              style={{ ...btnO, padding: "10px 0", fontSize: 12 }}>
              🔄 別の条件で探す
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!recommendations && (
        <div style={{ display: "flex", gap: 6, paddingTop: 12, borderTop: "1px solid #e0d8c8", marginTop: 8, flexShrink: 0 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="課題や悩みを入力..."
            style={{ ...inp, flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendMessage(); } }} disabled={loading} />
          <button onClick={sendMessage} disabled={!input.trim() || loading}
            style={{ ...btnS, padding: "8px 16px", fontSize: 12, opacity: !input.trim() || loading ? 0.5 : 1 }}>送信</button>
        </div>
      )}
    </div>
  );
}

/* ========== Bottom Nav ========== */
function BottomNav({ tab, setTab }) {
  const tabs = [
    { key: "books", icon: "📚", label: "本棚" },
    { key: "review", icon: "🔄", label: "振り返り" },
    { key: "brain", icon: "🧠", label: "読書脳" },
    { key: "advisor", icon: "🤖", label: "AI 選書" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#faf6f0", borderTop: "1px solid #e0d8c8", display: "flex", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)" }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: "10px 0 8px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative", minHeight: 56 }}>
          <span style={{ fontSize: 22 }}>{t.icon}</span>
          <span style={{ fontSize: 10, color: tab === t.key ? "#3d362c" : "#b5aa96", fontWeight: tab === t.key ? 600 : 400 }}>{t.label}</span>
          {tab === t.key && <div style={{ position: "absolute", top: 0, left: "25%", right: "25%", height: 2, background: "#d4a040", borderRadius: 1 }} />}
        </button>
      ))}
    </div>
  );
}

/* ========== Shell ========== */
function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#f5f0e8,#ebe4d8)", fontFamily: "'Noto Serif JP',Georgia,serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;500;600&display=swap');
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: .2 } 50% { opacity: 1 } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, textarea, select { font-family: inherit; }
        ::placeholder { color: #b5aa96; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #c8bfb0; border-radius: 2px; }
      `}</style>
      {children}
    </div>
  );
}

/* ========== MAIN APP ========== */
function AuthedApp() {
  const { signOut } = useAuth();
  const {
    books: rawBooks,
    loading: booksLoading,
    saveBook,
    deleteBook,
    captureBookSnapshot,
    restoreBookFromSnapshot,
  } = useBooks();
  const toast = useToast();
  const confirm = useConfirm();

  // collections と readingPlans は一旦localStorageのまま
  const [data, setData] = useState(() => {
    const d = loadData();
    return { collections: d.collections || [], readingPlans: d.readingPlans || {} };
  });
  const collections = data.collections;
  const readingPlans = data.readingPlans || {};

  const [tab, setTab] = useState("books");
  const [view, setView] = useState("list"); // list | detail | edit
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState(emptyBook());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated"); // updated | created | title | rating
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  // Personal Capital UI is removed; data layer (CapitalDashboard component
  // file) is retained for potential future re-enablement.
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [recentlyDoneId, setRecentlyDoneId] = useState(null);
  const recentlyDoneTimerRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // iOS-style "Large Title" shrink-on-scroll for the main header.
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let raf = 0;
    const update = () => {
      const y = window.scrollY || 0;
      setHeaderCollapsed(y > 40);
      raf = 0;
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [quickMemoOpen, setQuickMemoOpen] = useState(false);
  const [fullEditorPrefill, setFullEditorPrefill] = useState(null); // { pageNumber, text }
  const onboardingTriggeredRef = useRef(false);

  // Memo ops for the currently-open book (FAB / quick sheet / full editor handoff).
  // Always called so hook order stays stable; isUsableBookId guards inside the hook.
  const currentMemoOps = useBookMemos(current?.id, { sortBy: 'page' });

  // Books are now committed to DB on delete (no soft-delete state to filter).
  const books = rawBooks;

  // Scroll to top on every top-level tab/view change so the new content
  // always starts at the top of the screen instead of inheriting the previous
  // scroll position. `behavior: 'auto'` for instant snap (no smooth animation).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [tab, view]);

  // First-run onboarding: show once per user/device until they dismiss it.
  // The completion flag is the single source of truth — the book count is
  // intentionally NOT part of the predicate, so users who clear data or
  // re-install only see it again if they explicitly reset via the help button.
  useEffect(() => {
    if (booksLoading) return;
    if (onboardingTriggeredRef.current) return;
    if (isOnboardingCompleted()) return;
    onboardingTriggeredRef.current = true;
    setShowOnboarding(true);
  }, [booksLoading]);

const persist = useCallback((updates) => {
    setData((prev) => { 
      const next = { ...prev, ...updates };
      // booksはSupabaseで管理するのでlocalStorageには保存しない
      saveData({ collections: next.collections, readingPlans: next.readingPlans });
      return next;
    });
  }, []);

  // Resolve the help key for whatever screen the user is currently looking at.
  // Priority order:
  //   1. Open modal contexts (advisor / quick memo / full editor) — they overlay everything
  //   2. Book detail / edit view — map by status
  //   3. Bottom-nav tabs (list view) — today / books / memos / actions
  const getCurrentHelpKey = () => {
    if (quickMemoOpen || fullEditorPrefill) return 'memoEditor';
    if (view === 'detail' || view === 'edit') {
      const status = current?.status || form?.status;
      if (status === 'want') return 'bookDetailWant';
      if (status === 'before') return 'bookDetailBefore';
      if (status === 'reading') return 'bookDetailReading';
      if (status === 'done') return 'bookDetailDone';
    }
    if (tab === 'review') return 'review';
    if (tab === 'advisor') return 'aiAdvisor';
    if (tab === 'brain') return 'myBookBrain';
    return 'bookList';
  };

  const openHelp = () => setHelpModalOpen(true);

  const openAdd = () => { setForm({ ...emptyBook(), id: Date.now().toString() }); setView("edit"); setCurrent(null); setTab("books"); };
  const openDetail = (b) => { setCurrent(b); setView("detail"); };
  const openEdit = (b) => { setForm({ ...emptyBook(), ...b, tags: b.tags || [], actions: b.actions || [] }); setCurrent(b); setView("edit"); };
  const goList = () => { setView("list"); setCurrent(null); };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error(fieldRequiredMessage('タイトル'));
      return;
    }
    try {
      const normalizedTags = Array.from(
        new Set(
          (form.tags || [])
            .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
            .filter(Boolean)
        )
      );
      const payload = { ...form, tags: normalizedTags };
      const saved = await saveBook(payload);
      const next = saved || payload;
      setCurrent(next);
      setForm({ ...emptyBook(), ...next, tags: next.tags || [], actions: next.actions || [] });
      setView("detail");
      toast.success('保存しました');
    } catch (error) {
      toast.error(toMessage(error, '保存に失敗しました。もう一度お試しください。'));
    }
  };

  const handleSaveSummaryFromForm = async (text) => {
    if (!form?.id) return;
    const merged = { ...form, leverageMemo: text };
    try {
      const saved = await saveBook(merged);
      const next = saved || merged;
      setForm((f) => ({ ...f, leverageMemo: next.leverageMemo ?? text }));
      if (current && current.id === next.id) setCurrent(next);
    } catch (error) {
      throw new Error(toMessage(error, 'まとめメモの保存に失敗しました。'));
    }
  };

  const handleSaveSummaryFromCurrent = async (text) => {
    if (!current?.id) return;
    const merged = { ...current, leverageMemo: text };
    try {
      const saved = await saveBook(merged);
      const next = saved || merged;
      setCurrent(next);
      if (form && form.id === next.id) {
        setForm((f) => ({ ...f, leverageMemo: next.leverageMemo ?? text }));
      }
    } catch (error) {
      throw new Error(toMessage(error, 'まとめメモの保存に失敗しました。'));
    }
  };

  // Immediate-delete with restore-on-undo. The DB DELETE is fired right away
  // so closing the app within the 5s undo window cannot resurrect the book.
  // Undo re-INSERTs from the in-memory snapshot (photos are non-recoverable).
  const requestDeleteBook = async (book) => {
    if (!book) return;
    const ok = await confirm({
      title: 'この本を削除しますか？',
      message: `「${book.title}」のメモ・写真・行動リストもすべて削除されます。`,
      confirmLabel: '削除する',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;

    // Snapshot first (must read relations BEFORE the delete cascades them away).
    const snapshot = await captureBookSnapshot(book.id);
    if (!snapshot) {
      toast.error('本のデータを取得できませんでした。削除を中止します。');
      return;
    }

    // Fire DB delete immediately. Capture the promise so Undo waits for it
    // before re-inserting (avoids any DELETE↔INSERT race).
    const deletionPromise = deleteBook(book.id).catch((error) => {
      toast.error(toMessage(error, '削除に失敗しました。'));
      throw error;
    });

    goList();

    const hasPhotos = (snapshot.book_memos || []).some((m) => m.photo_path);
    toast.undo({
      message: hasPhotos
        ? `「${book.title}」を削除しました。\n※写真は復元できません。`
        : `「${book.title}」を削除しました。`,
      onUndo: async () => {
        try {
          await deletionPromise.catch(() => {}); // wait until DB DELETE settles
          await restoreBookFromSnapshot(snapshot);
          toast.info('削除を取り消しました');
        } catch (error) {
          toast.error(toMessage(error, '復元に失敗しました。'));
        }
      },
    });
  };

  const handleBookSelect = (b) => {
    setSearchOpen(false);
    setForm((f) => ({ ...f, title: b.title || f.title, author: b.author || f.author, cover: b.cover || f.cover, totalPages: b.pages || f.totalPages }));
  };

  const addFromAdvisor = async (rec) => {
    const newBook = { ...emptyBook(), title: rec.title, author: rec.author, status: "want" };
    // Try to get cover from Google Books
    try {
      const results = await searchBooksAPI(rec.title + " " + rec.author);
      if (results.length > 0) { newBook.cover = results[0].cover || ""; newBook.totalPages = results[0].pages || 0; }
    } catch {}
    try {
      await saveBook(newBook);
      toast.success(`「${rec.title}」を「読みたい」に追加しました`);
    } catch (error) {
      toast.error(toMessage(error, '本の追加に失敗しました。'));
    }
  };

  // Used by CapitalDashboard's "学習プラン" → bulk-add. Throws on failure so
  // the dashboard can count successes/failures across the plan's book list.
  const addBookFromPlan = async ({ title, author = '', tags = [] }) => {
    const newBook = {
      ...emptyBook(),
      title,
      author: author || '',
      status: 'want',
      tags: Array.isArray(tags) ? tags : [],
    };
    try {
      const results = await searchBooksAPI(`${title} ${author || ''}`.trim());
      if (results.length > 0) {
        newBook.cover = results[0].cover || '';
        newBook.totalPages = results[0].pages || 0;
      }
    } catch {
      /* cover is best-effort; ignore */
    }
    await saveBook(newBook);
  };

// Status transitions — optimistic UI with undo toast.
  const advanceStatus = (book, newStatus) => {
    if (!book) return;
    const prev = {
      status: book.status,
      startDate: book.startDate,
      doneDate: book.doneDate,
    };
    const updated = { ...book, status: newStatus };
    if (newStatus === "before" && !updated.startDate) updated.startDate = new Date().toISOString().slice(0, 10);
    if (newStatus === "done" && !updated.doneDate) updated.doneDate = new Date().toISOString().slice(0, 10);

    // Optimistic update — switch to edit view immediately.
    setCurrent(updated);
    setForm({ ...emptyBook(), ...updated, tags: updated.tags || [], actions: updated.actions || [] });
    setView("edit");

    // Persist in background; roll back on failure.
    saveBook(updated).catch((error) => {
      toast.error(toMessage(error, 'ステータス変更に失敗しました。'));
      const restored = { ...book, ...prev };
      setCurrent(restored);
      setForm({ ...emptyBook(), ...restored, tags: restored.tags || [], actions: restored.actions || [] });
      setView("edit");
    });

    const labels = { want: '読みたい', before: '読書前', reading: '読書中', done: '読了' };
    const revert = async () => {
      const reverted = { ...book, ...prev };
      setCurrent(reverted);
      setForm({ ...emptyBook(), ...reverted, tags: reverted.tags || [], actions: reverted.actions || [] });
      setView("edit");
      try {
        await saveBook(reverted);
      } catch (error) {
        toast.error(toMessage(error, 'ステータス変更の取り消しに失敗しました。'));
      }
    };

    const becomingDone = newStatus === 'done' && prev.status !== 'done';
    if (becomingDone) {
      // Light up the matching card on the books list so when the user navigates
      // back, they see the freshly-completed book glowing.
      if (recentlyDoneTimerRef.current) clearTimeout(recentlyDoneTimerRef.current);
      setRecentlyDoneId(book.id);
      recentlyDoneTimerRef.current = setTimeout(() => setRecentlyDoneId(null), 8000);
      try { fireConfetti(); } catch { /* non-critical */ }
      toast.show({
        type: 'success',
        message: '🎉 1 冊読了！お疲れ様でした',
        duration: 5000,
        action: { label: '取消', onClick: revert },
      });
    } else {
      toast.undo({
        message: `「${labels[newStatus] || newStatus}」に変更しました`,
        onUndo: revert,
      });
    }
  };

  // Share
  const shareBook = async (book) => {
    // Build recommendation reason from available data
    let reason = "";
    if (book.roiSummary?.trim()) {
      reason = book.roiSummary.trim();
    } else if (book.aiSummary?.trim()) {
      reason = book.aiSummary.split("\n").filter((l) => l.trim())[0] || "";
    } else if (book.leverageMemo?.trim()) {
      reason = book.leverageMemo.split("\n").filter((l) => l.trim())[0] || "";
    }

    const link = amazonLink(book.title, book.author);
    const lines = [
      `📚 おすすめの本`,
      ``,
      `「${book.title}」${book.author ? `（${book.author}）` : ""}`,
    ];
    if (book.rating > 0) lines.push(`${"★".repeat(book.rating)}${"☆".repeat(5 - book.rating)}`);
    if (reason) { lines.push(``); lines.push(`💡 ${reason}`); }
    lines.push(``);
    lines.push(`📖 Amazonで見る：`);
    lines.push(link);

    const text = lines.join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: `おすすめ：${book.title}`, text });
        return;
      } catch {}
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
      toast.success('共有テキストをコピーしました');
    } catch {
      // Last resort
      prompt("共有テキストをコピーしてください：", text);
    }
  };

  // AI
  const runAnalysis = async () => {
    setAiLoading(true);
    try {
      const r = await callClaude(AI_SYS, ANALYSIS_PROMPT(form.title, form.author));
      setForm((f) => ({ ...f, aiAnalysis: r }));
    } catch (error) {
      toast.error(toMessage(error, 'AI解析に失敗しました。'));
    } finally {
      setAiLoading(false);
    }
  };
  const runStrategy = async () => {
    setAiLoading(true);
    try {
      const r = await callClaude(AI_SYS, STRATEGY_PROMPT(form.title, form.author, form.aiAnalysis, form.investPurpose));
      setForm((f) => ({ ...f, aiStrategy: r }));
    } catch (error) {
      toast.error(toMessage(error, 'AI戦略の生成に失敗しました。'));
    } finally {
      setAiLoading(false);
    }
  };
  const runSummary = async () => {
    setAiLoading(true);
    try {
      const r = await callClaude(AI_SYS, SUMMARY_PROMPT(form.title, form.leverageMemo));
      setForm((f) => ({ ...f, aiSummary: r }));
    } catch (error) {
      toast.error(toMessage(error, 'AI要約に失敗しました。'));
    } finally {
      setAiLoading(false);
    }
  };

  const toggleAction = async (bookId, actionIdx) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;

    const acts = [...(book.actions || [])];
    acts[actionIdx] = { ...acts[actionIdx], done: !acts[actionIdx].done };
    const updated = { ...book, actions: acts };

    try {
      await saveBook(updated);
    } catch (error) {
      toast.error(toMessage(error, '行動の更新に失敗しました。'));
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = books.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (!q) return true;
      const title = (b.title || '').toLowerCase();
      const author = (b.author || '').toLowerCase();
      const tagsHit = (b.tags || []).some((t) => (t || '').toLowerCase().includes(q));
      return title.includes(q) || author.includes(q) || tagsHit;
    });

    const titleKey = (b) => (b.title || '').toLowerCase();
    const created = (b) => b.created_at || b.startDate || '';
    const updated = (b) => b.updated_at || b.startDate || b.doneDate || '';

    const sorted = [...list];
    if (sortBy === 'title') {
      sorted.sort((a, b) => titleKey(a).localeCompare(titleKey(b), 'ja'));
    } else if (sortBy === 'rating') {
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || updated(b).localeCompare(updated(a)));
    } else if (sortBy === 'created') {
      sorted.sort((a, b) => created(b).localeCompare(created(a)));
    } else {
      sorted.sort((a, b) => updated(b).localeCompare(updated(a)));
    }
    return sorted;
  }, [books, statusFilter, search, sortBy]);

  const recentBooks = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return books
      .filter((b) => {
        const stamp = b.updated_at ? Date.parse(b.updated_at) : NaN;
        return Number.isFinite(stamp) && stamp >= cutoff;
      })
      .slice(0, 3);
  }, [books]);

  const stats = { total: books.length, want: books.filter((b) => b.status === "want").length, before: books.filter((b) => b.status === "before").length, reading: books.filter((b) => b.status === "reading").length, done: books.filter((b) => b.status === "done").length };
  const actionCount = books.reduce((s, b) => s + (b.actions || []).filter((a) => a.text?.trim()).length, 0);
  const actionDone = books.reduce((s, b) => s + (b.actions || []).filter((a) => a.done).length, 0);
  const allTags = useMemo(() => { const s = new Set(); books.forEach((b) => (b.tags || []).forEach((t) => s.add(t))); return [...s]; }, [books]);

  // ===== DETAIL =====
  if (view === "detail" && current) {
    const st = getSt(current.status);
    const nextStatus = { want: "before", before: "reading", reading: "done" };
    const nextLabel = { want: "📐 読書前へ進む", before: "📖 読書を開始する", reading: "✅ 読了にする" };

    return (
      <Shell>
        <div style={{ padding: "20px 20px 80px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={goList} style={lnk}>← 一覧</button>
            <button
              onClick={openHelp}
              style={{ background: "none", border: "1px solid #d4ccbe", borderRadius: 999, fontSize: 11, color: "#8a7e6b", cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}
              aria-label="この画面のヘルプを見る"
            >
              ？ ヘルプ
            </button>
          </div>

          {/* Book header */}
          <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
            {current.cover && <img src={ensureHttps(current.cover)} alt="" style={{ width: 60, height: 84, objectFit: "cover", borderRadius: 6, border: "1px solid #e0d8c8" }} />}
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 17, fontWeight: 500, color: "#3d362c", lineHeight: 1.4 }}>{current.title}</h2>
              {current.author && <p style={{ fontSize: 12, color: "#8a7e6b", marginTop: 3 }}>{current.author}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <StatusBadge status={current.status} />
                {current.rating > 0 && <Stars r={current.rating} size={13} />}
              </div>
            </div>
          </div>

          {current.tags?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
              {current.tags.map((t, i) => (<span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#eae3d6", color: "#7a6e58" }}>#{t}</span>))}
            </div>
          )}

          {/* Phase-specific content */}
          {current.startDate && <p style={{ fontSize: 11, color: "#9a8e7a", marginTop: 10 }}>📅 開始: {current.startDate}</p>}
          {current.doneDate && <p style={{ fontSize: 11, color: "#9a8e7a", marginTop: 2 }}>📅 完了: {current.doneDate}</p>}

          {current.aiAnalysis && <Card label="🔍 AI本の解析" text={current.aiAnalysis} />}
          {current.investPurpose && <Card label="目的・課題・仮説" text={current.investPurpose} />}
          {current.aiStrategy && <Card label="🗺️ セットアップシート" text={current.aiStrategy} />}

          {current.totalPages > 0 && (
            <div style={{ marginTop: 12, background: "#f7f3ec", borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#5c5548", marginBottom: 4 }}>
                <span>進捗</span>
                <span>{current.currentPage || 0}/{current.totalPages}p ({Math.round(((current.currentPage || 0) / current.totalPages) * 100)}%)</span>
              </div>
              <div style={{ height: 6, background: "#e0d8c8", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${Math.round(((current.currentPage || 0) / current.totalPages) * 100)}%`, background: "#4a6e8a", borderRadius: 3 }} />
              </div>
            </div>
          )}

          {(current.status === "reading" || current.status === "done") ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#8a7040", marginBottom: 6 }}>📝 レバレッジメモ</p>
              <BookMemoList
                bookId={current.id}
                bookTitle={current.title}
                summaryText={current.leverageMemo || ""}
                onSaveSummary={handleSaveSummaryFromCurrent}
              />
            </div>
          ) : (
            <div
              style={{
                marginTop: 12,
                padding: "14px 16px",
                background: "#faf6f0",
                border: "1px dashed #d4ccbe",
                borderRadius: 10,
                fontSize: 12,
                color: "#a89e8c",
                lineHeight: 1.7,
              }}
            >
              {current.status === "want"
                ? "📚 読み始めたら、ここにメモが書けるようになります。"
                : "🎯 今は投資戦略を立てる段階です。読書中になるとここにメモが表示されます。"}
            </div>
          )}
          {current.aiSummary && <Card label="🤖 AI要約" text={current.aiSummary} bg="#e2ecd8" />}

          {(current.actions || []).filter((a) => a.text?.trim()).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#8a7040", marginBottom: 6 }}>⚡ 行動リスト</p>
              {current.actions.filter((a) => a.text?.trim()).map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
                  <span style={{ fontSize: 16 }}>{a.done ? "✅" : "⬜"}</span>
                  <div>
                    <p style={{ fontSize: 13, color: a.done ? "#9a8e7a" : "#4a4036", textDecoration: a.done ? "line-through" : "none" }}>{a.text}</p>
                    {a.deadline && <p style={{ fontSize: 10, color: "#b5aa96" }}>📅 {a.deadline}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {current.roiSummary && <Card label="💡 ROI" text={current.roiSummary} bg="#f0ebe2" />}

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            {nextStatus[current.status] && (
              <button onClick={() => advanceStatus(current, nextStatus[current.status])} style={{ ...btnS, width: "100%", background: st.color }}>
                {nextLabel[current.status]}
              </button>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => openEdit(current)} style={{ ...btnO, flex: 1 }}>編集</button>
              <button onClick={() => shareBook(current)} style={{ ...btnO, flex: 0, padding: "10px 18px", color: "#4a6e8a", borderColor: "#b8d0e0" }}>📤 共有</button>
              <button onClick={() => requestDeleteBook(current)} style={{ ...btnO, flex: 0, padding: "10px 14px", borderColor: "#c4a0a0", color: "#a05040" }}>削除</button>
            </div>
          </div>
        </div>

        {/* Floating "+ memo" FAB — only for reading/done so we don't lure
            users into creating memos that the section above hides. */}
        {(current.status === "reading" || current.status === "done") && (
          <button
            type="button"
            onClick={() => setQuickMemoOpen(true)}
            aria-label="クイックメモを追加"
            style={{
              position: "fixed",
              right: 18,
              bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
              width: 56,
              height: 56,
              borderRadius: 28,
              border: "none",
              background: "#5c5043",
              color: "#faf6f0",
              fontSize: 28,
              lineHeight: 1,
              cursor: "pointer",
              boxShadow: "0 6px 16px rgba(30,25,20,0.28)",
              zIndex: 600,
              fontFamily: "inherit",
            }}
          >
            ＋
          </button>
        )}

        {quickMemoOpen && (current.status === "reading" || current.status === "done") && (
          <QuickMemoSheet
            bookTitle={current.title}
            defaultPageNumber={
              (() => {
                const nums = (currentMemoOps.memos || [])
                  .map((m) => m.pageNumber)
                  .filter((n) => Number.isFinite(n));
                return nums.length ? Math.max(...nums) + 1 : '';
              })()
            }
            onClose={() => setQuickMemoOpen(false)}
            onCreate={async (payload) => {
              await currentMemoOps.createMemo(payload);
              toast.success('メモを保存しました');
            }}
            onOpenFullEditor={(prefill) => {
              setQuickMemoOpen(false);
              setFullEditorPrefill(prefill);
            }}
          />
        )}

        {fullEditorPrefill && (
          <BookMemoEditor
            bookTitle={current.title}
            initial={null}
            defaultPageNumber={fullEditorPrefill.pageNumber ?? ''}
            defaultText={fullEditorPrefill.text || ''}
            allTags={allTags}
            onClose={() => setFullEditorPrefill(null)}
            onCreate={async (payload) => {
              await currentMemoOps.createMemo(payload);
              toast.success('メモを保存しました');
            }}
            onUpdate={async (memoId, payload) => {
              await currentMemoOps.updateMemo(memoId, payload);
              toast.success('メモを更新しました');
            }}
          />
        )}

        {helpModalOpen && (
          <HelpModal
            helpKey={getCurrentHelpKey()}
            onClose={() => setHelpModalOpen(false)}
            onShowOnboarding={() => {
              setHelpModalOpen(false);
              clearOnboardingCompletion();
              setShowOnboarding(true);
            }}
          />
        )}

        <BottomNav tab={tab} setTab={(t) => { setTab(t); goList(); }} />
      </Shell>
    );
  }

  // ===== EDIT (renders different phase based on status) =====
  if (view === "edit") {
    return (
      <Shell>
        <div style={{ padding: "20px 20px 80px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={current ? () => setView("detail") : goList} style={lnk}>← 戻る</button>
            <button
              onClick={openHelp}
              style={{ background: "none", border: "1px solid #d4ccbe", borderRadius: 999, fontSize: 11, color: "#8a7e6b", cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}
              aria-label="この画面のヘルプを見る"
            >
              ？ ヘルプ
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 16 }}>
            <StatusBadge status={form.status} />
            <h2 style={{ fontSize: 17, fontWeight: 500, color: "#3d362c" }}>
              {!current ? "本を追加" : form.status === "want" ? "読みたい本" : form.status === "before" ? "投資設計" : form.status === "reading" ? "読書中" : "投資回収"}
            </h2>
          </div>

          {(form.status === "want" || !current) && (
            <WantPhase form={form} setForm={setForm} onSave={handleSave} onSearchOpen={() => setSearchOpen(true)} allTags={allTags} />
          )}
          {form.status === "before" && current && (
            <BeforePhase form={form} setForm={setForm} onSave={handleSave} aiLoading={aiLoading} onRunAnalysis={runAnalysis} onRunStrategy={runStrategy} />
          )}
          {form.status === "reading" && current && (
            <ReadingPhase form={form} setForm={setForm} onSave={handleSave} onSaveSummary={handleSaveSummaryFromForm} allTags={allTags} />
          )}
          {form.status === "done" && current && (
            <DonePhase form={form} setForm={setForm} onSave={handleSave} aiLoading={aiLoading} onRunSummary={runSummary} allTags={allTags} />
          )}
        </div>

        <Modal open={searchOpen} onClose={() => setSearchOpen(false)}>
          <BookSearchModal onSelect={handleBookSelect} onClose={() => setSearchOpen(false)} />
        </Modal>
        {helpModalOpen && (
          <HelpModal
            helpKey={getCurrentHelpKey()}
            onClose={() => setHelpModalOpen(false)}
            onShowOnboarding={() => {
              setHelpModalOpen(false);
              clearOnboardingCompletion();
              setShowOnboarding(true);
            }}
          />
        )}
        <BottomNav tab={tab} setTab={(t) => { setTab(t); goList(); }} />
      </Shell>
    );
  }

  // ===== TAB CONTENT =====
  return (
    <Shell>
   <header style={{ padding: headerCollapsed ? "10px 20px 6px" : "20px 20px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "padding 250ms cubic-bezier(0.25,1,0.5,1)" }}>
  <h1 className={"lvg-large-title" + (headerCollapsed ? " is-collapsed" : "")} style={{ letterSpacing: headerCollapsed ? 1 : -0.5 }}>📚 レバレッジ読書ログ</h1>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <button
      onClick={openHelp}
      style={{ background: "none", border: "1px solid #d4ccbe", borderRadius: 999, fontSize: 11, color: "#8a7e6b", cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}
      aria-label="この画面のヘルプを見る"
    >
      ？ ヘルプ
    </button>
    <button
      onClick={() => setSettingsOpen(true)}
      style={{ background: "none", border: "1px solid #d4ccbe", borderRadius: 999, fontSize: 11, color: "#8a7e6b", cursor: "pointer", padding: "4px 10px", fontFamily: "inherit" }}
      aria-label="アカウント設定"
    >
      ⚙️ 設定
    </button>
  </div>
</header>

      <div key={tab} className="lvg-page" style={{ paddingBottom: 80 }}>
        {tab === "books" && (
          <>
            <div style={{ padding: "10px 20px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #e8e2d6" }}>
              <input
                placeholder="🔍 タイトル・著者・タグで検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}
                style={{ ...inp, background: "#faf6f0" }}
              />
              {/* Pill filters — hide statuses with zero books to keep the bar tight. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                  { key: "all", label: "全て", count: stats.total, color: "#4a4036", bg: "#e8e0d2" },
                  ...STATUSES.map((s) => ({
                    key: s.key,
                    label: s.label,
                    emoji: s.emoji,
                    color: s.color,
                    bg: s.bg,
                    count: stats[s.key] || 0,
                  })),
                ]
                  .filter((s) => s.key === "all" || s.count > 0 || statusFilter === s.key)
                  .map((s) => {
                    const active = statusFilter === s.key;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setStatusFilter(s.key)}
                        style={{
                          padding: "6px 12px",
                          minHeight: 30,
                          fontSize: 11,
                          borderRadius: 999,
                          fontFamily: "inherit",
                          cursor: "pointer",
                          border: active ? `1.5px solid ${s.color}` : "1px solid #d4ccbe",
                          background: active ? s.bg : "transparent",
                          color: active ? s.color : "#8a7e6b",
                          fontWeight: active ? 600 : 400,
                          transition: "background .15s, color .15s",
                        }}
                      >
                        {s.emoji ? `${s.emoji} ` : ""}{s.label} <span style={{ opacity: 0.7, fontWeight: 500 }}>({s.count})</span>
                      </button>
                    );
                  })}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, color: "#8a7e6b" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>並び順</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{ fontSize: 12, padding: "4px 8px", borderRadius: 8, border: "1px solid #d4ccbe", background: "#faf6f0", color: "#3d362c", fontFamily: "inherit" }}
                  >
                    <option value="updated">更新順</option>
                    <option value="created">登録順</option>
                    <option value="title">タイトル順</option>
                    <option value="rating">評価順</option>
                  </select>
                </div>
                <span>{filtered.length}件</span>
              </div>
            </div>
            <div style={{ padding: "0 20px" }}>
              {recentBooks.length > 0 && rawBooks.length >= 3 && !search && statusFilter === "all" && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, color: "#8a7040", fontWeight: 600, marginBottom: 6 }}>📖 続きから</p>
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                    {recentBooks.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => openDetail(b)}
                        style={{
                          flex: "0 0 auto",
                          width: 132,
                          background: "#faf6f0",
                          border: "1px solid #e4ddd0",
                          borderRadius: 10,
                          padding: 10,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textAlign: "left",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        {b.cover ? (
                          <img src={ensureHttps(b.cover)} alt="" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid #e0d8c8" }} />
                        ) : (
                          <div style={{ width: "100%", height: 90, background: "#eae3d6", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📕</div>
                        )}
                        <div style={{ fontSize: 12, color: "#3d362c", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                        <div><StatusBadge status={b.status} /></div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {booksLoading && rawBooks.length === 0 ? (
                <BookListSkeleton rows={4} />
              ) : filtered.length === 0 ? (
                rawBooks.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "#5c5548" }}>
                    <div style={{ fontSize: 56, marginBottom: 8 }}>📚</div>
                    <p style={{ fontSize: 15, fontWeight: 500, color: "#3d362c", margin: "0 0 6px" }}>まだ本がありません</p>
                    <p style={{ fontSize: 12, color: "#8a7e6b", margin: "0 0 18px", lineHeight: 1.7 }}>
                      読みたい本を追加して、<br />読書投資を始めましょう。
                    </p>
                    <button onClick={openAdd} style={{ ...btnS, padding: "12px 28px", fontSize: 14 }}>＋ 最初の本を追加</button>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "32px 20px", color: "#8a7e6b" }}>
                    <div style={{ fontSize: 36, marginBottom: 6 }}>🔍</div>
                    <p style={{ fontSize: 13, color: "#5c5548", margin: 0, lineHeight: 1.7 }}>該当する本が見つかりませんでした。</p>
                    <p style={{ fontSize: 11, color: "#a89e8c", margin: "6px 0 0" }}>検索ワードやフィルタを変えてみてください。</p>
                  </div>
                )
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filtered.map((b, i) => {
                    const justDone = recentlyDoneId === b.id;
                    return (
                      <div
                        key={b.id}
                        onClick={() => openDetail(b)}
                        style={{
                          background: "#faf6f0",
                          borderRadius: 14,
                          padding: "12px 14px",
                          border: "1px solid #e4ddd0",
                          boxShadow: justDone
                            ? "0 0 18px rgba(212,160,64,0.55), 0 2px 8px rgba(30,25,20,0.08)"
                            : "0 2px 6px rgba(30,25,20,0.06)",
                          cursor: "pointer",
                          transition: "background .12s ease, box-shadow .35s ease, transform .12s ease",
                          animation: justDone
                            ? "leverage-card-celebrate 2.4s ease both"
                            : `slideUp .3s ease ${i * 0.02}s both`,
                        }}
                      >
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          {b.cover ? (
                            <img
                              src={ensureHttps(b.cover)}
                              alt=""
                              style={{ width: 42, height: 60, objectFit: "cover", borderRadius: 5, border: "1px solid #e0d8c8", flexShrink: 0, boxShadow: "0 1px 3px rgba(30,25,20,0.12)" }}
                            />
                          ) : (
                            <BookIcon />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "#3d362c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0.2 }}>{b.title}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                              {b.author && <span style={{ fontSize: 11, color: "#a89e8c", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.author}</span>}
                              {b.rating > 0 && <Stars r={b.rating} size={11} />}
                            </div>
                            <div style={{ marginTop: 6 }}>
                              <StatusBadge status={b.status} />
                            </div>
                          </div>
                          <span style={{ fontSize: 14, color: "#c4b8a6" }}>›</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Floating "本を追加" FAB — books tab only, sits above bottom nav. */}
            <button
              type="button"
              onClick={openAdd}
              aria-label="本を追加"
              style={{
                position: "fixed",
                right: 18,
                bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
                width: 56,
                height: 56,
                borderRadius: 28,
                border: "none",
                background: "#5c5043",
                color: "#faf6f0",
                fontSize: 28,
                lineHeight: 1,
                cursor: "pointer",
                boxShadow: "0 6px 16px rgba(30,25,20,0.28)",
                zIndex: 600,
                fontFamily: "inherit",
              }}
            >
              ＋
            </button>
          </>
        )}

        {tab === "review" && (
          <Review books={books} onOpenBook={(b) => { openDetail(b); setTab("books"); }} />
        )}

        {tab === "brain" && (
          <MyBookBrain onOpenBook={(b) => { openDetail(b); setTab("books"); }} />
        )}

        {tab === "advisor" && (
          <div style={{ padding: "12px 16px 24px" }}>
            <BookAdvisor
              onAddBook={(rec) => { addFromAdvisor(rec); }}
              onClose={() => setTab("books")}
            />
          </div>
        )}
      </div>

      {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} />}

      {settingsOpen && (
        <AccountSettings
          onClose={() => setSettingsOpen(false)}
          onAfterDelete={() => setSettingsOpen(false)}
        />
      )}

      {helpModalOpen && (
        <HelpModal
          helpKey={getCurrentHelpKey()}
          onClose={() => setHelpModalOpen(false)}
          onShowOnboarding={() => {
            setHelpModalOpen(false);
            clearOnboardingCompletion();
            setShowOnboarding(true);
          }}
        />
      )}

      <BottomNav tab={tab} setTab={(t) => { setTab(t); if (view !== "list") goList(); }} />
    </Shell>
  );
}

function hashHasAuthParams() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hash || '';
  return h.includes('error=') || h.includes('access_token=');
}

function AppShell() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Shell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <Dots />
        </div>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <AuthScreen />
      </Shell>
    );
  }
  return <AuthedApp />;
}

export default function App() {
  const [authCallbackActive, setAuthCallbackActive] = useState(hashHasAuthParams);
  const [showSplash, setShowSplash] = useState(true);
  const exitAuthCallback = useCallback(() => setAuthCallbackActive(false), []);

  return (
    <>
      {showSplash && <SplashScreen onDismiss={() => setShowSplash(false)} />}
      {authCallbackActive ? <AuthCallback onDone={exitAuthCallback} /> : <AppShell />}
    </>
  );
}

/* ========== Styles ========== */
const inp = { width: "100%", padding: "10px 12px", fontSize: 16, border: "1px solid #d4ccbe", borderRadius: 10, background: "#fff", outline: "none", color: "#3d362c", fontFamily: "inherit" };
const ta = { ...inp, resize: "vertical", lineHeight: 1.7 };
const lnk = { background: "none", border: "none", color: "#8a7e6b", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 };
const btnS = { padding: "10px 0", borderRadius: 10, border: "none", background: "#5c5043", color: "#faf6f0", cursor: "pointer", fontFamily: "inherit", fontSize: 14, letterSpacing: 1 };
const btnO = { padding: "10px 0", borderRadius: 10, border: "1px solid #d4ccbe", background: "transparent", color: "#8a7e6b", cursor: "pointer", fontFamily: "inherit", fontSize: 14 };
const aiB = { width: "100%", padding: "10px 0", borderRadius: 10, border: "1px dashed #c4b8a6", background: "#f7f3ec", color: "#6b5d4f", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500 };
const navBtn = { padding: "10px 24px", borderRadius: 10, border: "1px solid #d4ccbe", background: "transparent", color: "#5c5548", cursor: "pointer", fontFamily: "inherit", fontSize: 13 };
const closeBtn = { background: "none", border: "none", fontSize: 20, color: "#8a7e6b", cursor: "pointer" };
const phaseDesc = { fontSize: 12, color: "#8a7e6b", marginBottom: 16, lineHeight: 1.6 };
const tagBtn = { fontSize: 10, padding: "3px 10px", borderRadius: 12, border: "1px solid #d4ccbe", background: "transparent", color: "#8a7e6b", cursor: "pointer", fontFamily: "inherit" };
const tagBtnActive = { border: "1.5px solid #8a7e6b", background: "#e8e0d2", color: "#3d362c" };
