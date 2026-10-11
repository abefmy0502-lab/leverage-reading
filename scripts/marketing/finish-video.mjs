#!/usr/bin/env node
// 🎬 録画（raw.webm）を、SNS に出せる mp4 に仕上げる。
//
// record-demo.mjs が最後に呼ぶ（--no-finish のときは手で）:
//   node scripts/marketing/finish-video.mjs marketing-out/videos/2026-10-11/consult-answer
//
// やること:
//   - 頭の読み込み中（meta.json の trimStart）を切る（meta.cuts に [から, まで] を書けば途中も切れる・手で足すとき用）
//   - H.264 / 30fps / 1080×1920 / 無音の音声トラックつきの final.mp4（Instagram・TikTok・YouTube ショート・X で読める形）
//   - 字幕の captions.srt（final.mp4 の時間に合わせる）と、表紙用の cover.jpg（題が出ている 1 秒目）
// 字幕と題は録画の時点で画面に焼き込んである（--plain で録ったときだけ素の画面＝CapCut で字幕を付ける）。
//
// ffmpeg は 環境変数 FFMPEG → npm の ffmpeg-static → PATH の ffmpeg の順に探す。
// 見つからなければ、raw.webm に合わせた captions.srt だけ書き、CapCut での仕上げ方を表示する。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { toSrt, keepSegments, cutCues } from './srt.mjs';

export async function findFfmpeg() {
  const candidates = [];
  if (process.env.FFMPEG) candidates.push(process.env.FFMPEG);
  try {
    const mod = await import('ffmpeg-static');
    if (mod.default) candidates.push(mod.default);
  } catch { /* 入っていない */ }
  candidates.push('ffmpeg');
  for (const bin of candidates) {
    const r = spawnSync(bin, ['-hide_banner', '-version'], { encoding: 'utf8' });
    if (r.status === 0) return bin;
  }
  return null;
}

function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg が失敗しました: ${(r.stderr || '').split('\n').filter(Boolean).slice(-3).join(' / ')}`);
}

export async function finishVideo(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const raw = join(dir, 'raw.webm');
  if (!existsSync(raw)) throw new Error(`${raw} がありません`);
  const bin = await findFfmpeg();
  const cues = [...(meta.plain ? [{ start: meta.trimStart, end: meta.trimStart + meta.titleSec, text: meta.title }] : []), ...meta.cues];
  const duration = meta.duration || cues.reduce((m, c) => Math.max(m, c.end), 0);
  const segments = keepSegments(duration, [[0, meta.trimStart], ...(meta.cuts || [])]);
  if (!bin) {
    writeFileSync(join(dir, 'captions.srt'), toSrt(cues, 0));
    const mid = (meta.cuts || []).map(([a, b]) => `${a.toFixed(1)}〜${b.toFixed(1)} 秒`).join('・');
    console.log(`  ffmpeg が見つからないので mp4 は作りませんでした。captions.srt は raw.webm の時間に合わせてあります。
  CapCut で仕上げる: 新しいプロジェクト → raw.webm を読み込む → 「テキスト」→「字幕を読み込む」で captions.srt
  → 頭の ${meta.trimStart.toFixed(1)} 秒（読み込み中）${mid ? `と ${mid}（次の画面の読み込み）` : ''}を字幕ごと切る → 書き出し（1080p・30fps）。`);
    return null;
  }
  const out = join(dir, 'final.mp4');
  // 最後の区間は録画の終わりまで（重い場面があると録画の時間が台本の時計より少し長くなり、終わりで切ると最後の場面が欠ける）。
  const parts = segments.map(([a, b], i) => `[0:v]trim=start=${a.toFixed(3)}${i === segments.length - 1 ? '' : `:end=${b.toFixed(3)}`},setpts=PTS-STARTPTS[v${i}]`);
  const joined = `${segments.map((_, i) => `[v${i}]`).join('')}concat=n=${segments.length}:v=1:a=0[vc]`;
  const filter = `${parts.join(';')};${joined};[vc]scale=1080:1920:flags=lanczos,fps=30,format=yuv420p[v]`;
  run(bin, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', raw,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-filter_complex', filter,
    '-map', '[v]', '-map', '1:a', '-shortest',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out,
  ]);
  run(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', out, '-frames:v', '1', '-q:v', '3', join(dir, 'cover.jpg')]);
  writeFileSync(join(dir, 'captions.srt'), toSrt(cutCues(cues, segments), 0));
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) {
    console.error('使い方: node scripts/marketing/finish-video.mjs <録画のフォルダ>…');
    process.exit(1);
  }
  for (const d of dirs) {
    const out = await finishVideo(d);
    if (out) console.log(`✓ ${out}`);
  }
}
