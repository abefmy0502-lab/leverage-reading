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
  { name: 'quickstart', url: '/?demo=new', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }] },
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
  { name: 'consult-answer-open', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { css: 'summary:has-text("根拠を見る")' }, { scrollTo: 'summary:has-text("根拠を見る")' }] },
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
  // 有料プランの画面は起動時には出ない（フリーミアム）。設定の「プランを見る」と同じ合図で開く。
  { name: 'paywall', url: '/?demo=paywall', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-native', url: '/?demo=paywall&native=1', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-bottom', url: '/?demo=paywall&native=1', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }, { scrollBottom: true }] },
  { name: 'webgate', url: '/?demo=webgate' },
  // 2026-09-27 追加: 生成後・状態別・編集・取り込み
  { name: 'report-result', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { css: 'button:text-is("まとめる")' }, { wait: 5000 }] },
  { name: 'report-result-bottom', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { css: 'button:text-is("まとめる")' }, { wait: 5000 }, { scrollBottom: true }] },
  { name: 'advisor-interview', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }] },
  { name: 'advisor-reco', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }] },
  { name: 'advisor-reco-bottom', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }, { scrollBottom: true }] },
  { name: 'book-detail-want', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("チーズはどこへ消えた")' }] },
  { name: 'book-detail-before', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }] },
  { name: 'book-edit-reading', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("1兆ドルコーチ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }] },
  { name: 'book-edit-before', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("LIFE SHIFT")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("編集")' }] },
  { name: 'import-sheet', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button:has-text("ほかのアプリから取り込む")' }] },

  // ── 状態（空・読み込み中・エラー・上限など）。お試しモードの切り替え:
  //    ?demo=new / nomemo / overdue / limit / free / freeused / freenew / freegrown / trial / paywall、&ai=slow|fail|cut、&load=slow、&save=slow、&db=fail、&price=loading|fail
  { name: 'home-nomemo', url: '/?demo=nomemo' },
  { name: 'home-loading', url: '/?load=slow' },
  { name: 'home-focus', url: '/', steps: [{ css: 'textarea[aria-label="相談したいこと"]' }] },
  { name: 'library-noresult', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を検索"]' }, { fill: ['input[aria-label="本を検索（書名・著者・タグ）"]', 'zzzz'] }] },
  { name: 'add-book-notfound', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', 'zzzzqqqqxxxx'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'onboarding-last', url: '/?demo=new', steps: [{ role: '次へ' }] },
  { name: 'quickstart-results', url: '/?demo=new', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { fill: ['input[aria-label="書名や著者名で探す"]', 'ファクト'] }, { css: '[role=dialog] button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'quickstart-noresult', url: '/?demo=new', steps: [{ role: '次へ' }, { css: '[role=dialog] button:has-text("これまで読んだ本から始める")' }, { fill: ['input[aria-label="書名や著者名で探す"]', 'ぞぞぞ'] }, { css: '[role=dialog] button:has-text("検索")' }, { wait: 1500 }] },
  { name: 'auth-signup', url: '/?demo=auth&auth=signup' },
  // ログインが通信エラーになったとき（&authfail=1・ErrorMessage の面で出る）
  { name: 'auth-error', url: '/?demo=auth&auth=signin&authfail=1', steps: [{ fill: ['input[aria-label="メールアドレス"]', 'demo@example.com'] }, { fill: ['input[aria-label="パスワード"]', 'password1'] }, { css: 'button[type=submit]' }, { wait: 800 }] },
  { name: 'landing-bottom', url: '/?demo=auth', steps: [{ scrollBottom: true }, { wait: 800 }] },
  { name: 'landing-pricing', url: '/?demo=auth', steps: [{ scrollTo: '#lp-pricing' }, { wait: 800 }] },
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
  { name: 'consult-history-list', url: '/', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }] },
  { name: 'consult-history-empty', url: '/?demo=nomemo', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }] },
  { name: 'consult-history-error', url: '/?db=fail', steps: [{ css: nav('相談') }, { css: 'button[aria-label="過去の相談を見る"]' }, { wait: 1200 }] },
  // 📚 答え方（まとめて / 本ごとに）
  { name: 'consult-mode-sheet', url: '/', steps: [{ css: nav('相談') }, { css: 'button:has-text("答え方：")' }] },
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
  { name: 'review-memo-menu', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { css: 'button[aria-label="このメモの操作"]' }] },
  { name: 'review-record-empty', url: '/?demo=nomemo', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("記録")' }] },
  { name: 'settings-bottom', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollBottom: true }] },
  { name: 'advisor-loading', url: '/?ai=slow', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 800 }] },
  { name: 'advisor-error', url: '/?ai=fail', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }] },
  { name: 'advisor-limit', url: '/?demo=limit', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }] },
  { name: 'advisor-added', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }, { css: 'button:has-text("読みたいに追加")' }, { waitFor: 'button:has-text("追加済み・開く")' }, { wait: 1500 }] },
  // トークンが 1 回分に足りない人: 「まとめる」は押せない形で、上限の案内カード＋「トークンを追加」が先に出る（テーマを選ぶだけ）
  { name: 'report-limit', url: '/?demo=limit', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }] },
  { name: 'report-added', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { css: 'button:text-is("まとめる")' }, { wait: 5000 }, { css: 'button:has-text("この一歩を行動に追加")' }, { wait: 1500 }] },
  { name: 'report-more', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { css: 'button:text-is("まとめる")' }, { wait: 5000 }, { css: 'button[aria-label="その他の操作"]' }] },
  // ── 状態（3 回目の採点で追加）
  { name: 'home-error', url: '/?dbfail=books' },
  { name: 'home-write-memo-discard', url: '/', steps: [{ css: 'button[aria-label$="にメモを書く"]' }, { fill: ['textarea[aria-label="メモ本文"]', '書きかけのメモ'] }, { css: 'button:has-text("キャンセル")' }] },
  { name: 'library-loading', url: '/?load=slow&shelf=library' },
  { name: 'library-error', url: '/?dbfail=books&shelf=library' },
  { name: 'library-empty', url: '/?demo=new&shelf=library', steps: [{ css: 'button[aria-label="閉じる"]' }] },
  { name: 'add-book-results', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: 'button[aria-label="本を追加"]' }, { fill: ['#add-book-query', 'ファクト'] }, { css: 'button:has-text("検索")' }, { wait: 1500 }] },
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
  { name: 'landing-sticky', url: '/?demo=auth', steps: [{ scrollTo: '#lp-problem' }, { waitFor: '.lp-sticky.is-visible' }, { wait: 400 }] },
  { name: 'paywall-trial', url: '/?demo=paywall&native=1&trial=7日間無料', steps: [{ eval: "window.dispatchEvent(new CustomEvent('orime:paywall', { detail: { reason: null } }))" }] },
  { name: 'paywall-free-covers', url: '/?demo=freeused&native=1', steps: [{ css: nav('相談') }, { css: 'button:has-text("プランを見る")' }] },
  { name: 'webgate-confirmed', url: '/?demo=webgate', steps: [{ eval: "sessionStorage.setItem('orime-email-confirmed', 'true')" }, { reload: true }] },
  { name: 'report-empty', url: '/?demo=nomemo', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }] },
  { name: 'report-generating', url: '/?ai=slow', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { css: 'button:text-is("まとめる")' }, { wait: 1500 }] },
  // ── フリーミアム（2026-09-27）: 無料プラン・トークン・プランの機能
  { name: 'free-home', url: '/?demo=free' },
  { name: 'free-consult', url: '/?demo=free', steps: [{ css: nav('相談') }] },
  { name: 'free-consult-used', url: '/?demo=freeused', steps: [{ css: nav('相談') }] },
  { name: 'free-consult-answer', url: '/?demo=free', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }] },
  { name: 'free-feature-gate', url: '/?demo=free', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }] },
  { name: 'paywall-feature', url: '/?demo=free&native=1', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { css: 'button:text-is("まとめる")' }] },
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
  { name: 'report-error', url: '/?ai=fail', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { css: 'button:text-is("まとめる")' }, { wait: 2500 }] },
  // 長さの上限で途中まで（&ai=cut・本文は残し、下に 1 行の案内）
  { name: 'report-truncated', url: '/?ai=cut', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'button[aria-label^="テーマ「"]' }, { css: 'button:text-is("まとめる")' }, { wait: 5000 }, { scrollBottom: true }] },
  // ── 一文をシェア（2026-09-27・SPEC §2-1）
  { name: 'share-line', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="この本の一文をシェア"]' }, { wait: 1500 }] },
  { name: 'share-line-post', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="この本の一文をシェア"]' }, { wait: 1200 }, { css: '[role=radio]:has-text("投稿")' }, { wait: 1500 }] },
  { name: 'share-line-night', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="この本の一文をシェア"]' }, { wait: 1200 }, { css: '[role=radio][aria-label="夜"]' }, { wait: 1500 }] },
  { name: 'share-line-from-memo', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="メニューを開く"]' }, { css: 'button:has-text("この一文をシェア")' }, { wait: 1500 }] },
  { name: 'share-line-photo', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="この本の一文をシェア"]' }, { wait: 1200 }, { upload: ['[role=dialog] input[type=file]', 'scripts/fixtures/share-photo.jpg'] }, { wait: 1500 }] },
  { name: 'share-line-sticker', url: '/', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="この本の一文をシェア"]' }, { wait: 1200 }, { css: '[role=radio][aria-label="透明"]' }, { wait: 1500 }] },
  { name: 'share-finished-nomemo', url: '/?demo=nomemo', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="その他の操作"]' }, { css: 'button:has-text("一文をシェア")' }, { wait: 1200 }] },
  // ── 相談・シェア・トークンの状態（4 回目の採点で追加）。&load=chat（過去の相談だけ遅い）/ &writefail=表 / &share=slow|fail / ?demo=trialout
  { name: 'consult-loading', url: '/?load=slow', steps: [{ css: nav('相談') }] },
  { name: 'consult-answer-added', url: '/', steps: [{ css: nav('相談') }, { fill: ['textarea[aria-label="相談したいこと"]', '部下が報告をくれなくて困っています'] }, { css: 'button[aria-label="送信"]' }, { wait: 6000 }, { css: '[aria-label="相談への答え"] button:has-text("行動に追加")' }, { wait: 800 }] },
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
  { name: 'share-line-loading', url: '/?share=slow', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="この本の一文をシェア"]' }, { wait: 800 }] },
  { name: 'share-line-error', url: '/?share=fail', steps: [{ css: 'button:has-text("すべての本")' }, { css: '.lvg-page button:has-text("イシューからはじめよ")' }, { css: 'button[aria-label="この本の一文をシェア"]' }, { wait: 1500 }] },
  // ── 使いやすさの手直し（2026-09-29・b2）: AI 選書の確認・振り返りの思い出しの取り消し・絞り込みのメニュー・テーマを選ぶ・無料プランの「プラン」・設定のヘルプ・フィードバック
  { name: 'advisor-confirm', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }, { fill: ['textarea[aria-label="AI 選書への相談内容"]', '仕事が回らず、いつも時間が足りません'] }, { css: 'button[aria-label="本を探す"]' }, { wait: 3000 }, { css: 'button:has-text("時間が足りない")' }, { wait: 1200 }, { css: 'button:has-text("大事な仕事に集中できる")' }, { wait: 7000 }, { css: 'button:has-text("読みたいに追加")' }, { wait: 3000 }] },
  { name: 'review-recall-answered', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { css: 'button:has-text("まだ覚えていない")' }, { wait: 500 }] },
  { name: 'review-filter-menu', url: '/', steps: [{ css: nav('振り返り') }, { css: 'button[role=tab]:has-text("メモ")' }, { css: 'input[placeholder="メモを検索"]' }, { css: 'button[aria-label^="種類で絞り込む"]' }] },
  { name: 'report-picked', url: '/', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("テーマまとめ")' }, { css: 'section[aria-labelledby="theme-detected"] button' }] },
  { name: 'free-advisor-tab', url: '/?demo=free', steps: [{ css: nav('相談') }, { css: 'button[role=tab]:has-text("AI 選書")' }] },
  { name: 'settings-support', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { scrollTo: 'button:has-text("ヘルプ・使い方")' }] },
  { name: 'home-reading-add', url: '/', steps: [{ scrollTo: 'button:has-text("本を追加")' }] },
  { name: 'feedback-form', url: '/', steps: [{ css: 'button[aria-label="アカウント設定を開く"]' }, { css: 'button[aria-label="フィードバックを送る"]' }] },
];

function browserOptions() {
  if (process.env.PW_EXE) return { executablePath: process.env.PW_EXE };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium' };
  return { channel: 'chrome' };
}

async function run(step, page) {
  if (step.wait) return page.waitForTimeout(step.wait);
  if (step.waitFor) return page.locator(step.waitFor).first().waitFor({ state: 'visible', timeout: 20000 });
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
