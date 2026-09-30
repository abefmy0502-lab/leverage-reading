// 🧪 お試しモード（開発専用）のサンプルデータ。
// 「半年ほど使い込んだビジネスパーソン」の本棚を再現する。メモは書籍からの
// 引用ではなく、読み手自身の言葉で書いた気づき（著作物の転載を避けるため）。
// 日付は起動時点からの相対（daysAgo）で生成するので、いつ開いても自然に見える。

export const DEMO_USER_ID = '00000000-0000-4000-8000-00000000d3e0';

const COLORS = [
  ['#2f4858', '#f6f1e7'], ['#7a3b2e', '#fbeee0'], ['#1f5f5b', '#eef6f3'],
  ['#3d3a6b', '#f1effa'], ['#8a5a14', '#fdf4e3'], ['#274060', '#eaf0f8'],
  ['#5c2a4a', '#f9ecf3'], ['#35553a', '#edf5ea'], ['#6b4b2a', '#f7efe5'],
  ['#44475a', '#f0f0f4'],
];

// 表紙の書名を折り返す。英数字の単語はひとかたまり、日本語は 1 字ずつ折り返せる単位にする。
// 幅は概算（全角 1em・太字の英大文字 0.72em・ほかの半角 0.58em・空白 0.3em）。
const COVER_TITLE_W = 160;
const COVER_TITLE_H = 205;
function unitWidth(u, size) {
  let w = 0;
  for (const ch of u) w += /\s/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.72 : /[\x21-\x7e]/.test(ch) ? 0.58 : 1;
  return w * size;
}
function wrapTitle(title, size) {
  // 行頭に来てはいけない字（小さいかな・ー・閉じ括弧・句読点）は前の字とひとかたまりにする。
  const units = [];
  for (const u of title.match(/[A-Za-z0-9.,'!?&:\-]+|\s+|./gu) || []) {
    if (units.length && /^[ぁぃぅぇぉっゃゅょァィゥェォッャュョー）」』、。・！？]$/.test(u) && !/^\s+$/.test(units[units.length - 1])) units[units.length - 1] += u;
    else units.push(u);
  }
  const lines = [];
  let cur = '';
  for (const u of units) {
    if (/^\s+$/.test(u)) { if (cur) cur += ' '; continue; }
    // 1 単語が 1 行に入らないときだけ、その単語を文字で切る。
    if (unitWidth(u, size) > COVER_TITLE_W) {
      for (const ch of u) {
        if (unitWidth(cur + ch, size) > COVER_TITLE_W && cur.trim()) { lines.push(cur.trim()); cur = ''; }
        cur += ch;
      }
      continue;
    }
    if (unitWidth(cur + u, size) > COVER_TITLE_W && cur.trim()) { lines.push(cur.trim()); cur = ''; }
    cur += u;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
function layoutCoverTitle(title) {
  for (let size = 24; size >= 14; size -= 2) {
    const lines = wrapTitle(title, size);
    const maxLines = Math.floor(COVER_TITLE_H / (size * 1.25));
    const tooLongWord = (title.match(/[A-Za-z0-9.,'!?&:\-]+/g) || []).some((w) => unitWidth(w, size) > COVER_TITLE_W);
    if (lines.length <= maxLines && !tooLongWord) return { lines, size };
  }
  const size = 14;
  return { lines: wrapTitle(title, size).slice(0, Math.floor(COVER_TITLE_H / (size * 1.25))), size };
}

// 表紙は外部画像を使わず SVG を data URI で描く（オフラインでも本棚らしく見せる）。
function coverSvg(title, author, i) {
  const [bg, fg] = COLORS[i % COLORS.length];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // 書名は枠（x 20〜180・y 40〜245）の中に収める。英単語は途中で切らず（「LIFE SH/IFT」にしない）、
  // 収まらないときは文字を小さくする（LP の画面写真にも使うため）。
  const { lines, size } = layoutCoverTitle(title);
  const lineH = Math.round(size * 1.25);
  const titleSvg = lines.map((l, idx) =>
    `<text x="20" y="${40 + size + idx * lineH}" font-size="${size}" font-weight="700" fill="${fg}" font-family="serif">${esc(l)}</text>`,
  ).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">` +
    `<rect width="200" height="300" fill="${bg}"/>` +
    `<rect x="12" y="12" width="176" height="276" fill="none" stroke="${fg}" stroke-opacity="0.35"/>` +
    titleSvg +
    `<text x="20" y="270" font-size="13" fill="${fg}" fill-opacity="0.85" font-family="sans-serif">${esc(author)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const iso = (daysAgo, hour = 21) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, (daysAgo * 7) % 60, 0, 0);
  return d.toISOString();
};
const dateOnly = (daysAgo) => iso(daysAgo).slice(0, 10);

// [title, author, isbn, status, startedDaysAgo, doneDaysAgo, rating, purpose, tags]
const BOOKS = [
  ['レバレッジ・リーディング', '本田直之', '9784492555938', 'done', 190, 182, 5,
    '読んだ本を仕事の成果に変えるやり方を知りたい', ['読書術']],
  ['イシューからはじめよ', '安宅和人', '9784862760852', 'done', 160, 150, 5,
    '会議や企画で「何を考えるべきか」を外さないようにしたい', ['思考法', '仕事術']],
  ['エッセンシャル思考', 'グレッグ・マキューン', '9784761270438', 'done', 130, 121, 4,
    '仕事を抱えすぎて手が回らない状態を抜け出したい', ['仕事術', '時間']],
  ['人を動かす', 'D・カーネギー', '9784422100517', 'done', 110, 98, 5,
    'チームのメンバーとの関係をよくしたい', ['マネジメント', 'コミュニケーション']],
  ['嫌われる勇気', '岸見一郎・古賀史健', '9784478025819', 'done', 90, 80, 4,
    '人の評価を気にしすぎる自分を変えたい', ['心理学']],
  ['アウトプット大全', '樺沢紫苑', '9784864106368', 'done', 70, 64, 4,
    '学んだことを忘れずに使えるようにしたい', ['読書術', '習慣']],
  ['数値化の鬼', '安藤広大', '9784478114445', 'reading', 20, null, 0,
    'チームの成果をきちんと測って伸ばしたい', ['マネジメント']],
  ['1兆ドルコーチ', 'エリック・シュミット', '9784478107249', 'reading', 9, null, 0,
    '1on1 でメンバーの力を引き出せるようになりたい', ['マネジメント', 'コミュニケーション']],
  ['LIFE SHIFT', 'リンダ・グラットン', '9784492533871', 'before', null, null, 0, '', ['キャリア']],
  ['チーズはどこへ消えた？', 'スペンサー・ジョンソン', '9784594025551', 'want', null, null, 0, '', ['キャリア']],
];

// 読書準備・AI の出力が入っている本（編集画面の「以前の AI 解析」「AI 選書から引き継いだ内容」
// 「読書計画シート」「この本のAI まとめ」を、お試しモードでも確かめられるように）。
const BOOK_EXTRAS = {
  'LIFE SHIFT': {
    source_query: '40代からのキャリアの考え方を知りたい',
    current_challenge: 'いまの会社で定年まで働くイメージが持てない',
    hypothesis: '人生を複数のステージで考える視点が身につく',
    book_reason: '長く働く時代の「無形の資産」の育て方を、具体的な事例で考えられるため。',
    ai_analysis: '## 🧭 この本の核心\n寿命が延びると、教育→仕事→引退の 3 段階では足りなくなる。\n\n## 🔑 キーコンセプト\n- 無形の資産（スキル・健康・人間関係）\n- マルチステージの人生',
  },
  '1兆ドルコーチ': {
    ai_strategy: '## 🎯 重点的に読む箇所\n- 第2章 1on1 の進め方\n\n## ⏩ 流し読みでよい箇所\n- 第5章 チームファースト',
  },
  'イシューからはじめよ': {
    ai_summary: '報告や企画は「決めてほしいこと」から話す。分析の前にストーリーラインを作る。',
  },
};

// [bookIndex | null, page, text, daysAgo, tags, recallCount]
const MEMOS = [
  [0, 32, '読書は「投資」。1冊から1つでも行動が変われば元は取れる。全部覚えようとしなくていい。', 188, ['読書術'], 2],
  [0, 58, '目的を決めてから読むと、必要なところが勝手に目に入ってくる。読む前に「この本で何を解決したいか」を一行書く。', 186, [], 1],
  [0, 120, '読んだあとに自分用のメモを作り、何度も見返すのが本番。本を読むのは準備にすぎない。', 183, [], 0],
  [1, 25, '答えを出す前に「本当に答えるべき問い（イシュー）」かを確かめる。忙しさの大半は、解かなくていい問いに取り組んでいることから来る。', 158, ['思考法'], 2],
  [1, 47, 'よいイシューの条件は「本質的な選択肢であること」「深い仮説があること」「答えを出せること」。', 156, [], 1],
  [1, 88, '分析の前にストーリーラインと絵コンテを作る。どんなグラフがあれば結論を言えるかを先に考える。', 152, ['仕事術'], 0],
  [1, null, '部長への報告で、結論より経緯を先に話してしまう癖がある。「この報告で決めてほしいことは何か」から話す。', 151, [], 0],
  [2, 18, '「全部やる」はできない。やらないことを決めることが、いちばん大事な仕事。', 128, ['仕事術'], 3],
  [2, 64, '頼まれごとに即答しない。「確認して返事します」と一度持ち帰ると、断る余地が生まれる。', 126, [], 1],
  [2, 102, '迷ったら「絶対にやりたい」と思えないものは、すべて「やらない」にする（90点ルール）。', 124, [], 0],
  [2, 150, '予定を詰めすぎない。予備の時間（バッファ）を最初からカレンダーに入れておく。', 122, ['時間'], 0],
  [3, 30, '人は自分が重要だと感じたいもの。相手の名前を覚えて呼ぶだけで関係が変わる。', 108, ['コミュニケーション'], 2],
  [3, 76, '批判しても人は変わらない。まず相手の立場で「なぜそうしたのか」を考える。', 105, [], 1],
  [3, 142, '人に動いてもらうには、命令ではなく質問で。「どうすればうまくいくと思う？」と聞く。', 101, ['マネジメント'], 0],
  [3, null, '後輩の資料のミスを、みんなの前で指摘してしまった。次は1対1で、先によかった点から伝える。', 99, [], 0],
  [4, 40, '他人の課題と自分の課題を分ける。相手が自分をどう評価するかは「相手の課題」。', 88, ['心理学'], 2],
  [4, 132, '承認を求めて生きると、他人の人生を生きることになる。貢献している感覚があれば、それで十分。', 84, [], 1],
  [4, 210, '「いま、ここ」に集中する。過去の失敗も、将来の不安も、今日やることを変えない。', 81, [], 0],
  [5, 22, 'インプットとアウトプットの黄金比は 3:7。読んだら話す・書く・行動する。', 68, ['読書術', '習慣'], 1],
  [5, 71, '2週間に3回使った情報は記憶に残る。読んだ内容は、その週のうちに誰かに話す。', 66, ['習慣'], 0],
  [5, 180, '寝る前の15分は記憶のゴールデンタイム。1日の学びを3行で書いてから寝る。', 65, [], 0],
  [6, 15, '「頑張ります」は計測できない。行動を「数」で決める（例：週に3件、先方に電話する）。', 18, ['マネジメント'], 0],
  [6, 48, '結果の数字より、それを生む行動の数字（KPI）を見る。行動量が足りないのか、やり方が悪いのかを分けて考える。', 14, [], 0],
  [6, null, 'チームの週次ミーティングで「件数」だけでなく「次の一週間で何件やるか」を各自に言ってもらう。', 12, [], 0],
  [7, 33, 'よいマネージャーは答えを与えるのではなく、問いで考えさせる。', 7, ['マネジメント'], 0],
  [7, 61, '1on1 は仕事の話の前に、相手の近況や家族の話から始める。人として関心を持っていることを伝える。', 5, ['コミュニケーション'], 0],
  [7, 95, 'チームの勝利が最優先。個人の手柄より、チームが勝つための判断をする。', 2, [], 0],
  [null, null, '会議で意見が割れたときは「そもそも何を決める会議か」を最初に確認すると早く終わる。', 60, ['仕事術'], 0],
  [null, null, '上司に相談するときは、選択肢を2つ用意して「私はAがいいと思います」まで言う。', 45, ['仕事術'], 0],
  [null, null, '忙しい週ほど、朝の15分で「今日やらないこと」を決めると夕方に余裕が残る。', 30, ['時間'], 0],
];

// [bookIndex, text, done, daysAgo, priority, deadlineInDays | null]
const ACTIONS = [
  [0, '本を読む前に「解決したいこと」を一行書く', true, 180, 'medium', null],
  [1, '報告は「決めてほしいこと」から話す', true, 150, 'high', null],
  [1, '企画書を作る前に、結論のストーリーを箇条書きで作る', false, 148, 'medium', 5],
  [2, '頼まれごとは一度「確認して返事します」と持ち帰る', true, 125, 'high', null],
  [2, 'カレンダーに毎日30分のバッファを入れる', false, 120, 'medium', 2],
  [3, '後輩へのフィードバックは1対1で、よかった点から伝える', true, 98, 'high', null],
  [4, '人の評価が気になったら「これは誰の課題？」と自分に聞く', true, 80, 'low', null],
  [5, '読んだ本の内容を、その週のうちに誰かに話す', false, 64, 'medium', 1],
  [6, '週次ミーティングで各自の行動目標を「数」で言ってもらう', false, 12, 'high', 4],
  [7, '次の1on1 は近況の話から始める', false, 5, 'medium', 3],
];

export function buildSeed(scenario) {
  const now = new Date().toISOString();
  const db = {
    books: [], book_tags: [], book_collections: [], actions: [], book_memos: [],
    chat_messages: [], theme_reports: [], advisor_sessions: [], push_subscriptions: [],
    analytics_events: [], feedback: [], account_deletion_requests: [], ai_token_lots: [],
    subscriptions: [{
      user_id: DEMO_USER_ID, status: 'active', provider: 'demo', price_id: 'orime_annual', // 設定の「プラン」は年額プラン
      current_period_end: iso(-30), created_at: iso(200), updated_at: now,
    }],
  };
  const jstMonth = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  // ?demo=freenew: 新規ユーザーで、契約なし（無料プラン・初回ガイドから）。
  if (scenario === 'freenew') { db.subscriptions = []; db.ai_usage = []; return db; }
  if (scenario === 'new') return db;
  // ?demo=free: 本もメモもある、契約なしの人（無料プラン＝相談だけ AI・毎月 30 トークン）。
  if (scenario === 'free') { db.subscriptions = []; db.ai_usage = []; }
  // ?demo=freegrown: 無料プランで、自分のメモが 10 件以上たまった人（相談のいちばん上の「相談相手が育ってきました」
  //   ＝7 日間無料をすすめる案内の確認用・lib/trialNudge.js）。ほかのシナリオでは、この案内は閉じたものとして出さない。
  //   &trial=off で「無料期間はもう使えない人」の文（「プランを見る」）。
  if (scenario === 'freegrown') { db.subscriptions = []; db.ai_usage = []; }
  // ?demo=freeused: 無料プランで今月の 30 トークンを使い切った人（案内と有料プランの画面の確認用）。
  if (scenario === 'freeused') {
    db.subscriptions = [];
    db.ai_usage = [{ user_id: DEMO_USER_ID, period_month: `free-${jstMonth}`, calls: 3, cost_mjpy: 9000 }];
  }
  // ?demo=paywall: 使い込んだデータのまま、購読だけ無い（有料プランの画面の確認用）。
  if (scenario === 'paywall') db.subscriptions = [];
  // ?demo=trial: 7 日間無料の途中（あと 5 日・150 トークンのうち 40 を使った）。
  // ?demo=trialout: 7 日間無料の途中で 150 トークンを使い切った（無料期間が終わる日の案内の確認用）。
  if (scenario === 'trial' || scenario === 'trialout') {
    const end = iso(-5);
    db.subscriptions[0] = { ...db.subscriptions[0], period_type: 'trial', current_period_end: end };
    const endDay = new Date(Date.parse(end) + 9 * 3600 * 1000).toISOString().slice(0, 10);
    db.ai_usage = [{ user_id: DEMO_USER_ID, period_month: `trial-${endDay}`, calls: scenario === 'trialout' ? 15 : 4, cost_mjpy: scenario === 'trialout' ? 45000 : 12000 }];
  }
  // ?demo=limit: 今月の 800 トークンを使い切った人（上限の案内の確認用）。
  if (scenario === 'limit') {
    db.ai_usage = [{ user_id: DEMO_USER_ID, period_month: jstMonth, calls: 80, cost_mjpy: 240000 }];
  }
  // ?demo=tokens: 今月の 800 トークンを使い切り、買い足した分が 120 トークン残っている人。
  if (scenario === 'tokens') {
    db.ai_usage = [{ user_id: DEMO_USER_ID, period_month: jstMonth, calls: 98, cost_mjpy: 294000, lot_tokens: 180 }];
    db.ai_token_lots = [{
      id: '00000000-0000-4000-8000-0000000d0001', user_id: DEMO_USER_ID, tokens_total: 300, tokens_left: 120,
      source: 'iap', transaction_id: 'demo-seed', product_id: 'orime_tokens_300', environment: 'sandbox',
      purchased_at: iso(30), expires_at: iso(-150),
    }];
  }

  const bookIds = BOOKS.map((_, i) => `00000000-0000-4000-8000-0000000b00${String(i).padStart(2, '0')}`);
  BOOKS.forEach(([title, author, isbn, status, started, done, rating, purpose, tags], i) => {
    const createdDays = (started ?? 30 - i) + 3;
    db.books.push({
      id: bookIds[i], user_id: DEMO_USER_ID, title, author, isbn, asin: '',
      cover: coverSvg(title, author, i), cover_isbn: 'manual', added_via: 'search',
      status, rating,
      start_date: started != null ? dateOnly(started) : null,
      done_date: done != null ? dateOnly(done) : null,
      invest_purpose: purpose, current_challenge: '', hypothesis: '', book_reason: '',
      ai_analysis: '', ai_strategy: '', leverage_memo: '', ai_summary: '', roi_summary: '',
      source_query: '', current_page: null, total_pages: 240,
      created_at: iso(createdDays), updated_at: iso(done ?? started ?? createdDays),
      ...(BOOK_EXTRAS[title] || {}),
    });
    tags.forEach((tag) => db.book_tags.push({
      id: `${bookIds[i]}-t-${tag}`, book_id: bookIds[i], user_id: DEMO_USER_ID, tag_name: tag,
    }));
  });

  // ?demo=nomemo: 本はあるが、メモも行動もまだ無い人（相談・ホームの「メモ 0 件」の確認用）。
  if (scenario === 'nomemo') return db;

  MEMOS.forEach(([bi, page, text, daysAgo, tags, recallCount], i) => {
    db.book_memos.push({
      id: `00000000-0000-4000-8000-0000000c${String(i).padStart(4, '0')}`,
      user_id: DEMO_USER_ID,
      book_id: bi == null ? null : bookIds[bi],
      source_type: bi == null ? 'personal' : 'book',
      page_number: page, text, photo_path: null, tags,
      last_recalled_at: recallCount > 0 ? iso(Math.max(1, daysAgo - 20)) : null,
      recall_count: recallCount,
      created_at: iso(daysAgo), updated_at: iso(daysAgo),
    });
  });

  // ?demo=onebook: メモ（カード式）がある本が 1 冊だけの人（答え方「本ごとに」で並べる本が 2 冊に満たず、
  //   「まとめて」で答える流れの確認用・ai.js の pickPerspectiveBooks）。学び（personal）は残す。
  if (scenario === 'onebook') {
    const keep = bookIds[BOOKS.findIndex(([t]) => t === 'エッセンシャル思考')];
    db.book_memos = db.book_memos.filter((m) => m.book_id == null || m.book_id === keep);
  }

  // ?demo=longmemo: 『1兆ドルコーチ』の先頭（ページ順で最初）に長いメモが 1 件ある人（メモカードの長文の確認用）。
  if (scenario === 'longmemo') {
    const bi = BOOKS.findIndex(([t]) => t === '1兆ドルコーチ');
    db.book_memos.push({
      id: '00000000-0000-4000-8000-0000000cffff',
      user_id: DEMO_USER_ID, book_id: bookIds[bi], source_type: 'book',
      page_number: 3, photo_path: null, tags: ['マネジメント', 'コミュニケーション'],
      text: 'ビル・キャンベルは、1on1 をいつも仕事の話から始めなかった。家族のこと、週末のこと、最近気になっていること。相手を「役割」ではなく「人」として見ていると伝わってはじめて、本当の課題が出てくる。\n\n自分の 1on1 は、最初の 1 分で進捗の確認に入ってしまう。これでは相手は報告しかしない。来週から、最初の 5 分は仕事以外の話を聞くと決める。聞いたことはメモに残し、次の 1on1 でその続きを聞く。\n\nもう 1 つ。キャンベルは「チームが第一」を繰り返した。個人の成果より、チームがうまく回ることを先に考える。評価面談でも、この人がチームのために何をしたかを必ず聞く。',
      last_recalled_at: null, recall_count: 0,
      created_at: iso(2), updated_at: iso(2),
    });
  }

  ACTIONS.forEach(([bi, text, done, daysAgo, priority, deadlineIn], i) => {
    db.actions.push({
      id: `00000000-0000-4000-8000-0000000a${String(i).padStart(4, '0')}`,
      user_id: DEMO_USER_ID, book_id: bookIds[bi], text, done, priority,
      deadline: deadlineIn != null ? dateOnly(-deadlineIn) : null,
      recurrence: null, source_memo_id: null, source_page: null, reflection: '',
      completed_at: done ? iso(Math.max(1, daysAgo - 3)) : null,
      notify_at: null, scheduled_for: null,
      created_at: iso(daysAgo), updated_at: iso(daysAgo),
    });
  });

  // ?demo=acted: 2 日前に完了した行動に、ふりかえりが書いてある人（相談例の「やってみた「…」、次はどうする？」の確認用）。
  if (scenario === 'acted') {
    const a = db.actions.find((x) => x.done);
    if (a) { a.reflection = '結論から話したら、報告が 5 分で終わった'; a.completed_at = iso(2); a.updated_at = iso(2); }
  }

  // ?demo=overdue: 期限を過ぎた行動が 3 件と、今日が期限の行動が 1 件ある人（行動タブの確認用）。
  if (scenario === 'overdue') {
    [['上司への報告を、結論から 3 行で送る', -3], ['週次の振り返りを 15 分だけやる', -2], ['読んだ本を 1 冊、同僚にすすめる', -1], ['朝いちばんに今日の一番大事な仕事を書く', 0]]
      .forEach(([text, deadlineIn], i) => db.actions.push({
        id: `00000000-0000-4000-8000-0000000a9${String(i).padStart(3, '0')}`,
        user_id: DEMO_USER_ID, book_id: bookIds[i % 3], text, done: false, priority: 'medium',
        deadline: dateOnly(-deadlineIn), recurrence: null, source_memo_id: null, source_page: null,
        reflection: '', completed_at: null, notify_at: null, scheduled_for: null,
        created_at: iso(7), updated_at: iso(7),
      }));
  }

  // 過去の相談（「過去の相談」の一覧の確認用）。答えは本番と同じ【結論】…の書式。
  const CHATS = [
    [12, '会議で意見を言えないのをどうにかしたい', '【結論】\n最初の 5 分で、ひとことだけ「確認の質問」をしてみましょう。\n\n【明日からできる 1 つの行動】\n次の会議の前に、聞きたいことを 1 つだけメモに書いておく。', ['📚 D・カーネギー『人を動かす』 p.64']],
    [5, '部下に任せた仕事がいつも遅れる', '【結論】\n任せる前に「終わった状態」を一文で決めて、相手と合わせましょう。\n\n【明日からできる 1 つの行動】\n任せる仕事を 1 つ選び、完了の形を一文で書いて渡す。', ['📚 安宅和人『イシューからはじめよ』 p.25']],
  ];
  CHATS.forEach(([daysAgo, q, a, refs], i) => {
    db.chat_messages.push({ id: `00000000-0000-4000-8000-0000000d${String(i * 2).padStart(4, '0')}`, user_id: DEMO_USER_ID, role: 'user', content: q, refs: [], created_at: iso(daysAgo, 20) });
    db.chat_messages.push({ id: `00000000-0000-4000-8000-0000000d${String(i * 2 + 1).padStart(4, '0')}`, user_id: DEMO_USER_ID, role: 'assistant', content: a, refs, created_at: iso(daysAgo, 21) });
  });

  return db;
}

// 本の検索（Google Books 互換の応答）で返す、追加用の候補カタログ。
export const SEARCH_CATALOG = [
  ['7つの習慣', 'スティーブン・R・コヴィー', '9784863940246', 'キングベアー出版', '2013'],
  ['影響力の武器', 'ロバート・B・チャルディーニ', '9784414304237', '誠信書房', '2014'],
  ['ファクトフルネス', 'ハンス・ロスリング', '9784822289607', '日経BP', '2019'],
  ['伝え方が9割', '佐々木圭一', '9784478017234', 'ダイヤモンド社', '2013'],
  ['メモの魔力', '前田裕二', '9784344034075', '幻冬舎', '2018'],
  ['FACTFULNESS', 'ハンス・ロスリング', '9784822289607', '日経BP', '2019'],
  ['思考の整理学', '外山滋比古', '9784480020475', '筑摩書房', '1986'],
  ['時間術大全', 'ジェイク・ナップ', '9784478107157', 'ダイヤモンド社', '2019'],
  // 同じ本の別の版（ISBN 違い）。AI 選書で「読みたいに追加」したときの確認（候補が 2 冊）を確かめる用（ui-shots の advisor-confirm）。
  ['時間術大全', 'ジェイク・ナップ', '9784478119013', 'ダイヤモンド社', '2023'],
  ['GRIT やり抜く力', 'アンジェラ・ダックワース', '9784478064801', 'ダイヤモンド社', '2016'],
  ['大事なことに集中する', 'カル・ニューポート', '9784478068540', 'ダイヤモンド社', '2016'],
  ['レバレッジ時間術', '本田直之', '9784344980372', '幻冬舎', '2007'],
  ['プロフェッショナルマネジャー', 'ハロルド・ジェニーン', '9784833418485', 'プレジデント社', '2004'],
  // 本棚にある本（同じ ISBN）。検索結果に「追加済み」が出ることを確かめる用（ui-shots の add-book-existing）。
  ['1兆ドルコーチ', 'エリック・シュミット', '9784478107249', 'ダイヤモンド社', '2019'],
];
