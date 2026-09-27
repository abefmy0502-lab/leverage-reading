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

// 画面の定義: url（お試しモードのシナリオ）と、そこに至る操作。
const SCREENS = [
  { name: 'home', url: '/' },
  { name: 'home-new-user', url: '/?demo=new', steps: [{ css: 'button[aria-label="閉じる"]' }] },
  { name: 'library', url: '/', steps: [{ css: 'button:has-text("すべての本")' }] },
  { name: 'library-list', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label^="並び替え・絞り込み・表示"]' }, { css: 'button:has-text("リストで表示")' }] },
  { name: 'library-menu', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label^="並び替え・絞り込み・表示"]' }] },
  { name: 'home-write-memo', url: '/', steps: [{ css: 'button[aria-label$="にメモを書く"]' }] },
  { name: 'onboarding', url: '/?demo=new' },
  { name: 'quickstart', url: '/?demo=new', steps: [{ role: '次へ' }, { role: '次へ' }, { role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }] },
  { name: 'book-detail', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }] },
  { name: 'book-detail-memos', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollTo: 'h2:has-text("メモ")' }] },
  { name: 'book-memo-sheet', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }] },
  { name: 'book-detail-bottom', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollBottom: true }] },
  { name: 'book-memo-sheet-more', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { css: 'button:has-text("ページ・写真")' }] },
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
  { name: 'consult-answer-open', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { css: 'summary:has-text("根拠を見る")' }, { scrollBottom: true }] },
  { name: 'consult-history', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }] },
  { name: 'consult-scope', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("相談相手：")' }] },
  { name: 'advisor', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }] },
  { name: 'consult-learning', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("学びを書く")' }] },
  { name: 'consult-knowledge', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("根拠にできる情報")' }] },
  { name: 'report', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }] },
  { name: 'review', url: '/', steps: [{ css: nav('振り返り') }] },
  { name: 'review-action', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("行動")' }] },
  { name: 'review-action-bottom', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("行動")' }, { scrollBottom: true }] },
  { name: 'review-memo', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("ノート"), button[role=tab]:has-text("メモ")' }] },
  { name: 'review-record', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("記録")' }] },
  { name: 'settings', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }] },
  { name: 'auth', url: '/?demo=auth&auth=signin' },
  { name: 'landing', url: '/?demo=auth' },
  { name: 'add-book', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }] },
  { name: 'paywall', url: '/?demo=paywall' },
  { name: 'paywall-native', url: '/?demo=paywall&native=1' },
  { name: 'paywall-bottom', url: '/?demo=paywall&native=1', steps: [{ scrollBottom: true }] },
  { name: 'webgate', url: '/?demo=webgate' },
  // 2026-09-27 追加: 生成後・状態別・編集・取り込み
  { name: 'report-result', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { wait: 5000 }] },
  { name: 'report-result-bottom', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { wait: 5000 }, { scrollBottom: true }] },
  { name: 'advisor-interview', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="相談する"]' }, { wait: 3000 }] },
  { name: 'advisor-reco', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="相談する"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }] },
  { name: 'advisor-reco-bottom', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="相談する"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }, { scrollBottom: true }] },
  { name: 'book-detail-want', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("チーズはどこへ消えた")' }] },
  { name: 'book-detail-before', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }] },
  { name: 'book-edit-reading', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }] },
  { name: 'book-edit-before', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }] },
  { name: 'import-sheet', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ブクログ・Kindle")' }] },

  // ── 状態（空・読み込み中・エラー・上限など）。お試しモードの切り替え:
  //    ?demo=new / nomemo / overdue / limit / free / paywall、&ai=slow|fail、&load=slow、&db=fail、&price=loading|fail
  { name: 'home-nomemo', url: '/?demo=nomemo' },
  { name: 'home-loading', url: '/?load=slow' },
  { name: 'home-focus', url: '/', steps: [{ css: 'textarea[aria-label="相談したいこと"]' }] },
  { name: 'library-noresult', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label="本を検索（書名・著者・タグ）"]', 'zzzz'] }] },
  { name: 'add-book-notfound', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', 'zzzzqqqqxxxx'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'onboarding-last', url: '/?demo=new', steps: [{ role: '次へ' }, { role: '次へ' }, { role: '次へ' }] },
  { name: 'quickstart-results', url: '/?demo=new', steps: [{ role: '次へ' }, { role: '次へ' }, { role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { fill: ['input[aria-label="書名や著者名で探す"]', 'ファクト'] }, { css: '[role=dialog] button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'quickstart-noresult', url: '/?demo=new', steps: [{ role: '次へ' }, { role: '次へ' }, { role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { fill: ['input[aria-label="書名や著者名で探す"]', 'ぞぞぞ'] }, { css: '[role=dialog] button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'auth-signup', url: '/?demo=auth&auth=signup' },
  { name: 'landing-bottom', url: '/?demo=auth', steps: [{ scrollBottom: true }] },
  { name: 'landing-pricing', url: '/?demo=auth', steps: [{ scrollTo: '#lp-pricing' }] },
  { name: 'paywall-price-loading', url: '/?demo=paywall&native=1&price=loading' },
  { name: 'paywall-price-fail', url: '/?demo=paywall&native=1&price=fail' },
  { name: 'paywall-free-used', url: '/?demo=free&native=1', steps: [{ css: 'button[aria-label="閉じる"]' }, { eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: 'free_used' } }))" }] },
  { name: 'book-detail-plan-open', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { scrollBottom: true }, { css: 'summary:has-text("読書計画")' }, { scrollBottom: true }] },
  { name: 'book-detail-summary-open', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'summary:has-text("この本のまとめ")' }, { scrollTo: 'summary:has-text("この本のまとめ")' }] },
  { name: 'book-detail-nomemo', url: '/?demo=nomemo', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }] },
  { name: 'book-memo-sheet-typed', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { fill: ['textarea[aria-label="メモ本文"]', '1on1 では最初に相手の近況を聞く。仕事の話はそのあと。人として関心を持っていると伝わると、相手は本音を話しやすくなる。'] }] },
  { name: 'book-edit-done', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }] },
  { name: 'consult-nomemo', url: '/?demo=nomemo', steps: [{ css: nav('相談') }] },
  { name: 'consult-streaming', url: '/?ai=slow', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 1500 }] },
  { name: 'consult-error', url: '/?ai=fail', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 2500 }] },
  { name: 'consult-limit', url: '/?demo=limit', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 2500 }] },
  { name: 'consult-answer-bottom', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { scrollBottom: true }] },
  { name: 'consult-history-list', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }] },
  { name: 'consult-history-empty', url: '/?demo=nomemo', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }] },
  { name: 'consult-history-error', url: '/?db=fail', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }, { wait: 1200 }] },
  { name: 'consult-scope-multi', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("相談相手：")' }, { css: '[role=dialog] button[aria-pressed]:has-text("イシューからはじめよ")' }, { css: '[role=dialog] button[aria-pressed]:has-text("1兆ドルコーチ")' }] },
  { name: 'consult-learning-typed', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("学びを書く")' }, { fill: ['#learning-text', '人に任せるときは、終わった状態を先に言葉にする'] }, { css: 'button[aria-controls="learning-more"]' }] },
  { name: 'consult-knowledge-nohit', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("根拠にできる情報")' }, { fill: ['input[type="search"]', 'zzzz'] }] },
  { name: 'consult-knowledge-empty', url: '/?demo=nomemo', steps: [{ css: nav('相談') }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("根拠にできる情報")' }] },
  { name: 'review-action-empty', url: '/?demo=nomemo', steps: [{ css: nav('振り返り') }] },
  { name: 'review-action-overdue', url: '/?demo=overdue', steps: [{ css: nav('振り返り') }] },
  { name: 'review-action-justdone', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=checkbox][aria-checked=false]' }] },
  { name: 'review-action-done-open', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button:has-text("完了した行動（")' }, { scrollBottom: true }] },
  { name: 'review-memo-empty', url: '/?demo=nomemo', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }] },
  { name: 'review-memo-noresult', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { fill: ['input[placeholder="メモを検索"]', 'zzzz'] }] },
  { name: 'review-memo-menu', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { css: 'button[aria-label="このメモの操作"]' }] },
  { name: 'review-record-empty', url: '/?demo=nomemo', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("記録")' }] },
  { name: 'settings-bottom', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollBottom: true }] },
  { name: 'advisor-loading', url: '/?ai=slow', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="相談する"]' }, { wait: 800 }] },
  { name: 'advisor-error', url: '/?ai=fail', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="相談する"]' }, { wait: 3000 }] },
  { name: 'advisor-limit', url: '/?demo=limit', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="相談する"]' }, { wait: 3000 }] },
  { name: 'advisor-added', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="相談する"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }, { css: 'button:has-text("読みたいに追加")' }, { wait: 3000 }, { css: 'button:has-text("この本を追加")' }, { wait: 1500 }] },
  { name: 'report-limit', url: '/?demo=limit', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { wait: 3000 }] },
  { name: 'report-added', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { wait: 5000 }, { css: 'button[aria-label="次の一歩を行動リストに追加"]' }, { wait: 1500 }] },
  { name: 'report-more', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { wait: 5000 }, { css: 'button[aria-label="その他の操作"]' }] },
  // ── 状態（3 回目の採点で追加）
  { name: 'home-error', url: '/?dbfail=books' },
  { name: 'home-write-memo-discard', url: '/', steps: [{ css: 'button[aria-label$="にメモを書く"]' }, { fill: ['textarea[aria-label="メモ本文"]', '書きかけのメモ'] }, { css: 'button:has-text("キャンセル")' }] },
  { name: 'library-loading', url: '/?load=slow&shelf=library' },
  { name: 'library-error', url: '/?dbfail=books&shelf=library' },
  { name: 'library-empty', url: '/?demo=new&shelf=library', steps: [{ css: 'button[aria-label="閉じる"]' }] },
  { name: 'add-book-results', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', 'ファクト'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'add-book-existing', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', '1兆ドルコーチ'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'add-book-manual', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { css: 'button:has-text("手動で入力する")' }] },
  { name: 'import-preview', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ブクログ・Kindle")' }, { upload: ['input[type=file]', 'scripts/fixtures/booklog.csv'] }, { wait: 1200 }] },
  { name: 'import-done', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ブクログ・Kindle")' }, { upload: ['input[type=file]', 'scripts/fixtures/booklog.csv'] }, { wait: 1200 }, { css: '[role=dialog] button:has-text("取り込む")' }, { wait: 3000 }] },
  { name: 'import-error', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ブクログ・Kindle")' }, { upload: ['input[type=file]', 'scripts/fixtures/broken.txt'] }, { wait: 1200 }] },
  { name: 'book-memo-sheet-discard', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button:has-text("メモを書く")' }, { fill: ['textarea[aria-label="メモ本文"]', '書きかけのメモ'] }, { css: 'button:has-text("キャンセル")' }] },
  { name: 'review-memo-zero', url: '/?demo=new', steps: [{ css: 'button[aria-label="閉じる"]' }, { css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }] },
  { name: 'review-record-zero', url: '/?demo=new', steps: [{ css: 'button[aria-label="閉じる"]' }, { css: nav('振り返り') }, { css: 'button[role=tab]:has-text("記録")' }] },
  { name: 'settings-free', url: '/?demo=free', steps: [{ css: 'button[aria-label="閉じる"]' }, { css: 'button[aria-label="アカウント設定を開く"]' }] },
  { name: 'landing-sticky', url: '/?demo=auth', steps: [{ scrollTo: '#lp-problem' }] },
  { name: 'paywall-trial', url: '/?demo=paywall&native=1&trial=7日間無料' },
  { name: 'paywall-free-covers', url: '/?demo=freeused&native=1' },
  { name: 'webgate-confirmed', url: '/?demo=webgate', steps: [{ eval: "sessionStorage.setItem('orime-email-confirmed', 'true')" }, { reload: true }] },
  { name: 'report-empty', url: '/?demo=nomemo', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }] },
  { name: 'report-generating', url: '/?ai=slow', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { wait: 1500 }] },
  { name: 'report-error', url: '/?ai=fail', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { wait: 2500 }] },
];

function browserOptions() {
  if (process.env.PW_EXE) return { executablePath: process.env.PW_EXE };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium' };
  return { channel: 'chrome' };
}

async function run(step, page) {
  if (step.wait) return page.waitForTimeout(step.wait);
  if (step.role) await page.getByRole('button', { name: step.role }).first().click();
  if (step.css) await page.locator(step.css).first().click();
  if (step.scrollTo) await page.locator(step.scrollTo).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  if (step.scrollBottom) await page.evaluate(() => document.querySelectorAll('*').forEach((el) => { if (el.scrollHeight > el.clientHeight + 10) el.scrollTop = el.scrollHeight; }));
  if (step.fill) await page.locator(step.fill[0]).first().fill(step.fill[1]);
  if (step.eval) await page.evaluate(step.eval);
  if (step.upload) await page.locator(step.upload[0]).first().setInputFiles(step.upload[1]);
  if (step.reload) await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
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
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      locale: 'ja-JP', colorScheme: scheme,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(BASE + s.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
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
