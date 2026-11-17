// 🧭 お試しモードの目標とロードマップ（2026-11-15）。
//   &goals=on        … 1 年後・3 年後・5 年後の目標＋3 つをつなぐロードマップ（本棚の本で道のりと読書計画）
//   &goals=noroadmap … 3 つの目標だけ（ロードマップはまだ＝「ロードマップをつくる」）
//   &goals=partial   … 1 年後・3 年後だけ（5 年後がまだ＝つくれない）
//   &goalage=N   … 作ってから N 日たった状態・&goalread=1 … ロードマップの本を読み終えた（長く使ったときの確認）
//   &goals=purpose   … 目標は空・はじめに書いた目標（入れた理由）だけある（どの欄に入れるかのカード）
//   付けなければ目標は空（行動の上は「1 年後・3 年後・5 年後の目標を書く」）。

const EXTRA_BOOKS = [
  ['HIGH OUTPUT MANAGEMENT', 'アンドリュー・S・グローブ', '9784822255008', 'before', 'チームの成果を上げるマネジャーの仕事を知りたい', 330],
  ['部下をもったらいちばん最初に読む本', '橋本拓也', '9784866803081', 'want', '', 220],
  ['ザ・ファシリテーター', '森時彦', '9784478732601', 'want', '', 300],
];

export function applyGoalsDemo(db, user, params, { userId, now = new Date(), coverSvg } = {}) {
  const mode = params.get('goals');
  if (!mode) return;
  // &goalage=30|90|200|400 … 目標とロードマップを作ってから N 日たった状態（長く使ったときの確認用）。
  const age = Math.max(3, Math.min(2000, Number(params.get('goalage')) || 3));
  const at = new Date(now.getTime() - age * 86400000).toISOString();
  if (mode === 'purpose') {
    user.user_metadata = { ...user.user_metadata, app_purpose: { text: '3 年後には、チームを任されるリーダーになりたい', at } };
    return;
  }
  user.user_metadata = {
    ...user.user_metadata,
    app_goals: {
      y1: { text: '1 年後に、チームの会議を自分で回し、メンバーの力を引き出せるようになりたい', at },
      y3: { text: '3 年後に、10 人のチームを任されるリーダーになりたい', at },
      y5: mode === 'partial' ? null : { text: '5 年後に、新しい事業を立ち上げて任せられる人になりたい', at },
    },
  };
  if (mode === 'noroadmap' || mode === 'partial') return;

  // 本棚に、まだ読んでいない本を少し足す（読書計画のカレンダーが数か月にまたがるように）。
  const extraIds = EXTRA_BOOKS.map((_, i) => `00000000-0000-4000-8000-0000000b09${String(i).padStart(2, '0')}`);
  EXTRA_BOOKS.forEach(([title, author, isbn, status, purpose, pages], i) => {
    if (db.books.some((b) => b.title === title)) return;
    db.books.push({
      id: extraIds[i], user_id: userId, title, author, isbn, asin: '',
      cover: coverSvg ? coverSvg(title, author, 20 + i) : null, cover_isbn: 'manual', added_via: 'search',
      status, rating: 0, start_date: null, done_date: null,
      invest_purpose: purpose, current_challenge: '', hypothesis: '', book_reason: '',
      ai_analysis: '', ai_strategy: '', leverage_memo: '', ai_summary: '', roi_summary: '',
      source_query: '', current_page: null, total_pages: pages,
      created_at: new Date(now.getTime() - (5 + i) * 86400000).toISOString(),
      updated_at: new Date(now.getTime() - (5 + i) * 86400000).toISOString(),
    });
  });
  const idOf = (title) => db.books.find((b) => b.title === title)?.id;
  const roadmap = {
    needs: [
      { name: '会議の進め方', why: '会議を自分で回すには、目的と決めることを先に置く型が要ります。' },
      { name: '1on1 の聞き方', why: 'メンバーの力を引き出すには、話を最後まで聞く場が欠かせません。' },
      { name: '成果の測り方', why: 'チームの前進を数字で見せると、任せる範囲を広げやすくなります。' },
      { name: '任せる勇気', why: '自分でやるほうが早い、から抜け出す考え方が要ります。' },
    ],
    issues: [
      '「会議で結論が出ないまま終わる」ことが多く、次の一歩が決まらない。',
      '忙しいと、メンバーの話を途中で引き取ってしまう。',
    ],
    phases: [
      { focus: '会議と 1on1 の型をつくる', todos: ['毎週の定例の議題を前日に 3 行で送る', '月に 1 回、メンバー全員と 30 分の 1on1 をする'], books: [
        { bookId: idOf('1兆ドルコーチ'), why: '1on1 で話を引き出す具体的なやり方が、今の課題に直結します。' },
        { bookId: idOf('ザ・ファシリテーター'), why: '会議で結論を出す進め方を、物語で身につけられます。' },
        { bookId: idOf('数値化の鬼'), why: '前進を数字で見せる考え方が、任せる範囲を広げる土台になります。' },
        { bookId: idOf('HIGH OUTPUT MANAGEMENT'), why: 'マネジャーの仕事を「チームの成果」で考える軸になります。' },
      ] },
      { focus: 'チームの成果を数字で見せる', todos: ['チームの目標を 1 つの数字にして、週に 1 回見せる'], books: [
        { bookId: idOf('部下をもったらいちばん最初に読む本'), why: '任せ方と育て方を、最初の一歩から確かめられます。' },
        { bookId: idOf('LIFE SHIFT'), why: '3 年後のリーダー像を、長い働き方の中で考え直せます。' },
      ] },
      { focus: '任せて、育てる', todos: ['自分の仕事を 1 つ、メンバーに任せて振り返る'], books: [] },
      { focus: '次の 2 年に向けて広げる', todos: ['この 1 年でうまくいったことを 3 つ書き出す'], books: [] },
      { focus: 'チームの数を増やして任せる', todos: ['リーダーを 1 人育て、会議を任せる'], books: [] },
      { focus: '10 人のチームの仕組みをつくる', todos: ['チームの役割と決め方を 1 枚に書く'], books: [] },
      { focus: '新しい事業の種を探す', todos: ['社内の困りごとを 10 個集める'], books: [] },
      { focus: '小さく始めて、任せる', todos: ['小さな企画を 1 つ立ち上げ、メンバーに任せる'], books: [] },
    ],
    missing: [{ theme: '人を育てる対話', why: '本棚に、コーチングの基本を学べる本がまだありません。' }],
  };
  roadmap.phases.forEach((p) => { p.books = p.books.filter((b) => b.bookId); });
  // &goalread=1 … ロードマップの本を全部読み終えた（読書計画の本が尽きた状態の確認用）。
  if (params.get('goalread')) {
    const ids = new Set(roadmap.phases.flatMap((p) => p.books.map((b) => b.bookId)));
    db.books.forEach((b) => { if (ids.has(b.id)) { b.status = 'done'; b.done_date = b.done_date || new Date(now.getTime() - 10 * 86400000).toISOString().slice(0, 10); } });
  }
  db.goal_roadmaps = [{
    user_id: userId,
    horizon: 'all',
    goal_text: user.user_metadata.app_goals.y1.text,
    goal_at: at,
    data: {
      goals: user.user_metadata.app_goals,
      qa: [
        { q: '会議を回すうえで、いまいちばん引っかかっているのは、どんなところですか？', a: '会議で結論が出ないまま終わる' },
        { q: '「会議で結論が出ないまま終わる」とき、メンバーとはどう関わっていますか？', a: '忙しいと話を途中で引き取ってしまう' },
      ],
      summary: '「会議で結論が出ないまま終わる」ことと、忙しいとメンバーの話を引き取ってしまうことが、いまの壁だと受け取りました。',
      roadmap,
      plan: params.get('plan') === 'set' ? { minutesPerDay: 45 } : null,
    },
    created_at: at,
    updated_at: at,
  }];
}

// 深掘りの問い（お試しの AI）。本番と同じ JSON。
export function goalInterviewAnswer(userText) {
  const round = Number((userText.match(/【次の問いの番号】(\d+)/) || [])[1] || 1);
  const answers = [...userText.matchAll(/^A\d+\. (.+)$/gm)].map((m) => m[1]);
  const quote = (s) => String(s || '').replace(/（.*?）/g, '').split(/[、。]/)[0].slice(0, 20);
  const summary = answers.length
    ? `「${quote(answers[0])}」ことが、目標に向けたいまの壁だと受け取りました。`
    : '目標に向けて、いまの立ち位置といちばんの壁を確かめています。';
  if (round > 2) return JSON.stringify({ done: true, question: '', options: [], summary });
  if (round === 1) {
    return JSON.stringify({
      done: false,
      question: '1 年後の目標に向けて、いまいちばん足りないと感じるのは、どんなところですか？',
      options: ['会議で結論が出ないまま終わる', 'メンバーに任せきれない', '自分の仕事で手一杯になる'],
      summary,
    });
  }
  return JSON.stringify({
    done: false,
    question: `「${quote(answers[0])}」とありましたが、そのときメンバーとはどう関わっていますか？`,
    options: ['忙しいと話を途中で引き取ってしまう', '意見が出るのを待てずに決めてしまう', '1on1 の時間が取れていない'],
    summary,
  });
}

// ロードマップ（お試しの AI）。本番と同じく、渡された本棚の印（B1…）だけで本を挙げる。
export function goalRoadmapAnswer(userText) {
  const keys = [...userText.matchAll(/^(B\d+) \|/gm)].map((m) => m[1]);
  const phaseLines = [...userText.matchAll(/^\d+\. .+（.+）.*$/gm)].map((m) => m[0]);
  const phaseCount = phaseLines.length || 8;
  const caps = phaseLines.map((l) => Number((l.match(/約 (\d+) 冊/) || [])[1] || 2));
  const phases = [];
  let k = 0;
  for (let i = 0; i < phaseCount; i += 1) {
    // いまの区切りは本棚の本 1 冊（あれば）＋読むべき本（本棚に無い・お試しの書誌で実在する本）、次の区切りは候補だけ。
    const ks = i === 0 ? keys.slice(0, 1) : [];
    k += ks.length;
    const recs = i === 0 ? [
      { title: '伝え方が9割', author: '佐々木圭一', why: '会議で結論を出すための、短く伝える型が身につきます。' },
      { title: '思考の整理学', author: '外山滋比古', why: '考えを寝かせて整える習慣が、決める力の土台になります。' },
      { title: '存在しない本の書名', author: '架空', why: '（お試し: 書誌で見つからないので消える）' },
    ] : i === 1 ? [{ title: '大事なことに集中する', author: 'カル・ニューポート', why: '次の区切りで、深く考える時間をつくる候補です。' }] : [];
    phases.push({
      focus: ['土台になる型をつくる', '成果を見える形にする', '任せて、育てる', '次に向けて広げる', 'チームを広げる', '仕組みにする', '新しい種を探す', '小さく始めて任せる'][i] || '続ける',
      todos: [['毎週の振り返りを 15 分とる', '気づいたことを 1 行メモに残す'], ['目標を 1 つの数字にして週に 1 回見る'], ['仕事を 1 つ人に任せて振り返る'], ['この期間でうまくいったことを 3 つ書き出す'], ['リーダーを 1 人育てる'], ['役割と決め方を 1 枚に書く'], ['困りごとを 10 個集める'], ['小さな企画を 1 つ立ち上げる']][i] || [],
      books: [...ks.map((key) => ({ key, why: 'いま読んでいて、取り組むことにまっすぐ効く本です。' })), ...recs],
    });
  }
  return JSON.stringify({
    needs: [
      { name: '考えを整理する力', why: '目標に向けて、何から手をつけるかを決めるために要ります。' },
      { name: '人と話す力', why: '周りの力を借りるには、聞いて伝える場が欠かせません。' },
      { name: '続ける仕組み', why: '小さな一歩を毎週続けることが、長い目標の土台になります。' },
    ],
    issues: ['「会議で結論が出ないまま終わる」ことが多い。'],
    phases,
    missing: [{ theme: '人を育てる対話', why: '本棚に、コーチングの基本を学べる本がまだありません。' }],
  });
}

// ロードマップの見直し（お試しの AI）。&reflect=same で「見えなかった」。
export function goalRoadmapUpdateAnswer(userText, params) {
  if (params?.get?.('reflect') === 'same') return JSON.stringify({ found: false });
  const base = JSON.parse(goalRoadmapAnswer(userText));
  base.issues = ['「会議で結論が出ないまま終わる」ことが多い。', '忙しくなると、自分で抱え込んで人に頼めない。'];
  base.needs = [{ name: '頼む力', why: '抱え込まずに任せるには、早めに頼む言い方が要ります。' }, ...base.needs.slice(0, 3)];
  return JSON.stringify({
    found: true,
    newIssues: ['忙しくなると、自分で抱え込んで人に頼めない。'],
    note: '「頼む力」を必要なことに足し、次の区切りに任せ方の本を前に出しました。',
    ...base,
  });
}

// この 3 か月の本を選ぶ（お試しの AI）。お試しの書誌で実在する本＋見つからない 1 冊（消える）。
export function goalPhaseBooksAnswer() {
  return JSON.stringify({
    now: { books: [
      { title: '伝え方が9割', author: '佐々木圭一', why: '任せるときに、短く伝える型が身につきます。' },
      { title: '思考の整理学', author: '外山滋比古', why: 'メモに残した考えを寝かせて整える習慣になります。' },
      { title: '存在しない本の書名', author: '架空', why: '（お試し: 書誌で見つからないので消える）' },
    ] },
    next: { books: [{ title: '大事なことに集中する', author: 'カル・ニューポート', why: '次の区切りで、深く考える時間をつくる候補です。' }] },
  });
}
