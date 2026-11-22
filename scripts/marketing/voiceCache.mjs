// 🎙 声の作り置き（2026-11-22）: 先に声を作って長さを覚え、動画の間（ま）を声の長さに合わせる。
//   npm run mkt:voice -- --prepare [台本の名前…] → marketing-out/voice-cache/ に 1 文ずつの声と index.json（文 → 長さ）。
//   mkt:record（画面の動画）と mkt:explainer（概念の動画）は、index.json に長さがある文なら、その声が読み終わるまで次へ進まない。
//   mkt:voice は作り置きの声を使って重ねる（同じ文はもう一度作らない＝費用も声の揺れも出ない）。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const CACHE_DIR = process.env.MKT_VOICE_CACHE || join('marketing-out', 'voice-cache');
const INDEX = () => join(CACHE_DIR, 'index.json');

// 読み上げ用に整える（字幕の改行・矢印・英字の名前）
export function spokenText(text) {
  return String(text || '')
    .replace(/\n?↓\n?/g, '。')
    .replace(/\n/g, '')
    .replace(/Orime/g, 'オリメ')
    .replace(/App Store/g, 'アップストア')
    .replace(/。+/g, '。')
    .trim();
}

// 声の種類ごとに作り置きを分ける（MKT_VOICE_ENGINE=say のときは Mac の say の声）
// Mac の say の既定は日本語の男性の声（「Reed」だけだと英語の Reed になる）
export const SAY_VOICE_DEFAULT = 'Reed (日本語（日本）)';
export const sayVoice = () => process.env.MKT_SAY_VOICE || SAY_VOICE_DEFAULT;
export const voiceId = () => (process.env.MKT_VOICE_ENGINE === 'say'
  ? `say|${sayVoice()}`
  : `${process.env.MKT_VOICE || 'onyx'}|${process.env.MKT_VOICE_STYLE || ''}`);
export const keyOf = (text) => createHash('sha1').update(`${voiceId()}|${spokenText(text)}`).digest('hex').slice(0, 16);
export const clipPath = (text) => join(CACHE_DIR, `${keyOf(text)}.mp3`);

export function readIndex() {
  try { return JSON.parse(readFileSync(INDEX(), 'utf8')); } catch { return {}; }
}
export function writeIndex(idx) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(INDEX(), JSON.stringify(idx, null, 1));
}
// 作り置きの声の長さ（秒）。無ければ 0（＝今までどおりの間で撮る）。
export function voiceLength(text, idx = readIndex()) {
  if (!text) return 0;
  const k = keyOf(text);
  return idx[k]?.len && existsSync(join(CACHE_DIR, `${k}.mp3`)) ? idx[k].len : 0;
}
