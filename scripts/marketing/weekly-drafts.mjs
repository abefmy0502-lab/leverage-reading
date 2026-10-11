#!/usr/bin/env node
// ✍️ その週の投稿・動画の説明欄・note の下書きを作る（オーナーが直して、自分の手で投稿する＝自動では投稿しない）。
//
// 使い方:
//   npm run mkt:drafts                     → marketing-out/drafts/<日付>/ に prompt.md（いつも）と drafts.md（鍵があるとき）
//   npm run mkt:drafts -- --days 14        → 「新しくなったこと」を何日前までさかのぼるか（既定 7）
//   npm run mkt:drafts -- --dry            → 鍵があっても API を呼ばない（prompt.md だけ）
//   npm run mkt:drafts -- --check 文書.md   → 書いた文を言葉の決まりで確かめるだけ（API なし）
//
// 材料（読むだけ・どれも無ければ飛ばす）:
//   - src/lib/releaseNotes.js（その週の「新しくなったこと」）
//   - company/marketing-master-plan-2026-10.md（訴求の正）・company/brand-guardrails.md
//   - company/launch-2026-11/ の sns-playbook.md・x-posts.md・short-video-scripts.md（書き方の見本）
//   - scripts/marketing/scenarios.mjs（今週録った動画の題と柱）
//
// ANTHROPIC_API_KEY があるときだけ Claude API を呼ぶ（安いモデル・1 回およそ数円）。無ければ prompt.md を書き出すので、
// それを Claude Code（このリポジトリで `claude`）か claude.ai に貼れば同じ下書きができる＝0 円で回る。
// モデルは環境変数 MKT_MODEL で変えられる。出力は git 管理外（marketing-out/）。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SAMPLE_NOTE, BOOK_DISCLAIMER } from './notes.mjs';

const ROOT = process.cwd();
const read = (p, max = 6000) => {
  const f = join(ROOT, p);
  if (!existsSync(f)) return '';
  const t = readFileSync(f, 'utf8');
  return t.length > max ? `${t.slice(0, max)}\n…（以下略）` : t;
};

// 公開物で使わない言い方（master-plan §3・brand-guardrails・CLAUDE.md の GLOSSARY）。[正規表現, 理由]
export const BANNED = [
  [/著者と(話|対話|会話)|著者本人|著者が(答え|話)/, '「著者と話せる」とは言わない（「本の語り口で」まで）'],
  [/さんが(答え|話し|教え)/, '著者を主役にしない（「〇〇さんが答える」と書かない）'],
  [/必ず|絶対に|No\.?1|ナンバーワン|業界初|日本初/, '言い切り・最上級は使わない'],
  [/先着|通常価格|定価|早期割引|期間限定/, '二重価格・あおりの言葉は使わない'],
  [/忘れない|9割|9 割|3日で/, '立証できない数字・効果の言い切りは使わない'],
  [/AI\s?要約|要約アプリ/, '「AI 要約」とは言わない（メモから答える）'],
  [/マイ読書脳|アクション|タスク|ステータス|無料トライアル|お試し期間|クーポン|招待コード/, 'GLOSSARY の旧称・揺れ（相談・行動・状態・7 日間無料・オファーコード）'],
];

// 文を確かめる。見つかった行を [{ line, word, why }] で返す（コードブロックと引用の見本「使わない言葉」の行は除く）。
export function checkCopy(text) {
  const out = [];
  String(text || '').split('\n').forEach((line, i) => {
    if (/使わない|言わない|禁止/.test(line)) return; // 決まりを説明している行
    for (const [re, why] of BANNED) {
      const m = line.match(re);
      if (m) out.push({ line: i + 1, word: m[0], why });
    }
  });
  return out;
}

// releases（releaseNotes.js の RELEASES）から、today（'YYYY-MM-DD'）の days 日前より新しい項目だけを箇条書きに。
export function recentReleaseLines(releases, today, days = 7) {
  const from = new Date(`${today}T00:00:00+09:00`).getTime() - days * 86400000;
  const lines = [];
  for (const r of releases || []) {
    const d = new Date(`${String(r.date || r.id).slice(0, 10)}T00:00:00+09:00`).getTime();
    if (!(d >= from)) continue;
    for (const it of r.items || []) lines.push(`- [${r.date}] ${it.where}：${it.what} — ${it.after}（意図：${it.intent}）`);
  }
  return lines;
}

export function buildPrompt({ today, releaseLines, scenarios, plan, guard, playbook, xSample, videoSample }) {
  const system = `あなたは読書アプリ「Orime」の SNS 担当の下書き係です。オーナー（個人開発・顔と声は出さない）が直してから自分で投稿します。

# 守ること（破った下書きは使えません）
- 訴求の軸は「読書を、受け身から会話へ」。見出しは「読んだ本と、会話しよう。」。1 本の投稿で言う柱は 1 つだけ（本と会話・成果（行動）・習慣（集中モード）・発信（写真で共有）・客観視（記録の分野・AI 選書））。
- 「著者と話せる」「著者が答える」とは書かない。書けるのは「本の語り口で（AI が）答える」「本と会話する」まで。
- 実在の人（著者・有名人・利用者）の名前・声・顔・発言を作らない。利用者の声や数字を作らない。立証できない数字・効果の言い切り（必ず・No.1・忘れない・9 割）を書かない。
- 使う場は Instagram（リール・カルーセル）・Threads・X・note の 4 つだけ（TikTok・YouTube は使わない）。縦の動画はリールと X に出す。
- 画面はお試しモードの見本。画面を見せる投稿には「${SAMPLE_NOTE}」（動画は焼き込み済み・画像 1 枚の投稿は本文に「画面は見本です。」）。
- 本の表紙の画像（出版社・Amazon・楽天の画像）や著者の写真を使う案を出さない（アプリの画面の録画とアプリが作る画像だけ）。書名は文中に出してよいが、変えない・もじらない。実在の書名を出す投稿の最後には「${BOOK_DISCLAIMER}」。
- 著者の名前を主役にしない。「〇〇さんが答える」と書かない。本の文を長く写さない（1 投稿に 1 文・30 字くらいまで）。メモの例は自分の言葉の短いものだけ。
- AI のナレーションを使う案では、説明欄・本文の最後に「ナレーションは合成音声です」と書き、Instagram・Threads の AI 情報のラベルを付ける前提にする。
- 料金・無料の書き方は「無料プラン（ずっと無料）」「7 日間無料」だけ。「先着」「通常価格」「期間限定」は使わない。
- 協業・提供した相手の投稿には「PR」を最初に書いてもらう前提（ステマ規制）。こちらの投稿はアプリの運営者の投稿だと分かる書き方に。
- 言葉は「相談」「行動」「メモ」「積読」「思い出しカード」「書名」「状態」「分野」「トークン」（アクション・タスク・マイ読書脳・ステータス は使わない）。
- 下の材料（ユーザーデータではない社内資料）に書いてあることだけを使う。材料にない機能を作らない。

# 書き方
- 日本語・短く・煽らない・同じ目線。絵文字は 1 投稿 1 つまで。ハッシュタグは X は 0〜2、Instagram は 5〜8。
- 出力は Markdown。下の「出してほしいもの」の見出しをそのまま使う。`;

  const user = `今日は ${today}（日本時間）。この 1 週間の下書きを作ってください。

## 出してほしいもの
1. **## X（5 本）** — 1 本 140 字以内。柱を【】で頭に。うち 1 本は開発の物語（今週変わったこと）、うち 1 本は相談の実例（材料にある例だけ）。宣伝は 1 本まで。
2. **## Threads（2 本）** — X の価値の投稿の書き直し。問いかけで終える。
3. **## 縦の動画の説明欄** — 下の「今週の動画」1 本ごとに、Instagram リール（2〜3 行＋ハッシュタグ 5〜8）と X（本文 140 字以内・ハッシュタグ 0〜2）。説明の最後に「${BOOK_DISCLAIMER}」を入れる（X で入らなければ「返信の 1 本目に」と書く）。
4. **## AI のナレーション（任意）** — 動画 1 本ごとに 15 秒で読める 1 段落（1 秒 6〜7 字）。人の声をまねない、ふつうの合成音声で読む前提。
5. **## note（1 本の構成）** — 題の案 3 つ・見出し 5 つ・各見出しの要点 1 行。
6. **## 確かめること** — 投稿の前にオーナーが画面と見比べるべき点を 3〜5 個（画面は見本の注記・著者・出版社とは関係ない旨・表紙・著者名・本文の長さを含める）。

## 今週の動画（scripts/marketing/scenarios.mjs）
${scenarios.map((s) => `- ${s.name}（柱：${s.pillar || '—'}）題「${String(s.title || '').replace(/\n/g, '')}」 字幕：${(s.steps || []).filter((x) => x.say).map((x) => x.say).join(' / ')}`).join('\n')}

## この 1 週間に新しくなったこと（src/lib/releaseNotes.js）
${releaseLines.length ? releaseLines.join('\n') : '（この 1 週間はありません。開発の物語は前からある機能の作った理由で書く）'}

## 材料 1：訴求の正（company/marketing-master-plan-2026-10.md）
${plan}

## 材料 2：ブランドの決まり（company/brand-guardrails.md）
${guard}

## 材料 3：SNS の作戦（company/launch-2026-11/sns-playbook.md の頭）
${playbook}

## 材料 4：X の見本（company/launch-2026-11/x-posts.md の頭）
${xSample}

## 材料 5：動画の台本の見本（company/launch-2026-11/short-video-scripts.md の頭）
${videoSample}`;
  return { system, user };
}

async function callClaude({ system, user }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const model = process.env.MKT_MODEL || 'claude-haiku-5-5';
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') throw new Error('下書きを作れませんでした（断られました）。prompt.md を Claude Code に貼ってください。');
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return { text, usage: res.usage, model, truncated: res.stop_reason === 'max_tokens' };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('ANTHROPIC_API_KEY が違います。');
    if (e instanceof Anthropic.RateLimitError) throw new Error('API の回数の上限です。少し待ってからもう一度。');
    if (e instanceof Anthropic.APIError) throw new Error(`API のエラー（${e.status}）: ${e.message}`);
    throw e;
  }
}

function reportCheck(text, label) {
  const hits = checkCopy(text);
  if (!hits.length) { console.log(`✓ ${label}: 言葉の決まりに引っかかる行はありません`); return hits; }
  console.log(`⚠️ ${label}: 直してから使う行が ${hits.length} か所`);
  for (const h of hits) console.log(`  ${h.line} 行目「${h.word}」— ${h.why}`);
  return hits;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  if (opt('--check')) {
    const hits = reportCheck(readFileSync(opt('--check'), 'utf8'), opt('--check'));
    process.exit(hits.length ? 1 : 0);
  }
  const days = Number(opt('--days') || 7);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const outDir = opt('--out') || join('marketing-out', 'drafts', today);
  mkdirSync(outDir, { recursive: true });

  const { RELEASES } = await import(pathToFileURL(join(ROOT, 'src/lib/releaseNotes.js')).href);
  const { SCENARIOS } = await import(pathToFileURL(join(ROOT, 'scripts/marketing/scenarios.mjs')).href);
  const prompt = buildPrompt({
    today,
    releaseLines: recentReleaseLines(RELEASES, today, days),
    scenarios: SCENARIOS,
    plan: read('company/marketing-master-plan-2026-10.md', 9000),
    guard: read('company/brand-guardrails.md', 3000),
    playbook: read('company/launch-2026-11/sns-playbook.md', 3500),
    xSample: read('company/launch-2026-11/x-posts.md', 3000),
    videoSample: read('company/launch-2026-11/short-video-scripts.md', 3000),
  });
  const promptFile = join(outDir, 'prompt.md');
  writeFileSync(promptFile, `<!-- これを Claude Code か claude.ai に貼ると、drafts.md と同じ下書きができます -->\n\n# 指示\n\n${prompt.system}\n\n---\n\n${prompt.user}\n`);
  console.log(`✓ ${promptFile}`);

  if (args.includes('--dry') || !process.env.ANTHROPIC_API_KEY) {
    if (!args.includes('--dry')) console.log('  ANTHROPIC_API_KEY が無いので API は呼びません（0 円）。prompt.md を Claude Code に貼ってください。');
    return;
  }
  const { text, usage, model, truncated } = await callClaude(prompt);
  const file = join(outDir, 'drafts.md');
  writeFileSync(file, `<!-- 下書き（${today}・${model}）。オーナーが直してから自分で投稿する。自動では投稿しない。 -->\n\n${text}\n`);
  console.log(`✓ ${file}（入力 ${usage.input_tokens}・出力 ${usage.output_tokens} トークン）${truncated ? '  ⚠️ 途中で切れました' : ''}`);
  reportCheck(text, 'drafts.md');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
