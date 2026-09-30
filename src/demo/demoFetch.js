// 🧪 お試しモード（開発専用）— 外部 API への fetch を差し替える。
// AI（/api/claude）はサンプルの応答を返し、本の検索は手元のカタログから返す。
// マイ読書脳だけは、実際に入っているメモから質問に近いものを選んで
// 本番と同じ書式（【結論】…REFS_START/END）で答えるので、画面の流れを確かめられる。

import { SEARCH_CATALOG } from './seed';
import { questionGist } from '../lib/consultHelpers';

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

function brainAnswer(store, question, memoBlock = '', aiMode = '') {
  const q = bigrams(question);
  const books = new Map(store.table('books').map((b) => [b.id, b]));
  // 本番と同じく、AI に渡されたメモ一覧（相談相手で絞り込み済み）に載っている本だけを使う。
  const inBlock = (m) => {
    if (!memoBlock) return true;
    const b = books.get(m.book_id);
    return b ? memoBlock.includes(`本: ${b.title}`) : memoBlock.includes("自分の学び");
  };
  // 「この本のまとめ」（books.leverage_memo）も本番と同じく材料にする（読書メーターの感想だけを取り込んだ人の相談の確認用）。
  //   引用はまとめの最初の 1 行（長ければ 60 字）＝まとめの本文の一部なので、根拠の照合（evidenceCheck.js）も通る。
  const summaries = store.table('books')
    .filter((b) => String(b.leverage_memo || '').trim())
    .map((b) => ({
      id: `summary-${b.id}`,
      book_id: b.id,
      source_type: 'summary',
      text: String(b.leverage_memo).trim().split('\n')[0].slice(0, 60),
      page_number: null,
      created_at: b.updated_at || b.created_at,
    }));
  const memos = [...store.table('book_memos'), ...summaries].filter((m) => (m.text || '').trim() && inBlock(m));
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
  // 選んだメモの本の数（学びログは本に数えない）。本が 1 冊だけなら「別々の本で」とは言わない（?demo=onebook）。
  const bookCount = new Set(picked.filter((m) => m.book_id).map((m) => m.book_id)).size;
  // &ai=fabricate: 2 つ目の引用を、メモに無い文にする（「根拠を見る」で見せないことの確認用・evidenceCheck.js）。
  const quotes = picked.map((m, i) => `- ${label(m).name} のメモ：「${aiMode === 'fabricate' && i === 1 ? '他人の期待を満たすために生きてはいけない' : m.text}」`).join('\n');
  // 一歩は、あとで行動の一覧だけを見ても分かる文にする（本番の指示文と同じ・「この件」と書かない）。
  const subject = questionGist(question, 20) || 'いまの悩み';
  const refs = picked.map((m) => `- ${label(m).ref}`).join('\n');

  // 結論・解釈は、引いたメモに書いてあることだけで組み立てる（メモに無い主張を足さない・2026-09-29）。
  const clip = (t) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > 40 ? `${x.slice(0, 40)}…` : x; };
  // 結論には書名・引用のかぎかっこを入れない（出典は「根拠を見る」の中・SPEC §3・本番の BRAIN_SYSTEM と同じ）。
  const gist = (t) => clip(t).replace(/[「」『』]/g, '').replace(/[。．.]+$/, '');
  return [
    '【結論】',
    p2
      ? `いまの悩みには、${gist(picked[0].text)}という考えがいちばん近そうです。まずこれを、いまの状況に 1 つだけ当てはめてみましょう。`
      : memos.every((m) => m.book_id === picked[0].book_id)
        ? `この本のメモから答えます。${gist(picked[0].text)}という考えを、いまの状況に当てはめてみましょう。`
        : `この件に関係するメモは 1 件だけでした。${gist(picked[0].text)}という考えを、いまの状況に当てはめてみましょう。`,
    '',
    '【参照した本のメモ】',
    quotes,
    '',
    '【あなたの状況に合わせた解釈】',
    p2
      ? `${bookCount >= 2 ? '別々の本で残したメモです。' : '本で読んだことと、自分で気づいたことです。'}まず${p1.name}の「${clip(picked[0].text)}」を試し、足りなければ${p2.name}の「${clip(picked[1].text)}」を次の手にする、という順で使えます。全部を一度に変えず、1 つずつ試すと動きやすくなります。`
      : `「${clip(picked[0].text)}」を、いまの悩みのどこに当てはめられるかを 1 つだけ決めると、動きやすくなります。`,
    '',
    '【明日からできる 1 つの行動】',
    // 一歩は、選んだメモに書いてあることから作る（決まった文にしない・2026-09-29）。
    // 書名は入れない（行動は本に付けて保存される・行動の一覧で読んでも分かる文に）。
    `「${subject}」の場面で、メモに残した「${gist(picked[0].text)}」を 1 回だけ試し、どうだったかを 1 行メモに残してください。`,
    '',
    '（お試しモードの応答です。本番では AI があなたのメモ全体を読んで答えます）',
    '',
    'REFS_START',
    refs,
    'REFS_END',
  ].join('\n');
}

// 📚 答え方「本ごとに」— 本番と同じ形（【結論】【本ごとの視点】◆『書名』｜著者／視点：／根拠：
// 【共通点と違い】【明日からできる 1 つの行動】REFS）を、AI に渡された本ごとのメモ（PERSPECTIVE_BOOKS）から組み立てる。
const PERBOOK_VIEWS = {
  '嫌われる勇気': '『嫌われる勇気』の視点では、焦りの多くは「どう評価されるか」を気にするところから来ます。評価は相手の課題と割り切り、いま相手に何を貢献できるかに意識を戻すと、次の打ち手が見えてきます。',
  'エッセンシャル思考': '『エッセンシャル思考』の視点では、成果が落ちたときほど、全部を取り戻そうとしないことが大切です。まず「やらないこと」を決め、いちばん効く一点に時間を集めると、焦りそのものが小さくなります。',
  'イシューからはじめよ': '『イシューからはじめよ』の視点では、動く前に「本当に解くべき問い」を確かめます。落ちた理由が量なのか、やり方なのか、相手選びなのか。問いを 1 つに絞れば、忙しさの大半は消えます。',
  '人を動かす': '『人を動かす』の視点では、成果を急ぐほど相手を「動かそう」としがちです。説得より先に、相手の立場で「なぜそうするのか」を考え、質問で一緒に答えを探すと、相手が自分から動いてくれます。',
  '数値化の鬼': '『数値化の鬼』の視点では、「頑張る」を数に置き換えます。結果の数字ではなく、それを生む行動の数を見て、足りないのが量なのか、やり方なのかを分けて考えます。',
  '1兆ドルコーチ': '『1兆ドルコーチ』の視点では、ひとりで抱えるより、問いで考えを引き出してくれる相手を持つことが近道です。チームで勝つための判断を先に置くと、焦りが個人の問題でなくなります。',
};

function perBookAnswer(block) {
  const books = [];
  let cur = null;
  block.split('\n').forEach((line) => {
    const h = line.match(/^◆『([^』]*)』｜(.*)$/);
    if (h) { cur = { title: h[1], author: h[2].trim(), memos: [] }; books.push(cur); return; }
    const m = line.match(/^- (?:\(([^)]*)\) )?(.*)$/);
    if (cur && m) {
      const page = ((m[1] || '').match(/p\.(\d+)/) || [])[1] || null;
      cur.memos.push({ page, text: m[2].trim() });
    }
  });
  const quote = (t) => {
    const s = t.split(/[。\n]/)[0].replace(/[「」]/g, '').trim();
    return s.length > 28 ? `${s.slice(0, 28)}…` : s;
  };
  const views = books.map((b) => {
    const m = b.memos.find((x) => x.page) || b.memos[0] || { text: '' };
    const view = PERBOOK_VIEWS[b.title]
      || `『${b.title}』の視点では、メモに残した「${quote(m.text)}」を、いまの悩みに当てはめてみることができます。`;
    return { ...b, view, basis: `${m.page ? `p.${m.page}` : ''}「${quote(m.text)}」`, ref: `📚 ${b.author}『${b.title}』${m.page ? ` p.${m.page}` : ''}` };
  });
  return [
    '【結論】',
    '焦りの正体を分けて、いま自分で動かせる一点に集中しましょう。評価や結果は、追いかけるほど遠くなります。',
    '',
    '【本ごとの視点】',
    ...views.flatMap((v) => [`◆『${v.title}』｜${v.author}`, `視点：${v.view}`, `根拠：${v.basis}`, '']),
    '【共通点と違い】',
    `${views.length} 冊とも「自分で変えられることに力を集める」点で重なります。違うのは入り口で、何を手放すか、誰の課題かを分けるか、相手とどう向き合うかが分かれます。`,
    '',
    '【明日からできる 1 つの行動】',
    '始業前の 10 分で、次の商談を 1 つだけ選び、「この商談で相手に何を貢献できるか」を 1 行書いてから臨んでください。',
    '',
    '（お試しモードの応答です。本番では AI があなたのメモを本ごとに読んで答えます）',
    '',
    'REFS_START',
    ...views.map((v) => `- ${v.ref}`),
    'REFS_END',
  ].join('\n');
}

// &ai=broken: 「本ごとに」の答えの ◆ の形が崩れた答え（◆ も「視点：」も無い）。
//   画面は【本ごとの視点】の節をそのまま段落で見せる（SPEC §3・parseAnswer の booksRaw）。
function perBookBrokenAnswer(block) {
  const titles = [...block.matchAll(/^◆『([^』]*)』/gm)].map((m) => m[1]).slice(0, 3);
  const views = titles.map((t) => (PERBOOK_VIEWS[t] || `『${t}』では、メモに残したことを、いまの悩みに当てはめて考えます。`));
  return [
    '【結論】',
    '焦りの正体を分けて、いま自分で動かせる一点に集中しましょう。評価や結果は、追いかけるほど遠くなります。',
    '',
    '【本ごとの視点】',
    ...views.flatMap((v) => [v, '']),
    '【共通点と違い】',
    `${views.length} 冊とも「自分で変えられることに力を集める」点で重なります。`,
    '',
    '【明日からできる 1 つの行動】',
    '始業前の 10 分で、次の商談を 1 つだけ選び、「この商談で相手に何を貢献できるか」を 1 行書いてから臨んでください。',
    '',
    'REFS_START',
    ...titles.map((t) => `- 📚 『${t}』`),
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
    `次の打ち合わせで、「${picked[0].text}」を 1 回だけ試す。終わったら、相手の反応を一行メモに残す。`,
  ].join('\n');
}

function aiReply(store, payload, aiMode = '') {
  const last = [...(payload.messages || [])].reverse().find((m) => m.role === 'user');
  const userText = textOf(last?.content);
  const perBook = userText.match(/PERSPECTIVE_BOOKS_START =====\n([\s\S]*?)\n===== PERSPECTIVE_BOOKS_END/);
  if (perBook) return aiMode === 'broken' ? perBookBrokenAnswer(perBook[1]) : perBookAnswer(perBook[1]);
  const q = userText.match(/QUESTION_START =====\n([\s\S]*?)\n=====/);
  if (q) {
    // 本番は質問に近いメモを RELATED_MEMOS に分けて渡す（MEMOS からは外す）ので、両方を材料にする。
    const block = [
      (userText.match(/===== MEMOS_START =====\n([\s\S]*?)\n===== MEMOS_END/) || [])[1] || '',
      (userText.match(/RELATED_MEMOS_START =====\n([\s\S]*?)\n===== RELATED_MEMOS_END/) || [])[1] || '',
    ].filter(Boolean).join('\n\n');
    return brainAnswer(store, q[1], block, aiMode);
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
    // 「なぜあなたに」は、ヒアリングで実際に選んだ答え（「A. …」の行）だけを引く。選んでいない選択肢は言わない（2026-09-29）。
    const answers = userText.split('\n').filter((l) => l.startsWith('A. ')).join('\n');
    const chose = (opt) => answers.includes(opt);
    const delegate = ['人に任せられない', 'チームが自走する'].find(chose);
    const recs = [
      { title: '大事なことに集中する', author: 'カル・ニューポート',
        why: chose('時間が足りない') ? '邪魔の入らない時間を先に確保するやり方が、「時間が足りない」にそのまま効きます。'
          : chose('大事な仕事に集中できる') ? '邪魔の入らない時間を先に確保するやり方で、「大事な仕事に集中できる」状態に近づけます。'
            : '邪魔の入らない時間を先に確保するやり方で、大事な仕事に使える時間が増えます。',
        core: '深い仕事の時間を、予定より先に押さえる。', focus: '第2部のルール1〜2', duration: '2週間で読了、1か月で実践' },
      { title: '時間術大全', author: 'ジェイク・ナップ',
        why: chose('優先順位が決められない') ? '毎日 1 つ「ハイライト」を決める習慣で、「優先順位が決められない」迷いが減ります。'
          : chose('定時で帰れる') ? '毎日 1 つ「ハイライト」を決める習慣で、やることが絞れて「定時で帰れる」日が増えます。'
            : '毎日 1 つ「ハイライト」を決める習慣で、何から手を付けるかに迷う時間が減ります。',
        core: '今日のハイライトを 1 つだけ決める。', focus: '「ハイライト」の章', duration: '1週間で読了、2週間で実践' },
      { title: 'プロフェッショナルマネジャー', author: 'ハロルド・ジェニーン',
        why: delegate ? `結果から逆算して任せる考え方が、「${delegate}」の手がかりになります。`
          : '結果から逆算して任せる考え方が、ひとりで抱え込まない手がかりになります。',
        core: '終わりから始めて、そこへ到達するためにできる限りのことをする。', focus: '第3章', duration: '3週間で読了、2か月で実践' },
    ];
    return [
      '## 👋 はじめに', 'お話を伺って、時間の使い方と任せ方の両方に効く本を選びました。', '',
      '## 📚 おすすめの本', '', 'RECOMMENDATIONS_START', JSON.stringify(recs, null, 2), 'RECOMMENDATIONS_END', '',
      // 4 行目は JSON に無い架空の書名（本番で起きた漏れの再現・2026-09-30）。画面では lib/advisorProse.js が消し、番号も 1〜3 のまま。
      '## 📋 読む順番のおすすめ', '1. 『大事なことに集中する』 — 集中できる時間をつくる', '2. 『チームを動かす最強の時間術 ハイライト実践編』 — 仕上げに', '3. 『時間術大全』 — 毎日の 1 つを決める', '4. 『プロフェッショナルマネジャー』 — 結果から逆算して任せる', '',
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

// 本物の fetch と同じく、止める合図（AbortSignal）で待ちをやめて AbortError にする（2026-09-30）。
//   お試しモードで「止める」・画面を離れたときに、裏で答えが流れ続けないように。
const abortError = () => {
  try { return new DOMException('The operation was aborted.', 'AbortError'); } catch { const e = new Error('The operation was aborted.'); e.name = 'AbortError'; return e; }
};
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const t = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(t); reject(abortError()); }
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

// stallAt: その文字数まで書いたところで長く止まる（書いている途中の画面を撮る &ai=stall 用）。
// extra: message_stop のあとに送る独自の枠（相談のトークンを返した知らせ orime_token_refund など）。
// signal: 止める合図。来たら流すのをやめてストリームをエラーにする（本物と同じ）。
function sseResponse(text, stopReason = 'end_turn', stallAt = -1, extra = null, signal = null) {
  const enc = new TextEncoder();
  const chunks = stallAt > 0
    ? [...(text.slice(0, stallAt).match(/[\s\S]{1,14}/g) || []), null, ...(text.slice(stallAt).match(/[\s\S]{1,14}/g) || [])]
    : (text.match(/[\s\S]{1,14}/g) || ['']);
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      send({ type: 'message_start' });
      try {
        for (const c of chunks) {
          // eslint-disable-next-line no-await-in-loop
          if (c === null) { await wait(60000, signal); continue; }
          if (signal?.aborted) throw abortError();
          send({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: c } });
          // eslint-disable-next-line no-await-in-loop
          await wait(18, signal);
        }
      } catch (e) {
        try { controller.error(e); } catch { /* ignore */ }
        return;
      }
      send({ type: 'message_delta', delta: { stop_reason: stopReason } });
      send({ type: 'message_stop' });
      if (extra) controller.enqueue(enc.encode(`event: ${extra.type}\ndata: ${JSON.stringify(extra)}\n\n`));
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
    const signal = init?.signal || (typeof input === 'object' ? input?.signal : null) || null;
    if (url.includes('/api/claude')) {
      if (signal?.aborted) throw abortError();
      let payload = {};
      try { payload = JSON.parse(init.body || '{}'); } catch { /* ignore */ }
      // &ai=fail: AI がエラーを返す（エラー表示の確認用）/ &ai=slow: 答えがなかなか返らない（読み込み中の確認用）
      // / &ai=cut: 答えが長さの上限で途中まで（stop_reason 'max_tokens'・途中切れの表示の確認用）
      // / &ai=stall: 書き始めてから、本ごとの答えなら 1 冊目の視点の途中（そのほかは 3 割ほど）で長く止まる
      //   （書いている途中の形の確認用）/ &ai=broken: 本ごとの答えの ◆ の形が崩れる（段落で見せる確認用）。
      const aiMode = new URLSearchParams(window.location.search).get('ai');
      if (aiMode === 'fail') {
        await wait(400, signal);
        return json({ error: { message: 'サーバーで問題が起きました。' } }, 500);
      }
      if (aiMode === 'slow') await wait(60000, signal);
      // 本番（api/claude.js・api/_aiAccess.js）と同じ決まりをまねる:
      //   契約なし＝無料プラン: 相談（purpose 'consult'）だけ・毎月 30 トークン（'free-YYYY-MM'）。ほかは 402 plan_required
      //   無料期間: 150 トークン（'trial-終わる日'）/ 有料: 毎月 800 トークン（'YYYY-MM'）→ 使い切ったら 429
      //   「最後の 1 回」: 使ったトークン（切り上げ）が上限未満なら始められる。
      const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
      const month = jstNow.toISOString().slice(0, 7);
      const nextFirst = `${(jstNow.getUTCMonth() + 1) % 12 + 1}\u2060月\u20601\u2060日`;
      const sub = store.table('subscriptions').find((r) => r.status === 'active');
      const tier = !sub ? 'free' : (sub.period_type === 'trial' || sub.period_type === 'intro') ? 'trial' : 'paid';
      if (tier === 'free' && payload.purpose !== 'consult') {
        return json({ error: { message: 'この AI 機能は、プランでご利用いただけます。' }, error_code: 'plan_required' }, 402);
      }
      const trialEnd = sub?.current_period_end ? new Date(Date.parse(sub.current_period_end) + 9 * 3600 * 1000) : null;
      const key = tier === 'free' ? `free-${month}` : tier === 'trial' ? `trial-${trialEnd ? trialEnd.toISOString().slice(0, 10) : month}` : month;
      const allowance = tier === 'free' ? 30 : tier === 'trial' ? 150 : 800;
      const rows = store.table('ai_usage');
      let row = rows.find((r) => r.period_month === key);
      if (!row) { row = { user_id: store.session?.user?.id, period_month: key, calls: 0, cost_mjpy: 0 }; rows.push(row); }
      const used = Math.ceil((row.cost_mjpy || 0) / 300 - 1e-9);
      // 追加トークン（買い足し）: その月の分を使い切ったら、期限の近いロットから使う（supabase_ai_token_credits.sql と同じ）。
      const nowIso = new Date().toISOString();
      const lots = store.table('ai_token_lots')
        .filter((l) => l.tokens_left > 0 && l.expires_at > nowIso)
        .sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)));
      const lotBalance = lots.reduce((n, l) => n + l.tokens_left, 0);
      if (used >= allowance + (row.lot_tokens || 0) + lotBalance) {
        if (tier === 'free') {
          return json({ error: { message: `今月のトークンは、ここまでです。${nextFirst}に 30 トークンに戻ります。` }, error_code: 'free_limit_reached' }, 402);
        }
        const message = tier === 'trial'
          ? `無料期間のトークンは、ここまでです。無料期間が終わる${trialEnd.getUTCMonth() + 1}\u2060月\u2060${trialEnd.getUTCDate()}\u2060日から、毎月 800 トークン使えます。`
          : `今月のトークンは、ここまでです。${nextFirst}に 800 トークンに戻ります。`;
        return json({ error: { message }, error_code: 'monthly_budget_exceeded', ...(tier === 'trial' ? { trial: true } : null) }, 429);
      }
      // 使った量（目安）: 相談 約 9 トークン・AI 選書 約 20・そのほか 約 3。
      row.calls += 1;
      row.cost_mjpy = (row.cost_mjpy || 0) + (payload.purpose === 'consult' ? 2760 : (payload.max_tokens || 0) >= 3000 ? 6000 : 900);
      // その月の分を超えた分を、追加分から差し引く（settle_token_overflow）。
      let need = Math.max(0, Math.ceil(row.cost_mjpy / 300 - 1e-9) - allowance) - (row.lot_tokens || 0);
      if (need > 0) {
        row.lot_tokens = (row.lot_tokens || 0) + need;
        for (const l of lots) {
          if (need <= 0) break;
          const take = Math.min(l.tokens_left, need);
          l.tokens_left -= take;
          need -= take;
        }
      }
      await wait(500, signal);
      // &ai=noinfo: 関係するメモが無いと答え、トークンを返す（本番の api/claude.js と同じく message_stop のあとに
      //   orime_token_refund の枠を送る・相談の答えの下の「トークンは使っていません」の確認用）。
      const noInfo = aiMode === 'noinfo' && payload.purpose === 'consult';
      if (noInfo) { row.calls -= 1; row.cost_mjpy = Math.max(0, (row.cost_mjpy || 0) - 2760); }
      const full = noInfo
        ? ['【結論】', 'あなたの読書記録には、このトピックに関する情報がまだありません。', '', '【明日からできる 1 つの行動】', '次に読む本で、このテーマについて心が動いた一行を 1 つメモに残す。'].join('\n')
        : aiReply(store, payload, aiMode);
      const cut = aiMode === 'cut';
      // 途中切れ: 本文の前半だけ返す（文の途中で切れる）。
      const text = cut ? full.slice(0, Math.max(40, Math.floor(full.length * 0.6))) : full;
      const stopReason = cut ? 'max_tokens' : 'end_turn';
      if (payload.stream) {
        let stallAt = -1;
        if (aiMode === 'stall') {
          const v = text.indexOf('\n視点：');
          stallAt = v > 0 ? v + 40 : Math.floor(text.length * 0.3);
        }
        return sseResponse(text, stopReason, stallAt, noInfo ? { type: 'orime_token_refund', reason: 'no_info', tokens: 9 } : null, signal);
      }
      return json({ content: [{ type: 'text', text }], stop_reason: stopReason });
    }
    if (url.includes('/api/cover')) {
      // 見本の本の一覧にある本は「実在する」と答える（AI 選書の実在確認で全部が疑わしく見えないように）。
      const params = (() => { try { return new URL(url, window.location.origin).searchParams; } catch { return new URLSearchParams(); } })();
      const title = params.get('title') || '';
      // 実在の判定（?verify=1）は本番と同じく書名がまるごと同じ本だけを「実在」にする（2026-09-30）。
      if (params.get('verify') === '1') {
        // &verify=down: 検索元がどれも答えない（「確認できませんでした」の確認用）。
        const mode = new URLSearchParams(window.location.search).get('verify');
        if (mode === 'down') return json({ cover: '', isbn: '', candidates: [], verified: null }, 200);
        // &verify=mixed: 1 冊目だけ確かめられない（カードごとの「確認できませんでした」の確認用）。
        if (mode === 'mixed' && title === '大事なことに集中する') return json({ cover: '', isbn: '', candidates: [], verified: null }, 200);
        const exact = title && SEARCH_CATALOG.find(([t]) => t === title);
        return json(exact ? { cover: null, isbn: exact[2], candidates: [], verified: true } : { cover: '', isbn: '', candidates: [], verified: false });
      }
      const hit = title && SEARCH_CATALOG.find(([t]) => t === title || t.includes(title) || title.includes(t));
      return json(hit ? { cover: null, isbn: hit[2] } : { cover: null });
    }
    // 自前の /api/ だけを止める（NDL の /api/opensearch まで止めると、該当なしが常にエラーに見える）。
    const isOwnApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
    if (isOwnApi) return json({ error: 'お試しモードでは使えません' }, 503);
    // &search=fail: 本の検索（Google Books・openBD・NDL）がすべて失敗する（検索のエラー表示の確認用）。
    const isBookSearch = url.includes('googleapis.com/books') || url.includes('api.openbd.jp')
      || url.includes('ndlsearch.ndl.go.jp') || url.includes('iss.ndl.go.jp');
    if (isBookSearch && new URLSearchParams(window.location.search).get('search') === 'fail') {
      await new Promise((r) => setTimeout(r, 300));
      return json({ error: 'unavailable' }, 503);
    }
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
