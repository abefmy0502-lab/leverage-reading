// 🧪 お試しモード（開発専用）— 外部 API への fetch を差し替える。
// AI（/api/claude）はサンプルの応答を返し、本の検索は手元のカタログから返す。
// マイ読書脳だけは、実際に入っているメモから質問に近いものを選んで
// 本番と同じ書式（【結論】…REFS_START/END）で答えるので、画面の流れを確かめられる。

import { SEARCH_CATALOG } from './seed';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b) => (b && b.text) || '').join('\n');
  return '';
};

const bigrams = (s) => {
  const t = String(s || '').replace(/\s+/g, '');
  const out = new Set();
  for (let i = 0; i < t.length - 1; i += 1) {
    const g = t.slice(i, i + 2);
    // ひらがなだけの組（「して」「ます」等）は意味が薄いので照合に使わない。
    if (!/^[ぁ-ゟ、。！？]+$/.test(g)) out.add(g);
  }
  return out;
};

function brainAnswer(store, question) {
  const q = bigrams(question);
  const books = new Map(store.table('books').map((b) => [b.id, b]));
  const memos = store.table('book_memos').filter((m) => (m.text || '').trim());
  if (!memos.length) {
    return 'まだメモが 1 件も保存されていません。本を読んでメモを書くと、ここでマイ読書脳があなただけのアドバイザーになります。';
  }
  const scored = memos
    .map((m) => {
      const mb = bigrams(m.text);
      let hit = 0;
      q.forEach((g) => { if (mb.has(g)) hit += 1; });
      return { m, hit };
    })
    .sort((a, b) => b.hit - a.hit || (b.m.created_at || '').localeCompare(a.m.created_at || ''))
    .slice(0, 3)
    .map((x) => x.m);

  const label = (m) => {
    const b = books.get(m.book_id);
    if (!b) return { ref: `💡 自分の学び (${(m.created_at || '').slice(0, 10)})`, name: 'あなたの学びログ' };
    const page = m.page_number ? ` P.${m.page_number}` : '';
    return { ref: `📚 ${b.author}『${b.title}』${page}`, name: `『${b.title}』${page}` };
  };
  const first = label(scored[0]);
  const quotes = scored.map((m) => `- ${label(m).name} のメモ：「${m.text}」`).join('\n');
  const refs = scored.map((m) => `- ${label(m).ref}`).join('\n');

  return [
    '【結論】',
    `あなたが以前 ${first.name} で残したメモが、今回のいちばんのヒントです。「${scored[0].text.slice(0, 40)}${scored[0].text.length > 40 ? '…' : ''}」を、いまの状況にそのまま当てはめてみましょう。`,
    '',
    '【参照した本のメモ】',
    quotes,
    '',
    '【あなたの状況に合わせた解釈】',
    'どのメモも「一度立ち止まって、何に集中するかを自分で決める」という点で共通しています。いまの悩みも、全部を解決しようとせず、いちばん効く一点に絞ると動きやすくなります。',
    '',
    '【明日からできる 1 つの行動】',
    '明日の朝、始業前の 10 分で、この件について「やること」と「やらないこと」を 1 つずつ紙に書き出してみてください。',
    '',
    '（お試しモードの応答です。本番では AI があなたのメモ全体を読んで答えます）',
    '',
    'REFS_START',
    refs,
    'REFS_END',
  ].join('\n');
}

function aiReply(store, payload) {
  const last = [...(payload.messages || [])].reverse().find((m) => m.role === 'user');
  const userText = textOf(last?.content);
  const q = userText.match(/QUESTION_START =====\n([\s\S]*?)\n=====/);
  if (q) return brainAnswer(store, q[1]);
  const system = textOf(payload.system);
  if (system.includes('今週ひとつだけ「問い」')) {
    return '『エッセンシャル思考』で「やらないことを決める」とメモしていましたね。今週、あえて手放せそうな仕事はどれでしょう？';
  }
  return [
    '## 💡 お試しモードの応答',
    'これはお試しモードの仮の応答です。本番では、ここに AI の回答が表示されます。',
    '',
    '- 画面の流れや文言の確認用に、固定の文章を返しています',
    '- マイ読書脳の相談だけは、実際に入っているメモから答えます',
  ].join('\n');
}

function sseResponse(text) {
  const enc = new TextEncoder();
  const chunks = text.match(/[\s\S]{1,14}/g) || [''];
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      send({ type: 'message_start' });
      for (const c of chunks) {
        send({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: c } });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 18));
      }
      send({ type: 'message_delta', delta: { stop_reason: 'end_turn' } });
      send({ type: 'message_stop' });
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function googleBooks(url) {
  const q = decodeURIComponent((url.match(/[?&]q=([^&]*)/) || [])[1] || '').replace(/\+/g, ' ');
  const isbn = (q.match(/isbn:(\d+)/) || [])[1];
  const tokens = q.replace(/isbn:\d+/, '').split(/\s+/).filter(Boolean);
  const items = SEARCH_CATALOG
    .filter(([title, author, i]) =>
      (isbn ? i === isbn : tokens.some((t) => title.includes(t) || author.includes(t))))
    .map(([title, author, i, publisher, year]) => ({
      volumeInfo: {
        title, authors: [author], publisher, publishedDate: year, pageCount: 256,
        industryIdentifiers: [{ type: 'ISBN_13', identifier: i }],
      },
    }));
  return json({ totalItems: items.length, items });
}

export function installDemoFetch(store) {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/api/claude')) {
      let payload = {};
      try { payload = JSON.parse(init.body || '{}'); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 500));
      const text = aiReply(store, payload);
      if (payload.stream) return sseResponse(text);
      return json({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
    }
    if (url.includes('/api/cover')) return json({ cover: null });
    if (url.includes('/api/')) return json({ error: 'お試しモードでは使えません' }, 503);
    if (url.includes('googleapis.com/books')) return googleBooks(url);
    if (url.includes('api.openbd.jp')) {
      const n = ((url.match(/isbn=([^&]*)/) || [])[1] || '').split(',').length;
      return json(Array(n).fill(null));
    }
    if (url.includes('ndlsearch.ndl.go.jp') || url.includes('iss.ndl.go.jp')) {
      return new Response('<?xml version="1.0"?><rss><channel></channel></rss>', {
        status: 200, headers: { 'Content-Type': 'application/xml' },
      });
    }
    return realFetch(input, init);
  };
}
