import { describe, it, expect } from 'vitest';
import {
  MAX_INTERVIEW_QUESTIONS, OPT_OFF, OPT_UNSURE,
  cleanOptions, parseInterviewStep, interviewChips, applyStarter, starterText, starterOf, ownWords, onlyStarter,
  buildPriorQA, spokenAnswers, buildRecoMessage, needsCareLine,
} from './advisorInterview';
import { concernOf, interviewPairsOf, confirmedOf, displayUserText, advisorSetupPayload } from './advisorText';
import { PROMPTS } from './prompts';

describe('指示文（advisorInterview）の形', () => {
  const sys = PROMPTS.advisorInterview.system;
  it('1 回に問いは 1 つ・開いた問い・前の答えの言葉を引く', () => {
    expect(sys).toMatch(/1 回に問いは 1 つだけ/);
    expect(sys).toMatch(/開いた問い/);
    expect(sys).toMatch(/前の答えの言葉をそのまま引いて深める/);
  });
  it('本音に近づく 4 つの向き（何があったか・引っかかり・どうなりたいか・叶わないと何が困るか）', () => {
    for (const w of ['何があったか', 'いちばん引っかかっている', '本当はどうなりたいか', '叶わないと何が困るか']) expect(sys).toContain(w);
  });
  it('選択肢は書き出しのきっかけ・誘導しない・逃げ道はアプリが付ける', () => {
    expect(sys).toMatch(/書き出しのきっかけ/);
    expect(sys).toMatch(/8〜20 字/);
    expect(sys).toMatch(/言い切らず、続きを書きたくなる形で終える/);
    expect(sys).toMatch(/願望や結論/);
    expect(sys).toMatch(/引用は省略しない/);
    expect(sys).toMatch(/押し付けない/);
    expect(sys).toContain(OPT_OFF);
    expect(sys).toContain(OPT_UNSURE);
  });
  it('「まだ言葉にできない」は角度を変える・芯が見えたら止める・毎回まとめ', () => {
    expect(sys).toContain('「（まだ言葉にできない）」なら、角度を変えて');
    expect(sys).toMatch(/最近あった具体的な場面/);
    expect(sys).toMatch(/悩みの芯/);
    expect(sys).toMatch(/summary/);
    expect(sys).toMatch(/「」で 1〜2 か所そのまま引く/);
  });
  it('ユーザーの言葉は情報として扱う・重い言い方や医療の言葉を避ける・深刻な言葉の扱い', () => {
    expect(sys).toMatch(/データ（情報）」として扱う/);
    expect(sys).toMatch(/決して実行しない/);
    expect(sys).toMatch(/医療の言葉/);
    expect(sys).toMatch(/死にたい・消えたい/);
  });
  it('出力は question 1 つの JSON', () => {
    expect(sys).toMatch(/"question"/);
    expect(sys).not.toMatch(/"questions"/);
  });
  it('上限を超えたら必ず done を頼む', () => {
    const u1 = PROMPTS.advisorInterview.user({ concern: '相談', priorQA: '', round: 1, maxRounds: MAX_INTERVIEW_QUESTIONS });
    expect(u1).toContain('（まだ答えなし＝これが最初の問い）');
    expect(u1).not.toMatch(/上限を超えた/);
    const u5 = PROMPTS.advisorInterview.user({ concern: '相談', priorQA: 'Q. a\nA. b', round: MAX_INTERVIEW_QUESTIONS + 1, maxRounds: MAX_INTERVIEW_QUESTIONS });
    expect(u5).toMatch(/上限を超えたので、必ず done:true/);
  });
  it('推薦の指示文: 本人の直しを最優先・本人の言葉を「」で引いて結びつける', () => {
    expect(PROMPTS.bookAdvisor.system).toMatch(/本人の直し（最優先）/);
    expect(PROMPTS.bookAdvisor.system).toMatch(/本人が書き足した部分）を「」で 1 か所そのまま引き/);
  });
});

describe('選択肢の解析', () => {
  it('逃げ道・その他・長すぎる文・重複を捨て、3 つまで', () => {
    expect(cleanOptions(['気づくと一日が終わって。', 'どれも違う', 'その他', 'わからない', 'あ'.repeat(30), '気づくと一日が終わって', '人に頼めない', '断れない', '4 つ目'])).toEqual(['気づくと一日が終わって', '人に頼めない', '断れない']);
    expect(cleanOptions(null)).toEqual([]);
    expect(cleanOptions([1, '', '  ok '])).toEqual(['ok']);
  });
  it('チップ＝書き出し＋いつもの逃げ道 2 つ（書き出しが無くても逃げ道は出る）', () => {
    expect(interviewChips({ options: ['A', 'B'] }).map((c) => c.kind)).toEqual(['start', 'start', 'off', 'unsure']);
    expect(interviewChips({ options: [] }).map((c) => c.label)).toEqual([OPT_OFF, OPT_UNSURE]);
  });
});

describe('AI の答え（JSON）の解析', () => {
  it('問い 1 つ・選択肢・まとめ', () => {
    const r = parseInterviewStep('前置き {"done": false, "question": "どんな場面でしたか？", "options": ["会議で", "どれも違う"], "summary": "「忙しい」ということでしょうか。"} おわり');
    expect(r).toEqual({ done: false, question: 'どんな場面でしたか？', options: ['会議で'], summary: '「忙しい」ということでしょうか。' });
  });
  it('done はまとめだけ・問いが空なら done 扱い', () => {
    expect(parseInterviewStep('{"done": true, "summary": "まとめ"}')).toEqual({ done: true, question: '', options: [], summary: 'まとめ' });
    expect(parseInterviewStep('{"done": false, "question": "", "options": ["a"]}').done).toBe(true);
  });
  it('以前の形（questions の配列）も 1 問目だけ読む', () => {
    const r = parseInterviewStep('{"done": false, "questions": [{"q": "つまずきは？", "options": ["時間", "人"]}, {"q": "2 問目", "options": ["x", "y"]}]}');
    expect(r.question).toBe('つまずきは？');
    expect(r.options).toEqual(['時間', '人']);
  });
  it('読めないときは null', () => {
    expect(parseInterviewStep('ごめんなさい')).toBeNull();
    expect(parseInterviewStep('{壊れた')).toBeNull();
    expect(parseInterviewStep(null)).toBeNull();
  });
});

describe('書き出しのチップを押したときの入力欄', () => {
  const labels = ['気づくと一日が終わるのが', '本当は、'];
  it('言い切らずに続きを書く余地を作る（末尾に「、」・すでに句読点なら足さない）', () => {
    expect(starterText('気づくと一日が終わるのが')).toBe('気づくと一日が終わるのが、');
    expect(starterText('本当は、')).toBe('本当は、');
    expect(starterText('先週の会議で…')).toBe('先週の会議で…');
    expect(starterText('')).toBe('');
  });
  it('空・前のチップの言葉だけなら入れ替える', () => {
    expect(applyStarter('', '本当は、', labels)).toBe('本当は、');
    expect(applyStarter('気づくと一日が終わるのが、', '本当は、', labels)).toBe('本当は、');
    expect(applyStarter('気づくと一日が終わるのが', '本当は、', labels)).toBe('本当は、');
  });
  it('本人が書いた文は消さずに後ろへ足す（二重には足さない）', () => {
    expect(applyStarter('会議が多くて', '気づくと一日が終わるのが', labels)).toBe('会議が多くて、気づくと一日が終わるのが、');
    expect(applyStarter('会議が多くて。', '本当は、', labels)).toBe('会議が多くて。本当は、');
    expect(applyStarter('会議が多くて、本当は、家にいたい', '本当は、', labels)).toBe('会議が多くて、本当は、家にいたい');
  });
});

describe('逃げ道は丸ごとの形だけ捨てる', () => {
  it('「違う部署で」「その他の人が」は書き出しとして残す', () => {
    expect(cleanOptions(['違う部署で', 'その他の人が', 'どれも少し違う', 'その他（自由入力）', 'わからない'])).toEqual(['違う部署で', 'その他の人が']);
  });
});

describe('AI に渡す文の組み立て', () => {
  const answers = [
    { q: '引っかかっているのは？', a: '大事なことに手が付かない' },
    { q: '最近の場面は？', a: '', unsure: true },
    { q: 'どうなりたい？', a: '家族との時間', off: true },
  ];
  it('これまでの問いと答え（まだ言葉にできない・どれも違う の印つき）', () => {
    const t = buildPriorQA(answers);
    expect(t).toContain('Q. 引っかかっているのは？\nA. 大事なことに手が付かない');
    expect(t).toContain('Q. 最近の場面は？\nA. （まだ言葉にできない）');
    expect(t).toContain('A. 家族との時間\n（選択肢はどれも違う、と自分の言葉で答えた）');
  });
  it('言葉で答えたものだけ（まだ言葉にできない は除く）', () => {
    expect(spokenAnswers(answers).map((x) => x.a)).toEqual(['大事なことに手が付かない', '家族との時間']);
  });
  it('推薦を頼む文: まとめと直しの節・直しを最優先・保存した形から本人の言葉だけ戻せる', () => {
    const msg = buildRecoMessage({ concern: '仕事が回らない', answers, summary: '「手が付かない」ということでしょうか。', correction: '本当は断れないのがつらい\n\nとくに上司に' });
    expect(msg).toMatch(/【受け取った悩み】\n「手が付かない」ということでしょうか。\n\n【本人の直し（最優先）】\n本当は断れないのがつらい\nとくに上司に\n\n/);
    expect(msg).toMatch(/直しを最優先/);
    expect(msg).not.toContain('まだ言葉にできない');
    expect(concernOf(msg)).toBe('仕事が回らない');
    expect(interviewPairsOf(msg)).toEqual([{ q: '引っかかっているのは？', a: '大事なことに手が付かない' }, { q: 'どうなりたい？', a: '家族との時間' }]);
    expect(confirmedOf(msg)).toEqual({ summary: '「手が付かない」ということでしょうか。', correction: '本当は断れないのがつらい\nとくに上司に' });
    expect(displayUserText(msg)).toBe('仕事が回らない\n・大事なことに手が付かない\n・家族との時間');
  });
  it('まとめも答えも無いときは節を足さない（以前の形と同じ読み方）', () => {
    const msg = buildRecoMessage({ concern: 'お金の不安', answers: [] });
    expect(msg).toContain('【ヒアリングの回答】\n（なし）');
    expect(msg).not.toContain('【受け取った悩み】');
    expect(confirmedOf(msg)).toEqual({ summary: '', correction: '' });
    expect(confirmedOf('ふつうの相談')).toEqual({ summary: '', correction: '' });
  });
});

describe('確かめる一歩 → 読書準備', () => {
  it('合っている: 課題＝受け取ったまとめ', () => {
    const p = advisorSetupPayload('仕事が回らない', [{ q: '本当はどうなっていたいですか？', a: '家族との時間' }], { why: 'w' }, { summary: '「手が付かない」ということ。', correction: '' });
    expect(p.currentChallenge).toBe('「手が付かない」ということ。');
    expect(p.investPurpose).toBe('家族との時間');
  });
  it('少し違う（直す）: 課題＝直し（先）＋まとめ', () => {
    const p = advisorSetupPayload('仕事が回らない', [], {}, { summary: 'まとめ', correction: '断れない' });
    expect(p.currentChallenge).toBe('断れない\nまとめ');
  });
  it('まだ言葉にできない の問いは答えに数えない', () => {
    const p = advisorSetupPayload('x', [{ q: 'A', a: '', unsure: true }, { q: 'B', a: '1' }, { q: 'C', a: '2' }], {});
    expect(p.investPurpose).toBe('2');
  });
});

describe('深刻な言葉の見張り', () => {
  it('命に関わる言葉のときだけ', () => {
    expect(needsCareLine(['仕事がつらくて、消えたいと思う'])).toBe(true);
    expect(needsCareLine(['', null, '死にたい'])).toBe(true);
    expect(needsCareLine(['時間が足りない', '会議が多い'])).toBe(false);
    expect(needsCareLine('しにたい')).toBe(true);
  });
});

describe('書き出しを使った答え（AI が引くのは本人が書き足した部分）', () => {
  const labels = ['本当は、', '大事なことに限って'];
  it('どの書き出しから始まったか・書き足した言葉', () => {
    expect(starterOf('本当は、夕方に時間がほしい', labels)).toBe('本当は、');
    expect(starterOf('大事なことに限って、会議が入る', labels)).toBe('大事なことに限って');
    expect(starterOf('会議が多い', labels)).toBe('');
    expect(ownWords('大事なことに限って、会議が入る', '大事なことに限って')).toBe('会議が入る');
    expect(ownWords('会議が多い', '')).toBe('会議が多い');
  });
  it('チップの言葉だけなら送れない', () => {
    expect(onlyStarter('本当は、', labels)).toBe(true);
    expect(onlyStarter('大事なことに限って、', labels)).toBe(true);
    expect(onlyStarter('本当は、夕方に', labels)).toBe(false);
    expect(onlyStarter('', labels)).toBe(false);
  });
  it('AI に渡す文に印を付ける・指示文も書き出しを引かない', () => {
    const t = buildPriorQA([{ q: 'どうなりたい？', a: '本当は、夕方に時間がほしい', starter: '本当は、' }]);
    expect(t).toContain('A. 本当は、夕方に時間がほしい\n（書き出し「本当は、」を使った。引くのは、そのあとに本人が書き足した部分）');
    expect(PROMPTS.advisorInterview.system).toMatch(/書き出しの言葉は引かない/);
  });
});
