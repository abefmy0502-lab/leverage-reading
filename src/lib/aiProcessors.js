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

// 同意の版。送り先（会社と用途の組み合わせ）が変わったら上げる。
export const AI_CONSENT_VERSION = 1;

// 会社（api/_aiRouting.js の provider）→ 画面に出す名前。
export const AI_PROVIDER_NAMES = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google',
};

// 何かで失敗したときに代わりに答える会社（api/_aiRouting.js: Claude 以外が答える前に失敗したら Claude で 1 回だけ）。
export const AI_FALLBACK_PROVIDER = 'anthropic';

// 同意を求めない用途（管理者だけの運営の参謀。利用者のデータを送らない）。
export const AI_CONSENT_EXEMPT_PURPOSES = ['ops_advise'];

// 機能ごとに「送るもの」と「送り先」。purposes はアプリが送る用途（purpose）。
// providers は api/_aiRouting.js の既定と同じ順（テストで確かめる）。
export const AI_FEATURES = [
  {
    id: 'consult',
    name: '相談',
    // 量は lib/ai.js の CONSULT_TOTAL_CHARS（メモと読書準備で約 9,000 字・質問に近いものから）と合わせる。
    // 件数は字数で決まる（MAX_MEMOS 80 件＋質問に近いメモ最大 12 件の中から、合わせて約 9,000 字まで）ので、字数で言う。
    sends: '質問と、メモ・読書準備（関係するものから約 9,000 字まで）・行動と過去の相談',
    purposes: ['consult'],
  },
  {
    id: 'advisor',
    name: 'AI 選書',
    sends: '探したいことと答え、読んだ本・メモの一部',
    purposes: ['book_advisor', 'advisor_interview'],
  },
  {
    id: 'setup_sheet',
    name: '読書計画シート',
    sends: '書名・著者・得たいこと・タグ・シートへの直しの指示',
    purposes: ['setup_sheet', 'setup_sheet_edit'],
  },
  {
    id: 'memo',
    name: '凝縮・まとめ',
    sends: 'そのメモの文',
    purposes: ['condense', 'cards_to_summary'],
  },
  {
    id: 'ocr',
    name: '写真から書き起こし',
    sends: '撮った写真だけ',
    purposes: ['ocr'],
  },
];

// 用途 → 既定の会社（api/_aiRouting.js の ROUTES.primary の会社と同じ）。
export const AI_PURPOSE_PROVIDER = {
  consult: 'anthropic',
  book_advisor: 'anthropic',
  advisor_interview: 'openai',
  setup_sheet: 'openai',
  setup_sheet_edit: 'openai',
  condense: 'gemini',
  cards_to_summary: 'gemini',
  ocr: 'gemini',
};

// 機能の送り先の会社名（重なりなし・用途の順）。例: AI 選書 → ['Anthropic', 'OpenAI']
export function providersFor(feature) {
  const out = [];
  for (const p of feature?.purposes || []) {
    const name = AI_PROVIDER_NAMES[AI_PURPOSE_PROVIDER[p]];
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

// 用途 → 機能（シートの見出しの「◯◯を使うと」に使う）。分からない用途は null。
export function featureForPurpose(purpose) {
  return AI_FEATURES.find((f) => f.purposes.includes(purpose)) || null;
}

// 版を決める元（会社と用途の組み合わせ）。これが変わったら AI_CONSENT_VERSION を上げる（テストで確かめる）。
export function processorSignature() {
  return Object.keys(AI_PURPOSE_PROVIDER)
    .sort()
    .map((p) => `${p}:${AI_PURPOSE_PROVIDER[p]}`)
    .join(',') + `|fallback:${AI_FALLBACK_PROVIDER}`;
}
