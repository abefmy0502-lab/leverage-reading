#!/usr/bin/env node
// 🎬🎙 縦動画を声入りまで 1 回で作る（2026-11-22 オーナー「音声も簡単に入るような仕組み」）。Mac のターミナルで:
//   npm run mkt:videos                     → 1 週目の 7 本（画面 4・概念 3）
//   npm run mkt:videos -- shelf-scan       → 名前で絞る
//   npm run mkt:videos -- --say            → 鍵なしで Mac の声（Reed・日本語）の試し
// 中で順に: ① 声を作り置き（mkt:voice --prepare・鍵は環境変数かキーチェーン「orime-openai-tts」）
//          ② お試しモードを起動して画面の動画を撮る（声の長さで間を取る）③ 概念の動画を書き出す ④ 声を重ねる（final-voice.mp4）
// 鍵が無ければ声なしで撮る（final.mp4 だけ）。
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const SCREEN = ['shelf-scan', 'goal-roadmap', 'consult-answer', 'focus-mode'];
const CONCEPT = ['concept-consult', 'concept-goal', 'concept-focus'];
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const screen = names.length ? SCREEN.filter((n) => names.includes(n)) : SCREEN;
const concept = names.length ? CONCEPT.filter((n) => names.includes(n)) : CONCEPT;
const env = { ...process.env };
// ブラウザは record-demo が決める（PW_EXE → Playwright の Chromium → Google Chrome）。
// Mac で初めてのときは: node node_modules/playwright-core/cli.js install chromium ffmpeg
const sayVoice = process.argv.includes('--say'); // 鍵なしで Mac の声（Reed・日本語）で作る試し
if (sayVoice) env.MKT_VOICE_ENGINE = 'say';
if (!sayVoice && !env.OPENAI_API_KEY && process.platform === 'darwin') {
  const k = spawnSync('security', ['find-generic-password', '-s', 'orime-openai-tts', '-w'], { encoding: 'utf8' });
  if (k.status === 0 && k.stdout.trim()) env.OPENAI_API_KEY = k.stdout.trim();
}
// 作っている間は Mac を眠らせない（2026-11-22 途中で眠って録画が空になった）。このプロセスが終わると自動で解ける。
if (process.platform === 'darwin') { try { spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref(); } catch { /* 無くても続ける */ } }
const run = (args) => { const r = spawnSync('node', args, { stdio: 'inherit', env }); if (r.status !== 0) throw new Error(`${args[0]} が失敗しました`); };
const failedSteps = [];
// 撮影・書き出しは、1 本が失敗しても残りを作り、最後にまとめて知らせる
const tryRun = (args, label) => { const r = spawnSync('node', args, { stdio: 'inherit', env }); if (r.status !== 0) failedSteps.push(label); };
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const out = join('marketing-out', 'videos', today);

const withVoice = sayVoice || !!env.OPENAI_API_KEY;
const engineArgs = ['--engine', sayVoice ? 'say' : 'openai'];
console.log(sayVoice ? '🎙 Mac の声（試し）で作ります' : withVoice ? '🎙 声あり（OpenAI）で作ります' : '（鍵が無いので声なしで作ります。声を入れるときは README の手順で鍵をキーチェーンへ・試すだけなら --say）');
if (withVoice) run(['scripts/marketing/voice.mjs', '--prepare', ...engineArgs, ...screen, ...concept]);

if (screen.length) {
  const demo = spawn('npx', ['vite', '--port', '5173', '--strictPort'], { env: { ...env, VITE_DEMO: 'true' }, stdio: 'ignore' }); // npm run demo と同じ
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      try { up = (await fetch('http://localhost:5173/')).ok; } catch { up = false; }
    }
    if (!up) throw new Error('お試しモードが起動しませんでした（npm run demo を確かめる）');
    tryRun(['scripts/marketing/record-demo.mjs', ...screen], '画面の動画');
  } finally { demo.kill(); }
}
if (concept.length) tryRun(['scripts/marketing/explainer/render-explainer.mjs', ...concept], '概念の動画');
if (withVoice) run(['scripts/marketing/voice.mjs', out, ...engineArgs]);
if (failedSteps.length) {
  console.error(`\n✗ 一部が作れませんでした（${failedSteps.join('・')}）。上の「✗ 名前」の動画だけ作り直す: caffeinate -i npm run mkt:videos -- <名前> <名前>`);
  process.exit(1);
}
console.log(`✓ できあがり: ${out}/<名前>/${withVoice ? 'final-voice.mp4（声入り）' : 'final.mp4'}`);
