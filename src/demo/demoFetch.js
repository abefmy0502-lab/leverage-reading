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

function brainAnswer(store, question, memoBlock = '') {
  const q = bigrams(question);
  const books = new Map(store.table('books').map((b) => [b.id, b]));
  // 本番と同じく、AI に渡されたメモ一覧（相談相手で絞り込み済み）に載っている本だけを使う。
  const inBlock = (m) => {
    if (!memoBlock) return true;
    const b = books.get(m.book_id);
    return b ? memoBlock.includes(`本: ${b.title}`) : memoBlock.includes("自分の学び");
  };
  const memos = store.table('book_memos').filter((m) => (m.text || '').trim() && inBlock(m));
  if (!memos.length) {
    return 'まだメモが 1 件も保存されていません。本を読んでメモを書くと、ここがあなただけの相談相手になります。';
  }
  const scored = memos
    .map((m) => {
      const mb = bigrams(m.text);
      let hit = 0;
      q.forEach((g) => { if (mb.has(g)) hit += 1; });
      return { m, hit };
    })
    .sort((a, b) => b.hit - a.hit || (b.m.created_at || '').localeCompare(a.m.created_at || ''))
    .map((x) => x.m);
  // 本番の回答ルール（必ず複数の本を横断）に合わせ、異なる本から 1 件ずつ選ぶ。
  const picked = [];
  const seen = new Set();
  for (const m of scored) {
    const key = m.book_id || '__personal';
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(m);
    if (picked.length === 3) break;
  }

  const label = (m) => {
    const b = books.get(m.book_id);
    if (!b) return { ref: `💡 自分の学び (${(m.created_at || '').slice(0, 10)})`, name: 'あなたの学びログ' };
    const page = m.page_number ? ` p.${m.page_number}` : '';
    return { ref: `📚 ${b.author}『${b.title}』${page}`, name: `『${b.title}』${page}` };
  };
  const [p1, p2] = picked.map(label);
  const quotes = picked.map((m) => `- ${label(m).name} のメモ：「${m.text}」`).join('\n');
  const refs = picked.map((m) => `- ${label(m).ref}`).join('\n');

  return [
    '【結論】',
    p2
      ? '相手を変えようとする前に、あなたの「伝え方」を一つだけ変えてみましょう。別々の本で残したメモが、どちらも「最初に決めてほしいことを言う」ことを勧めています。'
      : memos.every((m) => m.book_id === picked[0].book_id)
        ? `この本のメモから答えます。「${picked[0].text.slice(0, 40)}${picked[0].text.length > 40 ? '…' : ''}」を、いまの状況に当てはめてみましょう。`
        : `この件に関係するメモは 1 件だけでした。「${picked[0].text.slice(0, 40)}${picked[0].text.length > 40 ? '…' : ''}」を、いまの状況に当てはめてみましょう。`,
    '',
    '【参照した本のメモ】',
    quotes,
    '',
    '【あなたの状況に合わせた解釈】',
    '別々の本で残したメモですが、どれも「相手や状況を責める前に、自分の伝え方・決め方を一つ変える」という点でつながっています。いまの悩みも、全部を解決しようとせず、いちばん効く一点に絞ると動きやすくなります。',
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

// テーマまとめ（本番と同じ「核心 / 繰り返す原則 / 次の一歩」の形）を、渡されたメモから組み立てる。
function themeAnswer(store, theme, memoBlock) {
  const books = new Map(store.table('books').map((b) => [b.id, b]));
  const short = (t) => {
    const s = (t || '').split(/[。\n]/)[0].trim();
    const open = (s.match(/「/g) || []).length;
    const close = (s.match(/」/g) || []).length;
    return close > open ? `「${s}` : s;
  };
  const picked = [];
  const seen = new Set();
  for (const m of store.table('book_memos')) {
    const b = books.get(m.book_id);
    if (!b || !(m.text || '').trim() || !memoBlock.includes(`本: ${b.title}`) || seen.has(b.id)) continue;
    seen.add(b.id);
    picked.push({ text: short(m.text), title: b.title });
    if (picked.length === 3) break;
  }
  if (!picked.length) return `## 🧭 核心\n「${theme}」のメモがまだありません。\n\n## 🎯 次の一歩\n次に読む本で、「${theme}」について心が動いた一行を 1 つ残す。`;
  return [
    '## 🧭 核心',
    `${picked[0].text}。`,
    '',
    '## 🔑 繰り返す原則',
    ...picked.map((p, i) => `${i + 1}. ${p.text} — 『${p.title}』`),
    '',
    '## 🎯 次の一歩',
    `明日の最初の打ち合わせで、「${picked[0].text}」を 1 回だけ試す。終わったら、相手の反応を一行メモに残す。`,
  ].join('\n');
}

function aiReply(store, payload) {
  const last = [...(payload.messages || [])].reverse().find((m) => m.role === 'user');
  const userText = textOf(last?.content);
  const q = userText.match(/QUESTION_START =====\n([\s\S]*?)\n=====/);
  if (q) {
    const block = (userText.match(/MEMOS_START =====\n([\s\S]*?)\n===== MEMOS_END/) || [])[1] || '';
    return brainAnswer(store, q[1], block);
  }
  if (userText.includes('のテーマまとめを、次のフォーマットで作成')) {
    const theme = (userText.match(/【テーマ】(.+)/) || [])[1] || '';
    const block = (userText.match(/MEMOS_START =====\n([\s\S]*?)\n===== MEMOS_END/) || [])[1] || '';
    return themeAnswer(store, theme.trim(), block);
  }
  const system = textOf(payload.system);
  // AI 選書: ヒアリング（1 周だけ質問を出し、2 周目で締める）と、おすすめ（本番と同じ JSON ブロック）
  if (system.includes('ヒアリング設計担当')) {
    if (userText.includes('まだ回答なし')) {
      return JSON.stringify({ done: false, questions: [
        { q: 'いま一番つまずいているのは？', options: ['時間が足りない', '優先順位が決められない', '人に任せられない'], multi: false },
        { q: '理想に近い状態は？', options: ['定時で帰れる', '大事な仕事に集中できる', 'チームが自走する'], multi: false },
      ] });
    }
    return JSON.stringify({ done: true, questions: [] });
  }
  if (system.includes('RECOMMENDATIONS_START')) {
    const recs = [
      { title: '大事なことに集中する', author: 'カル・ニューポート', why: '邪魔の入らない時間を先に確保するやり方が、「時間が足りない」にそのまま効きます。', core: '深い仕事の時間を、予定より先に押さえる。', focus: '第2部のルール1〜2', duration: '2週間で読了、1か月で実践' },
      { title: '時間術大全', author: 'ジェイク・ナップ', why: '毎日 1 つ「ハイライト」を決める習慣で、優先順位に迷う時間が減ります。', core: '今日のハイライトを 1 つだけ決める。', focus: '「ハイライト」の章', duration: '1週間で読了、2週間で実践' },
      { title: 'プロフェッショナルマネジャー', author: 'ハロルド・ジェニーン', why: '結果から逆算して任せる考え方が、チームを自走させる手がかりになります。', core: '終わりから始めて、そこへ到達するためにできる限りのことをする。', focus: '第3章', duration: '3週間で読了、2か月で実践' },
    ];
    return [
      '## 👋 はじめに', 'お話を伺って、時間の使い方と任せ方の両方に効く本を選びました。', '',
      '## 📚 おすすめの本', '', 'RECOMMENDATIONS_START', JSON.stringify(recs, null, 2), 'RECOMMENDATIONS_END', '',
      '## 📋 読む順番のおすすめ', '1. 大事なことに集中する — 集中できる時間をつくる', '2. 時間術大全 — 毎日の 1 つを決める', '3. プロフェッショナルマネジャー — 結果から逆算して任せる', '',
      '## 💬 まとめ', '一冊ずつ、明日できる一歩に変えていきましょう。',
    ].join('\n');
  }
  return [
    '## 💡 お試しモードの応答',
    'これはお試しモードの仮の応答です。本番では、ここに AI の回答が表示されます。',
    '',
    '- 画面の流れや文言の確認用に、固定の文章を返しています',
    '- 相談だけは、実際に入っているメモから答えます',
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
      // &ai=fail: AI がエラーを返す（エラー表示の確認用）/ &ai=slow: 答えがなかなか返らない（読み込み中の確認用）。
      const aiMode = new URLSearchParams(window.location.search).get('ai');
      if (aiMode === 'fail') {
        await new Promise((r) => setTimeout(r, 400));
        return json({ error: { message: 'サーバーで問題が起きました。' } }, 500);
      }
      if (aiMode === 'slow') await new Promise((r) => setTimeout(r, 60000));
      // ?demo=limit: 今月の AI の原価の上限に達した人（上限の案内の確認用）。
      if (new URLSearchParams(window.location.search).get('demo') === 'limit') {
        return json({ error: { message: `今月の AI の利用上限に達しました。${(new Date().getMonth() + 2) % 12 || 12}月1日からまた使えます。` }, error_code: 'monthly_budget_exceeded' }, 429);
      }
      // ?demo=free: 購読が無い間は、本番と同じくお試し 3 回まで（ai_usage の 'free' 行で数える）。
      if (!store.table('subscriptions').some((r) => r.status === 'active')) {
        const rows = store.table('ai_usage');
        let row = rows.find((r) => r.period_month === 'free');
        if (!row) { row = { user_id: store.session?.user?.id, period_month: 'free', calls: 0 }; rows.push(row); }
        if (row.calls >= 3) {
          return json({ error: { message: 'お試しの相談は、ここまでです。続けるにはプランへのご登録が必要です。' }, error_code: 'free_limit_reached' }, 402);
        }
        row.calls += 1;
      }
      await new Promise((r) => setTimeout(r, 500));
      const text = aiReply(store, payload);
      if (payload.stream) return sseResponse(text);
      return json({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
    }
    if (url.includes('/api/cover')) {
      // 見本の本の一覧にある本は「実在する」と答える（AI 選書の実在確認で全部が疑わしく見えないように）。
      const title = (() => { try { return new URL(url, window.location.origin).searchParams.get('title') || ''; } catch { return ''; } })();
      const hit = title && SEARCH_CATALOG.find(([t]) => t === title || t.includes(title) || title.includes(t));
      return json(hit ? { cover: null, isbn: hit[2] } : { cover: null });
    }
    // 自前の /api/ だけを止める（NDL の /api/opensearch まで止めると、該当なしが常にエラーに見える）。
    const isOwnApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
    if (isOwnApi) return json({ error: 'お試しモードでは使えません' }, 503);
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
