// 🎙 概念の動画（explainer）の、場面ごとの読み上げの文（声・字幕の srt・声の長さで場面を伸ばす のどれにも使う）。
import { END_LINE } from './reels.mjs';
import { voiceLength, readIndex } from '../voiceCache.mjs';

// 文をつなぐ（「前は」+「閉じたら終わり」→「前は、閉じたら終わり。」）
export function joinSpoken(texts) {
  return texts.map((t) => (/[。！？、]$/.test(t) ? t : /[はがにをもで]$/.test(t) ? `${t}、` : `${t}。`)).join('');
}

// 場面ごとの文（終わりのカードは決まりの 1 行）。文の無い場面は null。
export function sceneLine(scene) {
  if (scene.items[0]?.type === 'end') return END_LINE;
  if (scene.say) return scene.say; // 画面の字と読み上げを分けたいとき（orime とは何かの一言など）
  const texts = scene.items.filter((it) => ['box', 'text', 'sub'].includes(it.type) && it.text).map((it) => it.text.replace(/\n/g, ''));
  return texts.length ? joinSpoken(texts) : null;
}
export const explainerLines = (reel) => reel.scenes.map(sceneLine).filter(Boolean);

// 声の作り置きがあれば、その場面の声が読み終わるまで場面を伸ばす（読み始め 0.3 秒＋声＋0.5 秒）。
export function paceReel(reel, idx = readIndex()) {
  return {
    ...reel,
    scenes: reel.scenes.map((sc) => {
      const len = voiceLength(sceneLine(sc), idx);
      return len ? { ...sc, sec: Math.max(sc.sec, 0.3 + len + 0.5) } : sc;
    }),
  };
}
