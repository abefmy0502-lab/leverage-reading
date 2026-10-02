// 🤝 AI に送る内容と送り先（同意のシート・設定・ヘルプで見せる唯一の説明）。2026-10-01。
//
// App Store 審査ガイドライン 5.1.2(i): 個人のデータを第三者の AI に送る前に、何を・どこへ送るかを示して
// 同意をもらう。送り先は api/_aiRouting.js の ROUTES（用途ごとの既定の会社）と同じでなければならない
// （src/lib/aiProcessors.test.js が突き合わせる）。
//
// 送り先や送るものを変えたら:
//   1. ここ（AI_FEATURES・AI_PROCESSORS）を api/_aiRouting.js に合わせる
//   2. AI_CONSENT_VERSION を 1 つ上げる（同意した人にも、次に AI を使うときにもう一度確かめる）
//   3. aiProcessors.test.js の CONSENT_SIGNATURES に新しい版を足す
//   4. プライバシーポリシー第 7 条（src/legal/PrivacyPage.jsx・legal/privacy.md）も合わせる
//
// 🧭 Jev（TypeSafe AI の判断のモデル・2026-10-02）は、アプリの VITE_AI_JEV=on のときだけ送り先に加わる（buildAiProcessors）。
//   Jev の用途（memo_relevance / intent）は api/_aiRouting.js の JEV_ROUTES と同じ（テストで確かめる）。

// 🧭 Jev（TypeSafe AI の判断のモデル・2026-10-02・docs/jev-plan.md）をアプリで使うか。
//   VITE_AI_JEV=on のときだけ、送り先に TypeSafe AI を足し、同意の版を 2 にする（止めている間は、使っていない会社のために
//   同意を聞き直さない）。お試しモード（開発のときだけ）は ?jev=1 でも入る。サーバー側のスイッチ（JEV_ENABLED・
//   JEV_TASK_<用途>）が入っていなければ、入れても何も送られない（アプリはこれまでの決め方で続ける）。
function readJevFlag() {
  try {
    const env = import.meta.env || {};
    if (String(env.VITE_AI_JEV || '').trim().toLowerCase() === 'on') return true;
    if (env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('jev') === '1') return true;
  } catch { /* 読めなければ使わない */ }
  return false;
}
export const AI_JEV_ON = readJevFlag();

// 会社（api/_aiRouting.js の provider）→ 画面に出す名前。
export const AI_PROVIDER_NAMES = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google',
  typesafe: 'TypeSafe AI',
};

// 何かで失敗したときに代わりに答える会社（api/_aiRouting.js: Claude 以外が答える前に失敗したら Claude で 1 回だけ）。
export const AI_FALLBACK_PROVIDER = 'anthropic';

// 同意を求めない用途（管理者だけの運営の参謀。利用者のデータを送らない）。
export const AI_CONSENT_EXEMPT_PURPOSES = ['ops_advise'];

// 機能ごとに「送るもの」と「送り先」。purposes はアプリが送る用途（purpose）。
// providers は api/_aiRouting.js の既定と同じ順（テストで確かめる）。
const BASE_FEATURES = [
  {
    id: 'consult',
    name: '相談',
    // シートで 1 行に収める（390 幅で 13pt は約 25 字・2026-10-02 ui-critic: Jev を入れたときにシートが 85vh を超えた）。
    // 量（lib/ai.js の CONSULT_TOTAL_CHARS＝メモと読書準備で約 9,000 字）はプライバシーポリシー第 7 条に書く。
    // 量を書くときは CONSULT_TOTAL_CHARS と同じ数にする（aiProcessors.test.js）。
    sends: '質問・メモ・読書準備・行動・過去の相談',
    purposes: ['consult'],
  },
  {
    id: 'advisor',
    name: 'AI 選書',
    sends: '困りごと・聞き返しへの答え・読んだ本とメモの一部',
    purposes: ['book_advisor', 'advisor_interview'],
  },
  {
    id: 'setup_sheet',
    name: '読書計画シート',
    sends: '書名・著者・得たいこと・タグ・直してほしいこと',
    purposes: ['setup_sheet', 'setup_sheet_edit'],
  },
  // 凝縮・まとめ・写真から書き起こしは同じ送り先（Google）なので 1 行に（シートの高さ・2026-10-02 ui-critic）。
  {
    id: 'memo',
    name: '凝縮・まとめ・写真から書き起こし',
    sends: 'そのメモの文・撮ったページの写真',
    purposes: ['condense', 'cards_to_summary', 'ocr'],
  },
];

// 用途 → 既定の会社（api/_aiRouting.js の ROUTES.primary の会社と同じ）。
const BASE_PURPOSE_PROVIDER = {
  consult: 'anthropic',
  book_advisor: 'anthropic',
  advisor_interview: 'gemini',
  setup_sheet: 'gemini',
  setup_sheet_edit: 'gemini',
  condense: 'gemini',
  cards_to_summary: 'gemini',
  ocr: 'gemini',
};

// 🧭 Jev の用途 → どの機能の送り先に TypeSafe AI を足すか（api/_aiRouting.js の JEV_ROUTES.feature と同じ・テストで確かめる）。
//   memo_relevance … 相談の質問と、関係しそうなメモの一節（各 160 字まで・30 件まで）＝相談で送るものの一部
//   intent         … 相談の質問だけ（いまはアプリから送らない・評価だけ）
//   合いそうなタグ（タグの提案）は端末の中だけで決める＝TypeSafe AI には送らない（2026-10-02・docs/jev-plan.md §3-3）。
export const JEV_PURPOSE_FEATURE = {
  memo_relevance: 'consult',
  intent: 'consult',
};

// 送り先の表を組み立てる（jev: TypeSafe AI を足すか）。版は jev なら 2・ほかは 1。
export function buildAiProcessors({ jev = false } = {}) {
  const features = BASE_FEATURES.map((f) => ({ ...f, purposes: [...f.purposes] }));
  const purposeProvider = { ...BASE_PURPOSE_PROVIDER };
  if (jev) {
    for (const [purpose, featureId] of Object.entries(JEV_PURPOSE_FEATURE)) {
      const f = features.find((x) => x.id === featureId);
      if (f && !f.purposes.includes(purpose)) f.purposes.push(purpose);
      purposeProvider[purpose] = 'typesafe';
    }
  }
  return { features, purposeProvider, version: jev ? 2 : 1 };
}

const BUILT = buildAiProcessors({ jev: AI_JEV_ON });

// 同意の版。送り先（会社と用途の組み合わせ）が変わったら上げる。
// 版 1 = AI 選書の聞き返し・読書計画シートも Google（2026-10-01 の 2 回目の振り分け・api/_aiRouting.js）。
// （OpenAI に送っていた振り分けのときの版はアプリに出していないので、1 のまま書き直した。）
// 版 2 = 1 に TypeSafe AI（Jev・相談の関係するメモの判断）を足したもの（VITE_AI_JEV=on のときだけ・2026-10-02）。
export const AI_CONSENT_VERSION = BUILT.version;
// 機能ごとに「送るもの」と「送り先」。purposes はアプリが送る用途（purpose）。
export const AI_FEATURES = BUILT.features;
// 用途 → 会社。
export const AI_PURPOSE_PROVIDER = BUILT.purposeProvider;

// 機能の送り先の会社名（重なりなし・用途の順）。例: AI 選書 → ['Anthropic', 'Google']
export function providersFor(feature, purposeProvider = AI_PURPOSE_PROVIDER) {
  const out = [];
  for (const p of feature?.purposes || []) {
    const name = AI_PROVIDER_NAMES[purposeProvider[p]];
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

// 用途 → 機能（シートの見出しの「◯◯を使うと」に使う）。分からない用途は null。
export function featureForPurpose(purpose, features = AI_FEATURES) {
  return features.find((f) => f.purposes.includes(purpose)) || null;
}

// 版を決める元（会社と用途の組み合わせ）。これが変わったら AI_CONSENT_VERSION を上げる（テストで確かめる）。
export function processorSignature(purposeProvider = AI_PURPOSE_PROVIDER) {
  return Object.keys(purposeProvider)
    .sort()
    .map((p) => `${p}:${purposeProvider[p]}`)
    .join(',') + `|fallback:${AI_FALLBACK_PROVIDER}`;
}
