// 🔌 AI と連携（MCP）の本体（2026-11-07 オーナー「アプリと AI が繋がるようにしたい」「痒いところに手が届くレベルで」）。
//
// Orime を MCP（Model Context Protocol）のサーバーにして、利用者が Claude・ChatGPT・Claude Code などの AI から
// 自分の本・メモ・行動を呼べるようにする。HTTP の入口は api/mcp.js。ここは HTTP に依存しない純粋な部分
//（JSON-RPC の振り分け・道具・プロンプト・資料・会話の中に描く画面）で、テスト（api/_mcp.test.js）は偽の DB で動かす。
//
// 決まり:
//   - 読めるのは本人のものだけ（接続キーで本人を決め、すべての問い合わせに user_id を付ける・service_role で読む）。
//   - 書けるのは 足す（メモ・行動・本）・直す（メモ）・完了にする（行動）まで。消す・本の状態を変えるはアプリで。
//   - 相談（AI の答え）はここから呼ばない＝Orime のトークンは使わない。AI 側が材料として読むだけ。
//   - 文字は制御文字を除き、長さを切る（src/lib/limits.js と同じ上限）。
//   - 返すのは 文字（Markdown 風・AI が読む）＋ structuredContent（会話の中に描く画面＝api/_mcpWidget.js が読む）。
//     利用者 id は返さない。本・メモ・行動の id は返す（次の道具で使う）。
//   - 一覧は offset で続きを取れる（limit は 50 まで）。
import { createHash } from 'node:crypto';
import { WIDGET_URI_MCP, WIDGET_URI_OPENAI, WIDGET_MIME_MCP, WIDGET_MIME_OPENAI, widgetHtml } from './_mcpWidget.js';
import { launchGates } from './_launchHealth.js';
import { textLength } from './_social.js';

export const PROTOCOL_VERSION = '2025-06-18';
export const SERVER_INFO = { name: 'orime', version: '1.1.0' };
export const TOKEN_PREFIX = 'orime_mcp_';
const MEMO_TEXT_MAX = 5000;
const ACTION_TEXT_MAX = 500;
const TITLE_MAX = 200;
const AUTHOR_MAX = 100;
const QUERY_MAX = 200;
const LIMIT_MAX = 50;
const STATUS_LABEL = { want: '読みたい', before: '積読', reading: '読書中', done: '読了' };
const STATUS_KEYS = Object.keys(STATUS_LABEL);
const BOOK_COLS = 'id, title, author, status, rating, cover, start_date, done_date, updated_at, book_tags(tag_name)';

export function sha256Hex(s) {
  return createHash('sha256').update(String(s), 'utf8').digest('hex');
}

export function looksLikeToken(t) {
  return typeof t === 'string' && t.startsWith(TOKEN_PREFIX) && /^[A-Za-z0-9_-]{32,80}$/.test(t.slice(TOKEN_PREFIX.length));
}

function clean(text, max) {
  if (typeof text !== 'string') return '';
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').replace(/[​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, max);
}
function limitOf(v, dflt = 20) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(LIMIT_MAX, Math.floor(n));
}
function offsetOf(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(5000, Math.floor(n)) : 0;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const dateOnly = (iso) => (typeof iso === 'string' ? iso.slice(0, 10) : '');
const likeSafe = (w) => w.replace(/[%_,()]/g, ' ');
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

class ToolError extends Error {}

// ---------- 道具の一覧（AI に見せる説明は日本語＋英語の 1 行） ----------
const uiMeta = { ui: { resourceUri: WIDGET_URI_MCP }, 'openai/outputTemplate': WIDGET_URI_OPENAI, 'openai/widgetAccessible': false, 'openai/toolInvocation/invoking': 'Orime を読んでいます', 'openai/toolInvocation/invoked': 'Orime から取りました' };
const pageProps = (dflt) => ({ limit: { type: 'integer', minimum: 1, maximum: LIMIT_MAX, default: dflt }, offset: { type: 'integer', minimum: 0, default: 0, description: '続きを取るときの開始位置' } });

export const TOOLS = [
  {
    name: 'list_books',
    description: '本棚の本を一覧する（状態・分野・言葉で絞れる）。List the user\'s books, optionally filtered by status (want/before/reading/done), field (分野) or a keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: STATUS_KEYS, description: 'want=読みたい / before=積読 / reading=読書中 / done=読了' },
        field: { type: 'string', description: '分野の名前（例: マーケティング・習慣・小説・物語）' },
        query: { type: 'string', description: '書名・著者に含まれる言葉' },
        ...pageProps(20),
      },
    },
    _meta: uiMeta,
  },
  {
    name: 'get_book',
    description: '1 冊の本の詳細（読書準備・メモ・この本のまとめ・行動・読書の時間）を読む。Get one book with its memos, summary, reading plan, actions and reading time.',
    inputSchema: { type: 'object', properties: { book_id: { type: 'string', description: 'list_books で得た id' } }, required: ['book_id'] },
    _meta: uiMeta,
  },
  {
    name: 'search_memos',
    description: '自分のメモを言葉やタグで探す（本を横断）。Search the user\'s own memos by keywords (space-separated words are ANDed) and/or a tag.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '探す言葉（空白で区切ると全部を含むメモ）' },
        tag: { type: 'string', description: 'メモのタグ（任意）' },
        book_id: { type: 'string', description: 'この本の中だけで探す（任意）' },
        ...pageProps(20),
      },
    },
    _meta: uiMeta,
  },
  {
    name: 'recent_memos',
    description: '最近書いたメモを新しい順に読む。Read the most recent memos (newest first).',
    inputSchema: { type: 'object', properties: { ...pageProps(20), days: { type: 'integer', minimum: 1, maximum: 3660, description: 'この日数以内（任意）' } } },
    _meta: uiMeta,
  },
  {
    name: 'list_actions',
    description: '行動（読んで決めたやること）を一覧する。List the user\'s actions (to-dos decided from reading), open ones by default.',
    inputSchema: { type: 'object', properties: { done: { type: 'boolean', description: 'true=完了した行動 / false（既定）=まだの行動' }, ...pageProps(30) } },
    _meta: uiMeta,
  },
  {
    name: 'reading_stats',
    description: '読書の記録（本・メモ・行動の数と、集中モードで測った読書の時間＝今週・今月・これまで・本ごと）。Reading stats: counts and measured reading time.',
    inputSchema: { type: 'object', properties: {} },
    _meta: uiMeta,
  },
  {
    name: 'add_memo',
    description: '本にメモを足す（本の id が無ければ、本に紐づかない学びのメモ）。Add a memo to a book (or a personal learning memo without a book).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: `メモの本文（${MEMO_TEXT_MAX} 字まで）` },
        book_id: { type: 'string', description: '本の id（任意）' },
        page_number: { type: 'integer', minimum: 0, description: 'ページ番号（任意）' },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 10, description: 'メモのタグ（任意）' },
      },
      required: ['text'],
    },
  },
  {
    name: 'update_memo',
    description: '自分のメモの本文・ページ番号・タグを直す（本人のメモだけ）。Update a memo\'s text, page number or tags.',
    inputSchema: {
      type: 'object',
      properties: {
        memo_id: { type: 'string', description: 'メモの id（search_memos などの memo_id）' },
        text: { type: 'string', description: '新しい本文（任意）' },
        page_number: { type: 'integer', minimum: 0, description: '新しいページ番号（任意）' },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 10, description: '新しいタグ（任意・全部を置き換える）' },
      },
      required: ['memo_id'],
    },
  },
  {
    name: 'add_action',
    description: '本から決めた行動を足す。Add an action (to-do) tied to a book, with an optional deadline (YYYY-MM-DD).',
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: '本の id' },
        text: { type: 'string', description: `行動（${ACTION_TEXT_MAX} 字まで）` },
        deadline: { type: 'string', description: '期限 YYYY-MM-DD（任意）' },
      },
      required: ['book_id', 'text'],
    },
  },
  {
    name: 'complete_action',
    description: '行動を完了にする（ふりかえりを添えられる）。Mark an action as done, optionally with a short reflection.',
    inputSchema: {
      type: 'object',
      properties: {
        action_id: { type: 'string', description: '行動の id（list_actions の action_id）' },
        reflection: { type: 'string', description: 'やってみてどうだったか（任意・500 字まで）' },
      },
      required: ['action_id'],
    },
  },
  {
    name: 'ops_dashboard',
    description: '（運営者だけ）Orime の運営の数字をまとめて読む: 利用者数・会員・売上と粗利の材料・ローンチの 4 つの数字・目標・週ごとの数字・更新の見込み・開いているフィードバックとチケット・やること・公開の準備。Admin only: one snapshot of operations metrics.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ops_feedback',
    description: '（運営者だけ）利用者からのフィードバックを読む・状態を変える。action=list（status で絞る）/ update（id と status: open・in_progress・resolved・wont_fix、note）。Admin only: list or triage user feedback.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'update'], description: 'list か update' },
        status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'wont_fix'], description: 'list: この状態だけ／update: 新しい状態' },
        id: { type: 'string', description: 'update: フィードバックの id' },
        note: { type: 'string', description: 'update: 運営のメモ（任意・2,000 字まで）' },
      },
      required: ['action'],
    },
  },
  {
    name: 'ops_tickets',
    description: '（運営者だけ）運営の作業チケット（bug・feature・task）を読む・作る・進める。action=list（status で絞る）/ create（title・body・kind・priority 1〜3）/ update（id・status: open・in_progress・done・wont_fix・priority）。Admin only.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'update'] },
        status: { type: 'string', enum: ['open', 'in_progress', 'done', 'wont_fix'] },
        id: { type: 'string' },
        title: { type: 'string', description: 'create: 題（200 字まで）' },
        body: { type: 'string', description: 'create: 中身（任意・4,000 字まで）' },
        kind: { type: 'string', enum: ['bug', 'feature', 'task'] },
        priority: { type: 'integer', minimum: 1, maximum: 3, description: '1=高・2=中・3=低' },
      },
      required: ['action'],
    },
  },
  {
    name: 'ops_tasks',
    description: '（運営者だけ）運営者のやること（日付つき）を読む・足す・進める。担当 assignee=claude のやることは Claude Code が自動で取りに来て進める（担当 me は自分がやる）。action=list（include_done・assignee・status）/ add（title・due_date YYYY-MM-DD・dept・assignee）/ update（id・status: todo・doing・done・blocked・result・title・due_date・dept・assignee）/ claim（担当 claude の todo を 1 つ doing にして返す）/ done（id・done・result）/ delete（id）。Admin only: the operator\'s dated to-do list; assignee=claude tasks are picked up by Claude Code.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'update', 'claim', 'done', 'delete'] },
        id: { type: 'string' },
        title: { type: 'string', description: 'add / update: やること（200 字まで・Claude に任せるなら、何をどうしたいかを具体的に）' },
        due_date: { type: 'string', description: '期日 YYYY-MM-DD（add の省略は今日・日本時間）' },
        dept: { type: 'string', description: '区分（例: 経営・マーケ・開発・経理・任意）' },
        assignee: { type: 'string', enum: ['me', 'claude'], description: 'me＝自分／claude＝Claude Code が自動で進める' },
        status: { type: 'string', enum: ['todo', 'doing', 'done', 'blocked'], description: 'update: 状態' },
        result: { type: 'string', description: 'update / done: 結果（何をしたか・コミット・止まった理由・4,000 字まで）' },
        done: { type: 'boolean', description: 'done: false で未完了に戻す' },
        include_done: { type: 'boolean', description: 'list: 完了も含める' },
      },
      required: ['action'],
    },
  },
  {
    name: 'ops_image',
    description: '（運営者だけ）投稿の画像を作る（ChatGPT と同じ画像の仕組み gpt-image-1）。公開の置き場に置いて URL を返す。size=1024x1024（正方形）/ 1024x1536（縦）/ 1536x1024（横）・quality=low/medium/high。1 枚 約 ¥6〜25。Admin only: generate a post image and return its public URL.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '画像の指示（4,000 字まで・日本語でよい・文字を入れるなら短く）' },
        size: { type: 'string', enum: ['1024x1024', '1024x1536', '1536x1024'] },
        quality: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'ops_post',
    description: '（運営者だけ）SNS の投稿の予定を読む・入れる・直す・取り消す・出す。platform=x / threads / instagram。action=list（status）/ add（platform・text・image_url・scheduled_at ISO＝省略は今すぐの予定）/ update（id・text・image_url・scheduled_at）/ cancel（id）/ now（platform・text・image_url＝いますぐ出す）/ flush（時刻の来た予定を出す・自動のセッションが毎時呼ぶ）/ status（鍵がそろっている送り先）。Admin only: schedule and publish social posts.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'update', 'cancel', 'now', 'flush', 'status'] },
        id: { type: 'string' },
        platform: { type: 'string', enum: ['x', 'threads', 'instagram'] },
        text: { type: 'string', description: '本文（X 280・Threads 500・Instagram 2,200 字まで）' },
        image_url: { type: 'string', description: 'ops_image が返した URL（Instagram は必須）' },
        scheduled_at: { type: 'string', description: '出す時刻（ISO 8601・例 2026-11-10T21:00:00+09:00）' },
        status: { type: 'string', enum: ['scheduled', 'posted', 'failed', 'canceled'], description: 'list: この状態だけ' },
      },
      required: ['action'],
    },
  },
  {
    name: 'ops_goal',
    description: '（運営者だけ）有料ユーザーの目標（人数・期限・道しるべ・公開日）を読む・決め直す。action=get / set（target・deadline YYYY-MM-DD・milestones・launch_date）。Admin only.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set'] },
        target: { type: 'integer', minimum: 0 },
        deadline: { type: 'string', description: 'YYYY-MM-DD' },
        launch_date: { type: 'string', description: 'YYYY-MM-DD（任意）' },
        milestones: { type: 'array', description: '道しるべ（24 個まで・{date, paid, label} など自由）', items: { type: 'object' } },
      },
      required: ['action'],
    },
  },
  {
    name: 'ops_week',
    description: '（運営者だけ）週の記録を残す。action=review（毎週の見直し: week_start・numbers・actions・weakest・memo）/ sales（手入力の週の数字: new_paid・installs・lp_clicks・note_pv・x_profile_clicks・store_page_views・memo）。同じ週は上書き。Admin only.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['review', 'sales'] },
        week_start: { type: 'string', description: 'その週の月曜 YYYY-MM-DD（省略は今週）' },
        numbers: { type: 'object', description: 'review: 見直した数字（自由な形）' },
        actions: { type: 'array', description: 'review: 来週やること（文字列の配列）', items: { type: 'string' } },
        weakest: { type: 'string', description: 'review: いちばん弱い段階（40 字まで）' },
        memo: { type: 'string', description: 'メモ（review 1,000 字・sales 500 字まで）' },
        new_paid: { type: 'integer' }, installs: { type: 'integer' }, lp_clicks: { type: 'integer' }, note_pv: { type: 'integer' }, x_profile_clicks: { type: 'integer' }, store_page_views: { type: 'integer' },
      },
      required: ['action'],
    },
  },
  {
    name: 'add_book',
    description: '書名（と著者）から本を探して本棚に足す。既定は積読。Search a book by title (and author) and add it to the shelf (default status: before=積読).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '書名（著者名も続けて書くと見つけやすい）' },
        author: { type: 'string', description: '著者（任意）' },
        status: { type: 'string', enum: STATUS_KEYS, description: '入れる状態（既定 before=積読）' },
        reason: { type: 'string', description: 'この本を選んだ理由（任意・読書準備に入る）' },
      },
      required: ['title'],
    },
  },
];

// ---------- プロンプト（AI の会話に入れる決まった型） ----------
export const PROMPTS = [
  { name: 'consult', title: '自分のメモに相談する', description: 'Orime のメモを根拠に、いまの悩みに答えてもらう', arguments: [{ name: 'question', description: '相談したいこと', required: true }] },
  { name: 'book_review', title: '1 冊を振り返る', description: '1 冊のメモから、いちばん効いた主張・明日から変えること・反論を整理する', arguments: [{ name: 'book_title', description: '書名（一部でよい）', required: true }] },
  { name: 'weekly_actions', title: '今週の行動を決める', description: 'まだの行動と最近のメモから、今週やる 3 つを決める', arguments: [] },
  { name: 'reading_report', title: '読書の記録をまとめる', description: '読書の時間・メモ・行動の数から、最近の読書を短くまとめる', arguments: [] },
  { name: 'save_conversation', title: 'この会話を Orime に残す', description: 'いまの会話の結論・根拠にした本・次の一歩を、Orime のメモと行動に残す（本人が頼んだときだけ書く）', arguments: [{ name: 'note', description: '添えたい一言（任意）', required: false }] },
];

function promptText(name, args = {}) {
  const q = clean(args.question, 1000);
  const t = clean(args.book_title, TITLE_MAX);
  switch (name) {
    case 'consult':
      return `Orime の search_memos と recent_memos で、次の相談に関係する自分のメモを探してから答えてください。答えは「結論」→「根拠にしたメモ（『書名』p.N と本文の引用・言い換えない）」→「明日からできる一歩を 1 つ」の順に。メモに無いことは「メモにはありません」と言ってください。\n\n相談: ${q || '（ここに相談を書く）'}`;
    case 'book_review':
      return `Orime の list_books で『${t || '（書名）'}』を探し、get_book でメモと読書準備を読んでください。そのうえで「いちばん効いた主張」「明日から何を変えるか」「あえて反論するなら」を、メモの引用を根拠に 1 つずつ書いてください。最後に、行動にするなら add_action で足せることを伝えてください。`;
    case 'weekly_actions':
      return 'Orime の list_actions（まだの行動）と recent_memos（最近 14 日）を読んで、今週やる行動を 3 つに絞ってください。期限が近いもの・メモで何度も触れていることを優先し、それぞれ「なぜ今週か」を 1 行で。決まったら add_action か complete_action で反映してよいか聞いてください。';
    case 'save_conversation': {
      const extra = clean(args.note, 500);
      return `この会話の中身を Orime に残してください。手順:
1. 会話を読み返し、「結論（3 行まで・本人の言葉を活かす）」「根拠にした本と一節（『書名』p.N があれば）」「次の一歩（1 つ・できれば期限）」を書き出し、保存する前に本人に見せて確かめる。
2. 本が特定できれば list_books でその book_id を探し、add_memo に book_id を付けて結論と根拠を 1 件のメモとして足す（本文の頭に「Claude との相談：」）。本が無ければ book_id なしで足す（本なしの学び）。
3. 次の一歩があり、本人がよいと言えば add_action で足す（本の id は 2 と同じ・期限は YYYY-MM-DD）。
4. 保存した memo_id / action_id を伝える。書き直したいときは update_memo で直せると添える。
会話に無いことは書かない。順位やバッジの言い方はしない。${extra ? `

本人の一言: ${extra}` : ''}`;
    }
    case 'reading_report':
      return 'Orime の reading_stats と recent_memos（最近 30 日）を読んで、最近の読書を 5 行でまとめてください。数字は reading_stats のものだけを使い、順位やバッジのような言い方はしないでください。最後に、いちばん心に残っていそうなメモを 1 つ引用してください。';
    default:
      return null;
  }
}

// ---------- 資料（AI が自分で読める） ----------
export const RESOURCES = [
  { uri: 'orime://books', name: '本棚', title: '本棚の一覧', description: '本棚の本（状態・評価・分野）', mimeType: 'text/markdown' },
  { uri: 'orime://memos/recent', name: '最近のメモ', title: '最近のメモ 30 件', description: '新しい順のメモ', mimeType: 'text/markdown' },
  { uri: 'orime://actions', name: '行動', title: 'まだの行動', description: '未完了の行動', mimeType: 'text/markdown' },
  { uri: WIDGET_URI_MCP, name: 'orime-cards', title: 'Orime のカード', description: '会話の中に描く本・メモ・行動のカード（MCP Apps）', mimeType: WIDGET_MIME_MCP },
  { uri: WIDGET_URI_OPENAI, name: 'orime-cards-openai', title: 'Orime のカード', description: '会話の中に描く本・メモ・行動のカード（ChatGPT）', mimeType: WIDGET_MIME_OPENAI },
];
export const RESOURCE_TEMPLATES = [
  { uriTemplate: 'orime://books/{book_id}', name: '1 冊の本', description: '本の詳細（メモ・読書準備・行動）', mimeType: 'text/markdown' },
];

// ---------- DB（service_role・いつも user_id で絞る） ----------
async function run(q) {
  const { data, error } = await q;
  if (error) throw new ToolError(error.message || 'db error');
  return data || [];
}

const fieldsOf = (row) => (Array.isArray(row.book_tags) ? row.book_tags.map((t) => t?.tag_name).filter(Boolean) : []);
const bookOut = (b) => ({ id: b.id, title: b.title || '（無題）', author: b.author || '', status: b.status, rating: b.rating || 0, cover: typeof b.cover === 'string' && /^https:/.test(b.cover) ? b.cover : '', start_date: dateOnly(b.start_date), done_date: dateOnly(b.done_date), fields: fieldsOf(b) });
const memoOut = (m, title) => ({ id: m.id, book_id: m.book_id || null, book_title: title || '', text: String(m.text || ''), page_number: m.page_number ?? null, tags: Array.isArray(m.tags) ? m.tags : [], created_at: m.created_at || '' });
const actionOut = (a, title) => ({ id: a.id, book_id: a.book_id || null, book_title: title || '', text: a.text || '', deadline: dateOnly(a.deadline) || null, done: !!a.done, completed_at: a.completed_at || null, reflection: a.reflection || '' });

function bookLine(b) {
  const meta = [STATUS_LABEL[b.status] || b.status];
  if (b.rating) meta.push(`★${b.rating}`);
  if (b.done_date) meta.push(`読了 ${b.done_date}`);
  else if (b.start_date) meta.push(`開始 ${b.start_date}`);
  if (b.fields.length) meta.push(`分野: ${b.fields.join('・')}`);
  return `- ${b.title}${b.author ? `／${b.author}` : ''}（${meta.join(' · ')}）\n  book_id: ${b.id}`;
}
function memoLine(m, { withBook = true } = {}) {
  const head = [withBook ? (m.book_title ? `『${m.book_title}』` : '（本なし）') : '', m.page_number != null ? `p.${m.page_number}` : '', dateOnly(m.created_at)].filter(Boolean).join(' · ');
  const tags = m.tags.length ? `\n  タグ: ${m.tags.join('・')}` : '';
  return `- ${head}\n  ${m.text.trim().replace(/\n/g, '\n  ')}${tags}\n  memo_id: ${m.id}`;
}
const actionLine = (a) => `- [${a.done ? 'x' : ' '}] ${a.text}${a.deadline ? `（期限 ${a.deadline}）` : ''}${a.book_title ? ` — 『${a.book_title}』` : ''}${a.reflection ? `\n  ふりかえり: ${a.reflection}` : ''}\n  action_id: ${a.id}`;
const moreLine = (more, offset, n) => (more > 0 ? `\n（ほかに ${more} 件。offset=${offset + n} で続き）` : '');

async function ownBook(db, userId, bookId) {
  if (!isUuid(bookId)) throw new ToolError('book_id の形が違います（list_books の book_id を使ってください）');
  const rows = await run(db.from('books').select('id, title, author, status').eq('user_id', userId).eq('id', bookId).limit(1));
  if (!rows.length) throw new ToolError('その id の本は本棚にありません');
  return rows[0];
}
async function titleMap(db, userId, ids) {
  const uniq = [...new Set(ids.filter(isUuid))];
  if (!uniq.length) return new Map();
  const rows = await run(db.from('books').select('id, title').eq('user_id', userId).in('id', uniq));
  return new Map(rows.map((r) => [r.id, r.title]));
}
// 1 件多く取って「続きがあるか」を知る（count の往復を増やさない）。
async function page(q, limit) {
  const rows = await run(q.limit(limit + 1));
  return { rows: rows.slice(0, limit), more: rows.length > limit ? 1 : 0 };
}

function fmtMin(sec) {
  const m = Math.round((sec || 0) / 60);
  if (m < 60) return `${m} 分`;
  return `${Math.floor(m / 60)} 時間 ${m % 60} 分`;
}
function jstDayStart(now) {
  const t = new Date(now + 9 * 3600000);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - 9 * 3600000;
}

// 運営の指示（admin_act_for）。管理者でなければ「運営者だけ」。
async function opsAct({ db, userId }, action, args) {
  const { data, error } = await db.rpc('admin_act_for', { p_user_id: userId, p_action: action, p_args: args || {} });
  if (error) {
    if (/not authorized/i.test(error.message || '')) throw new ToolError('この道具は運営者だけが使えます');
    if (/could not find|does not exist|PGRST202|42883/i.test(`${error.code || ''} ${error.message || ''}`)) throw new ToolError('運営の道具の準備がまだです（supabase_admin_mcp.sql を流してください）');
    if (/invalid status|invalid kind|invalid platform|unknown action|invalid input/i.test(error.message || '')) throw new ToolError('値の形が違います（status / kind / platform / 日付を確かめてください）');
    throw new ToolError('運営の操作ができませんでした');
  }
  return data;
}
function needId(id) { if (!isUuid(id)) throw new ToolError('id の形が違います'); }

const handlers = {
  async list_books({ status, field, query, limit, offset }, { db, userId }) {
    const lim = limitOf(limit, 20); const off = offsetOf(offset);
    let q = db.from('books').select(BOOK_COLS).eq('user_id', userId).order('updated_at', { ascending: false });
    if (status && STATUS_KEYS.includes(status)) q = q.eq('status', status);
    const word = clean(query, QUERY_MAX);
    if (word) q = q.or(`title.ilike.%${likeSafe(word)}%,author.ilike.%${likeSafe(word)}%`);
    const f = clean(field, 30);
    if (f) {
      const tagRows = await run(db.from('book_tags').select('book_id').eq('user_id', userId).eq('tag_name', f));
      const ids = [...new Set(tagRows.map((r) => r.book_id).filter(isUuid))];
      if (!ids.length) return { text: `分野「${f}」の本はありません。`, structuredContent: { books: [] } };
      q = q.in('id', ids);
    }
    const { rows, more } = await page(q.range(off, off + lim), lim);
    const books = rows.map(bookOut);
    if (!books.length) return { text: '本が見つかりませんでした。', structuredContent: { books: [] } };
    return { text: `本 ${books.length} 冊\n${books.map(bookLine).join('\n')}${moreLine(more, off, lim)}`, structuredContent: { books, more } };
  },

  async get_book({ book_id }, { db, userId }) {
    if (!isUuid(book_id)) throw new ToolError('book_id の形が違います（list_books の book_id を使ってください）');
    const rows = await run(db.from('books').select(`${BOOK_COLS}, invest_purpose, current_challenge, hypothesis, book_reason, leverage_memo`).eq('user_id', userId).eq('id', book_id).limit(1));
    if (!rows.length) throw new ToolError('その id の本は本棚にありません');
    const raw = rows[0];
    const b = bookOut(raw);
    const memos = (await run(db.from('book_memos').select('id, book_id, text, page_number, tags, created_at').eq('user_id', userId).eq('book_id', b.id).order('created_at', { ascending: true }).limit(200))).map((m) => memoOut(m, b.title));
    const actions = (await run(db.from('actions').select('id, book_id, text, deadline, done, completed_at, reflection').eq('user_id', userId).eq('book_id', b.id).order('created_at', { ascending: true }).limit(100))).map((a) => actionOut(a, b.title));
    let readingSec = 0;
    try { readingSec = (await run(db.from('reading_sessions').select('seconds').eq('user_id', userId).eq('book_id', b.id).limit(1000))).reduce((s, r) => s + (Number(r.seconds) || 0), 0); } catch { readingSec = 0; }
    const out = [bookLine(b)];
    if (readingSec >= 60) out.push(`読書の時間: ${fmtMin(readingSec)}`);
    const prep = [['得たいこと', raw.invest_purpose], ['課題', raw.current_challenge], ['仮説', raw.hypothesis], ['選んだ理由', raw.book_reason]].filter(([, v]) => v && String(v).trim());
    if (prep.length) out.push('\n## 読書準備', ...prep.map(([k, v]) => `- ${k}: ${clean(String(v), 2000)}`));
    if (raw.leverage_memo && String(raw.leverage_memo).trim()) out.push('\n## この本のまとめ', clean(String(raw.leverage_memo), 8000));
    out.push(`\n## メモ（${memos.length} 件）`, memos.length ? memos.map((m) => memoLine(m, { withBook: false })).join('\n') : '（まだありません）');
    if (actions.length) out.push(`\n## 行動（${actions.length} 件）`, actions.map(actionLine).join('\n'));
    return { text: out.join('\n'), structuredContent: { book: b, memos, actions, reading_seconds: readingSec, prep: Object.fromEntries(prep.map(([k, v]) => [k, clean(String(v), 2000)])) } };
  },

  async search_memos({ query, tag, book_id, limit, offset }, { db, userId }) {
    const lim = limitOf(limit, 20); const off = offsetOf(offset);
    const words = clean(query, QUERY_MAX).split(/\s+/).filter(Boolean).slice(0, 5);
    const t = clean(tag, 30);
    if (!words.length && !t) throw new ToolError('query（探す言葉）か tag を入れてください');
    let q = db.from('book_memos').select('id, book_id, text, page_number, tags, created_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (book_id) { if (!isUuid(book_id)) throw new ToolError('book_id の形が違います'); q = q.eq('book_id', book_id); }
    for (const w of words) q = q.ilike('text', `%${likeSafe(w)}%`);
    if (t) q = q.contains('tags', [t]);
    const { rows, more } = await page(q.range(off, off + lim), lim);
    const label = [words.join(' '), t ? `タグ: ${t}` : ''].filter(Boolean).join(' · ');
    if (!rows.length) return { text: `「${label}」に合うメモはありませんでした。`, structuredContent: { memos: [] } };
    const titles = await titleMap(db, userId, rows.map((r) => r.book_id));
    const memos = rows.map((m) => memoOut(m, titles.get(m.book_id)));
    return { text: `メモ ${memos.length} 件（「${label}」）\n${memos.map((m) => memoLine(m)).join('\n')}${moreLine(more, off, lim)}`, structuredContent: { memos, more } };
  },

  async recent_memos({ limit, offset, days }, { db, userId }) {
    const lim = limitOf(limit, 20); const off = offsetOf(offset);
    let q = db.from('book_memos').select('id, book_id, text, page_number, tags, created_at').eq('user_id', userId).order('created_at', { ascending: false });
    const d = Number(days);
    if (Number.isFinite(d) && d > 0) q = q.gte('created_at', new Date(Date.now() - Math.min(3660, d) * 86400000).toISOString());
    const { rows, more } = await page(q.range(off, off + lim), lim);
    if (!rows.length) return { text: 'メモはまだありません。', structuredContent: { memos: [] } };
    const titles = await titleMap(db, userId, rows.map((r) => r.book_id));
    const memos = rows.map((m) => memoOut(m, titles.get(m.book_id)));
    return { text: `最近のメモ ${memos.length} 件\n${memos.map((m) => memoLine(m)).join('\n')}${moreLine(more, off, lim)}`, structuredContent: { memos, more } };
  },

  async list_actions({ done, limit, offset }, { db, userId }) {
    const lim = limitOf(limit, 30); const off = offsetOf(offset);
    const wantDone = done === true;
    const q = db.from('actions').select('id, book_id, text, deadline, done, completed_at, reflection').eq('user_id', userId).eq('done', wantDone).order(wantDone ? 'completed_at' : 'deadline', { ascending: !wantDone, nullsFirst: false });
    const { rows, more } = await page(q.range(off, off + lim), lim);
    if (!rows.length) return { text: wantDone ? '完了した行動はまだありません。' : 'まだの行動はありません。', structuredContent: { actions: [] } };
    const titles = await titleMap(db, userId, rows.map((r) => r.book_id));
    const actions = rows.map((a) => actionOut(a, titles.get(a.book_id)));
    return { text: `${wantDone ? '完了した行動' : 'まだの行動'} ${actions.length} 件\n${actions.map(actionLine).join('\n')}${moreLine(more, off, lim)}`, structuredContent: { actions, more } };
  },

  async reading_stats(_args, { db, userId, now = Date.now() }) {
    const books = await run(db.from('books').select('id, title, status').eq('user_id', userId).limit(2000));
    const memoRows = await run(db.from('book_memos').select('id').eq('user_id', userId).limit(5000));
    const actionRows = await run(db.from('actions').select('id, done').eq('user_id', userId).limit(5000));
    let sessions = [];
    try { sessions = await run(db.from('reading_sessions').select('book_id, started_at, seconds').eq('user_id', userId).order('started_at', { ascending: false }).limit(2000)); } catch { sessions = []; }
    const day0 = jstDayStart(now);
    const jst = new Date(now + 9 * 3600000);
    const weekStart = day0 - ((jst.getUTCDay() + 6) % 7) * 86400000; // 月曜
    const monthStart = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - 9 * 3600000;
    let week = 0; let month = 0; let total = 0; const perBook = new Map();
    for (const s of sessions) {
      const t = Date.parse(s.started_at); const sec = Number(s.seconds) || 0;
      total += sec; if (t >= weekStart) week += sec; if (t >= monthStart) month += sec;
      perBook.set(s.book_id, (perBook.get(s.book_id) || 0) + sec);
    }
    const titles = new Map(books.map((b) => [b.id, b.title]));
    const byBook = [...perBook.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, sec]) => ({ book_id: id, title: titles.get(id) || '（消した本）', seconds: sec, label: fmtMin(sec) }));
    const counts = { books: books.length, done: books.filter((b) => b.status === 'done').length, reading: books.filter((b) => b.status === 'reading').length, memos: memoRows.length, actions_open: actionRows.filter((a) => !a.done).length, actions_done: actionRows.filter((a) => a.done).length };
    const stats = { ...counts, this_week_seconds: week, this_month_seconds: month, total_seconds: total, this_week_label: fmtMin(week), this_month_label: fmtMin(month), total_label: fmtMin(total), books: byBook };
    const lines = [
      `本 ${counts.books} 冊（読了 ${counts.done}・読書中 ${counts.reading}）・メモ ${counts.memos} 件・行動 まだ ${counts.actions_open} / 完了 ${counts.actions_done}`,
      sessions.length ? `読書の時間: 今週 ${stats.this_week_label}・今月 ${stats.this_month_label}・これまで ${stats.total_label}` : '読書の時間: 記録はまだありません（アプリの「読む」で測ると貯まります）',
      ...(byBook.length ? ['本ごと:', ...byBook.map((b) => `- ${b.title}: ${b.label}`)] : []),
    ];
    return { text: lines.join('\n'), structuredContent: { stats } };
  },

  async add_memo({ text, book_id, page_number, tags }, { db, userId }) {
    const body = clean(text, MEMO_TEXT_MAX);
    if (!body) throw new ToolError('text（メモの本文）を入れてください');
    let book = null;
    if (book_id) book = await ownBook(db, userId, book_id);
    const pageN = Number.isInteger(page_number) && page_number >= 0 ? page_number : null;
    const tagList = Array.isArray(tags) ? tags.map((t) => clean(String(t), 30)).filter(Boolean).slice(0, 10) : [];
    const row = { user_id: userId, book_id: book ? book.id : null, text: body, page_number: pageN, tags: tagList, photo_path: null, source_type: book ? 'book' : 'personal' };
    const rows = await run(db.from('book_memos').insert([row]).select('id'));
    const id = rows[0]?.id || '';
    return { text: `メモを足しました${book ? `（『${book.title}』）` : '（本なし）'}。memo_id: ${id}`, structuredContent: { message: `メモを足しました${book ? `（『${book.title}』）` : ''}`, memo_id: id } };
  },

  async update_memo({ memo_id, text, page_number, tags }, { db, userId }) {
    if (!isUuid(memo_id)) throw new ToolError('memo_id の形が違います');
    const patch = {};
    if (text !== undefined) { const body = clean(text, MEMO_TEXT_MAX); if (!body) throw new ToolError('text が空です'); patch.text = body; }
    if (page_number !== undefined) patch.page_number = Number.isInteger(page_number) && page_number >= 0 ? page_number : null;
    if (tags !== undefined) patch.tags = Array.isArray(tags) ? tags.map((t) => clean(String(t), 30)).filter(Boolean).slice(0, 10) : [];
    if (!Object.keys(patch).length) throw new ToolError('直すもの（text / page_number / tags）を 1 つは入れてください');
    const rows = await run(db.from('book_memos').update(patch).eq('user_id', userId).eq('id', memo_id).select('id'));
    if (!rows.length) throw new ToolError('その id のメモはありません');
    return { text: `メモを直しました。memo_id: ${memo_id}`, structuredContent: { message: 'メモを直しました', memo_id } };
  },

  async add_action({ book_id, text, deadline }, { db, userId }) {
    const body = clean(text, ACTION_TEXT_MAX);
    if (!body) throw new ToolError('text（行動）を入れてください');
    const book = await ownBook(db, userId, book_id);
    const dl = isDate(deadline) ? deadline : null;
    const rows = await run(db.from('actions').insert([{ user_id: userId, book_id: book.id, text: body, deadline: dl, done: false }]).select('id'));
    const id = rows[0]?.id || '';
    return { text: `行動を足しました（『${book.title}』${dl ? `・期限 ${dl}` : ''}）。action_id: ${id}`, structuredContent: { message: `行動を足しました（『${book.title}』）`, action_id: id } };
  },

  async complete_action({ action_id, reflection }, { db, userId, now = Date.now() }) {
    if (!isUuid(action_id)) throw new ToolError('action_id の形が違います');
    const patch = { done: true, completed_at: new Date(now).toISOString() };
    const r = clean(reflection, ACTION_TEXT_MAX);
    if (r) patch.reflection = r;
    let rows;
    try { rows = await run(db.from('actions').update(patch).eq('user_id', userId).eq('id', action_id).select('id, text')); }
    catch { rows = await run(db.from('actions').update({ done: true }).eq('user_id', userId).eq('id', action_id).select('id, text')); } // completed_at の列が無い DB
    if (!rows.length) throw new ToolError('その id の行動はありません');
    return { text: `「${rows[0].text}」を完了にしました。`, structuredContent: { message: `「${rows[0].text}」を完了にしました`, action_id } };
  },

  // 運営ダッシュボード（アーティファクト）が「Orime」コネクタで 1 回呼ぶ。管理者だけ（supabase_admin_mcp.sql の admin_snapshot_for）。
  async ops_dashboard(_args, { db, userId }) {
    const { data, error } = await db.rpc('admin_snapshot_for', { p_user_id: userId });
    if (error) {
      if (/not authorized/i.test(error.message || '')) throw new ToolError('この道具は運営者だけが使えます');
      if (/could not find|does not exist|PGRST202|42883/i.test(`${error.code || ''} ${error.message || ''}`)) throw new ToolError('運営の数字を読む準備がまだです（supabase_admin_mcp.sql を流してください）');
      throw new ToolError('運営の数字を読めませんでした');
    }
    const o = data?.overview || {};
    const p = data?.profit?.paid || {};
    const text = [
      `利用者 ${o.users_total ?? '?'} 人（7 日で +${o.new_users_7d ?? '?'}・30 日で +${o.new_users_30d ?? '?'}）・MAU ${o.mau ?? '?'}・WAU ${o.wau ?? '?'}・DAU ${o.dau ?? '?'}`,
      `契約: 月額 ${p.monthly ?? '?'}・年額 ${p.annual ?? '?'}・創業メンバー ${p.founding ?? '?'}・無料期間 ${p.trial ?? '?'}`,
      `本 ${o.books_total ?? '?'} 冊・メモ ${o.memos_total ?? '?'} 件・行動 ${o.actions_total ?? '?'}（完了 ${o.actions_done ?? '?'}）・未対応のフィードバック ${o.feedback_open ?? '?'}`,
      `開いているフィードバック ${Array.isArray(data?.feedback) ? data.feedback.length : '?'} 件・開いているチケット ${Array.isArray(data?.tickets) ? data.tickets.length : '?'} 件・やること ${Array.isArray(data?.tasks) ? data.tasks.filter((t) => !t.done).length : '?'} 件`,
      '（くわしい数字は structuredContent に: overview / revenue / growth / launch / goal / weekly / profit / profit_series / renewals / active_series / feedback / tickets / tasks / weekly_reviews / sales_metrics / launch_gates）',
    ];
    const gates = await launchGates(db);
    return { text: text.join('\n'), structuredContent: { ...(data || {}), launch_gates: gates } };
  },

  // ── 指示を受ける（運営者だけ・supabase_admin_mcp.sql の admin_act_for）────────────────────────────
  async ops_feedback(args, ctx) {
    const { action } = args || {};
    if (action === 'list') { const rows = await opsAct(ctx, 'feedback_list', { status: args.status || null }); return { text: rows.length ? `フィードバック ${rows.length} 件` : 'フィードバックはありません', structuredContent: { feedback: rows } }; }
    if (action === 'update') { needId(args.id); await opsAct(ctx, 'feedback_update', { id: args.id, status: args.status || null, note: clean(args.note, 2000) || null }); return { text: 'フィードバックを更新しました', structuredContent: { ok: true, id: args.id } }; }
    throw new ToolError('action は list か update');
  },
  async ops_tickets(args, ctx) {
    const { action } = args || {};
    if (action === 'list') { const rows = await opsAct(ctx, 'ticket_list', { status: args.status || null }); return { text: rows.length ? `チケット ${rows.length} 件` : 'チケットはありません', structuredContent: { tickets: rows } }; }
    if (action === 'create') { const title = clean(args.title, 200); if (!title) throw new ToolError('title（題）を入れてください'); const r = await opsAct(ctx, 'ticket_create', { title, body: clean(args.body, 4000) || null, kind: args.kind || 'task', priority: args.priority ?? 2 }); return { text: `チケット「${title}」を作りました`, structuredContent: r }; }
    if (action === 'update') { needId(args.id); await opsAct(ctx, 'ticket_update', { id: args.id, status: args.status || null, priority: args.priority ?? null }); return { text: 'チケットを更新しました', structuredContent: { ok: true, id: args.id } }; }
    throw new ToolError('action は list・create・update のどれか');
  },
  async ops_tasks(args, ctx) {
    const { action } = args || {};
    const ASSIGNEES = ['me', 'claude']; const STATUSES = ['todo', 'doing', 'done', 'blocked'];
    if (args?.assignee && !ASSIGNEES.includes(args.assignee)) throw new ToolError('assignee は me か claude');
    if (args?.status && !STATUSES.includes(args.status)) throw new ToolError('status は todo・doing・done・blocked のどれか');
    if (args?.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(args.due_date)) throw new ToolError('due_date は YYYY-MM-DD');
    if (action === 'list') { const rows = await opsAct(ctx, 'task_list', { include_done: !!args.include_done, assignee: args.assignee || null, status: args.status || null }); return { text: rows.length ? `やること ${rows.length} 件` : 'やることはありません', structuredContent: { tasks: rows } }; }
    if (action === 'add') { const title = clean(args.title, 200); if (!title) throw new ToolError('title（やること）を入れてください'); const r = await opsAct(ctx, 'task_add', { title, due_date: args.due_date || null, dept: clean(args.dept, 40) || null, assignee: args.assignee || 'me' }); return { text: `「${title}」を足しました${args.assignee === 'claude' ? '（Claude Code が次の回に取りに来ます）' : ''}`, structuredContent: r }; }
    if (action === 'update') { needId(args.id); const r = await opsAct(ctx, 'task_update', { id: args.id, status: args.status || null, result: clean(args.result, 4000) || null, title: clean(args.title, 200) || null, due_date: args.due_date || null, dept: clean(args.dept, 40) || null, assignee: args.assignee || null }); return { text: r?.ok ? 'やることを更新しました' : 'その id のやることはありません', structuredContent: r }; }
    if (action === 'claim') { const r = await opsAct(ctx, 'task_claim', {}); return r && r.id ? { text: `取りかかります: 「${r.title}」（期日 ${r.due_date}）`, structuredContent: { task: r } } : { text: 'Claude に任せたやることは、いまありません', structuredContent: { task: null } }; }
    if (action === 'done') { needId(args.id); const r = await opsAct(ctx, 'task_done', { id: args.id, done: args.done !== false, result: clean(args.result, 4000) || null }); return { text: args.done === false ? '未完了に戻しました' : '完了にしました', structuredContent: r }; }
    if (action === 'delete') { needId(args.id); const r = await opsAct(ctx, 'task_delete', { id: args.id }); return { text: '消しました', structuredContent: r }; }
    throw new ToolError('action は list・add・update・claim・done・delete のどれか');
  },
  async ops_image(args, ctx) {
    const prompt = clean(args?.prompt, 4000); if (!prompt) throw new ToolError('prompt（画像の指示）を入れてください');
    const social = ctx.social; if (!social?.makeImage) throw new ToolError('画像の仕組みがこのサーバーにありません');
    // 管理者かどうかは admin_act_for の goal_get で確かめる（画像の原価を利用者に使わせない）
    await opsAct(ctx, 'goal_get', {});
    try {
      const r = await social.makeImage({ prompt, size: args.size, quality: args.quality, userId: ctx.userId }, { storage: social.storage });
      return { text: r.url ? `画像を作りました: ${r.url}` : '画像は作れましたが、置き場（ops-media）に置けませんでした', structuredContent: { url: r.url, path: r.path || null, revised_prompt: r.revised_prompt || null } };
    } catch (e) { throw new ToolError(e?.message || '画像を作れませんでした'); }
  },
  async ops_post(args, ctx) {
    const { action } = args || {};
    const PLATFORMS = ['x', 'threads', 'instagram']; const LIMIT = { x: 280, threads: 500, instagram: 2200 };
    const social = ctx.social;
    const checkPost = (platform, text, imageUrl) => {
      if (!PLATFORMS.includes(platform)) throw new ToolError('platform は x・threads・instagram のどれか');
      const t = clean(text, 4000); if (!t) throw new ToolError('text（本文）を入れてください');
      // X は重みで数える（漢字・かな・絵文字は 1 字で 2・URL は 23＝日本語なら約 140 字・api/_social.js の xWeightedLength）
      const len = textLength(platform, t);
      if (len > LIMIT[platform]) throw new ToolError(platform === 'x' ? `X の本文は重み 280 まで（日本語は 1 字で 2・URL は 23。いま ${len}）` : `${platform} の本文は ${LIMIT[platform]} 字まで（いま ${len} 字）`);
      if (imageUrl && !/^https:\/\//.test(imageUrl)) throw new ToolError('image_url は https の URL');
      if (platform === 'instagram' && !imageUrl) throw new ToolError('Instagram は image_url が要ります（ops_image で作ってから）');
      return t;
    };
    const needSocial = () => { if (!social?.postTo) throw new ToolError('投稿の仕組みがこのサーバーにありません'); };
    // やり直すのは予定の時刻から 6 時間まで（それを過ぎたら failed にして止める＝429 が続いても永久に打ち直さない・2026-11-09）
    const RETRY_WINDOW_MS = 6 * 3600000;
    const publish = async (row) => {
      try {
        const r = await social.postTo(row.platform, { text: row.text, imageUrl: row.image_url || null });
        await opsAct(ctx, 'post_update', { id: row.id, status: 'posted', posted_id: String(r.id), posted_url: r.url || null });
        return { id: row.id, platform: row.platform, ok: true, url: r.url || null };
      } catch (e) {
        const since = Date.now() - (Date.parse(row.scheduled_at || '') || Date.now());
        const retry = !!e?.retryable && since < RETRY_WINDOW_MS;
        const msg = String(e?.message || e);
        await opsAct(ctx, 'post_update', { id: row.id, status: retry ? 'scheduled' : 'failed', error: (retry ? msg : (e?.retryable ? '6 時間やり直しても出せませんでした: ' + msg : msg)).slice(0, 1000) });
        return { id: row.id, platform: row.platform, ok: false, error: msg.slice(0, 300), retry };
      }
    };
    if (action === 'status') { await opsAct(ctx, 'goal_get', {}); const c = social?.configured ? social.configured() : {}; return { text: `鍵: X ${c.x ? 'あり' : 'なし'}・Threads ${c.threads ? 'あり' : 'なし'}・Instagram ${c.instagram ? 'あり' : 'なし'}・画像 ${c.image ? 'あり' : 'なし'}`, structuredContent: { configured: c } }; }
    if (action === 'list') { const rows = await opsAct(ctx, 'post_list', { status: args.status || null }); return { text: rows.length ? `投稿の予定・記録 ${rows.length} 件` : '投稿の予定はありません', structuredContent: { posts: rows } }; }
    if (action === 'add') {
      const t = checkPost(args.platform, args.text, args.image_url);
      if (args.scheduled_at && Number.isNaN(Date.parse(args.scheduled_at))) throw new ToolError('scheduled_at は ISO 8601（例 2026-11-10T21:00:00+09:00）');
      const r = await opsAct(ctx, 'post_add', { platform: args.platform, text: t, image_url: args.image_url || null, scheduled_at: args.scheduled_at || null });
      return { text: `${args.platform} の投稿を予定に入れました（${args.scheduled_at || 'いますぐの予定・次の回に出ます'}）`, structuredContent: r };
    }
    if (action === 'update') { needId(args.id); if (args.scheduled_at && Number.isNaN(Date.parse(args.scheduled_at))) throw new ToolError('scheduled_at は ISO 8601'); const r = await opsAct(ctx, 'post_update', { id: args.id, text: clean(args.text, 4000) || null, image_url: args.image_url || null, scheduled_at: args.scheduled_at || null }); return { text: '投稿の予定を直しました', structuredContent: r }; }
    if (action === 'cancel') { needId(args.id); const r = await opsAct(ctx, 'post_update', { id: args.id, status: 'canceled' }); return { text: '投稿の予定を取り消しました', structuredContent: r }; }
    if (action === 'now') {
      needSocial();
      const t = checkPost(args.platform, args.text, args.image_url);
      const at = new Date().toISOString();
      const added = await opsAct(ctx, 'post_add', { platform: args.platform, text: t, image_url: args.image_url || null, scheduled_at: at });
      const r = await publish({ id: added.id, platform: args.platform, text: t, image_url: args.image_url || null, scheduled_at: at });
      return { text: r.ok ? `${args.platform} に出しました${r.url ? ': ' + r.url : ''}` : `${args.platform} に出せませんでした: ${r.error}`, structuredContent: r };
    }
    if (action === 'flush') {
      needSocial();
      const dueAll = await opsAct(ctx, 'post_due', {});
      // 鍵の無い送り先の予定は出さずに待たせる（failed にしない＝鍵が入った回に出る・2026-11-09）
      const conf = social.configured ? social.configured() : {};
      const waiting = dueAll.filter((row) => conf[row.platform] === false);
      const due = dueAll.filter((row) => conf[row.platform] !== false);
      // 送り先ごとに並べて送る（同じ送り先は順に・別の送り先は同時＝5 件でも 1 回の呼び出しに収まる）
      const byPlatform = new Map(); for (const row of due) { if (!byPlatform.has(row.platform)) byPlatform.set(row.platform, []); byPlatform.get(row.platform).push(row); }
      const results = (await Promise.all([...byPlatform.values()].map(async (rows) => { const out = []; for (const row of rows) out.push(await publish(row)); return out; }))).flat();
      const ok = results.filter((r) => r.ok).length;
      const waitText = waiting.length ? `・鍵の無い送り先の ${waiting.length} 件は待たせています（${[...new Set(waiting.map((r) => r.platform))].join('・')}）` : '';
      return { text: (due.length ? `時刻の来た投稿 ${due.length} 件のうち ${ok} 件を出しました` : '出す時刻の来た投稿はありません') + waitText, structuredContent: { results, waiting: waiting.map((r) => ({ id: r.id, platform: r.platform })) } };
    }
    throw new ToolError('action は list・add・update・cancel・now・flush・status のどれか');
  },
  async ops_goal(args, ctx) {
    const { action } = args || {};
    if (action === 'get') { const g = await opsAct(ctx, 'goal_get', {}); return { text: g ? `目標 有料 ${g.target ?? '?'} 人・期限 ${g.deadline ?? '?'}` : '目標はまだありません', structuredContent: { goal: g } }; }
    if (action === 'set') {
      if (!Number.isFinite(Number(args.target))) throw new ToolError('target（人数）を入れてください');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args.deadline || '')) throw new ToolError('deadline は YYYY-MM-DD');
      await opsAct(ctx, 'goal_set', { target: Number(args.target), deadline: args.deadline, milestones: Array.isArray(args.milestones) ? args.milestones.slice(0, 24) : null, launch_date: args.launch_date || null });
      return { text: `目標を 有料 ${Number(args.target)} 人・期限 ${args.deadline} にしました`, structuredContent: { ok: true } };
    }
    throw new ToolError('action は get か set');
  },
  async ops_week(args, ctx) {
    const { action } = args || {};
    if (args?.week_start && !/^\d{4}-\d{2}-\d{2}$/.test(args.week_start)) throw new ToolError('week_start は YYYY-MM-DD');
    if (action === 'review') { const r = await opsAct(ctx, 'week_review_save', { week_start: args.week_start || null, numbers: args.numbers && typeof args.numbers === 'object' ? args.numbers : {}, actions: Array.isArray(args.actions) ? args.actions.map((x) => clean(String(x), 200)).filter(Boolean).slice(0, 20) : [], weakest: clean(args.weakest, 40) || null, memo: clean(args.memo, 1000) || null }); return { text: `今週の見直しを残しました（${r?.week_start || ''} の週）`, structuredContent: r }; }
    if (action === 'sales') { const n = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null); const r = await opsAct(ctx, 'sales_week_save', { week_start: args.week_start || null, new_paid: n(args.new_paid), installs: n(args.installs), lp_clicks: n(args.lp_clicks), note_pv: n(args.note_pv), x_profile_clicks: n(args.x_profile_clicks), store_page_views: n(args.store_page_views), memo: clean(args.memo, 500) || null }); return { text: `週の数字を残しました（${r?.week_start || ''} の週）`, structuredContent: r }; }
    throw new ToolError('action は review か sales');
  },

  async add_book({ title, author, status, reason }, { db, userId, searchBooks }) {
    const t = clean(title, TITLE_MAX); const a = clean(author, AUTHOR_MAX);
    if (!t) throw new ToolError('title（書名）を入れてください');
    const st = STATUS_KEYS.includes(status) ? status : 'before';
    let found = null;
    if (searchBooks) {
      try {
        const r = await searchBooks([t, a].filter(Boolean).join(' '));
        found = Array.isArray(r?.results) && r.results.length ? r.results[0] : null;
      } catch { found = null; }
    }
    const row = {
      user_id: userId,
      title: clean(found?.title || t, TITLE_MAX),
      author: clean(found?.author || a, AUTHOR_MAX) || null,
      isbn: found?.isbn ? String(found.isbn).replace(/[^0-9Xx]/g, '').slice(0, 13) || null : null,
      cover: typeof found?.cover === 'string' && /^https?:/.test(found.cover) ? found.cover.replace(/^http:/, 'https:') : null,
      status: st,
      added_via: found ? 'search' : 'manual',
    };
    if (st === 'reading') row.start_date = dateOnly(new Date().toISOString());
    const rsn = clean(reason, 2000);
    if (rsn) row.book_reason = rsn;
    // 同じ本が既にあれば足さない（ISBN か 書名＋著者）
    const dupQ = row.isbn
      ? db.from('books').select('id, title, status').eq('user_id', userId).eq('isbn', row.isbn).limit(1)
      : db.from('books').select('id, title, status').eq('user_id', userId).ilike('title', row.title).limit(1);
    const dup = await run(dupQ);
    if (dup.length) return { text: `『${dup[0].title}』は本棚にあります（${STATUS_LABEL[dup[0].status] || dup[0].status}）。book_id: ${dup[0].id}`, structuredContent: { message: `『${dup[0].title}』は本棚にあります`, book_id: dup[0].id, existed: true } };
    let rows;
    try { rows = await run(db.from('books').insert([row]).select('id, title')); }
    catch { const { book_reason, added_via, isbn, ...base } = row; rows = await run(db.from('books').insert([base]).select('id, title')); } // 列が無い DB
    const id = rows[0]?.id || '';
    return { text: `『${rows[0]?.title || row.title}』を${STATUS_LABEL[st]}に足しました${found ? '' : '（書誌は見つからなかったので書名だけ）'}。book_id: ${id}`, structuredContent: { message: `『${rows[0]?.title || row.title}』を${STATUS_LABEL[st]}に足しました`, book_id: id, found: !!found } };
  },
};

// ---------- 接続キー → 本人 ----------
export async function resolveToken(db, token) {
  if (!looksLikeToken(token)) return null;
  const hash = sha256Hex(token);
  const { data, error } = await db.from('mcp_tokens').select('id, user_id, revoked_at, last_used_at').eq('token_hash', hash).limit(1);
  if (error || !data?.length) return null;
  const row = data[0];
  if (row.revoked_at) return null;
  return { userId: row.user_id, tokenId: row.id, lastUsedAt: row.last_used_at };
}

export async function touchToken(db, tokenRow, now = Date.now()) {
  const last = tokenRow.lastUsedAt ? Date.parse(tokenRow.lastUsedAt) : 0;
  if (now - last < 10 * 60 * 1000) return false;
  try { await db.from('mcp_tokens').update({ last_used_at: new Date(now).toISOString() }).eq('id', tokenRow.tokenId); } catch { /* ignore */ }
  return true;
}

// ---------- JSON-RPC ----------
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

async function readResource(uri, ctx) {
  if (uri === WIDGET_URI_MCP) return { uri, mimeType: WIDGET_MIME_MCP, text: widgetHtml() };
  if (uri === WIDGET_URI_OPENAI) return { uri, mimeType: WIDGET_MIME_OPENAI, text: widgetHtml() };
  if (uri === 'orime://books') return { uri, mimeType: 'text/markdown', text: (await handlers.list_books({ limit: 50 }, ctx)).text };
  if (uri === 'orime://memos/recent') return { uri, mimeType: 'text/markdown', text: (await handlers.recent_memos({ limit: 30 }, ctx)).text };
  if (uri === 'orime://actions') return { uri, mimeType: 'text/markdown', text: (await handlers.list_actions({ limit: 50 }, ctx)).text };
  const m = /^orime:\/\/books\/([0-9a-f-]{36})$/i.exec(uri);
  if (m) return { uri, mimeType: 'text/markdown', text: (await handlers.get_book({ book_id: m[1] }, ctx)).text };
  return null;
}

export async function handleRpc(msg, ctx) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid Request');
  const { id, method, params } = msg;
  const isNotification = id === undefined;
  if (method.startsWith('notifications/')) return null;
  const respond = (r) => (isNotification ? null : r);
  switch (method) {
    case 'initialize':
      return respond(rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Orime（読書メモのアプリ）に残した、この利用者の本・メモ・行動を読み書きします。答えるときは、どの本のどのメモを根拠にしたかを添えてください。メモは本人の言葉なので、言い換えずに引用してください。順位・バッジ・連続日数のような言い方はしません。書き込む道具（add_memo / update_memo / add_action / complete_action / add_book）は、本人が頼んだときだけ使ってください。',
      }));
    case 'ping':
      return respond(rpcResult(id, {}));
    case 'tools/list':
      return respond(rpcResult(id, { tools: TOOLS }));
    case 'prompts/list':
      return respond(rpcResult(id, { prompts: PROMPTS }));
    case 'prompts/get': {
      const p = PROMPTS.find((x) => x.name === params?.name);
      if (!p) return respond(rpcError(id, -32602, `Unknown prompt: ${params?.name}`));
      const text = promptText(p.name, params?.arguments || {});
      return respond(rpcResult(id, { description: p.description, messages: [{ role: 'user', content: { type: 'text', text } }] }));
    }
    case 'resources/list':
      return respond(rpcResult(id, { resources: RESOURCES }));
    case 'resources/templates/list':
      return respond(rpcResult(id, { resourceTemplates: RESOURCE_TEMPLATES }));
    case 'resources/read': {
      try {
        const r = await readResource(String(params?.uri || ''), ctx);
        if (!r) return respond(rpcError(id, -32002, `Resource not found: ${params?.uri}`));
        return respond(rpcResult(id, { contents: [r] }));
      } catch (e) {
        return respond(rpcError(id, -32603, e instanceof ToolError ? e.message : 'いま読めませんでした'));
      }
    }
    case 'tools/call': {
      const name = params?.name;
      const fn = handlers[name];
      if (!fn) return respond(rpcError(id, -32602, `Unknown tool: ${name}`));
      try {
        const r = await fn(params?.arguments && typeof params.arguments === 'object' ? params.arguments : {}, ctx);
        return respond(rpcResult(id, { content: [{ type: 'text', text: r.text }], structuredContent: r.structuredContent, isError: false }));
      } catch (e) {
        const text = e instanceof ToolError ? e.message : 'いま読み書きできませんでした。少し待って、もう一度お試しください。';
        return respond(rpcResult(id, { content: [{ type: 'text', text }], isError: true }));
      }
    }
    default:
      return respond(rpcError(id, -32601, 'Method not found'));
  }
}

export async function handleBatch(body, ctx) {
  const list = Array.isArray(body) ? body : [body];
  if (!list.length) return [rpcError(null, -32600, 'Invalid Request')];
  const out = [];
  for (const m of list) {
    const r = await handleRpc(m, ctx);
    if (r) out.push(r);
  }
  return out;
}
