// 🧪 お試しモード（開発専用）— 外部 API への fetch を差し替える。
// AI（/api/claude）はサンプルの応答を返し、本の検索は手元のカタログから返す。
// マイ読書脳だけは、実際に入っているメモから質問に近いものを選んで
// 本番と同じ書式（【結論】…REFS_START/END）で答えるので、画面の流れを確かめられる。

import { SEARCH_CATALOG, DEMO_BOOK_INFO, DEMO_MESSY_RELATED } from './seed';

const relatedMessy = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('related') === 'messy';
import { demoServerSearch, demoNdlXml } from './demoBookSearch';
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

// 深掘りの会話（2026-09-30）: 質問の前の THREAD（これまでのやりとり）から、直前の相談・結論・根拠にした本を読む。
function parseThread(userText) {
  const block = (userText.match(/===== THREAD_START =====\n([\s\S]*?)\n===== THREAD_END =====/) || [])[1];
  if (!block) return null;
  const all = (re) => [...block.matchAll(re)].map((m) => m[1].trim());
  const questions = all(/相談: (.+)/g);
  const conclusions = all(/答えの結論: (.+)/g);
  const cited = (all(/根拠にした本: (.+)/g).slice(-1)[0] || '').match(/『[^』]+』/g) || [];
  // 🎯 行動は会話で決める（2026-09-30）: 各やりとりが「答えの問い」で終わっていたか。問いのあとの相談＝返事（状況）。
  const turns = block.split(/\n(?=\d+\. 相談: )/).map((t) => ({
    q: ((t.match(/相談: (.+)/) || [])[1] || '').trim(),
    asked: /答えの問い: /.test(t),
  }));
  const replies = turns.filter((t, i) => i > 0 && turns[i - 1].asked).map((t) => t.q);
  return {
    turns: questions.length,
    firstQuestion: questions[0] || '',
    lastQuestion: questions[questions.length - 1] || '',
    lastConclusion: conclusions[conclusions.length - 1] || '',
    lastAsked: turns.length > 0 && turns[turns.length - 1].asked,
    replies,
    citedTitles: cited.map((t) => t.slice(1, -1)),
  };
}

// 最初の答えの【あなたに聞きたいこと】（本番は AI が相談とメモから作る。お試しは相談の言葉で選ぶ）。
function askFor(question) {
  const q = String(question || '');
  if (/報告|連絡|相談してくれ/.test(q)) return ['報告が遅れるのは、どんな場面が多いですか？', ['会議の前', '急ぎのとき', '悪い知らせ']];
  if (/焦|成果|評価|数字/.test(q)) return ['焦りを強く感じるのは、どんなときですか？', ['数字を見たとき', '人と比べたとき', '締め切り前']];
  if (/任せ|部下|チーム/.test(q)) return ['任せた仕事は、どこで止まりがちですか？', ['始める前', '途中', '仕上げの前']];
  if (/会議|意見|発言/.test(q)) return ['意見を言いにくいのは、どんな会議ですか？', ['大人数の会議', '上司がいる会議', '急に振られた']];
  return ['いちばん困るのは、どんな場面ですか？', ['仕事の場面', '人と話すとき', 'ひとりのとき']];
}
const askSection = (question) => {
  const [ask, replies] = askFor(question);
  return ['【あなたに聞きたいこと】', ask, ...replies.map((r) => `・${r}`)];
};
// 返事（「会議の前」）→「会議の前に」（行動の文の中で使う）。
const whenOf = (reply) => (/[にでは]$/.test(reply) ? reply : `${reply}に`);

// 著者の語り口（2026-09-30）: 質問の後ろの VOICE（今回の語り口）から書名・著者を読む。
function parseVoice(userText) {
  const block = (userText.match(/===== VOICE_START =====\n([\s\S]*?)\n===== VOICE_END =====/) || [])[1];
  if (!block) return null;
  return { title: ((block.match(/書名: 『([^』]*)』/) || [])[1] || '').trim(), author: ((block.match(/著者: (.+)/) || [])[1] || '').trim() };
}

function brainAnswer(store, question, memoBlock = '', aiMode = '', thread = null, voice = null, decide = false, lookup = false, relatedBlock = '') {
  // 深掘りの短い質問（「もっと具体的に」）でも、直前の相談の話題でメモを選ぶ（本番の retrievalQuery と同じ考え方）。
  const q = bigrams(thread ? `${question} ${thread.lastQuestion}` : question);
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
      // 本番と同じく「今回の質問にとくに関係がありそうなメモ」（RELATED_MEMOS・Jev を入れたときは Jev が選んだもの）を先に使う。
      const head = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (relatedBlock && head && relatedBlock.includes(head)) hit += 100;
      return { m, hit };
    })
    .sort((a, b) => b.hit - a.hit || (b.m.created_at || '').localeCompare(a.m.created_at || ''))
    .map((x) => x.m);
  // 本番の回答ルール（必ず複数の本を横断）に合わせ、異なる本から 1 件ずつ選ぶ。
  const picked = [];
  const seen = new Set();
  // 「ほかの本ではどう言ってる？」: 前の答えの根拠にした本は後回しにする（ほかに本が無ければ使う）。
  const otherBooks = thread && /ほかの本/.test(question) && thread.citedTitles.length > 0;
  const citedIds = new Set(otherBooks ? store.table('books').filter((b) => thread.citedTitles.includes(b.title)).map((b) => b.id) : []);
  const ordered = otherBooks ? [...scored.filter((m) => !citedIds.has(m.book_id)), ...scored.filter((m) => citedIds.has(m.book_id))] : scored;
  for (const m of ordered) {
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
  // &ai=fakeref（2026-10-04）: 1 つ目の引用のページを作り（p.300）、渡していない本（『7つの習慣』）を参照と REFS に足す
  //   （画面は、渡したメモと合わない参照を出さず、作ったページを外すことの確認用・evidenceCheck.js）。
  const fakeRef = aiMode === 'fakeref';
  const nameOf = (m, i) => (fakeRef && i === 0 && m.book_id ? label(m).name.replace(/ p\.\d+$/, '').concat(' p.300') : label(m).name);
  const quotes = [
    ...picked.map((m, i) => `- ${nameOf(m, i)} のメモ：「${aiMode === 'fabricate' && i === 1 ? '他人の期待を満たすために生きてはいけない' : m.text}」`),
    ...(fakeRef ? ['- 『7つの習慣』p.88 のメモ：主体性を発揮して、自分で選んで動く'] : []),
  ].join('\n');
  // 一歩は、あとで行動の一覧だけを見ても分かる文にする（本番の指示文と同じ・「この件」と書かない）。
  const subject = questionGist(thread ? (thread.firstQuestion || thread.lastQuestion) : question, 20) || 'いまの悩み';
  const refs = [
    ...picked.map((m) => `- ${label(m).ref}`),
    ...(fakeRef ? ['- 📚 スティーブン・R・コヴィー『7つの習慣』p.88'] : []),
  ].join('\n');

  // 結論・解釈は、引いたメモに書いてあることだけで組み立てる（メモに無い主張を足さない・2026-09-29）。
  const clip = (t) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > 40 ? `${x.slice(0, 40)}…` : x; };
  // 結論には書名・引用のかぎかっこを入れない（出典は「根拠を見る」の中・SPEC §3・本番の BRAIN_SYSTEM と同じ）。
  // 「…という考え」に入れる要旨: 最初の 1 文（長ければ 40 字までの最後の読点まで）。文の途中を … で切らない（2026-10-02 ui-critic）。
  const gist = (t) => {
    const first = String(t || '').replace(/\s+/g, ' ').replace(/[「」『』]/g, '').split(/[。．！？!?]/)[0].trim();
    if (first.length <= 40) return first;
    const cut = first.slice(0, 40).lastIndexOf('、');
    return cut > 8 ? first.slice(0, cut) : first;
  };
  const short16 = (t) => { const x = String(t || '').replace(/\s+/g, ' ').replace(/[「」『』]/g, '').split(/[。．.、]/)[0].trim(); return x.length > 16 ? `${x.slice(0, 16)}…` : x; };
  // 🔎 本を探す問い（本番の BOOK_LOOKUP・「…を書いた本はどれ？」）: 本とメモの一節だけ。問いも行動も書かない。
  if (lookup) {
    const names = [...new Set(picked.filter((m) => m.book_id).slice(0, 2).map((m) => `『${books.get(m.book_id).title}』`))];
    return [
      '【結論】',
      names.length ? `${names.join('と')}のメモに書いていました。` : 'あなたの読書記録には、このトピックに関する情報がまだありません',
      '',
      '【参照した本のメモ】',
      quotes,
      '',
      '（お試しモードの応答です。本番では AI があなたのメモ全体を読んで答えます）',
      '',
      'REFS_START',
      refs,
      'REFS_END',
    ].join('\n');
  }
  // 🎯 行動を決める回（会話の続きで行動を求めた・本番の ACTION_REQUEST）: 会話で聞いた状況（返事）を使って行動を 1 つ。
  if (decide) {
    const situation = (thread && thread.replies[thread.replies.length - 1]) || '';
    return [
      '【結論】',
      situation
        // 結論は短く（行動を決める回は、一歩の箱が主役）。
        ? `「${situation}」の場面に絞って、メモの一節を 1 回だけ試しましょう。`
        : 'ここまでの話から、メモの一節を 1 回だけ試しましょう。',
      '',
      '【参照した本のメモ】',
      quotes,
      '',
      '【あなたの状況に合わせた解釈】',
      situation
        ? `「${situation}」と聞いて、場面を 1 つに絞れました。${p1.name}の「${clip(picked[0].text)}」を、その場面だけで試すのがいちばん小さな一歩です。`
        : `${p1.name}の「${clip(picked[0].text)}」を、次の 1 回だけで試すのがいちばん小さな一歩です。`,
      '',
      '【明日からできる 1 つの行動】',
      situation
        // 行動の文は短く（行動の一覧で 2〜3 行に収まる長さ）。メモの一節は 16 字まで。
        ? `「${subject}」について、${whenOf(situation)}メモの「${short16(picked[0].text)}」を 1 回だけ試す。`
        : `「${subject}」の次の場面で、メモの「${short16(picked[0].text)}」を 1 回だけ試す。`,
      '',
      '（お試しモードの応答です。本番では AI があなたのメモ全体を読んで答えます）',
      '',
      'REFS_START',
      refs,
      'REFS_END',
    ].join('\n');
  }
  // 返事（前の答えの問いへの答え）: その状況に合わせて一歩深く。行動はまだ決めない（本番の BRAIN_SYSTEM ルール 9）。
  if (thread && thread.lastAsked) {
    const reply = String(question || '').trim().slice(0, 20);
    return [
      '【結論】',
      `${voice ? '私なら、' : ''}「${reply}」の場面なら、${gist(picked[0].text)}という考えが効きそうです。`,
      '',
      '【参照した本のメモ】',
      quotes,
      '',
      '【あなたの状況に合わせた解釈】',
      p2
        ? `「${reply}」の場面では、${p1.name}の「${clip(picked[0].text)}」を先に置き、${p2.name}の「${clip(picked[1].text)}」で相手が話しやすい形を整えると、動きやすくなります。`
        : `「${reply}」の場面では、「${clip(picked[0].text)}」を先に置くと、相手が話しやすくなります。`,
      '',
      // 最後の節（問い・行動）が無い答えの注記は「— 」で始める（画面は答えの下の注記として出す＝根拠の中に混ぜない）。
      '— （お試しモードの応答です。本番では AI があなたのメモ全体を読んで答えます）',
      '',
      'REFS_START',
      refs,
      'REFS_END',
    ].join('\n');
  }
  if (thread) {
    // 深掘りの答え（本番の BRAIN_SYSTEM ルール 9 と同じく、一歩深く・メモの言葉だけで・行動は求められたときだけ）。
    const ifFail = /うまくいかなかったら/.test(question);
    return [
      '【結論】',
      otherBooks
        ? `ほかの本のメモから見ると、${gist(picked[0].text)}という考えも使えます。前の答えと合わせて、2 つ目の手にしましょう。`
        : ifFail
          ? `${voice ? '私なら、' : ''}うまくいかなかったときは、やり方を変えるより先に、${gist(picked[0].text)}という考えに立ち戻ります。`
          : `${voice ? '私の考え方で言えば、' : ''}前の答えを一歩具体的にすると、${gist(picked[0].text)}を、次の 1 回の場面に決めて試すことです。`,
      '',
      '【参照した本のメモ】',
      quotes,
      '',
      '【あなたの状況に合わせた解釈】',
      p2
        ? `前の答えで決めたことを変えずに、${p1.name}の「${clip(picked[0].text)}」を具体的な場面に置き、足りなければ${p2.name}の「${clip(picked[1].text)}」で補います。`
        : `前の答えで決めたことを変えずに、「${clip(picked[0].text)}」を具体的な場面に置きます。`,
      '',
      '— （お試しモードの応答です。本番では AI があなたのメモ全体を読んで答えます）',
      '',
      'REFS_START',
      refs,
      'REFS_END',
    ].join('\n');
  }
  if (voice && !p2) {
    // 1 冊の本から答えるときは、その著者の語り口で（本番の BRAIN_SYSTEM ルール 8・中身はメモの言葉だけ）。
    return [
      '【結論】',
      `私の考え方で言えば、${gist(picked[0].text)}。まずはそこから始めてみてください。`,
      '',
      '【参照した本のメモ】',
      quotes,
      '',
      '【あなたの状況に合わせた解釈】',
      `あなたが残した「${clip(picked[0].text)}」は、私がいちばん大事にしている考え方に近いところです。`,
      '',
      ...askSection(question),
      '',
      '（お試しモードの応答です。本番では AI が本とあなたのメモをもとに、著者の語り口をまねて答えます）',
      '',
      'REFS_START',
      refs,
      'REFS_END',
    ].join('\n');
  }
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
      ? `${bookCount >= 2 ? '別々の本で残したメモです。' : '本で読んだことと、自分で気づいたことです。'}まず${p1.name}の「${clip(picked[0].text)}」、足りなければ${p2.name}の「${clip(picked[1].text)}」という順で使えます。`
      : `「${clip(picked[0].text)}」を、いまの悩みのどこに当てはめられるかを 1 つだけ決めると、動きやすくなります。`,
    '',
    // 🎯 最初の答えは行動を決めず、状況を 1 つ聞く（本番の BRAIN_SYSTEM ルール 5・2026-09-30）。
    ...askSection(question),
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

// decide: 行動を決める回（会話の続きで行動を求めた）だけ行動を 1 つ。それ以外は【あなたに聞きたいこと】で締める（2026-09-30）。
const PERBOOK_ASK = ['【あなたに聞きたいこと】', '焦りを強く感じるのは、どんなときですか？', '・数字を見たとき', '・人と比べたとき', '・締め切り前'];
const PERBOOK_ACTION = ['【明日からできる 1 つの行動】', '始業前の 10 分で、次の商談を 1 つだけ選び、「この商談で相手に何を貢献できるか」を 1 行書いてから臨む。'];
function perBookAnswer(block, decide = false, aiMode = '') {
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
  const givenCount = views.length; // 共通点と違いの「N 冊とも」は渡された本の数
  // &ai=fakeref（2026-10-04）: 1 冊目の根拠のページを作り（p.300）、渡していない本のカードを足す（画面は出さない・ページを外す）。
  if (aiMode === 'fakeref' && views.length > 0) {
    views[0] = { ...views[0], basis: views[0].basis.replace(/^p\.\d+/, '').replace(/^/, 'p.300') };
    views.push({ title: '7つの習慣', author: 'スティーブン・R・コヴィー', view: '主体性を発揮して、反応する前に自分で選びます。', basis: 'p.88「主体性を発揮する」', ref: '📚 スティーブン・R・コヴィー『7つの習慣』p.88' });
  }
  return [
    '【結論】',
    '焦りの正体を分けて、いま自分で動かせる一点に集中しましょう。評価や結果は、追いかけるほど遠くなります。',
    '',
    '【本ごとの視点】',
    ...views.flatMap((v) => [`◆『${v.title}』｜${v.author}`, `視点：${v.view}`, `根拠：${v.basis}`, '']),
    '【共通点と違い】',
    `${givenCount} 冊とも「自分で変えられることに力を集める」点で重なります。違うのは入り口で、何を手放すか、誰の課題かを分けるか、相手とどう向き合うかが分かれます。`,
    '',
    ...(decide ? PERBOOK_ACTION : PERBOOK_ASK),
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
function perBookBrokenAnswer(block, decide = false) {
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
    ...(decide ? PERBOOK_ACTION : PERBOOK_ASK),
    '',
    'REFS_START',
    ...titles.map((t) => `- 📚 『${t}』`),
    'REFS_END',
  ].join('\n');
}

// お試しの読書計画シート。目次があればその項目名を「」で引き、無ければ章の名前を挙げない（本番の指示文と同じ決まり）。
function planSheetAnswer(userText) {
  const about = (userText.match(/===== 本の紹介（[^）]*） =====\n([\s\S]*?)\n===== 本の紹介ここまで/) || [])[1] || '';
  const toc = ((userText.match(/===== 目次（データ） =====\n([\s\S]*?)\n===== 目次ここまで/) || [])[1] || '')
    .split('\n').map((l) => l.replace(/^- /, '').trim()).filter(Boolean);
  const purpose = ((userText.match(/得たいこと: (.+)/) || [])[1] || '').trim();
  const pick = (re) => toc.find((l) => re.test(l));
  const focus = [pick(/資産/), pick(/シナリオ/), pick(/ステージ/)].filter(Boolean).slice(0, 3);
  const skim = [pick(/資金計画/), pick(/雇用/)].filter(Boolean).slice(0, 2);
  // 概要は紹介文の写しではなく、著者のいちばんの主張を 1〜2 行（本番の指示文と同じ）。紹介も目次も無ければ節ごと出さない。
  return [
    ...(about || toc.length
      ? ['## 📖 この本の概要', '長く生きる時代には、お金より「見えない資産」を育て、人生のステージを自分で組み替えることが要になる——というのが著者の主張です。', '']
      : []),
    '## 🎯 読み方の戦略',
    `- ${purpose ? `「${purpose}」に引きつけて読む` : '自分の働き方に引きつけて読む'}`,
    '- 自分の「見えない資産」を書き出しながら読む',
    '- 次のステージの候補を1つ決めて読み終える',
    '',
    '## 📍 重点的に読む箇所（20%）',
    ...(toc.length
      ? (focus.length ? focus : toc.slice(1, 3)).map((l) => `- 『${l}』: 得たいことにいちばん近い章`)
      : ['目次が手に入らないため、章の名前は挙げていません。', '- 人生の段階の分け方を説明している部分', '- 具体的な人物の例が出てくる部分']),
    '',
    '## ⏩ 流し読みでOKな箇所',
    ...(toc.length && skim.length ? skim.map((l) => `- 『${l}』: 数字の細部は流してよい`) : ['- 統計や数字の細部']),
    '',
    '## ❓ 注意点・落とし穴',
    '- 海外の事例は、日本の制度に置き換えて読む',
    '',
    '## 💡 期待される変化',
    '- 5年後の働き方を1行で書ける',
    '- 学び直しの時間を予定に入れる',
    '- 人間関係に使う時間を見直す',
    '',
    // &related=messy: 2 冊を混ぜた行・『』の無い行・実在しない本（書誌で確かめて直すか消すことの確認用・2026-10-04）
    ...(relatedMessy() ? DEMO_MESSY_RELATED.split('\n') : [
      '## 📚 関連書籍',
      '### 1. 『GRIT やり抜く力』- アンジェラ・ダックワース',
      '長いステージを走り切る粘り強さを、習慣として育てる考え方が補えます。',
      '### 2. 『思考の整理学』- 外山滋比古',
      '学び直しの時間を、自分の考えにまとめる力につなげられます。',
    ]),
  ].join('\n');
}

function aiReply(store, payload, aiMode = '') {
  const last = [...(payload.messages || [])].reverse().find((m) => m.role === 'user');
  const userText = textOf(last?.content);
  const perBook = userText.match(/PERSPECTIVE_BOOKS_START =====\n([\s\S]*?)\n===== PERSPECTIVE_BOOKS_END/);
  // 行動を決める回は、本番と同じくアプリが質問の後ろに ACTION_REQUEST を付ける（ai.js の turnHint）。
  const decide = userText.includes('===== ACTION_REQUEST =====');
  if (perBook) return aiMode === 'broken' ? perBookBrokenAnswer(perBook[1], decide) : perBookAnswer(perBook[1], decide, aiMode);
  const q = userText.match(/QUESTION_START =====\n([\s\S]*?)\n=====/);
  if (q) {
    // 本番は質問に近いメモを RELATED_MEMOS に分けて渡す（MEMOS からは外す）ので、両方を材料にする。
    const related = (userText.match(/RELATED_MEMOS_START =====\n([\s\S]*?)\n===== RELATED_MEMOS_END/) || [])[1] || '';
    const block = [
      (userText.match(/===== MEMOS_START =====\n([\s\S]*?)\n===== MEMOS_END/) || [])[1] || '',
      related,
    ].filter(Boolean).join('\n\n');
    return brainAnswer(store, q[1], block, aiMode, parseThread(userText), parseVoice(userText), decide, userText.includes('===== BOOK_LOOKUP ====='), related);
  }
  // 📷 写真から書き起こし（本番と同じく、本文だけを返す）。
  if (payload.purpose === 'ocr') return '成果を上げるには、まず自分の時間がどこに使われているかを知ることから始めなければならない。時間の記録をとり、ムダな仕事を捨て、まとまった時間をつくる。';
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
      // &ai=mixedrec: 書名の欄に 2 冊を混ぜたカード（「A または B」）。画面は 1 冊ずつ確かめて、見つかった 1 冊のカードにする（2026-10-04）。
      ...(aiMode === 'mixedrec' ? [{ title: '7つの習慣 または やめる習慣', author: 'スティーブン・R・コヴィー',
        why: '自分で選んで動く「主体性」の考え方が、任せ方の土台になります。',
        core: '反応する前に、自分で選ぶ。', focus: '主体性の考え方', duration: '3週間で読了、1か月で実践' }] : []),
    ];
    return [
      '## 👋 はじめに', 'お話を伺って、時間の使い方と任せ方の両方に効く本を選びました。', '',
      '## 📚 おすすめの本', '', 'RECOMMENDATIONS_START', JSON.stringify(recs, null, 2), 'RECOMMENDATIONS_END', '',
      // 4 行目は JSON に無い架空の書名（本番で起きた漏れの再現・2026-09-30）。画面では lib/advisorProse.js が消し、番号も 1〜3 のまま。
      '## 📋 読む順番のおすすめ', '1. 『大事なことに集中する』 — 集中できる時間をつくる', '2. 『チームを動かす最強の時間術 ハイライト実践編』 — 仕上げに', '3. 『時間術大全』 — 毎日の 1 つを決める', '4. 『プロフェッショナルマネジャー』 — 結果から逆算して任せる', '',
      '## 💬 まとめ', '一冊ずつ、明日できる一歩に変えていきましょう。',
    ].join('\n');
  }
  // 📖 読書計画シート（2026-10-02）: 本番と同じく、渡された「本の紹介」「目次」だけから概要と重点箇所を書く。
  if (system.includes('『読書計画シート』を作成')) return planSheetAnswer(userText);
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

// 🧭 お試しモードの Jev（偽物）。悩みごとの言葉の手がかり（意味の近さのまね）で確率を決める。
const JEV_DEMO_PURPOSES = new Set(['memo_relevance', 'intent']);
const JEV_DEMO_CONCERNS = {
  人を動かす: /部下|メンバー|後輩|マネージャー|1on1|人に動いて|批判|命令|任せ/,
  抱えすぎ: /抱え|手が回ら|忙し|やらない|断る|持ち帰|バッファ|予定/,
  会議: /会議|結論|決めて|イシュー/,
  評価: /評価|承認|人の目|他人の課題|気にな/,
  忘れる: /忘れ|記憶|見返|アウトプット|話す/,
};
function demoJevResult(purpose, input) {
  if (purpose === 'memo_relevance') {
    // 相談の悩みごとの手がかり（意味の近さのまね）。「報告」のような語の重なりだけでは選ばない。
    const concernsOf = (text) => Object.entries(JEV_DEMO_CONCERNS).filter(([, re]) => re.test(String(text || ''))).map(([k]) => k);
    const q = concernsOf(input.question);
    const scores = {};
    for (const m of input.memos || []) scores[m.id] = concernsOf(m.text).some((t) => q.includes(t)) ? 0.82 : 0.08;
    return { scores };
  }
  return { intent: /どの本|何の本|なんの本|だっけ/.test(String(input.question || '')) ? 'lookup' : 'consult', confidence: 0.8, probabilities: null };
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
      // 🧭 Jev（判断のモデル・?jev=1 のときだけアプリが送る）の見本: 言葉の手がかりで「はい」の確率を決める偽物。
      //   本番（api/_jevRelay.js）と同じく、いつも 200・トークンは数えない。&jev=down で「使えない」（{ jev: null }）。
      if (JEV_DEMO_PURPOSES.has(payload.purpose)) {
        await wait(250, signal); // 本番の Jev（約 70〜500ms）くらい
        if (new URLSearchParams(window.location.search).get('jev') === 'down') return json({ jev: null, reason: 'upstream' });
        return json({ jev: { result: demoJevResult(payload.purpose, payload.jev || {}), ms: 180 } });
      }
      // 本番（api/claude.js・api/_aiAccess.js）と同じ決まりをまねる:
      //   契約なし＝無料プラン: 相談（purpose 'consult'）だけ・毎月 30 トークン（'free-YYYY-MM'）。ほかは 402 plan_required
      //   無料期間: 150 トークン（'trial-終わる日'）/ 有料: 毎月 800 トークン（'YYYY-MM'）→ 使い切ったら 429
      //   「最後の 1 回」: 使ったトークン（切り上げ）が上限未満なら始められる。
      const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
      const month = jstNow.toISOString().slice(0, 7);
      const nextFirst = `${(jstNow.getUTCMonth() + 1) % 12 + 1}\u2060月\u20601\u2060日`;
      const sub = store.table('subscriptions').find((r) => r.status === 'active');
      const tier = !sub ? 'free' : sub.period_type === 'trial' ? 'trial' : 'paid';
      // 📷 無料プランの写真から書き起こし: 相談のトークンとは別に、毎月 10 回（'freeocr-YYYY-MM' の calls・2026-10-02）。
      if (tier === 'free' && payload.purpose === 'ocr') {
        const rows = store.table('ai_usage');
        let row = rows.find((r) => r.period_month === `freeocr-${month}`);
        if (!row) { row = { user_id: store.session?.user?.id, period_month: `freeocr-${month}`, calls: 0, cost_mjpy: 0 }; rows.push(row); }
        if (row.calls >= 10) {
          return json({ error: { message: `今月の写真から書き起こしは、ここまでです。${nextFirst}に 10 回に戻ります。` }, error_code: 'free_ocr_limit_reached' }, 402);
        }
        row.calls += 1;
        await wait(900, signal);
        return json({ content: [{ type: 'text', text: aiReply(store, payload, aiMode) }], stop_reason: 'end_turn' });
      }
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
        ? ['【結論】', 'あなたの読書記録には、このトピックに関する情報がまだありません。このテーマの本を読んだら、心が動いた一行をメモに残すと、ここで答えられるようになります。'].join('\n')
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
    if (url.includes('/api/cover') && /[?&]search=/.test(url)) {
      // 本の検索（2026-10-02・本番は楽天の売上順 → Google → NDL）。&search=fail は失敗（端末の検索に切り替わる）・
      //   &search=old は「サーバーの検索が無い」（直す前と同じく端末だけで探す・比べる用）。
      //   &search=slow は答えがなかなか返らない（読み込み中の形の確認用）。
      const mode = new URLSearchParams(window.location.search).get('search');
      await wait(mode === 'slow' ? 60000 : 300, signal);
      if (mode === 'fail') return json({ error: 'unavailable', results: [] }, 502);
      if (mode === 'old') return json({ error: 'お試しモードでは使えません' }, 503);
      const q = (() => { try { return new URL(url, window.location.origin).searchParams.get('search') || ''; } catch { return ''; } })();
      return json(demoServerSearch(q));
    }
    if (url.includes('/api/cover')) {
      // 見本の本の一覧にある本は「実在する」と答える（AI 選書の実在確認で全部が疑わしく見えないように）。
      const params = (() => { try { return new URL(url, window.location.origin).searchParams; } catch { return new URLSearchParams(); } })();
      const title = params.get('title') || '';
      // 📖 この本について（?info=1・2026-10-02）: 見本の紹介文と目次。&info=none＝どの本も見つからない／&info=slow＝3 秒待つ。
      if (params.get('info') === '1') {
        const mode = new URLSearchParams(window.location.search).get('info');
        if (mode === 'slow') await new Promise((r) => setTimeout(r, 3000));
        //   &info=toconly＝目次だけ（楽天の商品説明の【目次】から）／&info=mixed＝紹介は出版社・目次は楽天（取得元が違う）。
        const base = DEMO_BOOK_INFO[params.get('isbn') || ''];
        const sampleToc = ['第1章 変化に気づく', '第2章 古いチーズを手放す', '第3章 新しいチーズを探す', '第4章 変化を楽しむ'];
        let hit = mode === 'none' ? null : base;
        if (base && mode === 'toconly') hit = { ...base, description: '', source: '', toc: base.toc.length ? base.toc : sampleToc, tocSource: 'rakuten' };
        if (base && mode === 'mixed') hit = { ...base, source: 'openbd', toc: base.toc.length ? base.toc : sampleToc, tocSource: 'rakuten' };
        return json(hit || { description: '', toc: [], source: '', tocSource: '', pages: 0, pubdate: '', isbn: params.get('isbn') || '' });
      }
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
      return new Response(demoNdlXml(url), {
        status: 200, headers: { 'Content-Type': 'application/xml' },
      });
    }
    return realFetch(input, init);
  };
}
