// 🧭 お試しモードの目標とロードマップ（2026-11-15）。
//   &goals=on        … 1 年後・3 年後の目標＋1 年後のロードマップ（本棚の本で道のりと読書計画）
//   &goals=noroadmap … 目標だけ（ロードマップはまだ）
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
  const at = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 3)).toISOString();
  if (mode === 'purpose') {
    user.user_metadata = { ...user.user_metadata, app_purpose: { text: '3 年後には、チームを任されるリーダーになりたい', at } };
    return;
  }
  user.user_metadata = {
    ...user.user_metadata,
    app_goals: {
      y1: { text: '1 年後に、チームの会議を自分で回し、メンバーの力を引き出せるようになりたい', at },
      y3: { text: '3 年後に、10 人のチームを任されるリーダーになりたい', at },
      y5: null,
    },
  };
  if (mode === 'noroadmap') return;

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
      ] },
      { focus: 'チームの成果を数字で見せる', todos: ['チームの目標を 1 つの数字にして、週に 1 回見せる'], books: [
        { bookId: idOf('数値化の鬼'), why: '前進を数字で見せる考え方が、任せる範囲を広げる土台になります。' },
        { bookId: idOf('HIGH OUTPUT MANAGEMENT'), why: 'マネジャーの仕事を「チームの成果」で考える軸になります。' },
      ] },
      { focus: '任せて、育てる', todos: ['自分の仕事を 1 つ、メンバーに任せて振り返る'], books: [
        { bookId: idOf('部下をもったらいちばん最初に読む本'), why: '任せ方と育て方を、最初の一歩から確かめられます。' },
      ] },
      { focus: '次の 2 年に向けて広げる', todos: ['この 1 年でうまくいったことを 3 つ書き出す'], books: [
        { bookId: idOf('LIFE SHIFT'), why: '3 年後のリーダー像を、長い働き方の中で考え直せます。' },
      ] },
    ],
    missing: [{ theme: '人を育てる対話', why: '本棚に、コーチングの基本を学べる本がまだありません。' }],
  };
  roadmap.phases.forEach((p) => { p.books = p.books.filter((b) => b.bookId); });
  db.goal_roadmaps = [{
    user_id: userId,
    horizon: 'y1',
    goal_text: user.user_metadata.app_goals.y1.text,
    goal_at: at,
    data: {
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
      question: 'その目標に向けて、いまいちばん足りないと感じるのは、どんなところですか？',
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
  const phaseCount = [...userText.matchAll(/^\d+\. .+（.+）$/gm)].length || 4;
  const phases = [];
  for (let i = 0; i < phaseCount; i += 1) {
    const ks = keys.slice(i * 2, i * 2 + 2);
    phases.push({
      focus: ['土台になる型をつくる', '成果を見える形にする', '任せて、育てる', '次に向けて広げる', '振り返って整える'][i] || '続ける',
      todos: [['毎週の振り返りを 15 分とる', '気づいたことを 1 行メモに残す'], ['目標を 1 つの数字にして週に 1 回見る'], ['仕事を 1 つ人に任せて振り返る'], ['この期間でうまくいったことを 3 つ書き出す'], ['次の目標を書き直す']][i] || [],
      books: ks.map((k) => ({ key: k, why: 'いまの区切りで取り組むことに、まっすぐ効く本です。' })),
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
