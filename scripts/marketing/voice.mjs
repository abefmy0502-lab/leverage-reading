#!/usr/bin/env node
// 🎙 縦動画に声（ナレーション）を重ねる（2026-11-22 オーナー「音声も簡単に入るような仕組み・落ち着いた男性の声で」）。
//
// 使い方（動画を作ったあと）:
//   npm run mkt:voice -- marketing-out/videos/2026-11-22/shelf-scan        → 1 本
//   npm run mkt:voice -- marketing-out/videos/2026-11-22                   → その日の全部
//   npm run mkt:voice -- <フォルダ> --engine say                           → Mac の声で試す（鍵なし・声は機械っぽい）
// 読む文: そのフォルダの captions.srt（字幕と同じ文・同じ時刻）。画面の動画（mkt:record）は最初に題も読む（meta.json の title）。
// 声の作り方（engine）:
//   openai（既定・OPENAI_API_KEY があるとき。Mac のキーチェーンに「orime-openai-tts」で入れておけば、そこから読む）… gpt-4o-mini-tts・声 onyx（MKT_VOICE で替えられる・ash も落ち着いた男性）。
//                                              「落ち着いた男性の声で、ゆっくり、はっきり」と指示する（MKT_VOICE_STYLE で替えられる）。
//   say（macOS）… 鍵が無いときの試し用（MKT_SAY_VOICE・既定 Reed の日本語）。
//   tone … 声の代わりに小さな音（時刻と重ね方の確かめ用・どの端末でも）。
// 出力: 同じフォルダに final-voice.mp4（映像はそのまま・声だけ重ねる）と voice/ の 1 文ずつの音。
// 鍵はファイルに書かない（シェルの環境変数で渡す）。読みは「Orime」→「オリメ」に直してから送る。

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findFfmpeg } from './finish-video.mjs';
import { spokenText, clipPath, keyOf, readIndex, writeIndex, CACHE_DIR, sayVoice } from './voiceCache.mjs';

export const DEFAULT_STYLE = '落ち着いた、低めの男性の声で。ゆっくり、はっきり、やさしく。宣伝っぽく盛り上げない。日本語の自然な抑揚で。';

// SRT → [{ start, end, text }]（秒）
export function parseSrt(src) {
  const toSec = (t) => { const [h, m, rest] = t.split(':'); const [s, ms] = rest.split(','); return (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000; };
  return String(src || '').replace(/\r/g, '').split(/\n\n+/).map((block) => {
    const lines = block.trim().split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) return null;
    const [a, b] = lines[i].split('-->').map((x) => x.trim());
    return { start: toSec(a), end: toSec(b), text: lines.slice(i + 1).join('') };
  }).filter((c) => c && c.text.trim());
}

export { spokenText };

// 読む順の文（題＋字幕）
export function narrationCues(dir) {
  const cues = parseSrt(readFileSync(join(dir, 'captions.srt'), 'utf8')).map((c) => ({ ...c, text: spokenText(c.text) }));
  const metaPath = join(dir, 'meta.json');
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (meta.title && !meta.plain) cues.unshift({ start: 0.3, end: Math.max(0.3, (cues[0]?.start ?? 3) - 0.1), text: spokenText(meta.title) });
    // 終わりのカードの 1 行（録画の時刻 → 仕上げた動画の時刻＝頭の読み込み中を切った分を引く）
    if (meta.endAt != null && meta.endLine) cues.push({ start: Math.max(0, meta.endAt - (meta.trimStart || 0) + 0.3), end: Infinity, text: spokenText(meta.endLine) });
  }
  return cues;
}

async function synthOpenai(text, file) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: process.env.MKT_VOICE || 'onyx', input: text, instructions: process.env.MKT_VOICE_STYLE || DEFAULT_STYLE, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`読み上げに失敗しました（${res.status}）`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function synthSay(text, file) {
  const aiff = file.replace(/\.mp3$/, '.aiff');
  const r = spawnSync('say', ['-v', sayVoice(), '-r', '165', '-o', aiff, text], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('say が使えません（macOS だけ）');
  return aiff;
}

function synthTone(bin, text, file) {
  const sec = Math.max(0.6, Math.min(4, text.length * 0.12));
  const r = spawnSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${sec}`, '-af', 'volume=0.2', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffmpeg で音を作れませんでした');
  return file;
}

// 長さ（秒）。ffprobe が無い端末（npm の ffmpeg-static だけ）でも動くよう、ffmpeg の表示から読む。
function duration(bin, file) {
  const r = spawnSync(bin, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = String(r.stderr || '').match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
}

// 1 文の声。作り置き（voice-cache）があればそれを使い、無ければ作って作り置きにも入れる（openai のときだけ）。
export async function synth(text, engine, bin, fallbackFile) {
  const spoken = spokenText(text);
  if (engine === 'openai' || engine === 'say') {
    const file = clipPath(spoken);
    const idx = readIndex();
    if (!existsSync(file)) {
      mkdirSync(CACHE_DIR, { recursive: true });
      if (engine === 'openai') await synthOpenai(spoken, file);
      else {
        const aiff = synthSay(spoken, file);
        const r = spawnSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-i', aiff, '-c:a', 'libmp3lame', '-b:a', '128k', file], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error('say の声を mp3 にできませんでした');
      }
    }
    const len = idx[keyOf(spoken)]?.len || duration(bin, file);
    if (!idx[keyOf(spoken)]) { idx[keyOf(spoken)] = { text: spoken, len }; writeIndex(idx); }
    return { file, len };
  }
  const file = engine === 'tone' ? synthTone(bin, spoken, fallbackFile) : synthSay(spoken, fallbackFile);
  return { file, len: duration(bin, file) };
}

async function voiceOne(dir, engine, bin) {
  const video = join(dir, 'final.mp4');
  if (!existsSync(video) || !existsSync(join(dir, 'captions.srt'))) { console.log(`  – ${basename(dir)}: final.mp4 か captions.srt が無いので飛ばします`); return; }
  const cues = narrationCues(dir);
  const vdir = join(dir, 'voice');
  mkdirSync(vdir, { recursive: true });
  const clips = [];
  for (const [i, c] of cues.entries()) {
    const { file, len } = await synth(c.text, engine, bin, join(vdir, `${String(i + 1).padStart(2, '0')}.mp3`));
    const room = (cues[i + 1]?.start ?? Infinity) - c.start;
    if (len > room + 0.2) console.log(`  ⚠ ${basename(dir)} の ${i + 1} 番目「${c.text}」は ${len.toFixed(1)} 秒で、次の文まで ${room.toFixed(1)} 秒。台本の hold を足すか、文を短く。`);
    clips.push({ file, at: c.start });
  }
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', video];
  for (const c of clips) args.push('-i', c.file);
  const delays = clips.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)},aresample=44100[a${i}]`);
  const filter = `${delays.join(';')};${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,volume=1.0,apad[aout]`;
  const out = join(dir, 'final-voice.mp4');
  const r = spawnSync(bin, [...args, '-filter_complex', filter, '-map', '0:v', '-map', '[aout]', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg が失敗しました: ${(r.stderr || '').split('\n').filter(Boolean).slice(-2).join(' / ')}`);
  console.log(`  ✓ ${out}（文 ${clips.length}）`);
}

if (process.argv[1] && process.argv[1].endsWith('voice.mjs')) {
  const args = process.argv.slice(2);
  const ei = args.indexOf('--engine');
  // 鍵: 環境変数か、Mac のキーチェーン（security add-generic-password -a orime -s orime-openai-tts -w で入れる・画面には出さない）
  // 声を --engine で say / tone に決めたときは、鍵を見に行かない
  const asked = ei >= 0 ? args[ei + 1] : null;
  if ((!asked || asked === 'openai') && !process.env.OPENAI_API_KEY && process.platform === 'darwin') {
    const k = spawnSync('security', ['find-generic-password', '-s', 'orime-openai-tts', '-w'], { encoding: 'utf8' });
    if (k.status === 0 && k.stdout.trim()) process.env.OPENAI_API_KEY = k.stdout.trim();
  }
  const engine = asked || (process.env.OPENAI_API_KEY ? 'openai' : 'say');
  process.env.MKT_VOICE_ENGINE = engine === 'say' ? 'say' : (process.env.MKT_VOICE_ENGINE || '');
  if (args.includes('--prepare')) {
    // 台本の文を先に声にする（撮る前に。撮るときに声の長さで間を取る）。撮るときも同じ MKT_VOICE_ENGINE を渡す
    if (engine !== 'openai' && engine !== 'say') { console.error('--prepare は OpenAI か Mac の say の声だけ。'); process.exit(1); }
    const bin = await findFfmpeg();
    const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--engine');
    const { SCENARIOS } = await import('./scenarios.mjs');
    const { REELS, END_LINE } = await import('./explainer/reels.mjs');
    const { explainerLines } = await import('./explainer/lines.mjs');
    const texts = new Set();
    for (const sc of SCENARIOS) if (!names.length || names.includes(sc.name)) {
      if (sc.title) texts.add(sc.title);
      for (const st of sc.steps || []) if (st.say) texts.add(st.say);
      texts.add(END_LINE);
    }
    for (const r of REELS) if (!names.length || names.includes(r.name)) for (const l of explainerLines(r)) texts.add(l);
    let n = 0;
    for (const t of texts) { const { len } = await synth(t, engine, bin); n += 1; console.log(`  ${len.toFixed(1)} 秒  ${spokenText(t)}`); }
    console.log(`✓ ${n} 文を作り置きしました（${CACHE_DIR}）。次に mkt:record・mkt:explainer で撮ると、声の長さで間を取ります。`);
    process.exit(0);
  }
  const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--engine');
  if (!target) { console.error('使い方: npm run mkt:voice -- <動画のフォルダ か 日付のフォルダ> [--engine openai|say]'); process.exit(1); }
  if (engine === 'openai' && !process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY がありません（シェルで渡す）。試すだけなら --engine say（Mac）。'); process.exit(1); }
  const bin = await findFfmpeg();
  if (!bin) { console.error('ffmpeg が見つかりません（mac は brew install ffmpeg）'); process.exit(1); }
  const dirs = existsSync(join(target, 'final.mp4')) ? [target] : readdirSync(target).map((n) => join(target, n)).filter((p) => statSync(p).isDirectory());
  console.log(`声: ${engine === 'openai' ? `OpenAI（${process.env.MKT_VOICE || 'onyx'}）` : engine === 'tone' ? '確かめ用の音' : `Mac の say（${sayVoice()}）`}`);
  for (const d of dirs) {
    try { await voiceOne(d, engine, bin); } catch (e) { console.log(`  ✗ ${basename(d)}: ${e.message}`); }
  }
}
