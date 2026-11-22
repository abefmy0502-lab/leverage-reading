#!/usr/bin/env node
// 🔑 動画の声の鍵（OpenAI）を Mac のキーチェーンに入れる（2026-11-22・`security … -w` で 2 回貼る入れ方は見えないまま間違えた）。
//   npm run mkt:key
// 1 回だけ貼る（画面には出ない）→ 空白・改行・貼り付けの見えない印を取り除く → 形を確かめる → OpenAI で短い声を 1 回作って通るかを試す
// → 通ったときだけキーチェーン（サービス名 orime-openai-tts）に保存する。鍵の文字は画面にもファイルにも出さない。
import { spawnSync } from 'node:child_process';

const SERVICE = 'orime-openai-tts';

export function cleanKey(raw) {
  return String(raw || '')
    .replace(/\x1b\[20[01]~/g, '') // 貼り付けの印（bracketed paste）
    .replace(/[\s\u200b\u2060\ufeff]/g, ''); // 空白・改行・見えない文字
}
export function keyShapeProblem(key) {
  if (!key) return '何も貼られていません';
  if (!key.startsWith('sk-')) return '「sk-」で始まっていません（別の文字をコピーしていませんか）';
  if (key.length < 40) return `短すぎます（${key.length} 字）。途中で切れていませんか`;
  if (/[^\w-]/.test(key)) return '鍵に使われない文字が入っています（コピーの範囲を確かめる）';
  return null;
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) { reject(new Error('ターミナルで動かしてください')); return; }
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\u0003') { stdin.setRawMode(false); stdout.write('\n'); process.exit(130); }
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n');
          resolve(buf); return;
        }
        if (ch === '\u007f' || ch === '\b') { buf = buf.slice(0, -1); continue; }
        buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function tryKey(key) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'onyx', input: 'てすと', response_format: 'mp3' }),
  });
  if (res.ok) return null;
  let code = ''; let msg = '';
  try { const j = await res.json(); code = j?.error?.code || j?.error?.type || ''; msg = String(j?.error?.message || ''); } catch { /* 本文なし */ }
  if (/insufficient permissions|Missing scopes/i.test(msg)) return `鍵の権限が足りません（${res.status}）。OpenAI の API keys で、この鍵の Permissions を All に`;
  if (res.status === 401) return `OpenAI がこの鍵を受け付けません（401 ${code}）。取り消した鍵か、別の組織の鍵かもしれません。新しい鍵を作って、もう一度`;
  if (res.status === 429) return `残高か上限に届いています（429 ${code}）。OpenAI の Billing・Limits を確かめる`;
  return `OpenAI に断られました（${res.status} ${code}）`;
}

if (process.argv[1] && process.argv[1].endsWith('set-key.mjs')) {
  if (process.platform !== 'darwin') { console.error('Mac で動かしてください（キーチェーンに入れるため）'); process.exit(1); }
  console.log('OpenAI の鍵を、⌘V で 1 回だけ貼って Enter（画面には出ません）。');
  const key = cleanKey(await readHidden('鍵: '));
  const shape = keyShapeProblem(key);
  if (shape) { console.error(`✗ 保存しませんでした: ${shape}`); process.exit(1); }
  console.log(`形は合っています（${key.length} 字）。OpenAI で試しています…`);
  const bad = await tryKey(key);
  if (bad) { console.error(`✗ 保存しませんでした: ${bad}`); process.exit(1); }
  // 鍵を引数に出さない（ほかのプロセスから見えないように）: security -i に標準入力で渡す
  const quoted = key.replace(/(["\\])/g, '\\$1');
  const r = spawnSync('security', ['-i'], { input: `add-generic-password -U -a orime -s ${SERVICE} -w "${quoted}"\n`, encoding: 'utf8' });
  if (r.status !== 0) { console.error('✗ キーチェーンに保存できませんでした'); process.exit(1); }
  console.log('✓ 保存しました。次は npm run mkt:videos（7 本を声入りで作ります）');
}
