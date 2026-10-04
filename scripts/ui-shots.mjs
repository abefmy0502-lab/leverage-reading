#!/usr/bin/env node
// 📸 UI スクリーンショット撮影（明るい画面 / 暗い画面の両方）
//
// DESIGN.md / CLAUDE.md の「UI を変えたら明暗両方のスクショを撮って比較する」ルール用。
// お試しモード（npm run demo・Supabase/AI 不要のサンプルデータ）で主要画面を順に開き、
// iPhone 相当（390×844 @2x）で撮る。
//
// 使い方:
//   1. 別ターミナルで  npm run demo            （http://localhost:5173）
//   2. npm run ui:shots -- after              → ui-shots/after/*.png
//      npm run ui:shots -- before             → 変更前に撮っておくと比較できる
//      npm run ui:shots -- after home detail  → 画面を絞って撮る
//   ブラウザ: 環境変数 PW_EXE（Chromium の実行ファイル）→ /opt/pw-browsers/chromium →
//            インストール済みの Google Chrome の順に使う。
//
// 撮った画像は ui-shots/<ラベル>/<画面>-light.png / -dark.png（git 管理外）。
// レビューは .claude/agents/ui-critic.md のエージェントに渡して採点する。

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.UI_SHOTS_URL || 'http://localhost:5173';
const [label = 'current', ...only] = process.argv.slice(2);
const outDir = join('ui-shots', label);

const nav = (name) => `nav button[aria-label="${name}"]`;

// 写真で共有の編集画面（2026-10-01）の操作。
const EDIT = '[role=dialog][aria-label="画像を編集"]';
const SHARE_CAMERA = [{ css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2000 }];
const SHARE_PAPER = [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("画像で共有")' }, { wait: 2000 }];
// 撮った写真のシートで、背景を紙に（手書き風の書体は、本の詳細から開くと中継の通信が詰まって撮影の間に読み込めないことがあるため）。
const SHARE_CAMERA_PAPER = [...SHARE_CAMERA, { css: '[role=dialog] button:has-text("写真以外")' }, { css: '[role=menuitem]:has-text("紙")' }, { wait: 1500 }];
const SHARE_EDIT = [{ css: '[role=dialog] button:text-is("編集")' }, { wait: 1500 }];
// 画像の上の (0.5, fy) でホイール（ctrlKey＝トラックパッドでつまむのと同じ）。
const editWheel = (opts, fy = 0.3) => ({ eval: `(() => { const st = document.querySelector('${EDIT} canvas').parentElement; const r = st.getBoundingClientRect(); st.dispatchEvent(new WheelEvent('wheel', { ...${JSON.stringify(opts)}, clientX: r.left + r.width / 2, clientY: r.top + r.height * ${fy}, bubbles: true, cancelable: true })); })()` });
const EDIT_ZOOM = editWheel({ deltaY: -40, ctrlKey: true });
const EDIT_PAN = editWheel({ deltaX: 70, deltaY: 110 });
const editSwitchesOff = (keep) => ({ eval: `(() => { const keep = ${JSON.stringify(keep)}; document.querySelectorAll('${EDIT} [role=switch]').forEach((b) => { if (!keep.includes(b.getAttribute('aria-label')) && b.getAttribute('aria-checked') === 'true') b.click(); }); })()` });
const EDIT_TITLE_ONLY = editSwitchesOff(['書名']);
const EDIT_TITLE_ONLY_LOGO = editSwitchesOff(['書名', 'Orime のロゴ']);
const EDIT_TOP = { eval: `document.querySelectorAll('${EDIT} *').forEach((el) => { el.scrollTop = 0; })` };
const EDIT_BLUR = { eval: '(() => { if (document.activeElement) document.activeElement.blur(); })()' };
const EDIT_PHRASE = [{ css: `${EDIT} button:has-text("言葉を入れる")` }, { fill: [`${EDIT} input[type=text]`, '問いの質が、答えの質を決める。'] }, { wait: 1200 }];
// 言葉を指で上へ動かす（上から 24% → 12%）。
const EDIT_PHRASE_DRAG = { eval: `(() => { const st = document.querySelector('${EDIT} canvas').parentElement; const r = st.getBoundingClientRect(); const x = r.left + r.width / 2; const y0 = r.top + r.height * 0.24; const ev = (type, y) => st.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); ev('pointerdown', y0); for (let i = 1; i <= 10; i += 1) ev('pointermove', y0 - (r.height * 0.12 * i) / 10); ev('pointerup', y0 - r.height * 0.12); })()` };
const EDIT_PHRASE_GROW = editWheel({ deltaY: -30, ctrlKey: true }, 0.14);

// 運営ダッシュボード（全画面の重なり）の中を、sel の要素が上から 130px に来るまで送る。
const ADMIN_SCROLL = (sel) => `(() => { const box = document.querySelector('[role=dialog][aria-label="運営ダッシュボード"]'); const el = document.querySelector('${sel.replace(/'/g, "\\'")}'); if (!box || !el) return; box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 130; })()`;
// 本の詳細でメモを書いて保存し、一覧のいちばん上（保存したあとのカード）まで送る（タグの提案・つながるメモ）。
const MEMO_SAVED = [
  { css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' },
  { fill: ['textarea[aria-label="メモ本文"]', 'よいマネージャーは部下に答えを渡さず、質問で考えてもらう。任せることで人は育つ。'] },
  { css: '[role=dialog] button:text-is("保存")' }, { wait: 2500 }, { scrollTo: 'h2:has-text("メモ")' },
];

// iPhone の下の安全域（34pt・ホームインジケータ）をまねる: シートの決定ボタンの欄の下に 34 を足す（Chromium では env() を変えられないため）。
const SAFE_BOTTOM = { eval: `(() => { const st = document.createElement('style'); st.textContent = '[data-sheet-footer]{padding-bottom:calc(var(--space-3) + 34px) !important}'; document.head.appendChild(st); })()` };
const CONSENT_CONSULT = [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 800 }];

// 画面の定義: url（お試しモードのシナリオ）と、そこに至る操作。
const SCREENS = [
  { name: 'home', url: '/' },
  { name: 'home-new-user', url: '/?demo=new', steps: [{ css: 'button[aria-label="閉じる"]' }] },
  { name: 'library', url: '/', steps: [{ css: 'button:has-text("すべての本")' }] },
  { name: 'library-list', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label^="並び替え・絞り込み・表示"]' }, { css: 'button:has-text("リストで表示")' }] },
  { name: 'library-menu', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label^="並び替え・絞り込み・表示"]' }] },
  { name: 'home-write-memo', url: '/', steps: [{ css: 'button[aria-label$="にメモを書く"]' }] },
  { name: 'onboarding', url: '/?demo=new' },
  { name: 'quickstart', url: '/?demo=new', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }] },
  { name: 'book-detail', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }] },
  { name: 'book-detail-memos', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollTo: 'h2:has-text("メモ")' }] },
  { name: 'book-memo-sheet', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }] },
  { name: 'book-detail-bottom', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollBottom: true }] },
  { name: 'book-memo-sheet-more', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }] },
  // 📷 無料プランの写真から書き起こし（月 10 回・2026-10-02）: あと 8 回／0 回（11月1日に戻ります）／0 回で押すと有料プランの画面／全画面のメモ
  { name: 'free-ocr', url: '/?demo=free', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { wait: 600 }] },
  // 書き起こしたあと（本文に入り、「今月の残り 7 回」に減る）
  { name: 'free-ocr-done', url: '/?demo=free', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { wait: 600 }, { upload: ['input[data-ocr-input]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 3000 }] },
  // 読み取り中（&ai=slow）・失敗（&ai=fail）。どちらもボタンの下 8 に写真と案内（残りの回数の行は出さない）
  { name: 'free-ocr-reading', url: '/?demo=free&ai=slow', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { wait: 600 }, { upload: ['input[data-ocr-input]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 1500 }] },
  { name: 'free-ocr-error', url: '/?demo=free&ai=fail', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { wait: 600 }, { upload: ['input[data-ocr-input]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2000 }] },
  { name: 'free-ocr-zero', url: '/?demo=free&ocr=used', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { wait: 600 }] },
  { name: 'free-ocr-paywall', url: '/?demo=free&ocr=used&native=1', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { wait: 600 }, { css: 'button:has-text("写真から書き起こす")' }, { wait: 1200 }] },
  { name: 'free-ocr-editor', url: '/?demo=free', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { css: 'button:has-text("全画面で書く")' }, { wait: 800 }] },
  // 全画面のメモで書き起こしたあと（「凝縮」が並ぶ・残りの回数は書き起こすボタンのすぐ下）
  { name: 'free-ocr-editor-done', url: '/?demo=free', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { css: 'button:has-text("全画面で書く")' }, { wait: 800 }, { upload: ['input[data-ocr-input]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 3000 }] },
  // 🏷 合いそうなタグ（2026-10-02）: メモを書いて保存したあと、一覧の上の「いま書いたメモに合いそうなタグ」（端末の中だけで決める）。
  { name: 'book-memo-saved', url: '/', steps: MEMO_SAVED },
  { name: 'book-memo-saved-tag-on', url: '/', steps: [...MEMO_SAVED, { css: 'section[aria-labelledby="tag-suggest-title"] button[aria-pressed="false"] >> nth=0' }, { wait: 800 }] },
  // 保存中（すぐ付いた形＋小さな回る印）・保存に失敗（元に戻して知らせ）・長いタグ（50 字・… に切る）
  { name: 'book-memo-saved-tag-saving', url: '/?save=slow-memo-update', steps: [...MEMO_SAVED, { css: 'section[aria-labelledby="tag-suggest-title"] button[aria-pressed="false"] >> nth=0' }, { wait: 400 }] },
  { name: 'book-memo-saved-tag-failed', url: '/?writefail=book_memos:update', steps: [...MEMO_SAVED, { css: 'section[aria-labelledby="tag-suggest-title"] button[aria-pressed="false"] >> nth=0' }, { wait: 900 }] },
  { name: 'book-memo-saved-long-tag', url: '/?longtag=1', steps: MEMO_SAVED },
  // ── 2026-10-04 監査（A: ホーム・本の追加・本の詳細・メモ・写真で共有）で確かめた状態
  // 読了にした直後: 先頭へ戻さず「読了を写真で共有」を知らせとメモを書くの上まで送る・知らせは「読了にしました。」の 1 行
  { name: 'book-detail-just-done', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("数値化の鬼")' }, { scrollBottom: true }, { css: 'button:has-text("読了にする")' }, { wait: 1200 }] },
  // 状態を進めたときの知らせ（「積読に積みました。」が元に戻すの横で 1 行）
  { name: 'book-detail-stacked-toast', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("チーズはどこへ消えた")' }, { css: 'button:has-text("積読に積む")' }, { wait: 600 }] },
  // 表紙を削除（元に戻すつき）
  { name: 'book-cover-deleted', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: '[role=menuitem]:has-text("表紙を削除")' }, { wait: 600 }] },
  // 全画面のメモの編集（タグは本の編集と同じ選ぶチップ・つながるメモ）
  { name: 'book-memo-editor-tags', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: '[data-memo-id] p >> nth=1' }, { wait: 800 }, { scrollTo: 'label:has-text("タグ")' }] },
  // メモの「ページ順 ▾」メニュー（✓ と空きだけ）
  { name: 'book-memo-sort-menu', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollTo: 'h2:has-text("メモ")' }, { css: 'button[aria-haspopup="menu"]:has-text("ページ順")' }] },
  // すべての本の並び替え・絞り込みのシート（「状態」の見出し）
  { name: 'library-sort-sheet', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label^="並び替え・絞り込み・表示"]' }, { css: '[role=menuitem]:has-text("並び替え")' }] },
  { name: 'library-filter-sheet', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label^="並び替え・絞り込み・表示"]' }, { css: '[role=menuitem]:has-text("絞り込み")' }] },
  // 本を追加の検索から選んだあとのフォーム（表紙の下は「外す」）
  { name: 'add-book-form-cover', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', '考え方'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }, { css: '[role=dialog] li button >> nth=0' }, { wait: 800 }] },
  // 文字サイズを大きくしたとき（30px＝約 1.8 倍）: ホームの行はボタンを書名の下へ・本の詳細の上の行は 1 行・書き起こすは文節で折り返す
  { name: 'home-xl-text', url: '/', steps: [{ eval: () => { document.documentElement.style.fontSize = '30px'; } }, { wait: 500 }] },
  { name: 'book-detail-xl-text', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { eval: () => { document.documentElement.style.fontSize = '30px'; } }, { wait: 500 }] },
  // 本の詳細の読み込み中（メモ一覧だけ遅い・&load=bookmemos）／手動で入れた本がもう本棚にあるときの確認（2026-10-04 ui-critic）
  { name: 'book-detail-loading', url: '/?load=bookmemos', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("数値化の鬼")', settle: 500 }] },
  { name: 'add-book-duplicate-confirm', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { css: 'button:has-text("手動で入力する")' }, { fill: ['input[aria-label="書名（必須）"]', '1兆ドルコーチ'] }, { fill: ['input[aria-label="著者（任意）"]', 'エリック・シュミット'] }, { css: 'button:text-is("保存")' }, { wait: 600 }] },
  // 積読の「読書を開始する」（得たいことあり・シートなし）: 無料プランはそのまま読み始める／7 日間無料は「作っておきますか？」（2026-10-04）
  { name: 'book-start-reading-free', url: '/?demo=free&purpose=1', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:has-text("読書を開始する")' }, { wait: 600 }] },
  { name: 'book-start-reading-trial', url: '/?demo=trial&purpose=1', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:has-text("読書を開始する")' }, { wait: 600 }] },
  // ページの無いメモを保存したら、一覧の最後に入ったそのメモまで送って光らせる（2026-10-04）
  { name: 'book-memo-saved-nopage', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { fill: ['textarea[aria-label="メモ本文"]', 'ページの無いメモ。一覧の最後に入る。'] }, { css: '[role=dialog] button:text-is("保存")', settle: 700 }] },
  // すべての本の表紙の一覧: 文字サイズを大きくしたら 2 列（23px＝約 1.35 倍・2026-10-04）
  { name: 'library-large-text', url: '/', steps: [{ eval: () => { document.documentElement.style.fontSize = '23px'; } }, { wait: 300 }, { css: 'button:has-text("すべての本")' }] },
  { name: 'book-memo-sheet-xl-text', url: '/', steps: [{ eval: () => { document.documentElement.style.fontSize = '30px'; } }, { wait: 300 }, { css: 'button[aria-label$="にメモを書く"]' }, { css: 'button:has-text("ページ・写真")' }] },
  { name: 'book-detail-done-bottom', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { scrollBottom: true }] },
  { name: 'book-store-sheet', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("この本を買う")' }] },
  { name: 'consult', url: '/', steps: [{ css: nav('相談') }] },
  {
    name: 'consult-answer', url: '/',
    steps: [
      { css: nav('相談') },
      { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] },
      { css: 'button[aria-label="送信"]' },
      { wait: 6000 },
    ],
  },
  { name: 'consult-answer-open', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { css: 'summary:has-text("根拠を見る")' }, { scrollTo: 'summary:has-text("根拠を見る")' }] },
  { name: 'consult-history', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }] },
  { name: 'consult-scope', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("相談相手：")' }] },
  { name: 'advisor', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }] },
  { name: 'consult-learning', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("学びを書く")' }] },
  { name: 'consult-knowledge', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("根拠にできる情報")' }] },
  { name: 'review', url: '/', steps: [{ css: nav('振り返り') }] },
  { name: 'review-action', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("行動")' }] },
  { name: 'review-action-bottom', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("行動")' }, { scrollBottom: true }] },
  { name: 'review-memo', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("ノート"), button[role=tab]:has-text("メモ")' }] },
  { name: 'review-record', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("記録")' }] },
  { name: 'settings', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }] },
  { name: 'auth', url: '/?demo=auth&auth=signin' },
  { name: 'landing', url: '/?demo=auth' },
  { name: 'add-book', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }] },
  // 有料プランの画面は起動時には出ない（フリーミアム）。設定の「プランを見る」と同じ合図で開く。
  { name: 'paywall', url: '/?demo=paywall', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-native', url: '/?demo=paywall&native=1', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-bottom', url: '/?demo=paywall&native=1', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }, { scrollBottom: true }] },
  // 🌱 創業メンバー価格（2026-10-02）: &founding=on＝ストアが年額に「1 年目 ¥9,800」を返し、かつ期間中（LP の env）。
  //   store＝ストアの初回価格だけ（期間外）・env＝期間中だけ（ストアに初回価格なし＝対象外の人）。月額は &trial= で 7 日間無料。
  { name: 'paywall-native-founding', url: '/?demo=paywall&native=1&founding=on&trial=7日間無料', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-native-founding-bottom', url: '/?demo=paywall&native=1&founding=on&trial=7日間無料', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }, { scrollBottom: true }] },
  { name: 'paywall-native-founding-monthly', url: '/?demo=paywall&native=1&founding=on&trial=7日間無料', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }, { css: '[role=radio]:has-text("月額プラン")' }] },
  { name: 'paywall-native-founding-store-only', url: '/?demo=paywall&native=1&founding=store&trial=7日間無料', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-native-founding-env-only', url: '/?demo=paywall&native=1&founding=env', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-founding', url: '/?demo=paywall&founding=on', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-grown-founding', url: '/?demo=freegrown&native=1&founding=on', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: 'grown' } }))" }] },
  { name: 'consult-trial-nudge-founding', url: '/?demo=freegrown&founding=on', steps: [{ css: nav('相談') }] },
  // 2026-10-02 ui-critic の追加: 価格の読み込み中・失敗（創業メンバー価格のとき）・大きな文字・使えない人の案内
  { name: 'paywall-native-founding-loading', url: '/?demo=paywall&native=1&founding=on&trial=7日間無料&price=loading', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-native-founding-fail', url: '/?demo=paywall&native=1&founding=on&trial=7日間無料&price=fail', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-native-founding-large-text', url: '/?demo=paywall&native=1&founding=on&trial=7日間無料', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }, { eval: () => { document.documentElement.style.fontSize = '23px'; } }, { wait: 500 }, { scrollBottom: true }] },
  { name: 'paywall-native-founding-xxl-text', url: '/?demo=paywall&native=1&founding=on&trial=7日間無料', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }, { eval: () => { document.documentElement.style.fontSize = '40px'; } }, { wait: 500 }] },
  { name: 'consult-trial-nudge-off', url: '/?demo=freegrown&trial=off', steps: [{ css: nav('相談') }] },
  { name: 'webgate', url: '/?demo=webgate' },
  // 2026-09-27 追加: 生成後・状態別・編集・取り込み
  { name: 'advisor-interview', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }] },
  { name: 'advisor-reco', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }] },
  // 書名の欄に 2 冊を混ぜたカード（&ai=mixedrec・2026-10-04）: 1 冊ずつ確かめて、見つかった 1 冊のカードに
  { name: 'advisor-reco-mixed', url: '/?ai=mixedrec', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 9000 }, { scrollTo: 'p:has-text("プロフェッショナルマネジャー")' }] },
  { name: 'advisor-reco-mixed-large-text', url: '/?ai=mixedrec', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 9000 }, { eval: () => { document.documentElement.style.fontSize = '23px'; } }, { wait: 500 }, { scrollTo: 'p:has-text("プロフェッショナルマネジャー")' }] },
  // 2 冊を混ぜたカードを確かめている途中（&verify=slow）: カード 1 枚ぶんの骨組み
  { name: 'advisor-reco-mixed-verifying', url: '/?ai=mixedrec&verify=slow', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 4000 }, { scrollTo: 'p:has-text("プロフェッショナルマネジャー")' }] },
  // 出せるカードが 0 枚（&ai=allmixed）→ ErrorMessage「本を確かめられませんでした」
  { name: 'advisor-reco-allmixed', url: '/?ai=allmixed', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 9000 }, { scrollBottom: true }] },
  { name: 'advisor-reco-allmixed-xxl-text', url: '/?ai=allmixed', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 9000 }, { eval: () => { document.documentElement.style.fontSize = '40px'; } }, { wait: 500 }, { scrollBottom: true }] },
  // 確かめられなかった（&verify=down）→「もう一度」＋文字の「別の条件で探す」。上の &ai=allmixed は どれも実在しない →「別の条件で探す」が主
  { name: 'advisor-reco-allmixed-down', url: '/?ai=allmixed&verify=down', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 9000 }, { scrollBottom: true }] },
  { name: 'advisor-reco-allmixed-down-large-text', url: '/?ai=allmixed&verify=down', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 9000 }, { eval: () => { document.documentElement.style.fontSize = '23px'; } }, { wait: 500 }, { scrollBottom: true }] },
  { name: 'advisor-reco-mixed-down', url: '/?ai=mixedrec&verify=down', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 9000 }, { scrollTo: 'p:has-text("プロフェッショナルマネジャー")' }] },
  { name: 'advisor-reco-bottom', url: '/', steps:[{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }, { scrollBottom: true }] },
  { name: 'book-detail-want', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("チーズはどこへ消えた")' }] },
  { name: 'book-detail-before', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }] },
  // 📖 この本について（2026-10-02）: 紹介文の続き・目次を開く／見つからない本（&info=none）／読み込み中（&info=slow）／読書中の畳む見出し
  { name: 'book-detail-want-about-open', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("チーズはどこへ消えた")' }, { css: 'button:has-text("続きを読む")' }] },
  // 積読で課題・仮説があるときは畳む見出し（主ボタン「読書を開始する」を最初の画面に残す）。開いたところ
  { name: 'book-detail-before-about-open', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'summary:has-text("この本について")' }, { scrollTo: 'summary:has-text("この本について")' }] },
  { name: 'book-detail-want-noinfo', url: '/?info=none', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("チーズはどこへ消えた")' }] },
  { name: 'book-detail-before-noinfo', url: '/?info=none', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }] },
  // まだ何も書いていない積読（?demo=planempty）: この本についてはカードの形
  { name: 'book-detail-before-card', url: '/?demo=planempty', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }] },
  { name: 'book-detail-before-card-toc-open', url: '/?demo=planempty', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'summary:has-text("目次")' }, { scrollTo: 'summary:has-text("目次")' }] },
  // 畳む見出しの読み込み中（積読で課題・仮説がある本／読書中）
  { name: 'book-detail-before-fold-loading', url: '/?info=slow', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")', settle: 300 }] },
  { name: 'book-detail-reading-fold-loading', url: '/?info=slow', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")', settle: 200 }, { scrollBottom: true, settle: 300 }] },
  { name: 'book-detail-want-about-loading', url: '/?info=slow', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("チーズはどこへ消えた")', settle: 300 }] },
  { name: 'book-detail-reading-about', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollBottom: true }, { css: 'summary:has-text("この本について")' }, { scrollTo: 'summary:has-text("この本について")' }] },
  // 読書中で紹介も目次も無い本（畳む見出しを出さない）／目次だけの本（楽天の【目次】）／紹介と目次の取得元が違う本
  { name: 'book-detail-reading-noinfo', url: '/?info=none', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollBottom: true }] },
  { name: 'book-detail-want-toc-only', url: '/?info=toconly', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("チーズはどこへ消えた")' }, { css: 'summary:has-text("目次")' }] },
  { name: 'book-detail-want-mixed-source', url: '/?info=mixed', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("チーズはどこへ消えた")' }, { css: 'summary:has-text("目次")' }, { scrollTo: 'summary:has-text("目次")' }] },
  // MarkdownSections の flat（畳みの中）の区画の間 24 の確認用: 以前の AI 解析を開く
  { name: 'book-detail-before-ai-analysis', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'summary:has-text("以前の AI 解析を見る")' }, { scrollTo: 'summary:has-text("以前の AI 解析を見る")' }] },
  // 読書計画シート（積読でその場で作る）の先頭「この本の概要」と、目次の項目を引いた「重点的に読む箇所」
  { name: 'book-plan-sheet-overview', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:text-is("読書計画シートを作る")' }, { waitFor: '#plan-sheet-fold[open]', timeout: 30000 }, { wait: 3000 }, { scrollTo: '#plan-sheet-fold' }] },
  { name: 'book-plan-sheet-overview-large-text', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:text-is("読書計画シートを作る")' }, { waitFor: '#plan-sheet-fold[open]', timeout: 30000 }, { wait: 3000 }, { eval: () => { document.documentElement.style.fontSize = '23px'; } }, { wait: 500 }, { scrollTo: '#plan-sheet-fold' }] },
  // 📚 崩れた関連書籍（&related=messy・2026-10-04）: 2 冊を混ぜた行・『』の無い行・実在しない本を、書誌で確かめて 1 冊の『』の行に直すか消す。
  //   作ったばかりのシート（LIFE SHIFT）と、保存済みのシートを開いたとき（1兆ドルコーチ）。
  { name: 'book-plan-sheet-related-messy', url: '/?related=messy', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:text-is("読書計画シートを作る")' }, { waitFor: '#plan-sheet-fold[open]', timeout: 30000 }, { wait: 4000 }, { scrollTo: 'h3:has-text("関連書籍")' }] },
  // 2026-10-04 ui-critic の追加: 関連書籍がどれも出せない・確かめている途中・大きな文字
  { name: 'book-plan-sheet-related-allbad', url: '/?related=allbad', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:text-is("読書計画シートを作る")' }, { waitFor: '#plan-sheet-fold[open]', timeout: 30000 }, { wait: 4000 }, { scrollTo: 'h3:has-text("期待される変化")' }] },
  { name: 'book-plan-sheet-related-pending', url: '/?related=messy&verify=slow', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:text-is("読書計画シートを作る")' }, { waitFor: 'h3:has-text("関連書籍")', timeout: 30000 }, { wait: 300 }, { scrollTo: 'h3:has-text("関連書籍")' }] },
  { name: 'book-detail-plan-related-messy-large-text', url: '/?related=messy', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { wait: 2500 }, { scrollBottom: true }, { css: 'summary:has-text("読書計画")' }, { eval: () => { document.documentElement.style.fontSize = '23px'; } }, { wait: 500 }, { scrollTo: 'h3:has-text("関連書籍")' }] },
  { name: 'book-detail-plan-related-messy-xxl-text', url: '/?related=messy', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { wait: 2500 }, { scrollBottom: true }, { css: 'summary:has-text("読書計画")' }, { eval: () => { document.documentElement.style.fontSize = '40px'; } }, { wait: 500 }, { scrollTo: 'h3:has-text("関連書籍")' }] },
  // 文字最大でいちばん下まで送ったとき、最後のボタンが右下の「メモを書く」に隠れない（2026-10-04）
  { name: 'book-detail-plan-related-messy-xxl-text-bottom', url: '/?related=messy', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { wait: 2500 }, { scrollBottom: true }, { css: 'summary:has-text("読書計画")' }, { eval: () => { document.documentElement.style.fontSize = '40px'; } }, { wait: 500 }, { scrollBottom: true }] },
  { name: 'book-detail-plan-related-messy', url: '/?related=messy', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { wait: 2500 }, { scrollBottom: true }, { css: 'summary:has-text("読書計画")' }, { scrollTo: 'h3:has-text("関連書籍")' }] },
  // 以前の AI 解析（書誌で確かめていない）に本を挙げる節があっても出さない（2026-10-04）
  // 以前の AI 解析が関連書籍の節だけ → 畳みごと出さない（いちばん下まで送って確かめる）
  { name: 'book-detail-old-analysis-only-related', url: '/?related=legacyonly', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { scrollBottom: true }] },
  { name: 'book-detail-old-analysis-related', url: '/?related=messy', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { scrollBottom: true }, { css: 'summary:has-text("以前の AI 解析")' }, { scrollTo: 'summary:has-text("以前の AI 解析")' }] },
  // 目次に無い章（&ai=fakechapter・2026-10-04）: 書き終えたところで重点的に読む箇所から消す（目次あり／目次なし）
  { name: 'book-plan-sheet-fakechapter', url: '/?ai=fakechapter', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:text-is("読書計画シートを作る")' }, { waitFor: '#plan-sheet-fold[open]', timeout: 30000 }, { wait: 3000 }, { scrollTo: 'h3:has-text("重点的に読む箇所")' }] },
  // 挙げた章がどれも目次に無い → 「目次と合う章が見つからなかったため、…」の注記 1 行
  { name: 'book-plan-sheet-fakechapter-only', url: '/?ai=fakechapteronly', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:text-is("読書計画シートを作る")' }, { waitFor: '#plan-sheet-fold[open]', timeout: 30000 }, { wait: 3000 }, { scrollTo: 'h3:has-text("重点的に読む箇所")' }] },
  { name: 'book-plan-sheet-fakechapter-noinfo', url: '/?ai=fakechapter&info=none', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:text-is("読書計画シートを作る")' }, { waitFor: '#plan-sheet-fold[open]', timeout: 30000 }, { wait: 3000 }, { scrollTo: 'h3:has-text("重点的に読む箇所")' }] },
  { name: 'book-plan-sheet-noinfo', url: '/?info=none', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button:text-is("読書計画シートを作る")' }, { waitFor: '#plan-sheet-fold[open]', timeout: 30000 }, { wait: 3000 }, { scrollTo: '#plan-sheet-fold' }] },
  { name: 'book-edit-reading', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }] },
  { name: 'book-edit-before', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }] },
  { name: 'import-sheet', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ほかのアプリから取り込む")' }] },

  // ── 状態（空・読み込み中・エラー・上限など）。お試しモードの切り替え:
  //    ?demo=new / nomemo / overdue / limit / free / freeused / freenew / freegrown / trial / paywall、&ai=slow|fail|cut、&load=slow、&save=slow、&db=fail、&price=loading|fail
  { name: 'home-nomemo', url: '/?demo=nomemo' },
  // いま読んでいる本が 0 冊（「＋ 本を追加」の 1 行だけ・2026-10-01）
  { name: 'home-noreading', url: '/?demo=noreading' },
  { name: 'home-noreading-done', url: '/?demo=noreadingdone' },
  { name: 'home-noreading-none', url: '/?demo=noreadingnone' },
  { name: 'home-loading', url: '/?load=slow' },
  { name: 'library-noresult', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', 'zzzz'] }, { wait: 800 }] },
  // メモの言葉で本を探す（「こんなことを書いたの、なんの本だったかな？」・2026-09-30）
  { name: 'library-memo-search', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', '断る'] }, { wait: 800 }] },
  { name: 'library-memo-search-multi', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', 'チーム'] }, { wait: 800 }] },
  // 一節を押す → その本の詳細で、そのメモまで送って示す
  { name: 'library-memo-search-open', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', '断る'] }, { wait: 800 }, { css: 'button:has-text("断る余地")', settle: 500 }] },
  // メモを読んでいる間（書名で見つかった本を先に・下に「メモの中を探しています…」）／読めなかったとき
  { name: 'library-memo-search-loading', url: '/?load=memosearch', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', 'チーズ'] }, { wait: 800 }] },
  { name: 'library-memo-search-loading-empty', url: '/?load=memosearch', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', '断る'] }, { wait: 800 }] },
  { name: 'library-memo-search-error', url: '/?dbfail=memosearch', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', 'イシュー'] }, { wait: 1200 }] },
  // 書名で見つかった本とメモで見つかった本の両方（見出し 2 つ）
  { name: 'library-memo-search-both', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', '人'] }, { wait: 800 }] },
  // 無料プランで「相談で探す」（下書きだけ・送らない）
  { name: 'library-consult-search-free', url: '/?demo=free', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', '雑談から始める'] }, { wait: 800 }, { css: 'button:has-text("相談で探す")' }, { wait: 1200 }] },
  // 本を探す問いの答え（問い返さず・行動も出さない）
  { name: 'library-consult-search-answer', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', '雑談から始める'] }, { wait: 800 }, { css: 'button:has-text("相談で探す")' }, { wait: 1200 }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }] },
  // 見つからない →「相談で探す」: 相談の入力欄に問いが入る（送らない）
  { name: 'library-consult-search', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', '雑談から始める'] }, { wait: 800 }, { css: 'button:has-text("相談で探す")' }, { wait: 1200 }] },
  { name: 'add-book-notfound', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', 'zzzzqqqqxxxx'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'onboarding-last', url: '/?demo=new', steps: [{ role: '次へ' }] },
  { name: 'quickstart-results', url: '/?demo=new', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { fill: ['input[aria-label="書名や著者名で探す"]', 'ファクト'] }, { css: '[role=dialog] button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'quickstart-noresult', url: '/?demo=new', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { fill: ['input[aria-label="書名や著者名で探す"]', 'ぞぞぞ'] }, { css: '[role=dialog] button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'auth-signup', url: '/?demo=auth&auth=signup' },
  // ログインが通信エラーになったとき（&authfail=1・ErrorMessage の面で出る）
  { name: 'auth-error', url: '/?demo=auth&auth=signin&authfail=1', steps: [{ fill: ['input[aria-label="メールアドレス"]', 'demo@example.com'] }, { fill: ['input[aria-label="パスワード"]', 'password1'] }, { css: 'button[type=submit]' }, { wait: 800 }] },
  { name: 'landing-bottom', url: '/?demo=auth', steps: [{ scrollBottom: true }, { wait: 800 }] },
  { name: 'landing-pricing', url: '/?demo=auth', steps: [{ scrollTo: '#lp-pricing' }, { wait: 800 }] },
  // LP の節（2026-10-02 作り直し）: 流れ・比較・シェア・学習に使わない・FAQ。&founding=on で創業メンバー価格の節と印。
  { name: 'landing-flow', url: '/?demo=auth', steps: [{ scrollTo: '#lp-flow' }, { wait: 1500 }] },
  { name: 'landing-flow-last', url: '/?demo=auth&motion=static', steps: [{ scrollTo: '#lp-flow' }, { css: '.lp-flow-steps button >> nth=3' }, { wait: 800 }] },
  { name: 'landing-compare', url: '/?demo=auth', steps: [{ scrollTo: '#lp-compare' }, { wait: 800 }] },
  { name: 'landing-share', url: '/?demo=auth', steps: [{ scrollTo: '#lp-share' }, { wait: 1800 }] },
  { name: 'landing-privacy', url: '/?demo=auth', steps: [{ scrollTo: '#lp-privacy' }, { wait: 800 }] },
  { name: 'landing-faq', url: '/?demo=auth', steps: [{ scrollTo: '#lp-faq' }, { wait: 800 }] },
  { name: 'landing-founding', url: '/?demo=auth&founding=on' },
  // 動きを減らす設定（自動で進まない・右端に「次へ」）・創業メンバー価格の FAQ を開いたところ
  { name: 'landing-flow-still', url: '/?demo=auth&motion=static', steps: [{ scrollTo: '#lp-flow' }, { wait: 800 }] },
  { name: 'landing-faq-founding', url: '/?demo=auth&founding=on', steps: [{ scrollTo: '#lp-faq' }, { css: 'summary:has-text("創業メンバー価格とは")' }, { scrollTo: 'summary:has-text("創業メンバー価格とは")' }, { wait: 600 }] },
  // 相談の流れを「止める」で止めたところ／スマホの 3D のヒーロー（明暗）／LP を最大の文字で（2026-10-02 ui-critic）
  { name: 'landing-flow-paused', url: '/?demo=auth', steps: [{ scrollTo: '#lp-flow' }, { wait: 1800 }, { css: '.lp-flow-controls button:has-text("止める")' }, { wait: 600 }] },
  { name: 'landing-hero-3d', url: '/?demo=auth&hero=3d', steps: [{ wait: 5000 }] },
  { name: 'landing-xxl-text', url: '/?demo=auth', steps: [{ eval: () => { document.documentElement.style.fontSize = '40px'; } }, { wait: 800 }] },
  // PC の 1280 幅: ヒーローのボタンが見えている間はヘッダーのボタンを隠し、スクロールしてヒーローのボタンが隠れたら出す
  // （App Store の URL を入れたサーバーで撮るとボタンが押せる形）
  { name: 'landing-desktop', url: '/?demo=auth&founding=on', viewport: { width: 1280, height: 800 }, steps: [{ wait: 800 }] },
  { name: 'landing-desktop-scrolled', url: '/?demo=auth&founding=on', viewport: { width: 1280, height: 800 }, steps: [{ scrollTo: '#lp-flow' }, { wait: 800 }] },
  // 料金のボタンが見えている間は、ヘッダーのボタンをまた隠す（主ボタンを 2 つ並べない）
  { name: 'landing-desktop-pricing', url: '/?demo=auth&founding=on', viewport: { width: 1280, height: 800 }, steps: [{ scrollTo: '#lp-pricing' }, { wait: 800 }] },
  { name: 'landing-xxl-pricing', url: '/?demo=auth&founding=on', steps: [{ eval: () => { document.documentElement.style.fontSize = '40px'; } }, { wait: 500 }, { scrollTo: '#lp-pricing' }, { wait: 800 }] },
  // App Store の URL を入れたとき（VITE_APP_STORE_URL を入れたお試しモードのサーバーで撮る＝ボタンが「無料プランで始める」の押せる形）
  { name: 'landing-store', url: '/?demo=auth&founding=on' },
  { name: 'landing-store-pricing', url: '/?demo=auth&founding=on', steps: [{ scrollTo: '#lp-pricing' }, { wait: 800 }] },
  { name: 'landing-offer', url: '/?demo=auth&founding=on', steps: [{ scrollTo: '#lp-offer' }, { wait: 800 }] },
  { name: 'landing-pricing-founding', url: '/?demo=auth&founding=on', steps: [{ scrollTo: '#lp-pricing' }, { wait: 800 }] },
  { name: 'paywall-price-loading', url: '/?demo=paywall&native=1&price=loading', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-price-fail', url: '/?demo=paywall&native=1&price=fail', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-free-used', url: '/?demo=freeused&native=1', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: 'free_used' } }))" }] },
  { name: 'book-detail-plan-open', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollBottom: true }, { css: 'summary:has-text("読書計画")' }, { scrollBottom: true }] },
  { name: 'book-detail-summary-open', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'summary:has-text("この本のまとめ")' }, { scrollTo: 'summary:has-text("この本のまとめ")' }] },
  { name: 'book-detail-nomemo', url: '/?demo=nomemo', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }] },
  { name: 'book-memo-sheet-typed', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { fill: ['textarea[aria-label="メモ本文"]', '1on1 では最初に相手の近況を聞く。仕事の話はそのあと。人として関心を持っていると伝わると、相手は本音を話しやすくなる。'] }] },
  { name: 'book-edit-done', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }] },
  // 本の編集: 変更して戻る（破棄の確認）／いちばん下（固定の保存）／積読の空・読書計画シートの作成中
  { name: 'book-edit-reading-discard', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }, { fill: ['input[type=date]', '2026-01-05'] }, { css: '.detail-enter button' }] },
  { name: 'book-edit-reading-bottom', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }, { scrollBottom: true }] },
  { name: 'book-edit-before-empty', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }, { fill: ['textarea[aria-label="現在の課題"]', ''] }, { fill: ['textarea[aria-label="仮説"]', ''] }, { scrollTo: 'textarea[aria-label="この本から得たいこと（必須）"]' }] },
  { name: 'book-edit-before-generating', url: '/?ai=slow', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }, { fill: ['textarea[aria-label="この本から得たいこと（必須）"]', '40代からの働き方を考えたい'] }, { css: 'button:has-text("読書計画シートを作")' }, { wait: 1200 }] },
  { name: 'book-edit-before-bottom', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }, { scrollBottom: true }] },
  { name: 'book-edit-done-discard', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }, { fill: ['input[type=date]', '2026-01-05'] }, { css: '.detail-enter button' }] },
  { name: 'book-edit-done-bottom', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }, { scrollBottom: true }] },
  { name: 'consult-nomemo', url: '/?demo=nomemo', steps: [{ css: nav('相談') }] },
  { name: 'consult-streaming', url: '/?ai=slow', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 1500 }] },
  { name: 'consult-error', url: '/?ai=fail', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 2500 }] },
  // 今月の 800 トークンを使い切った人（残りが 0 と分かっているので送信は押せない・「トークンを追加」）
  { name: 'consult-limit', url: '/?demo=limit', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }] },
  { name: 'consult-answer-bottom', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { scrollBottom: true }] },
  // 深掘りの会話（2026-09-30）: 答えのあと入力欄の上のチップ「もっと具体的に」で続けて聞いた答え。
  { name: 'consult-followup', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="続けて聞く"] button' }, { css: '[aria-label="続けて聞く"] button >> nth=0' }, { waitFor: '[aria-label="続けて聞く"] button:has-text("もっと具体的に")' }, { css: '[aria-label="続けて聞く"] button:has-text("もっと具体的に")' }, { waitFor: '[aria-label="続けて聞く"] button' }] },
  // 🎯 行動は会話で決める（2026-09-30）: 最初の答えは状況を 1 つ聞く（問いの箱＋返事のチップ）→ 返事 →「行動を決める」で行動。
  { name: 'consult-ask', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="続けて聞く"] button' }] },
  { name: 'consult-ask-bottom', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="続けて聞く"] button' }, { wait: 1500 }, { scrollBottom: true }] },
  { name: 'consult-reply', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="続けて聞く"] button' }, { css: '[aria-label="続けて聞く"] button >> nth=0' }, { waitFor: '[aria-label="続けて聞く"] button:has-text("行動を決める")' }] },
  { name: 'consult-decide', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="続けて聞く"] button' }, { css: '[aria-label="続けて聞く"] button >> nth=0' }, { waitFor: '[aria-label="続けて聞く"] button:has-text("行動を決める")' }, { css: '[aria-label="続けて聞く"] button:has-text("行動を決める")' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy]) button:has-text("行動に追加")' }] },
  // 無料プラン: 返事のあと（問いに答えている間は「別の角度で答えて」を出さない）のチップ＝「（約 10 トークン）」つき。
  { name: 'free-consult-reply', url: '/?demo=free', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="続けて聞く"] button' }, { css: '[aria-label="続けて聞く"] button >> nth=0' }, { waitFor: '[aria-label="続けて聞く"] button:has-text("行動を決める")' }] },
  // 本ごとにの「行動を決める」の回（共通点と違いのあとが一歩の箱）。
  { name: 'consult-perbook-decide', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="続けて聞く"] button' }, { css: '[aria-label="続けて聞く"] button:has-text("行動を決める")' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy]) button:has-text("行動に追加")' }, { wait: 800 }] },
  { name: 'consult-perbook-ask', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="続けて聞く"] button' }, { wait: 1500 }, { scrollBottom: true }] },
  // 相談相手のアイコン（2026-09-30）: 数冊の本から答えた答えの名前の行（「安宅和人 ほか 2 人」）を押すと、もとになった本の一覧。
  { name: 'consult-partner-group', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy]) button[aria-haspopup="dialog"]' }, { css: '[aria-label="相談への答え"] button[aria-haspopup="dialog"]' }] },
  // 著者の語り口（2026-09-30）: 1 冊に絞った相談の答え（名前の行「著者名（本の語り口で・AI）」と、はじめての一行の案内）。
  { name: 'consult-voice', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("相談相手：")' }, { css: '[role=dialog] button[aria-pressed]:has-text("イシューからはじめよ")' }, { css: '[role=dialog] button:has-text("この本に相談する")' }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy]) summary' }, { eval: () => { document.querySelector('.chat-scroll').scrollTop = 0; } }] },
  // 語り口の答えのいちばん下（カードの最後の一行「AI が本とあなたのメモから語り口をまねた答えです」）。
  { name: 'consult-voice-bottom', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("相談相手：")' }, { css: '[role=dialog] button[aria-pressed]:has-text("イシューからはじめよ")' }, { css: '[role=dialog] button:has-text("この本に相談する")' }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy]) summary' }, { scrollBottom: true }] },
  { name: 'consult-history-list', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }] },
  { name: 'consult-history-empty', url: '/?demo=nomemo', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }] },
  { name: 'consult-history-error', url: '/?db=fail', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }, { wait: 1200 }] },
  // 📚 答え方（まとめて / 本ごとに）
  { name: 'consult-mode-sheet', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }] },
  // 渡していない本・作ったページの参照（&ai=fakeref・2026-10-04）: 根拠を見る・本ごとのカードに出さない・ページを外す
  { name: 'consult-fakeref-open', url: '/?ai=fakeref', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { css: 'summary:has-text("根拠を見る")' }, { scrollTo: 'summary:has-text("根拠を見る")' }] },
  // 参照がどれも渡したメモに無い本・解釈も無い（&ai=fakeref-only）→「根拠を見る」ごと出さない（歩みの無い fewmemos で）
  { name: 'consult-fakeref-only', url: '/?demo=fewmemos&ai=fakeref-only', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { scrollBottom: true }] },
  { name: 'consult-fakeref-open-large-text', url: '/?ai=fakeref', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { css: 'summary:has-text("根拠を見る")' }, { eval: () => { document.documentElement.style.fontSize = '23px'; } }, { wait: 500 }, { scrollTo: 'summary:has-text("根拠を見る")' }] },
  { name: 'consult-perbook-streaming', url: '/?ai=fakeref', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { wait: 1800 }] },
  { name: 'consult-fakeref-open-books', url: '/?ai=fakeref', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { css: 'summary:has-text("根拠を見る")' }, { scrollTo: 'p:has-text("もとになった本")' }] },
  { name: 'consult-perbook-fakeref', url: '/?ai=fakeref', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { wait: 7000 }, { scrollTo: 'h4:has-text("本の語り口で") >> nth=2' }] },
  { name: 'consult-perbook', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }] },
  { name: 'consult-perbook-bottom', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { scrollBottom: true }] },
  { name: 'consult-scope-multi', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("相談相手：")' }, { css: '[role=dialog] button[aria-pressed]:has-text("イシューからはじめよ")' }, { css: '[role=dialog] button[aria-pressed]:has-text("1兆ドルコーチ")' }] },
  { name: 'consult-learning-typed', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("学びを書く")' }, { fill: ['#learning-text', '人に任せるときは、終わった状態を先に言葉にする'] }, { css: 'button[aria-controls="learning-more"]' }] },
  { name: 'consult-knowledge-nohit', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("根拠にできる情報")' }, { fill: ['input[aria-label="根拠にできる情報を検索"]', 'zzzz'] }] },
  { name: 'consult-knowledge-empty', url: '/?demo=new', steps: [{ css: 'button[aria-label="閉じる"]' }, { css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("根拠にできる情報")' }] },
  { name: 'review-action-empty', url: '/?demo=nomemo', steps: [{ css: nav('振り返り') }] },
  { name: 'review-action-overdue', url: '/?demo=overdue', steps: [{ css: nav('振り返り') }] },
  { name: 'review-action-justdone', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=checkbox][aria-checked=false]' }] },
  { name: 'review-action-done-open', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button:has-text("完了した行動（")' }, { scrollBottom: true }] },
  { name: 'review-memo-empty', url: '/?demo=nomemo', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }] },
  { name: 'review-memo-noresult', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { fill: ['input[placeholder="メモを検索"]', 'zzzz'] }] },
  // 思い出しカードを今日の分まで答え終えた人（「今日の思い出しカードは、ここまでです」・2026-10-01）
  { name: 'review-memo-recall-done', url: '/?demo=recalldone', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }] },
  // 「ここまでです」の下の「別のメモを見る」（答えのボタンは出さない）。
  { name: 'review-memo-recall-extra', url: '/?demo=recalldone', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { css: 'section button:text-is("別のメモを見る")' }] },
  // 最後の 1 枚に「覚えた」: 知らせは「覚えました」だけ・次に出る日はカードの中だけ。
  { name: 'review-memo-recall-last', url: '/?demo=recalllast', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { css: 'button:has-text("覚えた")', settle: 1200 }] },
  // 行動の編集（期限の日付の欄が画面の幅に収まるか・2026-10-01）
  { name: 'action-edit', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[aria-label$="」の操作"]' }, { css: 'button:has-text("編集")' }, { wait: 400 }] },
  // 期限を見直す（期限を過ぎた行動を 1 つずつ・やめるのは右上の ×）
  { name: 'action-review-deadline', url: '/?demo=overdue', steps: [{ css: nav('振り返り') }, { css: 'button:has-text("期限を見直す")' }, { wait: 400 }] },
  { name: 'review-memo-menu', url: '/',steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { css: 'button[aria-label="このメモの操作"]' }] },
  { name: 'review-record-empty', url: '/?demo=nomemo', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("記録")' }] },
  { name: 'settings-bottom', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollBottom: true }] },
  { name: 'advisor-loading', url: '/?ai=slow', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 800 }] },
  { name: 'advisor-error', url: '/?ai=fail', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }] },
  { name: 'advisor-limit', url: '/?demo=limit', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }] },
  { name: 'advisor-added', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }, { css: 'button:has-text("読みたいに追加")' }, { waitFor: 'button:has-text("追加済み・開く")' }, { wait: 1500 }] },
  // トークンが 1 回分に足りない人: 「まとめる」は押せない形で、上限の案内カード＋「トークンを追加」が先に出る（テーマを選ぶだけ）
  // ── 状態（3 回目の採点で追加）
  { name: 'home-error', url: '/?dbfail=books' },
  { name: 'home-write-memo-discard', url: '/', steps: [{ css: 'button[aria-label$="にメモを書く"]' }, { fill: ['textarea[aria-label="メモ本文"]', '書きかけのメモ'] }, { css: 'button:has-text("キャンセル")' }] },
  { name: 'library-loading', url: '/?load=slow&shelf=library' },
  { name: 'library-error', url: '/?dbfail=books&shelf=library' },
  { name: 'library-empty', url: '/?demo=new&shelf=library', steps: [{ css: 'button[aria-label="閉じる"]' }] },
  { name: 'add-book-results', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', 'ファクト'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  // 本の検索「考え方」（2026-10-02 オーナー報告: 稲盛和夫『考え方』が出ない）。サーバーの検索（楽天の売上順）で
  //   書名がまるごと同じ本を 1 位に・表紙つき。add-book-kangaekata-old は直す前と同じ端末だけの検索（&search=old）。
  // ホームの「＋ 本を追加」から選んだあとのフォーム（状態の初めの選択は「読みたい」・2026-10-04）
  { name: 'add-book-form-home', url: '/', steps: [{ css: 'button:has-text("本を追加") >> nth=0' }, { fill: ['#add-book-query', '考え方'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }, { css: '[role=dialog] li button >> nth=0' }, { wait: 800 }] },
  { name: 'add-book-kangaekata', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', '考え方'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'add-book-kangaekata-author', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', '稲盛和夫 考え方'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  // 一覧を最後まで出したあとの「著者名も入れると絞り込めます」（一覧の下・2026-10-02 ui-critic）／読み込み中（&search=slow）
  { name: 'add-book-kangaekata-bottom', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', '考え方'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }, { scrollBottom: true }] },
  { name: 'add-book-loading', url: '/?search=slow', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', '考え方'] }, { css: 'button:has-text("検索")' }, { wait: 800 }] },
  { name: 'quickstart-kangaekata', url: '/?demo=new', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { fill: ['input[aria-label="書名や著者名で探す"]', '考え方'] }, { css: '[role=dialog] button:has-text("検索")' }, { wait: 1500 }] },
  // 検索が失敗したとき（&search=fail＝サーバーも端末の検索も失敗・本を追加の add-book-error と同じ）
  { name: 'quickstart-error', url: '/?demo=new&search=fail', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { fill: ['input[aria-label="書名や著者名で探す"]', '考え方'] }, { css: '[role=dialog] button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'quickstart-loading', url: '/?demo=new&search=slow', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { fill: ['input[aria-label="書名や著者名で探す"]', '考え方'] }, { css: '[role=dialog] button:has-text("検索")' }, { wait: 800 }] },
  { name: 'add-book-kangaekata-old', url: '/?search=old', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', '考え方'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'add-book-existing', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', '1兆ドルコーチ'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'add-book-error', url: '/?search=fail', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', 'ファクト'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'book-detail-longmemo', url: '/?demo=longmemo', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollTo: 'h2:has-text("メモ")' }] },
  { name: 'add-book-manual', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { css: 'button:has-text("手動で入力する")' }] },
  // 書名が空のまま「保存」: 書名の欄が --error の枠＋「書名を入れてください」（SPEC 1-2）
  { name: 'add-book-manual-empty', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { css: 'button:has-text("手動で入力する")' }, { fill: ['input[aria-label="書名（必須）"]', ''] }, { css: 'button:text-is("保存")' }] },
  { name: 'import-preview', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/booklog.csv'] }, { wait: 1200 }] },
  // 読書メーター（2026-09-29）: 書き出しツールの CSV（感想・読了日・本棚つき）
  { name: 'import-preview-bookmeter', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/bookmeter.csv'] }, { wait: 1200 }] },
  { name: 'import-done', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/booklog.csv'] }, { wait: 1200 }, { css: '[role=dialog] button:has-text("取り込む")' }, { wait: 3000 }] },
  { name: 'import-error', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/broken.txt'] }, { wait: 1200 }] },
  // 取り込み中（&save=slow で本の保存が終わらない）／同じ CSV を 2 回取り込んだとき
  { name: 'import-importing', url: '/?save=slow', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/booklog.csv'] }, { wait: 1200 }, { css: '[role=dialog] button:has-text("取り込む")' }, { wait: 800 }] },
  { name: 'import-already', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/booklog.csv'] }, { wait: 1200 }, { css: '[role=dialog] button:has-text("取り込む")' }, { wait: 3000 }, { css: '[role=dialog] button:has-text("完了")' }, { wait: 600 }, { css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/booklog.csv'] }, { wait: 1200 }, { css: '[role=dialog] button:has-text("取り込む")' }, { wait: 3000 }] },
  // 写真から書き起こす: 読み取り中（&ai=slow）／失敗（&ai=fail・シートの中に理由と「もう一度試す」）
  { name: 'book-memo-sheet-ocr-loading', url: '/?ai=slow', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { upload: ['[role=dialog] input[type=file][accept="image/*"]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 800 }] },
  { name: 'book-memo-sheet-ocr-error', url: '/?ai=fail', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { upload: ['[role=dialog] input[type=file][accept="image/*"]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2000 }] },
  { name: 'book-memo-sheet-discard', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { fill: ['textarea[aria-label="メモ本文"]', '書きかけのメモ'] }, { css: 'button:has-text("キャンセル")' }] },
  { name: 'review-memo-zero', url: '/?demo=new', steps: [{ css: 'button[aria-label="閉じる"]' }, { css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }] },
  { name: 'review-record-zero', url: '/?demo=new', steps: [{ css: 'button[aria-label="閉じる"]' }, { css: nav('振り返り') }, { css: 'button[role=tab]:has-text("記録")' }] },
  { name: 'settings-free', url: '/?demo=free', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'section[aria-label="プラン・お支払い"], h2:has-text("プラン・お支払い")' }] },
  { name: 'landing-sticky', url: '/?demo=auth', steps: [{ scrollTo: '#lp-flow' }, { waitFor: '.lp-sticky.is-visible' }, { wait: 400 }] },
  { name: 'paywall-trial', url: '/?demo=paywall&native=1&trial=7日間無料', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-free-covers', url: '/?demo=freeused&native=1', steps: [{ css: nav('相談') }, { css: 'button:has-text("プランを見る")' }] },
  { name: 'webgate-confirmed', url: '/?demo=webgate', steps: [{ eval: "sessionStorage.setItem('orime-email-confirmed', 'true')" }, { reload: true }] },
  // ── フリーミアム（2026-09-27）: 無料プラン・トークン・プランの機能
  { name: 'free-home', url: '/?demo=free' },
  { name: 'free-consult', url: '/?demo=free', steps: [{ css: nav('相談') }] },
  { name: 'free-consult-used', url: '/?demo=freeused', steps: [{ css: nav('相談') }] },
  { name: 'free-consult-answer', url: '/?demo=free', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }] },
  { name: 'free-feature-gate', url: '/?demo=free', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }] },
  { name: 'paywall-feature', url: '/?demo=free&native=1', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }] },
  { name: 'free-new-home', url: '/?demo=freenew', steps: [{ css: 'button[aria-label="閉じる"]' }] },
  { name: 'trial-consult', url: '/?demo=trial', steps: [{ css: nav('相談') }] },
  // ── 7 日間無料をすすめる「ちょうどいいとき」（2026-09-28・lib/trialNudge.js）
  //    無料プランでメモが 10 件たまったら、相談のいちばん上に 1 回だけ。&trial=off は無料期間を使えない人の文。
  { name: 'free-grown-nudge', url: '/?demo=freegrown', steps: [{ css: nav('相談') }] },
  { name: 'free-grown-nudge-plan', url: '/?demo=freegrown&trial=off', steps: [{ css: nav('相談') }] },
  { name: 'free-grown-dismissed', url: '/?demo=freegrown', steps: [{ css: nav('相談') }, { css: 'section[aria-labelledby="brain-nudge-title"] button[aria-label="閉じる"]' }] },
  { name: 'paywall-grown', url: '/?demo=freegrown&native=1&trial=7日間無料', steps: [{ css: nav('相談') }, { css: 'section[aria-labelledby="brain-nudge-title"] button:has-text("で試す")' }] },
  { name: 'settings-trial', url: '/?demo=trial', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'section[aria-label="プラン・お支払い"]' }] },
  // ── 追加トークン（買い足し）
  { name: 'consult-tokens-out', url: '/?demo=limit', steps: [{ css: nav('相談') }] },
  { name: 'tokens-sheet', url: '/?demo=limit', steps: [{ css: nav('相談') }, { css: 'button:has-text("トークンを追加")' }] },
  { name: 'consult-tokens-extra', url: '/?demo=tokens', steps: [{ css: nav('相談') }] },
  { name: 'settings-tokens', url: '/?demo=tokens', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'section[aria-label="プラン・お支払い"]' }] },
  // 長さの上限で途中まで（&ai=cut・本文は残し、下に 1 行の案内）
  // ── 一文をシェア（2026-09-27・SPEC §2-1）
  { name: 'share-line', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("画像で共有")' }, { wait: 1500 }] },
  { name: 'share-line-story', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("画像で共有")' }, { wait: 1200 }, { css: '[role=radio]:has-text("ストーリー")' }, { wait: 1500 }] },
  { name: 'share-line-night', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("画像で共有")' }, { wait: 1200 }, { css: '[role=radiogroup][aria-label="地"] [role=radio]:has-text("夜")' }, { wait: 1500 }] },
  { name: 'share-line-from-memo', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label$="のメニュー"]' }, { css: 'button:has-text("この一文をシェア")' }, { wait: 1500 }] },
  { name: 'share-line-photo', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("画像で共有")' }, { wait: 1200 }, { upload: ['[role=dialog] input[type=file]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 1500 }] },
  { name: 'share-line-sticker', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("画像で共有")' }, { wait: 1200 }, { css: '[role=radio][aria-label="透明（ステッカー用）"]' }, { wait: 1500 }] },
  { name: 'share-finished-nomemo', url: '/?demo=nomemo', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("画像で共有")' }, { wait: 1200 }] },
  // ── 相談・シェア・トークンの状態（4 回目の採点で追加）。&load=chat（過去の相談だけ遅い）/ &writefail=表 / &share=slow|fail / ?demo=trialout
  { name: 'consult-loading', url: '/?load=slow', steps: [{ css: nav('相談') }] },
  { name: 'consult-answer-added', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="続けて聞く"] button' }, { css: '[aria-label="続けて聞く"] button:has-text("行動を決める")' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy]) button:has-text("行動に追加")' }, { css: '[aria-label="相談への答え"] button:has-text("行動に追加")' }, { wait: 800 }, { eval: () => { const el = [...document.querySelectorAll('[role=status]')].find((n) => n.textContent.includes('行動に追加しました')); if (el) el.scrollIntoView({ block: 'center' }); } }, { wait: 300 }] },
  { name: 'consult-history-loading', url: '/?load=chat', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }] },
  // メモの無い本（選べない行）の見た目。既定のデータは全冊にメモがあるので nomemo で撮る。
  // 相談相手を 1 冊に絞った（答え方のチップの代わりに「すべてに戻す」）。
  { name: 'consult-scope-one', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("相談相手：")' }, { css: '[role=dialog] button[aria-pressed]:has-text("イシューからはじめよ")' }, { css: '[role=dialog] button:has-text("この本に相談する")' }] },
  { name: 'consult-scope-disabled', url: '/?demo=nomemo', steps: [{ css: nav('相談') }, { css: 'button:has-text("相談相手：")' }, { wait: 600 }] },
  { name: 'consult-learning-error', url: '/?writefail=book_memos', steps: [{ css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("学びを書く")' }, { fill: ['#learning-text', '人に任せるときは、終わった状態を先に言葉にする'] }, { css: 'button:has-text("保存")' }, { wait: 400 }] },
  { name: 'perbook-middle', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { scrollTo: 'section[aria-label="本ごとの視点"]' }] },
  // 書いている途中: &ai=stall で 1 冊目の視点の途中で止め、本ごとの視点の節が出るまで待つ（決め打ちの秒数に頼らない）。
  { name: 'perbook-streaming', url: '/?ai=stall', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { waitFor: 'section[aria-label="本ごとの視点"]' }, { wait: 300 }] },
  // ◆ の形が崩れた本ごとの答え → 【本ごとの視点】の節をそのまま段落で見せる（SPEC §3）。
  { name: 'perbook-raw', url: '/?ai=broken', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy])' }, { eval: () => { const sc = document.querySelector('.chat-scroll'); const el = document.querySelector('section[aria-label="本ごとの視点"]'); sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 120; } }] },
  // 崩れた本ごとの答えに渡していない本の段落（&ai=brokenfake・2026-10-04）: その段落を出さない
  { name: 'perbook-raw-fake', url: '/?ai=brokenfake', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy])' }, { eval: () => { const sc = document.querySelector('.chat-scroll'); const el = document.querySelector('section[aria-label="本ごとの視点"]'); sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 120; } }] },
  // 本ごとにを選んでも、メモのある本が 1 冊だけ → 「まとめて」で答える。
  { name: 'perbook-fallback', url: '/?demo=onebook', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }, { css: '[role=dialog] [role=radio]:has-text("本ごとに")' }, { fill: ['textarea[aria-label="相談したいこと"]', '営業の成果が落ちて焦っています。人の評価も気になるし、全部を抱えてしまう。どう考えればいい？'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy])' }, { wait: 400 }] },
  { name: 'trial-consult-out', url: '/?demo=trialout', steps: [{ css: nav('相談') }] },
  { name: 'tokens-sheet-loading', url: '/?demo=limit&native=1&price=loading', steps: [{ css: nav('相談') }, { css: 'button:has-text("トークンを追加")' }] },
  { name: 'tokens-sheet-error', url: '/?demo=limit&native=1&price=fail', steps: [{ css: nav('相談') }, { css: 'button:has-text("トークンを追加")' }] },
  // ── 相談と初日の体験（2026-09-29）: 書いている途中の形・続きの相談・初日のできあがり・通知の案内
  // 「まとめて」の書いている途中（&ai=stall で 3 割ほどで止める）＝結論 → 答えを書いています… → 根拠を見る（押せない）
  { name: 'consult-streaming-mid', url: '/?ai=stall', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"][aria-busy] p' }, { wait: 600 }] },
  { name: 'consult-history-continue', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }, { css: 'button:has-text("この相談の続きを聞く")' }] },
  // 引用がメモと一致しない答え（&ai=fabricate）→ 根拠を見るで「表示していません」
  { name: 'consult-quote-check', url: '/?ai=fabricate', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy]) summary' }, { css: 'summary:has-text("根拠を見る")' }, { scrollTo: 'summary:has-text("根拠を見る")' }] },
  { name: 'quickstart-done-input', url: '/?demo=new', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { css: '[role=dialog] button[aria-label^="『イシューからはじめよ』"]' }, { css: '[role=dialog] button:has-text("次へ")' }, { fill: ['[role=dialog] textarea', '答えを出す前に、本当に答えるべき問いかを確かめる'] }, { css: '[role=dialog] button:has-text("相談相手をつくる")' }, { wait: 2500 }] },
  { name: 'quickstart-picked', url: '/?demo=new', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { css: '[role=dialog] button[aria-label^="『イシューからはじめよ』"]' }] },
  // 思い出しの通知の案内（&notify=1 のときだけ「通知を使える人」として出る）: はじめて行動に追加した直後
  { name: 'notify-optin', url: '/?notify=1', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy]) summary' }, { css: '[aria-label="相談への答え"] button:has-text("行動に追加")' }, { wait: 800 }, { scrollBottom: true }] },
  // 関係するメモが無い答え（&ai=noinfo）→ 答えの下に「関係するメモが無かったので、トークンは使っていません」
  { name: 'consult-refund', url: '/?ai=noinfo', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '確定申告のやり方を教えて'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy]) summary, [aria-label="相談への答え"]:not([aria-busy]) p' }, { wait: 800 }] },
  { name: 'share-line-loading', url: '/?share=slow', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("画像で共有")' }, { wait: 800 }] },
  { name: 'share-line-error', url: '/?share=fail', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("画像で共有")' }, { wait: 1500 }] },
  // ── 使いやすさの手直し（2026-09-29・b2）: AI 選書の確認・振り返りの思い出しの取り消し・絞り込みのメニュー・テーマを選ぶ・無料プランの「プラン」・設定のヘルプ・フィードバック
  // 2 冊目（時間術大全）はお試しのカタログに版が 2 つあるので、同じ本かを確かめる画面が出る。
  { name: 'advisor-confirm', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }, { css: 'button:has-text("読みたいに追加") >> nth=1' }, { wait: 3000 }] },
  { name: 'review-recall-answered', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { css: 'button:has-text("まだ覚えていない")' }, { wait: 500 }] },
  { name: 'review-filter-menu', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { css: 'input[placeholder="メモを検索"]' }, { css: 'button[aria-label^="種類で絞り込む"]' }] },
  { name: 'free-advisor-tab', url: '/?demo=free', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }] },
  { name: 'settings-support', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'button:has-text("ヘルプ・使い方")' }] },
  { name: 'home-reading-add', url: '/', steps: [{ scrollTo: 'button:has-text("本を追加")' }] },
  // ── 写真で共有（2026-09-30・Strava のように写真の上に記録を重ねる）。カメラの入口は隠した input[data-share-camera] に
  //    見本の写真（scripts/fixtures/share-photo.jpg）を渡して撮る（ブラウザではカメラを開けないため）。
  { name: 'home-empty', url: '/?demo=new', steps: [{ css: 'button[aria-label="閉じる"]' }] },
  { name: 'share-photo-home', url: '/', steps: [{ css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2500 }] },
  { name: 'share-photo-story', url: '/', steps: [{ css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2000 }, { css: '[role=radio][aria-label="ストーリー（9:16）"]' }, { wait: 2000 }] },
  { name: 'share-photo-swap', url: '/', steps: [{ css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2000 }, { css: '[role=dialog] button:has-text("別の一文")' }, { wait: 2000 }] },
  { name: 'share-photo-quote', url: '/', steps: [{ css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2000 }, { css: '[role=radiogroup][aria-label="見せ方"] [role=radio]:has-text("一文")' }, { wait: 2000 }] },
  { name: 'share-photo-month', url: '/', steps: [{ css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2000 }, { css: '[role=radiogroup][aria-label="どの本を共有するか"] [role=radio]:has-text("今月")' }, { wait: 2500 }] },
  { name: 'share-photo-empty', url: '/?demo=new', steps: [{ css: 'button[aria-label="閉じる"]' }, { css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2500 }] },
  { name: 'share-photo-detail', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2500 }] },
  // カメラをやめた（input の cancel）→ 写真なしのシート（「写真を選ぶ」からアルバムへ）
  { name: 'share-camera-canceled', url: '/', steps: [{ css: 'h1' }, { eval: () => document.querySelector('input[data-share-camera]').dispatchEvent(new Event('cancel')) }, { wait: 2500 }] },
  // 振り返り・相談の上の行の「写真で共有」（ホームと同じ場所・2026-10-01）。振り返り › 記録から開くと「今月」を選んでおく。
  { name: 'share-photo-review-record', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("記録")' }, { css: 'button[aria-label="写真で共有"]' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2500 }] },
  { name: 'share-photo-review-memo', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { css: 'button[aria-label="写真で共有"]' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2500 }] },
  // 文字を大きくしたとき（iOS の「文字サイズ」最大＝本文 23 前後）でも、上の行（ロゴ・写真で共有・？・⚙️）が 1 行に収まるか。
  { name: 'review-large-text', url: '/', steps: [{ css: nav('振り返り') }, { eval: () => { document.documentElement.style.fontSize = '23px'; } }, { wait: 500 }] },
  // いちばん大きな文字（アクセシビリティの最大に近い 40）でも上の行が 1 行（「写真で共有」は --text-bar-max の 20 で止まる）。
  { name: 'review-xxl-text', url: '/', steps: [{ css: nav('振り返り') }, { eval: () => { document.documentElement.style.fontSize = '40px'; } }, { wait: 500 }] },
  // 振り返り › 行動 から押したとき（いま読んでいる本）
  { name: 'share-photo-review-action', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[aria-label="写真で共有"]' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2500 }] },
  { name: 'share-photo-consult', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="写真で共有"]' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2500 }] },
  { name: 'share-camera-canceled-consult', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="写真で共有"]' }, { eval: () => document.querySelector('input[data-share-camera]').dispatchEvent(new Event('cancel')) }, { wait: 2500 }] },
  // 写真のときの「写真以外 ▾」のメニュー（紙・夜・表紙の色・透明・写真を選び直す）
  { name: 'share-photo-bgmenu', url: '/', steps: [{ css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2000 }, { css: '[role=dialog] button:has-text("写真以外")' }, { wait: 600 }] },
  // 写真があるときに「写真以外 ▾」で紙を選んだ → ボタンは「背景：紙 ▾」
  { name: 'share-photo-paper', url: '/', steps: [{ css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2000 }, { css: '[role=dialog] button:has-text("写真以外")' }, { css: '[role=menuitem]:has-text("紙")' }, { wait: 1500 }] },
  { name: 'share-record-paper', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("画像で共有")' }, { wait: 2000 }] },
  { name: 'share-done-prompt', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollBottom: true }, { css: 'button:text-is("読了にする")' }, { wait: 7500 }, { scrollBottom: true }] },
  // ── 写真で共有の編集画面（2026-10-01・オーナー要望: 大きな画像で編集・URL を外す・表示する項目・言葉を入れる）。
  //    編集画面は [role=dialog][aria-label="画像を編集"]。写真の拡大・移動はトラックパッドと同じホイールの知らせで動かす
  //    （ctrl＋ホイール＝つまんで拡大・ホイール＝動かす）。言葉の形は「言葉の形」の radiogroup から選ぶ。
  { name: 'share-edit-open', url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT] },
  // ── AI に送る内容の同意（App Review 5.1.2(i)・2026-10-01）。&consent=none＝まだ同意していない人（お試しモードの既定は同意済み）。
  //    はじめて AI を使う操作のときに、送る内容と送り先のシートが出る（相談の送信・写真から書き起こす）。
  { name: 'ai-consent-consult', url: '/?consent=none', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 800 }] },
  { name: 'ai-consent-ocr', url: '/?consent=none', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { upload: ['[role=dialog] input[type=file][accept="image/*"]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 800 }] },
  // 🧭 Jev を入れたとき（?jev=1）の相談: 関係するメモを Jev の見本で選んで答える（画面は今までと同じ・材料の選び方だけが変わる）。
  { name: 'consult-answer-jev', url: '/?jev=1', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }] },
  // 同意のシートを、iPhone の下の安全域 34 をまねて撮る（Jev あり・なし）。プライバシーポリシーの行が決定ボタンの欄に隠れないこと。
  { name: 'ai-consent-consult-safe', url: '/?consent=none', steps: [...CONSENT_CONSULT, SAFE_BOTTOM, { wait: 300 }] },
  { name: 'ai-consent-consult-jev-safe', url: '/?consent=none&jev=1', steps: [...CONSENT_CONSULT, SAFE_BOTTOM, { wait: 300 }] },
  // 「同意して使う」を押したあと、保存を待っている間（&consent=slow＝保存を 8 秒待つ）。
  { name: 'ai-consent-saving', url: '/?consent=none&consent=slow', steps: [...CONSENT_CONSULT, { css: '[role=dialog] button:has-text("同意して使う")' }, { wait: 400 }] },
  // 🧭 Jev を入れたとき（VITE_AI_JEV=on・お試しモードは ?jev=1）の同意のシート: 相談に TypeSafe AI・「合いそうなタグ」の行。
  { name: 'ai-consent-consult-jev', url: '/?consent=none&jev=1', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 800 }] },
  { name: 'ai-consent-advisor', url: '/?consent=none', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 800 }] },
  { name: 'ai-consent-plan', url: '/?consent=none', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }, { fill: ['textarea[aria-label="この本から得たいこと（必須）"]', '40代からの働き方を考えたい'] }, { css: 'button:has-text("読書計画シートを作")' }, { wait: 800 }] },
  // 「今はやめる」で閉じたあと（送らない・入力欄に相談が残る）
  { name: 'ai-consent-declined', url: '/?consent=none', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 800 }, { css: '[role=dialog] button:has-text("今はやめる")' }, { wait: 600 }] },
  // 「今はやめる」のあと（AI 選書＝入力が残り聞き返しへ進まない／写真＝送らず写真の読み込み表示も出さない／読書計画シート＝作り始めない）
  { name: 'ai-consent-advisor-declined', url: '/?consent=none', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 800 }, { css: '[role=dialog] button:has-text("今はやめる")' }, { wait: 600 }] },
  { name: 'ai-consent-ocr-declined', url: '/?consent=none', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { upload: ['[role=dialog] input[type=file][accept="image/*"]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 800 }, { css: '[role=dialog][aria-label="AI に送る内容について"] button:has-text("今はやめる")' }, { wait: 600 }] },
  { name: 'ai-consent-plan-declined', url: '/?consent=none', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }, { fill: ['textarea[aria-label="この本から得たいこと（必須）"]', '40代からの働き方を考えたい'] }, { css: 'button:has-text("読書計画シートを作")' }, { wait: 800 }, { css: '[role=dialog] button:has-text("今はやめる")' }, { wait: 600 }] },
  // 「同意して使う」を押して、アカウントへの保存を待っている間（&consent=slow＝8 秒かかる）
  { name: 'ai-consent-busy', url: '/?consent=none&consent=slow', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 800 }, { css: '[role=dialog] button:has-text("同意して使う")', settle: 400 }] },
  // 「同意して使う」のあと（そのまま相談が送られて答えが出る）
  { name: 'ai-consent-agreed', url: '/?consent=none', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 800 }, { css: '[role=dialog] button:has-text("同意して使う")' }, { wait: 6000 }] },
  // 設定の「AI へのデータ送信」（「10月1日に同意」／「まだ同意していません」）と、押して開くシート（同意済みなら「同意を取り消す」）
  { name: 'settings-ai-consent', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'h3:has-text("プライバシー")' }] },
  { name: 'settings-ai-consent-none', url: '/?consent=none', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'h3:has-text("プライバシー")' }] },
  { name: 'settings-ai-consent-sheet', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'h3:has-text("プライバシー")' }, { css: 'button:has-text("AI へのデータ送信")' }, { wait: 600 }] },
  // まだ同意していない人が設定から開いたシート（「今はやめる」｜「同意する」）
  { name: 'settings-ai-consent-sheet-none', url: '/?consent=none', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'h3:has-text("プライバシー")' }, { css: 'button:has-text("AI へのデータ送信")' }, { wait: 600 }] },
  // 「同意を取り消す」を押して保存を待っている間（&consent=slow）
  { name: 'settings-ai-consent-withdrawing', url: '/?consent=slow', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'h3:has-text("プライバシー")' }, { css: 'button:has-text("AI へのデータ送信")' }, { wait: 600 }, { css: '[role=dialog] button:has-text("同意を取り消す")', settle: 400 }] },
  // 取り消したあと（行が「まだ同意していません」に・知らせ）
  { name: 'settings-ai-consent-withdrawn', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'h3:has-text("プライバシー")' }, { css: 'button:has-text("AI へのデータ送信")' }, { wait: 600 }, { css: '[role=dialog] button:has-text("同意を取り消す")', settle: 300 }, { wait: 500 }] },
  { name: 'share-edit-photo-zoomed', url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT, EDIT_ZOOM, EDIT_ZOOM, EDIT_PAN, { wait: 800 }] },
  { name: 'share-edit-photo-zoomed-story', url: '/', steps: [...SHARE_CAMERA, { css: '[role=radio][aria-label="ストーリー（9:16）"]' }, { wait: 1500 }, ...SHARE_EDIT, EDIT_ZOOM, EDIT_PAN, { wait: 800 }] },
  { name: 'share-edit-items', url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT, { scrollBottom: true }] },
  { name: 'share-edit-title-only', url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT, EDIT_TITLE_ONLY, { wait: 1200 }, EDIT_TOP] },
  { name: 'share-edit-title-only-items', url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT, EDIT_TITLE_ONLY, { wait: 1200 }, { scrollBottom: true }] },
  { name: 'share-edit-title-only-paper-story', url: '/', steps: [...SHARE_PAPER, { css: '[role=radio][aria-label="ストーリー（9:16）"]' }, { wait: 1500 }, ...SHARE_EDIT, EDIT_TITLE_ONLY_LOGO, { wait: 1200 }, EDIT_TOP] },
  // 編集を終えてシートに戻ったとき（書名だけの 1 枚がそのまま共有される）
  { name: 'share-edit-title-only-sheet', url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT, EDIT_TITLE_ONLY, { wait: 1000 }, { css: `${EDIT} button:text-is("完了")` }, { wait: 2000 }] },
  { name: 'share-edit-text-input', url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT, ...EDIT_PHRASE] },
  ...['明朝の引用', '太いゴシック', '手書き風', '白抜きの帯'].flatMap((label, i) => {
    const key = ['mincho', 'bold', 'hand', 'band'][i];
    const pick = { eval: `(() => { const b = [...document.querySelectorAll('[aria-label="画像を編集"] [role=radiogroup][aria-label="言葉の形"] [role=radio]')].find((x) => x.textContent.includes('${label}')); if (b) b.click(); })()` };
    return [
      // 手書き風は Google Fonts を読み込めてから出る（遅い通信を待つ）。
      { name: `share-edit-phrase-${key}-photo`, url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT, ...EDIT_PHRASE, key === 'hand' ? { waitFor: `${EDIT} [role=radiogroup][aria-label="言葉の形"] [role=radio]:has-text("手書き風")`, timeout: 90000 } : { wait: 600 }, pick, { wait: 1500 }, EDIT_BLUR, EDIT_TOP] },
      { name: `share-edit-phrase-${key}-paper`, url: '/', steps: [...(key === 'hand' ? SHARE_CAMERA_PAPER : SHARE_PAPER), ...SHARE_EDIT, ...EDIT_PHRASE, key === 'hand' ? { waitFor: `${EDIT} [role=radiogroup][aria-label="言葉の形"] [role=radio]:has-text("手書き風")`, timeout: 90000 } : { wait: 600 }, pick, { wait: 1500 }, EDIT_BLUR, EDIT_TOP] },
    ];
  }),
  { name: 'share-edit-phrase-band-story', url: '/', steps: [...SHARE_CAMERA, { css: '[role=radio][aria-label="ストーリー（9:16）"]' }, { wait: 1500 }, ...SHARE_EDIT, ...EDIT_PHRASE, { css: `${EDIT} [role=radio]:has-text("白抜きの帯")` }, { wait: 1200 }, EDIT_BLUR, EDIT_TOP] },
  { name: 'share-edit-phrase-mincho-story-paper', url: '/', steps: [...SHARE_PAPER, { css: '[role=radio][aria-label="ストーリー（9:16）"]' }, { wait: 1500 }, ...SHARE_EDIT, ...EDIT_PHRASE, EDIT_BLUR, EDIT_TOP] },
  // 言葉を動かして大きくした（編集画面の指の操作と同じ・ctrl＋ホイールを言葉の上で）
  { name: 'share-edit-phrase-moved', url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT, ...EDIT_PHRASE, EDIT_BLUR, { css: `${EDIT} [role=radio]:has-text("太いゴシック")` }, { wait: 1200 }, EDIT_PHRASE_DRAG, { wait: 600 }, EDIT_PHRASE_GROW, { wait: 1200 }, EDIT_TOP] },
  // シートに戻ったとき（言葉の入った 1 枚）
  { name: 'share-edit-phrase-sheet', url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT, ...EDIT_PHRASE, EDIT_BLUR, { css: `${EDIT} button:text-is("完了")` }, { wait: 2000 }] },
  // 読み込み中・描けなかったとき（シートと編集画面）と、透明（ステッカー）の編集画面（2026-10-01 ui-critic）。
  { name: 'share-photo-loading', url: '/?share=slow', steps: [{ css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 1500 }] },
  { name: 'share-photo-error', url: '/?share=fail', steps: [{ css: 'h1' }, { upload: ['input[data-share-camera]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2000 }] },
  { name: 'share-edit-loading', url: '/?share=editslow', steps: [...SHARE_CAMERA, ...SHARE_EDIT] },
  { name: 'share-edit-error', url: '/?share=editfail', steps: [...SHARE_CAMERA, ...SHARE_EDIT] },
  { name: 'share-edit-sticker', url: '/', steps: [...SHARE_PAPER, { css: '[role=radio][aria-label="透明（ステッカー用）"]' }, { wait: 1500 }, ...SHARE_EDIT] },
  { name: 'share-edit-sticker-phrase', url: '/', steps: [...SHARE_PAPER, { css: '[role=radio][aria-label="透明（ステッカー用）"]' }, { wait: 1500 }, ...SHARE_EDIT, ...EDIT_PHRASE, { css: `${EDIT} [role=radio]:has-text("白抜きの帯")` }, { wait: 1200 }, EDIT_BLUR, EDIT_TOP] },
  // 言葉と一文の両方を出す（言葉を入れると一文は隠れる→一文をオンに戻す＝言葉に傍線を付けない）
  { name: 'share-edit-phrase-with-quote', url: '/', steps: [...SHARE_CAMERA, ...SHARE_EDIT, ...EDIT_PHRASE, EDIT_BLUR, { css: `${EDIT} [role=switch][aria-label="一文"]` }, { wait: 1500 }, EDIT_TOP] },
  // 編集画面で下の「表示する項目」まで送っても、画像が上に残る
  { name: 'share-edit-items-sticky', url: '/', steps: [...SHARE_CAMERA, { css: '[role=radio][aria-label="ストーリー（9:16）"]' }, { wait: 1500 }, ...SHARE_EDIT, { scrollBottom: true }, { wait: 600 }] },
  { name: 'feedback-form', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button[aria-label="フィードバックを送る"]' }] },
  // ── ヘルプ（2026-09-30）: 画面ごとのヘルプ。?helpkey= は開発中だけ効く（ほかの画面のヘルプを直に開く）。
  { name: 'help-home', url: '/', steps: [{ css: 'button[aria-label="この画面のヘルプを開く"]' }] },
  { name: 'help-home-bottom', url: '/', steps: [{ css: 'button[aria-label="この画面のヘルプを開く"]' }, { scrollBottom: true }] },
  { name: 'help-home-topic', url: '/', steps: [{ css: 'button[aria-label="この画面のヘルプを開く"]' }, { css: '[role=dialog] details summary' }] },
  { name: 'help-book-reading', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("ヘルプ")' }] },
  { name: 'help-consult', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="この画面のヘルプを開く"]' }] },
  { name: 'help-consult-bottom', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="この画面のヘルプを開く"]' }, { scrollBottom: true }] },
  { name: 'help-action', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[aria-label="この画面のヘルプを開く"]' }] },
  { name: 'help-billing', url: '/?helpkey=billing', steps: [{ css: 'button[aria-label="この画面のヘルプを開く"]' }] },
  // 「ほかの画面の使い方」から切り替えた形（上に「‹ ホームのヘルプに戻る」）
  { name: 'help-switch', url: '/', steps: [{ css: 'button[aria-label="この画面のヘルプを開く"]' }, { css: '[role=dialog] button:has-text("プラン・お支払い")' }] },
  // 読書中の本 → プラン・お支払い（上の行に「‹ 読書中の本」と画面の名前が並んでもあふれない）
  { name: 'help-switch-reading', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("ヘルプ")' }, { css: '[role=dialog] button:has-text("プラン・お支払い")' }] },
  { name: 'help-book-reading-topic', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("ヘルプ")' }, { css: '[role=dialog] details summary' }] },
  // ── メモが答える相談（2026-10-01）: 無料プランで今月のトークンを使い切ったあと、送った相談にメモの一節で答える（AI なし）。
  { name: 'free-used-memo-answer', url: '/?demo=freeused', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下に質問で考えてもらいたいが、つい答えを言ってしまう'] }, { css: 'button[aria-label="送信"]' }, { wait: 1500 }] },
  { name: 'free-used-memo-answer-bottom', url: '/?demo=freeused', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下に質問で考えてもらいたいが、つい答えを言ってしまう'] }, { css: 'button[aria-label="送信"]' }, { wait: 1500 }, { scrollBottom: true }] },
  // 学び（本に結びつかないメモ）と本のメモの両方で答える／ホームの相談カードから送る（相談タブでメモの答え）
  { name: 'free-used-memo-answer-learning', url: '/?demo=freeused', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '上司への報告がうまくいかない'] }, { css: 'button[aria-label="送信"]' }, { wait: 1500 }] },
  // メモを読んでいる間（&load=memosearch＝自分のメモを全部読む 1 回だけ遅い）／読めなかったとき（&dbfail=memosearch）
  { name: 'free-used-memo-loading', url: '/?demo=freeused&load=memosearch', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下に質問で考えてもらいたいが、つい答えを言ってしまう'] }, { css: 'button[aria-label="送信"]' }, { wait: 600 }] },
  { name: 'free-used-memo-error', url: '/?demo=freeused&dbfail=memosearch', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下に質問で考えてもらいたいが、つい答えを言ってしまう'] }, { css: 'button[aria-label="送信"]' }, { wait: 1500 }] },
  { name: 'free-used-memo-noresult', url: '/?demo=freeused', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', 'スキーがうまくなりたい'] }, { css: 'button[aria-label="送信"]' }, { wait: 1500 }] },
  { name: 'free-used-home', url: '/?demo=freeused' },
  // ── 本と本がつながる（2026-10-01）: 保存したメモ・開いたメモに、ほかの本で似たことを書いたメモ（AI なし）。
  { name: 'memo-saved-link', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("数値化の鬼")' }, { css: 'button:has-text("メモを書く")' }, { fill: ['textarea[aria-label="メモ本文"]', '頼まれごとはその場で引き受けず、一度持ち帰ってから数字で判断する。'] }, { css: '[role=dialog] button:text-is("保存")' }, { wait: 1800 }] },
  { name: 'memo-open-link', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'p:has-text("命令ではなく質問で")' }, { wait: 800 }, { scrollBottom: true }] },
  { name: 'memo-focus-link', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', '命令'] }, { wait: 800 }, { css: 'button:has-text("命令ではなく") >> nth=0', settle: 600 }] },
  // つながるメモの行を押す → その本のそのメモを開いて示す（開いた先のカードにも逆向きのつながるメモ）
  { name: 'memo-link-open', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label^="本を検索（"]', '命令'] }, { wait: 800 }, { css: 'button:has-text("命令ではなく") >> nth=0', settle: 1600 }, { css: 'section[aria-label="つながるメモ"] button', settle: 600 }] },
  { name: 'memo-editor-next-link', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("数値化の鬼")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }, { css: 'button:has-text("全画面で書く")' }, { fill: ['textarea#memo-body', '頼まれごとはその場で引き受けず、一度持ち帰ってから数字で判断する。'] }, { css: 'button:has-text("保存して次へ")', settle: 1200 }] },

  // ── 初日の体験（2026-10-02・lib/firstDay.js）: 初回ガイドの 3 つの道 → 終えたら「相談してみる」→ 相談の入力欄に下書き。
  //    メモ 3 件のホーム・相談（「あと N 件で相談相手が育ちます」）、はじめての相談の答え（「あなたのメモ N 件から答えました」）。
  //    メモが 10 件以上のホームは既存の home（一行は出ない）。
  { name: 'onboard-import-done', url: '/?demo=freenew', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/booklog.csv'] }, { wait: 1200 }, { css: '[role=dialog] button:has-text("取り込む")' }, { wait: 3000 }] },
  { name: 'onboard-import-consult', url: '/?demo=freenew', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/booklog.csv'] }, { wait: 1200 }, { css: '[role=dialog] button:has-text("取り込む")' }, { wait: 3000 }, { css: '[role=dialog] button:has-text("相談してみる")' }, { wait: 1500 }] },
  { name: 'onboard-ocr-sheet', url: '/?demo=freenew', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("本のページを撮る")' }, { fill: ['#add-book-query', '思考の整理学'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }, { css: 'button:has-text("思考の整理学") >> nth=0' }, { wait: 1200 }, { css: 'button:has-text("保存してメモを書く")' }, { wait: 6000 }] },
  // r4（2026-10-02）: 本のページを撮るのシートで、無料プランの今月 10 回を使い切った（0 回）／0 回で押した（有料プランの画面）／読み取りに失敗
  { name: 'onboard-ocr-sheet-zero', url: '/?demo=freenew&ocr=used', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("本のページを撮る")' }, { fill: ['#add-book-query', '思考の整理学'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }, { css: 'button:has-text("思考の整理学") >> nth=0' }, { wait: 1200 }, { css: 'button:has-text("保存してメモを書く")' }, { wait: 6000 }] },
  { name: 'onboard-ocr-paywall', url: '/?demo=freenew&ocr=used&native=1', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("本のページを撮る")' }, { fill: ['#add-book-query', '思考の整理学'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }, { css: 'button:has-text("思考の整理学") >> nth=0' }, { wait: 1200 }, { css: 'button:has-text("保存してメモを書く")' }, { wait: 6000 }, { css: '[role=dialog] button:has-text("写真から書き起こす")' }, { wait: 1500 }] },
  { name: 'onboard-ocr-error', url: '/?demo=freenew&ai=fail', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("本のページを撮る")' }, { fill: ['#add-book-query', '思考の整理学'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }, { css: 'button:has-text("思考の整理学") >> nth=0' }, { wait: 1200 }, { css: 'button:has-text("保存してメモを書く")' }, { wait: 6000 }, { upload: ['input[data-ocr-input]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 2500 }] },
  { name: 'onboard-ocr-saved', url: '/?demo=freenew', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("本のページを撮る")' }, { fill: ['#add-book-query', '思考の整理学'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }, { css: 'button:has-text("思考の整理学") >> nth=0' }, { wait: 1200 }, { css: 'button:has-text("保存してメモを書く")' }, { wait: 1500 }, { fill: ['textarea[aria-label="メモ本文"]', '考えは一晩寝かせると、いらないものが落ちて整理される'] }, { css: '[role=dialog] button:text-is("保存")' }, { wait: 1500 }] },
  { name: 'onboard-ocr-consult', url: '/?demo=freenew', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("本のページを撮る")' }, { fill: ['#add-book-query', '思考の整理学'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }, { css: 'button:has-text("思考の整理学") >> nth=0' }, { wait: 1200 }, { css: 'button:has-text("保存してメモを書く")' }, { wait: 1500 }, { fill: ['textarea[aria-label="メモ本文"]', '考えは一晩寝かせると、いらないものが落ちて整理される'] }, { css: '[role=dialog] button:text-is("保存")' }, { wait: 1500 }, { css: 'button:has-text("相談してみる")' }, { wait: 1500 }] },
  { name: 'onboard-quickstart-done', url: '/?demo=freenew', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("読んだ本に一言ずつ残す"), [role=dialog] button:has-text("これまで読んだ本から始める")' }, { css: '[role=dialog] button[aria-label^="『イシューからはじめよ』"]' }, { css: '[role=dialog] button:has-text("次へ")' }, { fill: ['[role=dialog] textarea', '答えを出す前に、本当に答えるべき問いかを確かめる'] }, { css: '[role=dialog] button:has-text("相談相手をつくる")' }, { wait: 2500 }] },
  { name: 'onboard-quickstart-consult', url: '/?demo=freenew', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("読んだ本に一言ずつ残す"), [role=dialog] button:has-text("これまで読んだ本から始める")' }, { css: '[role=dialog] button[aria-label^="『イシューからはじめよ』"]' }, { css: '[role=dialog] button:has-text("次へ")' }, { fill: ['[role=dialog] textarea', '答えを出す前に、本当に答えるべき問いかを確かめる'] }, { css: '[role=dialog] button:has-text("相談相手をつくる")' }, { wait: 2500 }, { css: '[role=dialog] button:has-text("の学びで")' }, { css: '[role=dialog] button:text-is("相談する")' }, { waitFor: '[aria-label="続けて聞く"] button' }, { wait: 800 }, { scrollBottom: true }] },
  { name: 'home-fewmemos', url: '/?demo=fewmemos' },
  // r2（2026-10-02 ui-critic）: 足りなかった状態
  //   ホームでメモの件数を数えている間（一行の場所は同じ高さの形）／取り込みの失敗（初回ガイドから）／
  //   はじめての相談で関係するメモが無かった答え（「答えました」の一行は出ない）／下書きで開いた相談で、別の相談例を選んだ／
  //   本のページを撮る → 知らせが消えたあとの「この本に相談する」も同じ道
  // 前回 3 件だった人（端末に覚えた件数）が開き直したところ。はじめて開いた人には形を出さない。
  { name: 'home-fewmemos-counting', url: '/?demo=fewmemos&load=memocount', steps: [{ eval: "localStorage.setItem('orime-home-memo-count', '3')" }, { reload: true }, { wait: 1500 }] },
  { name: 'onboard-import-error', url: '/?demo=freenew', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/broken.txt'] }, { wait: 1200 }] },
  { name: 'consult-first-noinfo', url: '/?demo=fewmemos&ai=noinfo', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '確定申告のやり方を教えて'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="相談への答え"]:not([aria-busy]) summary, [aria-label="相談への答え"]:not([aria-busy]) p' }, { wait: 800 }] },
  { name: 'onboard-import-consult-pick', url: '/?demo=freenew', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("ほかのアプリから取り込む")' }, { upload: ['input[type=file]', 'scripts/fixtures/booklog.csv'] }, { wait: 1200 }, { css: '[role=dialog] button:has-text("取り込む")' }, { wait: 3000 }, { css: '[role=dialog] button:has-text("相談してみる")' }, { wait: 1500 }, { css: '#brain-empty-title ~ div button[aria-pressed="false"] >> nth=0' }, { wait: 600 }] },
  { name: 'onboard-ocr-bridge', url: '/?demo=freenew', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("本のページを撮る")' }, { fill: ['#add-book-query', '思考の整理学'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }, { css: 'button:has-text("思考の整理学") >> nth=0' }, { wait: 1200 }, { css: 'button:has-text("保存してメモを書く")' }, { wait: 1500 }, { fill: ['textarea[aria-label="メモ本文"]', '考えは一晩寝かせると、いらないものが落ちて整理される'] }, { css: '[role=dialog] button:text-is("保存")' }, { wait: 11000 }, { css: 'button:has-text("この本に相談する")' }, { wait: 1500 }] },
  { name: 'consult-fewmemos', url: '/?demo=fewmemos', steps: [{ css: nav('相談') }, { wait: 1500 }] },
  { name: 'consult-first-answer', url: '/?demo=fewmemos', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { waitFor: '[aria-label="続けて聞く"] button' }, { wait: 800 }, { scrollBottom: true }] },
  // ── 運営ダッシュボード「ローンチの 4 つの数字」（2026-10-02・管理者だけ・?admin=1 は src/demo/demoAdmin.js）
  // 見出し（または表）を、上に貼りつく見出しとタブの下（上から 130px）に来るまで送る。
  ...[
    ['admin-kpis', '/?admin=1', []],
    ['admin-kpis-table', '/?admin=1', [{ eval: ADMIN_SCROLL('section[aria-labelledby="launch-kpi-title"] table') }]],
    ['admin-kpis-edit', '/?admin=1', [{ css: 'button[aria-label="目標を変える"]' }]],
    ['admin-kpis-notrial', '/?admin=1&kpi=notrial', []],
    ['admin-kpis-empty', '/?admin=1&kpi=empty', []],
    ['admin-kpis-missing', '/?admin=1&kpi=missing', []],
  ].map(([name, url, extra]) => ({
    name, url,
    steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("運営ダッシュボード")' }, { wait: 1200 }, { eval: ADMIN_SCROLL('#launch-kpi-title') }, ...extra],
  })),
];

// UI_SHOTS_PROXY=1 で、外への通信（Google Fonts＝共有の「手書き風」の書体など）を HTTPS_PROXY 経由にする
// （クラウドの作業環境向け・証明書は中継のものなので確かめない）。ふだんは未設定のまま。
function proxyOptions() {
  if (!process.env.UI_SHOTS_PROXY || !process.env.HTTPS_PROXY) return {};
  const u = new URL(process.env.HTTPS_PROXY);
  return { proxy: { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), bypass: 'localhost,127.0.0.1' } };
}

function browserOptions() {
  if (process.env.PW_EXE) return { executablePath: process.env.PW_EXE, ...proxyOptions() };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium', ...proxyOptions() };
  return { channel: 'chrome', ...proxyOptions() };
}

async function run(step, page) {
  if (step.wait) return page.waitForTimeout(step.wait);
  if (step.waitFor) return page.locator(step.waitFor).first().waitFor({ state: 'visible', timeout: step.timeout || 20000 });
  if (step.role) await page.getByRole('button', { name: step.role }).first().click();
  if (step.css) await page.locator(step.css).first().click();
  if (step.scrollTo) await page.locator(step.scrollTo).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  // 送るのは本当に送れる箱だけ（overflow-y が auto / scroll）。2 行で止めた一節（-webkit-line-clamp の overflow: hidden）まで
  // 送ると、写真では文の途中から見えていた（2026-10-01 ui-critic）。
  if (step.scrollBottom) await page.evaluate(() => document.querySelectorAll('*').forEach((el) => {
    if (el.scrollHeight <= el.clientHeight + 10) return;
    const oy = getComputedStyle(el).overflowY;
    if (oy === 'auto' || oy === 'scroll' || el === document.scrollingElement) el.scrollTop = el.scrollHeight;
  }));
  if (step.fill) await page.locator(step.fill[0]).first().fill(step.fill[1]);
  if (step.eval) await page.evaluate(step.eval);
  if (step.upload) await page.locator(step.upload[0]).first().setInputFiles(step.upload[1]);
  if (step.reload) await page.reload({ waitUntil: 'networkidle' });
  // settle: この操作のあとの待ち（既定 900ms）。開いたメモの光（.just-added-card・1.5 秒で薄れる）を写すときは短く。
  await page.waitForTimeout(step.settle ?? 900);
}

const targets = only.length ? SCREENS.filter((s) => only.includes(s.name)) : SCREENS;
if (targets.length === 0) {
  console.error(`画面名が見つかりません。使える名前: ${SCREENS.map((s) => s.name).join(', ')}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch(browserOptions());
let failed = 0;
for (const scheme of ['light', 'dark']) {
  for (const s of targets) {
    // 画面ごとに新しいコンテキスト（前の画面の localStorage＝開いていたタブ等を持ち越さない）。
    // s.viewport（例 { width: 1280, height: 800 }）があれば広い画面（PC・マウス）で撮る。既定は iPhone の 390 幅。
    const ctx = await browser.newContext({
      ...(s.viewport
        ? { viewport: s.viewport, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
        : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }),
      locale: 'ja-JP', colorScheme: scheme,
      ...(process.env.UI_SHOTS_PROXY ? { ignoreHTTPSErrors: true } : {}),
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(BASE + s.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      // 起動のスプラッシュ（Web だけ・約 1 秒）が消えるまで待つ（固定の待ち時間だけだと遅い端末で重なって写る）。
      await page.locator('[data-splash]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      for (const step of s.steps || []) await run(step, page);
      const file = join(outDir, `${s.name}-${scheme}.png`);
      await page.screenshot({ path: file });
      console.log(`✓ ${file}${errors.length ? `  ⚠️ ${errors[0]}` : ''}`);
    } catch (e) {
      failed += 1;
      console.error(`✗ ${s.name} (${scheme}): ${e.message.split('\n')[0]}`);
    } finally {
      await ctx.close();
    }
  }
}
await browser.close();
if (failed) process.exit(1);
