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
//   - company/sns-strategy-2026-11-22.md（SNS の正）・company/lp-axis-2026-11-15.md（芯）・company/sns-playbooks-2026-11.md（場ごとの勝ち筋）・company/brand-guardrails.md
//   - company/sns-prep/ の x-threads-week1.md・instagram-week1.md（いまの型の見本＝ビフォー → きっかけ → アフター）
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
  [/著者と(話|対話|会話)|著者本人(?!の言葉ではありません)|著者が(答え|話)/, '「著者と話せる」とは言わない（「本の語り口で」まで）'],
  [/さんが(答え|話し|教え)/, '著者を主役にしない（「〇〇さんが答える」と書かない）'],
  [/必ず|絶対に|No\.?1|ナンバーワン|業界初|日本初/, '言い切り・最上級は使わない'],
  [/先着|通常価格|定価|早期割引|期間限定/, '二重価格・あおりの言葉は使わない'],
  [/忘れない|9割|9 割|3日で/, '立証できない数字・効果の言い切りは使わない'],
  [/AI\s?要約|要約アプリ/, '「AI 要約」とは言わない（メモから答える）'],
  [/マイ読書脳|アクション|タスク|ステータス|無料トライアル|お試し期間|クーポン|招待コード/, 'GLOSSARY の旧称・揺れ（相談・行動・状態・7 日間無料・オファーコード）'],
];

// 投稿の形を確かめる（2026-11-10・company/sns-quality-guide-2026-11.md）。キットの Markdown の ``` の中を 1 本の投稿として読む。
//   - 1 行目のつかみ: 製品名・機能の知らせ（「orime の」「〜を入れました」）から始めない＝読む人の場面か意外な一言から
//   - X の文字数: X と同じ重み（漢字・かな・絵文字 2・URL 23）で 280 まで＝直前の見出しが「### X」か「P」で始まる投稿
//   - 決まり文句の連発: 同じ締めの 1 行（「読んで終わりにしない。」など）が 1 つの文書で 3 回以上
//   - Threads: 「### T」の投稿は問いで終わるものを半分以上（文書ぜんたいで数える）
// 最初の 1 文で見る（「〜が普通だと思う。だから入口を 4 つ作りました。」のように、読む人の話から始めて知らせに続く文は通す）
const HOOK_WEAK = [
  [/^(orime|オリメ)\s?(の|に|は|では|を)/, '1 行目が製品名から。読む人の場面か、意外な一言から始める'],
  [/^[^。]*(入れました|足しました|作りました|追加しました|できるようにしました)。?$/, '1 行目の最初の 1 文が機能の知らせ。知らせは 2 文目以降に回し、最初は読む人の話に'],
];
const SLOGANS = ['読んで終わりにしない', '読書を、受け身から会話へ', '読んだ本と、会話しよう', '読書が、受け身から会話に変わる'];
// AI っぽい文の定型（company/research/sns-quality-research-2026-11.md §6）。3〜4 個重なると「AI っぽい」と感じるので 1 つでも指す
// オーナーの決まり（2026-11-22）: 名前・「1 人で作った」の類（弱さを見せない）・「（オリメ）」の読みがなは書かない
const OWNER_NG = /阿部|一人で(作|開発)|1 人で(作|開発)|ひとりで(作|開発)|個人開発|（オリメ）|\(オリメ\)/;
const AI_TONE = [/することが重要です|が重要です。/, /いかがでしたか/, /ぜひ[^。]{0,12}てみてください/, /まず第一に|次に、|最後に、/, /探っていきましょう|見ていきましょう/, /と言われています/];
const X_WEIGHT_LIMIT = 280;
const CH_NAMES = { x: 'X', threads: 'Threads', instagram: 'Instagram', tiktok: 'TikTok' };
function xWeight(text) {
  const urlRe = /https?:\/\/[^\s]+/g;
  const urls = (text.match(urlRe) || []).length;
  let n = urls * 23;
  for (const ch of text.normalize('NFC').replace(urlRe, '')) {
    const c = ch.codePointAt(0);
    n += (c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2;
  }
  return n;
}
export function checkShape(text) {
  const out = [];
  const lines = String(text || '').split('\n');
  let heading = ''; let inBlock = false; let block = []; let blockStart = 0;
  const sloganCount = new Map();
  let threads = 0; let threadsAsk = 0;
  const channelCount = {};
  const xClosings = new Map(); let xPosts = 0; let xAsk = 0;
  const flush = (endLine) => {
    const body = block.join('\n').trim();
    if (!body) return;
    const firstLine = block.find((l) => l.trim())?.trim() || '';
    const ch = channelOf(heading);
    const isX = ch === 'x';
    const isThreads = ch === 'threads';
    const isPost = !!ch || /^(C\d|D\d|A\d)/.test(heading);
    if (isX && !/返信|スレッド/.test(heading)) { xPosts += 1; const ls = block.map((l) => l.trim()).filter(Boolean); const last = ls[ls.length - 1] || ''; if (ls.some((l) => /[？?]$/.test(l))) xAsk += 1; xClosings.set(last, (xClosings.get(last) || 0) + 1); }
    if (ch) { channelCount[ch] = (channelCount[ch] || 0) + 1; for (const h of channelRules(ch, heading, body)) out.push({ line: blockStart, ...h }); }
    if (!isPost && !/^#{2,3}\s/.test('## ' + heading)) return;
    const firstSentence = firstLine.split('。')[0] + (firstLine.includes('。') ? '。' : '');
    for (const [re, why] of HOOK_WEAK) { if (re.test(firstSentence) && isPost) { out.push({ line: blockStart, word: firstLine.slice(0, 24), why }); break; } }
    if (isX) { const w = xWeight(body); if (w > X_WEIGHT_LIMIT) out.push({ line: blockStart, word: `重み ${w}`, why: `X は重み ${X_WEIGHT_LIMIT} まで（日本語は 1 字で 2＝約 140 字）` }); }
    for (const sl of SLOGANS) if (body.includes(sl)) sloganCount.set(sl, (sloganCount.get(sl) || 0) + 1);
    if (isPost) { const m = body.match(OWNER_NG); if (m) out.push({ line: blockStart, word: m[0], why: '名前・「1 人で作った」の類・「（オリメ）」は書かない（オーナーの決まり）' }); }
    if (isPost) for (const re of AI_TONE) { const m = body.match(re); if (m) { out.push({ line: blockStart, word: m[0], why: 'AI っぽい文の定型。具体（数字・固有名詞・起きたこと）に置き換える' }); break; } }
    if (isThreads) { threads += 1; const last = block.filter((l) => l.trim()).pop() || ''; if (/[？?]\s*$/.test(last)) threadsAsk += 1; }
  };
  lines.forEach((line, i) => {
    const h = line.match(/^#{2,4}\s+(.*)$/); if (h && !inBlock) { heading = h[1].trim(); return; }
    if (/^```/.test(line)) { if (inBlock) { flush(i); block = []; inBlock = false; } else { inBlock = true; blockStart = i + 2; } return; }
    if (inBlock) block.push(line);
  });
  for (const [sl, n] of sloganCount) if (n >= 3) out.push({ line: 0, word: sl, why: `同じ締めの決まり文句が ${n} 回。投稿ごとに違う一言で締める（連発すると広告に見える）` });
  if (threads >= 4 && threadsAsk * 2 < threads) out.push({ line: 0, word: `Threads ${threadsAsk}/${threads}`, why: 'Threads は問いで終わる投稿を半分以上に（返信をもらう場）' });
  for (const [line, n] of xClosings) if (line && n >= 4) out.push({ line: 0, word: line.slice(0, 20), why: `X の締めの 1 行が ${n} 本で同じ。広告に見える＝2〜3 通りで回すか、問いで終えて入手の 1 行は返信へ` });
  if (xPosts >= 6 && xAsk * 3 < xPosts) out.push({ line: 0, word: `X の問い ${xAsk}/${xPosts}`, why: 'X は 3 本に 1 本は開いた問いを（返信は いいね の約 7 倍に数えられる）' });
  Object.defineProperty(out, 'channels', { value: channelCount, enumerable: false });
  return out;
}

// 場ごとの決まり（2026-11-23・company/sns-playbooks-2026-11.md §1〜§5）。見出しから場を決める。
//   x: 「X1 月」「X 承認前 1」「スレッド 1/5」「P02」／threads: 「T1」「Threads」／instagram: 「リール」「カルーセル」「IG」「Instagram」／tiktok: 「TikTok」「TT」
export function channelOf(heading) {
  const h = String(heading || '');
  if (/^(T\d|Threads)/.test(h)) return 'threads';
  if (/^(TikTok|TT\d)/i.test(h)) return 'tiktok';
  if (/^(IG|Instagram|リール|カルーセル|ストーリーズ)/.test(h)) return 'instagram';
  if (/^(X\d|X\s|X$|P\d|スレッド|\d\/\d)/.test(h)) return 'x';
  return '';
}
const URL_RE = /https?:\/\/\S+|\{APP_STORE_URL\}/;
const hashtags = (body) => (body.match(/(^|\s)#[^\s#]+/g) || []).length;
const emojis = (body) => (body.match(/\p{Extended_Pictographic}/gu) || []).length;
// 投稿の 1 本ごとの決まり。返す要素は { word, why }。
export function channelRules(ch, heading, body) {
  const out = [];
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = lines[0] || '';
  const isReply = /返信/.test(heading);
  const preLaunch = /承認前/.test(heading);
  const ph = body.match(/◯◯|〇〇|【[^】]*】/);
  if (ph) out.push({ word: ph[0], why: '伏せ字が残っている。実物（書名・一行・実数）に替えるまで予約しない' });
  if (emojis(body) > 1) out.push({ word: `絵文字 ${emojis(body)}`, why: '絵文字は 1 本に 1 つまで' });
  const bait = body.match(/いいねして|いいねお願い|RT\s?して|リポストして|拡散(して|希望|お願い)|フォローして|保存して(ね|ください)/);
  if (bait) out.push({ word: bait[0], why: '反応を頼む言葉は使わない（釣りに見え、ミュートや「興味がない」で大きく損をする）' });
  if (ch === 'x') {
    if (!isReply && URL_RE.test(body)) out.push({ word: 'リンク', why: 'X は本文にリンクを入れない（返信の 1 本目へ・外部リンクは表示が減りやすい）' });
    const tags = hashtags(body);
    if (tags > 1) out.push({ word: `ハッシュタグ ${tags}`, why: 'X のハッシュタグは 0〜1（月末の「#◯月読了本」だけ）' });
    if (xWeight(first) > 50) out.push({ word: first.slice(0, 14), why: '1 行目が長い（25 字まで）。最初の 1 行で止めてもらう' });
    if (!isReply && !preLaunch && !/スレッド [1-4]\//.test(heading) && !/返信に|リンクは返信|App Store|プロフィール/.test(body)) out.push({ word: '入手への道', why: '入手への 1 行が無い（「無料プラン（ずっと無料）で試せます。リンクは返信に。」など・承認前の投稿は除く）' });
  }
  if (ch === 'threads') {
    const n = [...body].length;
    if (n > 500) out.push({ word: `${n} 字`, why: 'Threads は 500 字まで（短い 2〜5 段のほうが会話になる）' });
    if (!isReply && URL_RE.test(body)) out.push({ word: 'リンク', why: 'Threads も本文にリンクを入れない（返信の 1 本目へ）' });
    if (hashtags(body) > 1) out.push({ word: `タグ ${hashtags(body)}`, why: 'Threads のトピックは 1 つだけ付けられる。1 つに絞る' });
  }
  if (ch === 'instagram') {
    const tags = hashtags(body);
    if (tags > 5) out.push({ word: `ハッシュタグ ${tags}`, why: 'Instagram は 5 個まで（2025-12 から上限）。関係する 3〜5 個に' });
    if (/^(orime|オリメ)/.test(first)) out.push({ word: first.slice(0, 14), why: '説明欄・1 枚目は製品名から始めない（場面か結果から）' });
    if (/リール/.test(heading) && !/秒/.test(heading + body)) out.push({ word: '長さ', why: 'リールの長さ（秒）を書く（15〜30 秒・字幕つき）' });
  }
  if (ch === 'tiktok') {
    const tags = hashtags(body);
    if (tags > 5) out.push({ word: `ハッシュタグ ${tags}`, why: 'TikTok の説明のハッシュタグは 3〜5 個' });
    if (!/orime/.test(body)) out.push({ word: '検索の言葉', why: 'リンクが使えないので「App Store で「orime」と検索」を説明か最後の字幕に' });
  }
  return out;
}

// note の下書き（company/weekly/note-<日付>.md）の決まり（sns-strategy §4-1・playbooks §5）
export function checkNote(text) {
  const out = [];
  const t = String(text || '').replace(/<!--[\s\S]*?-->/g, '');
  const title = (t.match(/^#\s+(.+)$/m) || [])[1] || '';
  const len = [...title].length;
  if (!title) out.push({ word: '題', why: '題（# で始まる 1 行）が無い' });
  else if (len > 25 || len < 12) out.push({ word: `題 ${len} 字`, why: '題は 15〜25 字くらい（検索と一覧で切れない長さ・体験か結果を入れる）' });
  const bodyLen = [...t.replace(/^#.*$/gm, '').replace(/\s/g, '')].length;
  if (bodyLen < 1800 || bodyLen > 4000) out.push({ word: `本文 ${bodyLen} 字`, why: '本文は 2,000〜3,500 字（1 記事 1 機能）' });
  const heads = (t.match(/^##\s/gm) || []).length;
  if (heads < 3 || heads > 6) out.push({ word: `見出し ${heads}`, why: '見出しは 3〜5 つ' });
  if (!/できないこと|できない|苦手|気をつけ/.test(t)) out.push({ word: 'できないこと', why: '「できないこと・気をつけること」を書く（信頼のため・言い過ぎない）' });
  if (!/ct=note_/.test(t)) out.push({ word: 'ct=note_', why: '最後のリンクに ct=note_<機能> を付ける（入手を測る）' });
  if (!/見出し画像|見出しの画像/.test(String(text || ''))) out.push({ word: '見出し画像', why: '見出し画像の指定を書く（有無で読まれ方が変わる・本文と関係のある画像）' });
  return out;
}

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
  const system = `あなたは読書アプリ「orime」の SNS 担当の下書き係です。オーナー（顔と声は出さない）が直してから自分で投稿します。

# 守ること（破った下書きは使えません）
- 芯は「読んだ本と、会話できる。答えのもとは、あなたが残したメモ。」（company/lp-axis-2026-11-15.md）。誰に＝とにかく成長したい人（入口 A 成長したい／B 読まなきゃ／C 読んでも残らない）。
- 1 本の型（company/sns-strategy-2026-11-22.md §3-2）：前の状態（ビフォー・1 行目・25 字まで）→ きっかけ（機能 1 つ）→ 後の状態（アフター・言い切らない）→ 入手への道の 1 行。機能の名前から始めない。1 本に機能 1 つ・変化 1 つ。
- 「著者と話せる」「著者が答える」とは書かない。書けるのは「本の語り口で（AI が）答える」「本と会話する」まで。
- 動画の台本の候補は、初めて orime を知る人にも分かる順にする: 困っていること → 「orime は、読んだ本のメモから答えてくれる読書アプリ」→ 使い方（ふつうの言葉）→「これからは、…」→「無料プランで、今日から試せます」。行動リスト・根拠・ロードマップ・区切りのようなアプリの中の言葉は使わない。
- オーナーの名前・「1 人で作った」「個人開発」のような言い方・「orime（オリメ）」の読みがなは書かない（orime とだけ書く）。
- 実在の人（著者・有名人・利用者）の名前・声・顔・発言を作らない。利用者の声や数字を作らない。立証できない数字・効果の言い切り（必ず・No.1・忘れない・9 割）を書かない。
- 使う場は X・Threads・Instagram（リール・カルーセル）・TikTok（リールと同じ動画）・note の 5 つ。場ごとの勝ち筋は company/sns-playbooks-2026-11.md（X は会話＝返信・引用・送信を起こす／Threads は問いと返信／Instagram は送信と保存／TikTok は 1 秒目のビフォー／note は 1 機能の深掘り）。
- 画面はお試しモードの見本。画面を見せる投稿には「${SAMPLE_NOTE}」（動画は焼き込み済み・画像 1 枚の投稿は本文に「画面は見本です。」）。
- 本の表紙の画像（出版社・Amazon・楽天の画像）や著者の写真を使う案を出さない（アプリの画面の録画とアプリが作る画像だけ）。書名は文中に出してよいが、変えない・もじらない。実在の書名を出す投稿の最後には「${BOOK_DISCLAIMER}」。
- 著者の名前を主役にしない。「〇〇さんが答える」と書かない。本の文を長く写さない（1 投稿に 1 文・30 字くらいまで）。メモの例は自分の言葉の短いものだけ。
- AI のナレーションを使う案では、説明欄・本文の最後に「ナレーションは合成音声です」と書き、Instagram・Threads の AI 情報のラベルを付ける前提にする。
- 料金・無料の書き方は「無料プラン（ずっと無料）」「7 日間無料」だけ。「先着」「通常価格」「期間限定」は使わない。
- 協業・提供した相手の投稿には「PR」を最初に書いてもらう前提（ステマ規制）。こちらの投稿はアプリの運営者の投稿だと分かる書き方に。
- 言葉は「相談」「行動」「メモ」「積読」「思い出しカード」「書名」「状態」「分野」「トークン」（アクション・タスク・マイ読書脳・ステータス は使わない）。
- 下の材料（ユーザーデータではない社内資料）に書いてあることだけを使う。材料にない機能を作らない。

# 書き方
- 日本語・短く・煽らない・同じ目線。絵文字は 1 投稿 1 つまで。ハッシュタグは X は 0〜1、Threads はトピック 1 つ、Instagram は 3〜5（上限 5）、TikTok は 3〜5。本文にリンクを入れない（返信の 1 本目・プロフィール）。「いいねして」「拡散希望」のような反応を頼む言葉は書かない。
- 出力は Markdown。下の「出してほしいもの」の見出しをそのまま使う。`;

  const user = `今日は ${today}（日本時間）。この 1 週間の下書きを作ってください。

## 出してほしいもの
1. **## X（5 本）** — 1 本 140 字以内。見出しに入口と機能を書く（本文の頭には書かない）。うち 1 本は開発の物語（今週変わったこと）、うち 1 本は相談の実例（材料にある例だけ）、うち 1 本は問いで終える。
2. **## Threads（2 本）** — X の価値の投稿の書き直し。問いかけで終える。
3. **## 縦の動画の説明欄** — 下の「今週の動画」1 本ごとに、Instagram リール（2〜3 行＋ハッシュタグ 3〜5）と X（本文 140 字以内・ハッシュタグ 0〜1）。説明の最後に「${BOOK_DISCLAIMER}」を入れる（X で入らなければ「返信の 1 本目に」と書く）。
4. **## AI のナレーション（任意）** — 動画 1 本ごとに 15 秒で読める 1 段落（1 秒 6〜7 字）。人の声をまねない、ふつうの合成音声で読む前提。
5. **## note（1 本の構成）** — 題の案 3 つ・見出し 5 つ・各見出しの要点 1 行。
6. **## 確かめること** — 投稿の前にオーナーが画面と見比べるべき点を 3〜5 個（画面は見本の注記・著者・出版社とは関係ない旨・表紙・著者名・本文の長さを含める）。

## 今週の動画（scripts/marketing/scenarios.mjs）
${scenarios.map((s) => `- ${s.name}（柱：${s.pillar || '—'}）題「${String(s.title || '').replace(/\n/g, '')}」 字幕：${(s.steps || []).filter((x) => x.say).map((x) => x.say).join(' / ')}`).join('\n')}

## この 1 週間に新しくなったこと（src/lib/releaseNotes.js）
${releaseLines.length ? releaseLines.join('\n') : '（この 1 週間はありません。開発の物語は前からある機能の作った理由で書く）'}

## 材料 1：SNS の正（company/sns-strategy-2026-11-22.md）と芯（company/lp-axis-2026-11-15.md）
${plan}

## 材料 2：ブランドの決まり（company/brand-guardrails.md）
${guard}

## 材料 3：場ごとの勝ち筋（company/sns-playbooks-2026-11.md の頭）
${playbook}

## 材料 4：X・Threads の見本（company/sns-prep/x-threads-week1.md の頭）
${xSample}

## 材料 5：リール・カルーセルの見本（company/sns-prep/instagram-week1.md の頭）
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
  if (!hits.length) console.log(`✓ ${label}: 言葉の決まりに引っかかる行はありません`);
  else { console.log(`⚠️ ${label}: 直してから使う行が ${hits.length} か所`); for (const h of hits) console.log(`  ${h.line} 行目「${h.word}」— ${h.why}`); }
  // 形（つかみ・X の重み・決まり文句の連発・Threads の問い）は注意として出す（止めない＝判断はオーナー）
  const shape = /(^|\/)note-[^/]*\.md$/.test(label) ? checkNote(text) : checkShape(text);
  const counted = Object.entries(shape.channels || {}).map(([k, v]) => `${CH_NAMES[k] || k} ${v} 本`).join('・');
  if (counted) console.log(`  確かめた投稿: ${counted}`);
  if (shape.length) { console.log(`ℹ️ ${label}: 形で見直したい所が ${shape.length} か所（company/sns-quality-guide-2026-11.md）`); for (const h of shape) console.log(`  ${h.line ? h.line + ' 行目' : '全体'}「${h.word}」— ${h.why}`); }
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
    plan: `${read('company/sns-strategy-2026-11-22.md', 9000)}\n\n${read('company/lp-axis-2026-11-15.md', 3000)}`,
    guard: read('company/brand-guardrails.md', 3000),
    playbook: read('company/sns-playbooks-2026-11.md', 6000),
    xSample: read('company/sns-prep/x-threads-week1.md', 5000),
    videoSample: read('company/sns-prep/instagram-week1.md', 4000),
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
