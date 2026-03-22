import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const STAR = "★";
const EMPTY_STAR = "☆";
const STORAGE_KEY = "leverage-reading-data";
const STATUSES = [
  { key: "want", label: "読みたい", emoji: "🔖", bg: "#f0e8d8", color: "#8a7040" },
  { key: "reading", label: "読書中", emoji: "📖", bg: "#dde8f0", color: "#4a6e8a" },
  { key: "done", label: "読了", emoji: "✅", bg: "#e2ecd8", color: "#5a7a48" },
];
const getSt = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];

// ==================== Storage ====================
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { books: [], collections: [], goal: 24 };
}
function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// ==================== AI ====================
async function callClaude(sys, usr) {
  try {
    const r = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: sys,
        messages: [{ role: "user", content: usr }],
      }),
    });
    const d = await r.json();
    if (d.error) return "AI機能を使うにはAPIキーの設定が必要です。";
    return d.content?.map((b) => b.text || "").join("\n") || "エラー";
  } catch {
    return "通信エラー。API設定を確認してください。";
  }
}
const AI_SYS = "レバレッジ・リーディング専門メンター。本は投資、重要20%で80%成果、行動が全て。マークダウン不使用、見出し【】。";
const S1P = (t, a) => `「${t}」（${a || "不明"}）分析：\n【本の核心】1行。\n【パラダイムシフト】覆す常識。\n【著者のポジション】強み偏り。\n【構造マップ】重要20%集中箇所。`;
const S2P = (t, a, an, p) => `本：「${t}」（${a || "不明"}）\n【解析】${an}\n【読者】${p}\n\n戦略：\n【投資戦略】重点20%と流し読み。\n【3つの問い】回収直結。\n【事前インストール】概念3〜5。\n【回収ゴール】1文。`;

// ==================== ISBN / Search ====================
async function lookupISBN(isbn) {
  try {
    const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    const d = await r.json();
    if (d?.[0]?.summary) {
      const s = d[0].summary;
      return { title: s.title || "", author: s.author || "", cover: s.cover || "" };
    }
  } catch {}
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const d = await r.json();
    if (d.items?.[0]?.volumeInfo) {
      const v = d.items[0].volumeInfo;
      return { title: v.title || "", author: (v.authors || []).join(", "), cover: v.imageLinks?.thumbnail || "" };
    }
  } catch {}
  return null;
}

async function searchBooksAPI(q) {
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=8&langRestrict=ja`);
    const d = await r.json();
    return (d.items || []).map((i) => {
      const v = i.volumeInfo;
      return { title: v.title || "", author: (v.authors || []).join(", "), cover: v.imageLinks?.thumbnail || "", pages: v.pageCount || 0 };
    });
  } catch { return []; }
}

// ==================== Barcode Scanner ====================
function BarcodeScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const fileRef = useRef(null);
  const [mode, setMode] = useState("init");
  const [status, setStatus] = useState("カメラ起動中...");
  const [manual, setManual] = useState("");

  const detect = useCallback(async (src) => {
    if ("BarcodeDetector" in window) {
      try {
        const d = new BarcodeDetector({ formats: ["ean_13", "ean_8"] });
        const b = await d.detect(src);
        if (b.length) return b[0].rawValue;
      } catch {}
    }
    return null;
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setMode("live");
        setStatus("バーコードをかざしてください");
        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          const c = canvasRef.current;
          if (!c) return;
          const ctx = c.getContext("2d");
          c.width = videoRef.current.videoWidth;
          c.height = videoRef.current.videoHeight;
          ctx.drawImage(videoRef.current, 0, 0);
          const isbn = await detect(c);
          if (isbn) { cleanup(); onDetect(isbn); }
        }, 400);
      } catch {
        if (!dead) { setMode("manual"); setStatus("カメラ利用不可"); }
      }
    })();
    return () => { dead = true; cleanup(); };
  }, [detect, onDetect]);

  const cleanup = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  };

  const handlePhoto = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setStatus("解析中...");
    try {
      const bm = await createImageBitmap(f);
      const isbn = await detect(bm);
      if (isbn) { cleanup(); onDetect(isbn); }
      else setStatus("検出できませんでした");
    } catch { setStatus("失敗"); }
  };

  const doManual = () => {
    const c = manual.replace(/[-\s]/g, "");
    if (c.length >= 10) { cleanup(); onDetect(c); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: "#3d362c" }}>📷 バーコード</h3>
        <button onClick={() => { cleanup(); onClose(); }} style={{ background: "none", border: "none", fontSize: 20, color: "#8a7e6b", cursor: "pointer" }}>×</button>
      </div>
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#1a1a1a", aspectRatio: "4/3" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: mode === "live" ? "block" : "none" }} />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        {mode !== "live" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 160 }}>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{mode === "init" ? "起動中..." : "カメラ利用不可"}</p>
          </div>
        )}
        {mode === "live" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "75%", height: 3, background: "rgba(212,160,64,0.7)", borderRadius: 2, animation: "scanLine 2s ease-in-out infinite" }} />
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#8a7e6b", textAlign: "center" }}>{status}</p>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
      <button onClick={() => fileRef.current?.click()} style={{ ...btnO }}>📸 写真で読み取る</button>
      <div style={{ borderTop: "1px solid #e0d8c8", paddingTop: 10 }}>
        <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 4 }}>ISBN入力</p>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="978-..." style={{ ...inp, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && doManual()} />
          <button onClick={doManual} style={{ ...btnS, padding: "8px 14px", fontSize: 12 }}>検索</button>
        </div>
      </div>
    </div>
  );
}

// ==================== Book Search Modal ====================
function BookSearchModal({ onSelect, onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const doSearch = async () => { if (!q.trim()) return; setSearching(true); setResults(await searchBooksAPI(q)); setSearching(false); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: "#3d362c" }}>🔍 検索</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#8a7e6b", cursor: "pointer" }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="タイトル/著者" style={{ ...inp, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && doSearch()} autoFocus />
        <button onClick={doSearch} style={{ ...btnS, padding: "8px 14px", fontSize: 12 }}>検索</button>
      </div>
      {searching && <Dots />}
      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
          {results.map((b, i) => (
            <button key={i} onClick={() => onSelect(b)} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 10, border: "1px solid #e4ddd0", background: "#faf6f0", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              {b.cover ? <img src={b.cover} alt="" style={{ width: 32, height: 44, objectFit: "cover", borderRadius: 4 }} /> : <div style={{ width: 32, height: 44, background: "#e8e2d6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>📕</div>}
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

// ==================== Small Components ====================
function Stars({ r, onChange, size = 18 }) {
  return (
    <span style={{ cursor: onChange ? "pointer" : "default", userSelect: "none" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} onClick={() => onChange?.(r === n ? 0 : n)} style={{ fontSize: size, color: n <= r ? "#d4a040" : "#d0c8b8", marginRight: 1 }}>{n <= r ? STAR : EMPTY_STAR}</span>
      ))}
    </span>
  );
}

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(30,25,20,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#faf6f0", borderRadius: 14, padding: "22px 20px", width: "min(420px,92vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 16px 48px rgba(30,25,20,0.16)", animation: "slideUp .25s" }}>{children}</div>
    </div>
  );
}

function Dots() {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 4, padding: "12px 0" }}>
      {[0, 1, 2].map((i) => (<span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: "#d4a040", animation: `pulse 1s infinite ${i * 0.2}s` }} />))}
    </div>
  );
}

function Field({ label, sub, children }) {
  return (
    <div>
      <label style={{ fontSize: 13, color: "#5c5548", fontWeight: 500, display: "block", marginBottom: sub ? 2 : 5 }}>{label}</label>
      {sub && <p style={{ fontSize: 11, color: "#a89e8c", marginBottom: 5, lineHeight: 1.5 }}>{sub}</p>}
      {children}
    </div>
  );
}

function Card({ label, text, bg, bold }) {
  return (
    <div style={{ background: bg || "#f7f3ec", borderRadius: 10, padding: "10px 12px", marginTop: 6 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#8a7040", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 13, color: "#4a4036", lineHeight: 1.8, whiteSpace: "pre-wrap", fontWeight: bold ? 500 : 400 }}>{text}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = getSt(status);
  return (<span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: s.bg, color: s.color, fontWeight: 500 }}>{s.emoji} {s.label}</span>);
}

function StatusPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {STATUSES.map((s) => (
        <button key={s.key} onClick={() => onChange(s.key)} style={{ flex: 1, padding: "7px 0", fontSize: 12, borderRadius: 10, fontFamily: "inherit", cursor: "pointer", border: value === s.key ? `1.5px solid ${s.color}` : "1px solid #d4ccbe", background: value === s.key ? s.bg : "transparent", color: value === s.key ? s.color : "#8a7e6b" }}>{s.emoji} {s.label}</button>
      ))}
    </div>
  );
}

function TagInput({ tags, onChange }) {
  const [input, setInput] = useState("");
  const add = () => { const t = input.trim(); if (t && !tags.includes(t)) onChange([...tags, t]); setInput(""); };
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
      <div style={{ display: "flex", gap: 6 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="タグを追加" style={{ ...inp, flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button onClick={add} style={{ ...btnO, padding: "6px 12px", fontSize: 12 }}>追加</button>
      </div>
    </div>
  );
}

// ==================== Data ====================
const emptyBook = () => ({
  id: "", title: "", author: "", cover: "", rating: 0, status: "want",
  date: new Date().toISOString().slice(0, 10), tags: [], currentPage: 0, totalPages: 0,
  investPurpose: "", aiAnalysis: "", aiStrategy: "",
  leverageMemo: "", actions: [], roiSummary: "",
});

// ==================== Tab: Today ====================
function TodayTab({ books }) {
  const cards = useMemo(() => {
    const all = [];
    books.forEach((b) => {
      if (b.leverageMemo?.trim()) all.push({ type: "memo", title: b.title, author: b.author, cover: b.cover, text: b.leverageMemo, tags: b.tags || [] });
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

  if (!cards.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: 48, marginBottom: 12 }}>📚</p>
        <p style={{ fontSize: 15, color: "#5c5548", fontWeight: 500 }}>学びを蓄積しよう</p>
        <p style={{ fontSize: 12, color: "#a89e8c", marginTop: 6, lineHeight: 1.6 }}>本を読んでレバレッジメモを記録すると、<br />毎日ここに学びが表示されます。</p>
      </div>
    );
  }

  const c = cards[idx];
  return (
    <div style={{ padding: "0 20px" }}
      onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={(e) => { if (touchStart === null) return; const diff = e.changedTouches[0].clientX - touchStart; if (Math.abs(diff) > 50) { diff < 0 ? next() : prev(); } setTouchStart(null); }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 11, color: "#a89e8c", letterSpacing: 3, fontWeight: 500 }}>TODAY'S LEVERAGE</p>
        <p style={{ fontSize: 11, color: "#c4b8a6", marginTop: 2 }}>{idx + 1} / {cards.length}</p>
      </div>
      <div key={idx} style={{ background: "#faf6f0", borderRadius: 16, padding: "20px 18px", border: "1px solid #e4ddd0", minHeight: 180, animation: "fadeIn .3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {c.cover && <img src={c.cover} alt="" style={{ width: 28, height: 40, objectFit: "cover", borderRadius: 4 }} />}
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "#3d362c" }}>{c.title}</p>
            {c.author && <p style={{ fontSize: 11, color: "#9a8e7a" }}>{c.author}</p>}
          </div>
          <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 8, background: c.type === "memo" ? "#f0e8d8" : c.type === "roi" ? "#e2ecd8" : "#dde8f0", color: c.type === "memo" ? "#8a7040" : c.type === "roi" ? "#5a7a48" : "#4a6e8a" }}>
            {c.type === "memo" ? "メモ" : c.type === "roi" ? "ROI" : "行動"}
          </span>
        </div>
        <p style={{ fontSize: 14, color: "#3d362c", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{c.text}</p>
        {c.tags?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 12 }}>
            {c.tags.map((t, i) => (<span key={i} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 8, background: "#eae3d6", color: "#7a6e58" }}>#{t}</span>))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
        <button onClick={prev} style={{ ...navBtn }}>← 前へ</button>
        <button onClick={next} style={{ ...navBtn, background: "#5c5043", color: "#faf6f0", border: "none" }}>次へ →</button>
      </div>
      <p style={{ textAlign: "center", fontSize: 10, color: "#c4b8a6", marginTop: 8 }}>← スワイプで移動 →</p>
    </div>
  );
}

// ==================== Tab: Memos ====================
function MemosTab({ books, collections, onUpdateCollections }) {
  const [subTab, setSubTab] = useState("search");
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [newColName, setNewColName] = useState("");
  const [editCol, setEditCol] = useState(null);

  const allMemos = useMemo(() => {
    const memos = [];
    books.forEach((b) => {
      if (b.leverageMemo?.trim()) {
        b.leverageMemo.split("\n").filter((l) => l.trim()).forEach((line) => {
          memos.push({ text: line.trim(), title: b.title, tags: b.tags || [], bookId: b.id });
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
              <button onClick={() => setTagFilter("")} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, border: !tagFilter ? "1.5px solid #8a7e6b" : "1px solid #d4ccbe", background: !tagFilter ? "#e8e0d2" : "transparent", color: !tagFilter ? "#3d362c" : "#8a7e6b", cursor: "pointer", fontFamily: "inherit" }}>すべて</button>
              {allTags.map((t) => (
                <button key={t} onClick={() => setTagFilter(tagFilter === t ? "" : t)} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, border: tagFilter === t ? "1.5px solid #8a7e6b" : "1px solid #d4ccbe", background: tagFilter === t ? "#e8e0d2" : "transparent", color: tagFilter === t ? "#3d362c" : "#8a7e6b", cursor: "pointer", fontFamily: "inherit" }}>#{t}</button>
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
                    <select onChange={(e) => { if (e.target.value) toggleMemoInCol(e.target.value, m.text); e.target.value = ""; }} style={{ fontSize: 10, border: "1px solid #d4ccbe", borderRadius: 6, padding: "2px 4px", color: "#8a7e6b", background: "transparent", fontFamily: "inherit", marginLeft: "auto" }} defaultValue="">
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
            <input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="新しいコレクション名" style={{ ...inp, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addCollection()} />
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

// ==================== Tab: Actions ====================
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
      {allActions.length === 0 ? <p style={{ textAlign: "center", padding: 30, color: "#b5aa96", fontSize: 13 }}>行動リストなし</p>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {allActions.map((a, i) => (
              <div key={i} onClick={() => onToggleAction(a.bookId, a.actionIdx)} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: a.done ? "#f0ebe2" : "#faf6f0", border: "1px solid #e4ddd0", cursor: "pointer" }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{a.done ? "✅" : "⬜"}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, color: a.done ? "#9a8e7a" : "#3d362c", textDecoration: a.done ? "line-through" : "none" }}>{a.text}</p>
                  <p style={{ fontSize: 10, color: "#b5aa96", marginTop: 2 }}>📕 {a.bookTitle}</p>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ==================== Bottom Nav ====================
function BottomNav({ tab, setTab, actionDone, actionCount }) {
  const tabs = [
    { key: "today", icon: "💡", label: "今日の学び" },
    { key: "books", icon: "📚", label: "本棚" },
    { key: "memos", icon: "🔍", label: "メモ" },
    { key: "actions", icon: "✅", label: "行動" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#faf6f0", borderTop: "1px solid #e0d8c8", display: "flex", zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)" }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: "8px 0 6px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
          <span style={{ fontSize: 20 }}>{t.icon}</span>
          <span style={{ fontSize: 9, color: tab === t.key ? "#3d362c" : "#b5aa96", fontWeight: tab === t.key ? 600 : 400 }}>{t.label}</span>
          {tab === t.key && <div style={{ position: "absolute", top: 0, left: "30%", right: "30%", height: 2, background: "#d4a040", borderRadius: 1 }} />}
          {t.key === "actions" && actionCount > 0 && (
            <span style={{ position: "absolute", top: 4, right: "20%", fontSize: 8, background: actionDone === actionCount ? "#5a7a48" : "#d4a040", color: "#fff", padding: "1px 4px", borderRadius: 6, minWidth: 14, textAlign: "center" }}>{actionDone}/{actionCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ==================== MAIN APP ====================
export default function App() {
  const [data, setData] = useState(() => loadData());
  const books = data.books;
  const collections = data.collections;
  const goal = data.goal;

  const [tab, setTab] = useState("today");
  const [view, setView] = useState("list");
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState(emptyBook());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStep, setAiStep] = useState(0);

  const persist = useCallback((updates) => {
    setData((prev) => {
      const next = { ...prev, ...updates };
      saveData(next);
      return next;
    });
  }, []);

  const openAdd = () => { setForm({ ...emptyBook(), id: Date.now().toString() }); setView("edit"); setCurrent(null); setAiStep(0); setTab("books"); };
  const openDetail = (b) => { setCurrent(b); setView("detail"); };
  const openEdit = (b) => { setForm({ ...emptyBook(), ...b, tags: b.tags || [], actions: b.actions || [] }); setCurrent(b); setView("edit"); setAiStep(b.aiAnalysis ? 1 : 0); };
  const goList = () => { setView("list"); setCurrent(null); };

  const handleSave = () => {
    if (!form.title.trim()) return;
    const ex = books.find((b) => b.id === form.id);
    const next = ex ? books.map((b) => (b.id === form.id ? { ...form } : b)) : [{ ...form }, ...books];
    persist({ books: next });
    setCurrent({ ...form });
    setView("detail");
  };

  const handleDelete = () => { persist({ books: books.filter((b) => b.id !== current.id) }); setDeleteConfirm(false); goList(); };
  const handleBarcode = async (isbn) => { setScannerOpen(false); setLookingUp(true); const info = await lookupISBN(isbn); setLookingUp(false); if (info) setForm((f) => ({ ...f, title: info.title || f.title, author: info.author || f.author, cover: info.cover || f.cover })); else alert("見つかりませんでした"); };
  const handleBookSelect = (b) => { setSearchOpen(false); setForm((f) => ({ ...f, title: b.title || f.title, author: b.author || f.author, cover: b.cover || f.cover, totalPages: b.pages || f.totalPages })); };
  const runS1 = async () => { if (!form.title.trim()) return; setAiLoading(true); const r = await callClaude(AI_SYS, S1P(form.title, form.author)); setForm((f) => ({ ...f, aiAnalysis: r })); setAiStep(1); setAiLoading(false); };
  const runS2 = async () => { if (!form.investPurpose?.trim()) return; setAiLoading(true); const r = await callClaude(AI_SYS, S2P(form.title, form.author, form.aiAnalysis, form.investPurpose)); setForm((f) => ({ ...f, aiStrategy: r })); setAiLoading(false); };

  const toggleAction = (bookId, actionIdx) => {
    const next = books.map((b) => {
      if (b.id !== bookId) return b;
      const acts = [...(b.actions || [])];
      acts[actionIdx] = { ...acts[actionIdx], done: !acts[actionIdx].done };
      return { ...b, actions: acts };
    });
    persist({ books: next });
  };

  const addAction = () => setForm((f) => ({ ...f, actions: [...(f.actions || []), { text: "", done: false }] }));
  const updateAction = (i, text) => setForm((f) => { const a = [...(f.actions || [])]; a[i] = { ...a[i], text }; return { ...f, actions: a }; });
  const removeAction = (i) => setForm((f) => ({ ...f, actions: (f.actions || []).filter((_, j) => j !== i) }));

  const filtered = useMemo(() => {
    let list = books.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (search) { const q = search.toLowerCase(); return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || (b.tags || []).some((t) => t.toLowerCase().includes(q)); }
      return true;
    });
    list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return list;
  }, [books, statusFilter, search]);

  const stats = { total: books.length, want: books.filter((b) => b.status === "want").length, reading: books.filter((b) => b.status === "reading").length, done: books.filter((b) => b.status === "done").length };
  const actionCount = books.reduce((s, b) => s + (b.actions || []).filter((a) => a.text?.trim()).length, 0);
  const actionDone = books.reduce((s, b) => s + (b.actions || []).filter((a) => a.done).length, 0);

  // ===== DETAIL =====
  if (view === "detail" && current) {
    const hasPrep = current.aiAnalysis || current.aiStrategy || current.investPurpose;
    const hasPost = current.leverageMemo || (current.actions || []).some((a) => a.text?.trim()) || current.roiSummary;
    return (
      <Shell>
        <div style={{ padding: "20px 20px 80px" }}>
          <button onClick={goList} style={lnk}>← 一覧</button>
          <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
            {current.cover && <img src={current.cover} alt="" style={{ width: 56, height: 78, objectFit: "cover", borderRadius: 6, border: "1px solid #e0d8c8" }} />}
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 17, fontWeight: 500, color: "#3d362c", lineHeight: 1.4 }}>{current.title}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                {current.author && <span style={{ fontSize: 12, color: "#8a7e6b" }}>{current.author}</span>}
                <StatusBadge status={current.status} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Stars r={current.rating || 0} size={14} />
                {current.date && <span style={{ fontSize: 11, color: "#b5aa96" }}>{current.date}</span>}
              </div>
            </div>
          </div>
          {current.tags?.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>{current.tags.map((t, i) => (<span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#eae3d6", color: "#7a6e58" }}>#{t}</span>))}</div>}
          {hasPrep && (
            <div style={{ marginTop: 22 }}>
              <h3 style={secT}>📐 投資設計</h3>
              {current.investPurpose && <Card label="目的・課題・仮説" text={current.investPurpose} />}
              {current.aiAnalysis && <Card label="🔍 AI解析" text={current.aiAnalysis} />}
              {current.aiStrategy && <Card label="🗺️ AI戦略" text={current.aiStrategy} />}
            </div>
          )}
          {hasPost && (
            <div style={{ marginTop: 22 }}>
              <h3 style={secT}>💰 投資回収</h3>
              {current.leverageMemo && <Card label="レバレッジメモ" text={current.leverageMemo} />}
              {(current.actions || []).filter((a) => a.text?.trim()).length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#8a7040", marginBottom: 4 }}>行動リスト</p>
                  {current.actions.filter((a) => a.text?.trim()).map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
                      <span style={{ fontSize: 16 }}>{a.done ? "✅" : "⬜"}</span>
                      <p style={{ fontSize: 13, color: a.done ? "#9a8e7a" : "#4a4036", textDecoration: a.done ? "line-through" : "none" }}>{a.text}</p>
                    </div>
                  ))}
                </div>
              )}
              {current.roiSummary && <Card label="ROI" text={current.roiSummary} bg="#f0ebe2" bold />}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button onClick={() => openEdit(current)} style={{ ...btnS, flex: 1 }}>編集</button>
            <button onClick={() => setDeleteConfirm(true)} style={{ ...btnO, padding: "10px 18px", borderColor: "#c4a0a0", color: "#a05040" }}>削除</button>
          </div>
        </div>
        <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)}>
          <p style={{ fontSize: 15, color: "#3d362c", textAlign: "center", marginBottom: 20 }}>この本を削除しますか？</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setDeleteConfirm(false)} style={{ ...btnO, flex: 1 }}>キャンセル</button>
            <button onClick={handleDelete} style={{ ...btnS, flex: 1, background: "#a05040" }}>削除</button>
          </div>
        </Modal>
        <BottomNav tab={tab} setTab={(t) => { setTab(t); goList(); }} actionDone={actionDone} actionCount={actionCount} />
      </Shell>
    );
  }

  // ===== EDIT =====
  if (view === "edit") {
    return (
      <Shell>
        <div style={{ padding: "20px 20px 80px" }}>
          <button onClick={current ? () => setView("detail") : goList} style={lnk}>← 戻る</button>
          <h2 style={{ fontSize: 17, fontWeight: 500, color: "#3d362c", marginTop: 10, marginBottom: 16 }}>{current ? "編集" : "本を追加"}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {!current && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setScannerOpen(true)} style={{ ...btnO, flex: 1, padding: "12px 0", borderStyle: "dashed", fontSize: 13 }}>📷 バーコード</button>
                <button onClick={() => setSearchOpen(true)} style={{ ...btnO, flex: 1, padding: "12px 0", borderStyle: "dashed", fontSize: 13 }}>🔍 検索</button>
              </div>
            )}
            {lookingUp && <Dots />}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {form.cover && <img src={form.cover} alt="" style={{ width: 48, height: 68, objectFit: "cover", borderRadius: 5, border: "1px solid #e0d8c8", flexShrink: 0 }} />}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="タイトル *" style={inp} autoFocus />
                <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="著者" style={inp} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="日付"><input type="date" value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp} /></Field></div>
              <div style={{ flex: 1 }}><Field label="評価"><Stars r={form.rating} onChange={(r) => setForm({ ...form, rating: r })} size={22} /></Field></div>
            </div>
            <Field label="ステータス"><StatusPicker value={form.status} onChange={(s) => setForm({ ...form, status: s })} /></Field>
            <Field label="進捗">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="number" value={form.currentPage || ""} onChange={(e) => setForm({ ...form, currentPage: parseInt(e.target.value) || 0 })} placeholder="現在" style={{ ...inp, width: 70, textAlign: "center" }} />
                <span style={{ color: "#b5aa96" }}>/</span>
                <input type="number" value={form.totalPages || ""} onChange={(e) => setForm({ ...form, totalPages: parseInt(e.target.value) || 0 })} placeholder="総" style={{ ...inp, width: 70, textAlign: "center" }} />
                <span style={{ fontSize: 12, color: "#8a7e6b" }}>p</span>
              </div>
            </Field>
            <Field label="タグ"><TagInput tags={form.tags || []} onChange={(t) => setForm({ ...form, tags: t })} /></Field>
          </div>
          <div style={{ marginTop: 22 }}>
            <h3 style={secT}>📐 投資設計</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
              <Field label="目的・課題・仮説"><textarea value={form.investPurpose || ""} onChange={(e) => setForm({ ...form, investPurpose: e.target.value })} placeholder={"・目的：\n・課題：\n・仮説："} rows={3} style={ta} /></Field>
              <button onClick={runS1} disabled={!form.title.trim() || aiLoading} style={{ ...aiB, opacity: !form.title.trim() || aiLoading ? 0.5 : 1 }}>{aiLoading && aiStep === 0 ? "分析中..." : "🔍 AI解析"}</button>
              {aiLoading && aiStep === 0 && <Dots />}
              {form.aiAnalysis && <Card label="🔍 解析" text={form.aiAnalysis} />}
              {aiStep >= 1 && form.investPurpose?.trim() && (
                <div style={{ animation: "slideUp .3s" }}>
                  <button onClick={runS2} disabled={aiLoading} style={{ ...aiB, opacity: aiLoading ? 0.5 : 1 }}>{aiLoading && aiStep >= 1 ? "作成中..." : "🗺️ AI戦略"}</button>
                  {aiLoading && aiStep >= 1 && <Dots />}
                  {form.aiStrategy && <Card label="🗺️ 戦略" text={form.aiStrategy} />}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 22 }}>
            <h3 style={secT}>💰 投資回収</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
              <Field label="レバレッジメモ" sub="重要な20%を1行ずつ抜き出す"><textarea value={form.leverageMemo || ""} onChange={(e) => setForm({ ...form, leverageMemo: e.target.value })} placeholder={"・フレーズ\n・ノウハウ\n・転換点"} rows={5} style={ta} /></Field>
              <Field label="行動リスト" sub="チェック可能な具体アクション">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(form.actions || []).map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input value={a.text} onChange={(e) => updateAction(i, e.target.value)} placeholder={`行動 ${i + 1}`} style={{ ...inp, flex: 1 }} />
                      <button onClick={() => removeAction(i)} style={{ background: "none", border: "none", fontSize: 16, color: "#c4a0a0", cursor: "pointer" }}>×</button>
                    </div>
                  ))}
                  <button onClick={addAction} style={{ ...btnO, padding: "8px 0", fontSize: 12, borderStyle: "dashed" }}>＋ 行動を追加</button>
                </div>
              </Field>
              <Field label="ROI一言"><input value={form.roiSummary || ""} onChange={(e) => setForm({ ...form, roiSummary: e.target.value })} placeholder="この本から得たリターン" style={inp} /></Field>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button onClick={current ? () => setView("detail") : goList} style={{ ...btnO, flex: 1 }}>キャンセル</button>
            <button onClick={handleSave} disabled={!form.title.trim()} style={{ ...btnS, flex: 1, opacity: form.title.trim() ? 1 : 0.5 }}>保存</button>
          </div>
        </div>
        <Modal open={scannerOpen} onClose={() => setScannerOpen(false)}><BarcodeScanner onDetect={handleBarcode} onClose={() => setScannerOpen(false)} /></Modal>
        <Modal open={searchOpen} onClose={() => setSearchOpen(false)}><BookSearchModal onSelect={handleBookSelect} onClose={() => setSearchOpen(false)} /></Modal>
      </Shell>
    );
  }

  // ===== TAB CONTENT =====
  return (
    <Shell>
      <header style={{ padding: "24px 20px 10px" }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, color: "#3d362c", letterSpacing: 2 }}>📚 レバレッジ読書ログ</h1>
      </header>
      <div style={{ paddingBottom: 80 }}>
        {tab === "today" && <TodayTab books={books} />}
        {tab === "books" && (
          <>
            <div style={{ display: "flex", gap: 3, padding: "8px 20px", borderTop: "1px solid #e8e2d6", borderBottom: "1px solid #e8e2d6" }}>
              {[{ l: "投資", v: stats.total, c: "#4a4036" }, { l: "読みたい", v: stats.want, c: "#8a7040" }, { l: "読書中", v: stats.reading, c: "#4a6e8a" }, { l: "読了", v: stats.done, c: "#5a7a48" }].map((s) => (
                <div key={s.l} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 9, color: "#9a8e7a" }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input placeholder="検索..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, flex: 1, background: "#faf6f0", fontSize: 13 }} />
                <button onClick={openAdd} style={{ ...btnS, padding: "8px 16px", fontSize: 12 }}>＋</button>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[{ key: "all", label: "すべて" }, ...STATUSES].map((s) => (
                  <button key={s.key} onClick={() => setStatusFilter(s.key)} style={{ flex: 1, padding: "4px 0", fontSize: 10, borderRadius: 12, fontFamily: "inherit", cursor: "pointer", border: statusFilter === s.key ? `1.5px solid ${s.color || "#8a7e6b"}` : "1px solid #d4ccbe", background: statusFilter === s.key ? (s.bg || "#e8e0d2") : "transparent", color: statusFilter === s.key ? (s.color || "#3d362c") : "#8a7e6b" }}>{s.emoji ? s.emoji + " " : ""}{s.label}</button>
                ))}
              </div>
            </div>
            <div style={{ padding: "0 20px" }}>
              {filtered.length === 0 ? (
                <p style={{ textAlign: "center", padding: "40px 20px", color: "#b5aa96", fontSize: 13 }}>{books.length === 0 ? "最初の一冊を投資しよう" : "該当なし"}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {filtered.map((b, i) => (
                    <div key={b.id} onClick={() => openDetail(b)} style={{ background: "#faf6f0", borderRadius: 12, padding: "10px 12px", border: "1px solid #e4ddd0", cursor: "pointer", animation: `slideUp .3s ease ${i * 0.02}s both` }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {b.cover ? <img src={b.cover} alt="" style={{ width: 34, height: 48, objectFit: "cover", borderRadius: 4, border: "1px solid #e0d8c8", flexShrink: 0 }} /> : <div style={{ width: 34, height: 48, background: "#e8e2d6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📕</div>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#3d362c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                            {b.author && <span style={{ fontSize: 11, color: "#9a8e7a", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.author}</span>}
                            <Stars r={b.rating || 0} size={10} />
                          </div>
                          <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
                            <StatusBadge status={b.status} />
                            {b.tags?.slice(0, 2).map((t, j) => (<span key={j} style={{ fontSize: 8, background: "#eae3d6", color: "#7a6e58", padding: "1px 5px", borderRadius: 5 }}>#{t}</span>))}
                          </div>
                        </div>
                        <span style={{ fontSize: 13, color: "#c4b8a6" }}>›</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {tab === "memos" && <MemosTab books={books} collections={collections} onUpdateCollections={(c) => persist({ collections: c })} />}
        {tab === "actions" && <ActionsTab books={books} onToggleAction={(bid, aidx) => toggleAction(bid, aidx)} />}
      </div>
      <BottomNav tab={tab} setTab={(t) => { setTab(t); if (view !== "list") goList(); }} actionDone={actionDone} actionCount={actionCount} />
    </Shell>
  );
}

// ==================== Shell ====================
function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#f5f0e8,#ebe4d8)", fontFamily: "'Noto Serif JP',Georgia,serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;500;600&display=swap');
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: .2 } 50% { opacity: 1 } }
        @keyframes scanLine { 0%, 100% { transform: translateY(-30px); opacity: .5 } 50% { transform: translateY(30px); opacity: 1 } }
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

// ==================== Styles ====================
const inp = { width: "100%", padding: "9px 12px", fontSize: 14, border: "1px solid #d4ccbe", borderRadius: 10, background: "#fff", outline: "none", color: "#3d362c", fontFamily: "inherit" };
const ta = { ...inp, resize: "vertical", lineHeight: 1.7 };
const lnk = { background: "none", border: "none", color: "#8a7e6b", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 };
const btnS = { padding: "10px 0", borderRadius: 10, border: "none", background: "#5c5043", color: "#faf6f0", cursor: "pointer", fontFamily: "inherit", fontSize: 14, letterSpacing: 1 };
const btnO = { padding: "10px 0", borderRadius: 10, border: "1px solid #d4ccbe", background: "transparent", color: "#8a7e6b", cursor: "pointer", fontFamily: "inherit", fontSize: 14 };
const aiB = { width: "100%", padding: "9px 0", borderRadius: 10, border: "1px dashed #c4b8a6", background: "#f7f3ec", color: "#6b5d4f", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500 };
const secT = { fontSize: 14, fontWeight: 500, color: "#3d362c", display: "flex", alignItems: "baseline", gap: 6 };
const navBtn = { padding: "10px 24px", borderRadius: 10, border: "1px solid #d4ccbe", background: "transparent", color: "#5c5548", cursor: "pointer", fontFamily: "inherit", fontSize: 13 };
