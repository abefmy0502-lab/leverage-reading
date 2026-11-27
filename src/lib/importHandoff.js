// 💻 引越しの「パソコンで続ける」（2026-11-27 体験した人の声「ブクログ・読書メーター・Kindle のまとめての保存はパソコンが要る。
//   iPhone だけの人は 1 日目にここで止まる」）。手順と 2 つのコードを 1 つの文にして、端末の共有シート（メール・メモ・AirDrop）で
//   自分のパソコンへ送る。サーバーには何も送らない。保存したファイルは、AirDrop・iCloud Drive・メールの添付で iPhone に戻して選ぶ。
import { BOOKMETER_BOOKMARKLET } from './bookmeterBookmarklet';
import { KINDLE_BOOKMARKLET } from './kindleBookmarklet';

export function importHandoffText({ bookmeter = BOOKMETER_BOOKMARKLET, kindle = KINDLE_BOOKMARKLET } = {}) {
  return [
    'orime への引越しの手順（パソコンで）',
    '',
    '■ ブクログ',
    'Web 版のブクログで、本棚の本棚マーク → スパナのマーク → 「エクスポート」で CSV を保存します。',
    '',
    '■ 読書メーター（全ページを 1 回で）',
    '1. 下のコードをブラウザのブックマークの URL の欄に貼ります。',
    '2. 読書メーターにログインして「読んだ本」を開き、そのブックマークを押します。',
    bookmeter,
    '',
    '■ Kindle（全部の本のハイライトを 1 回で）',
    '1. 下のコードをブラウザのブックマークの URL の欄に貼ります。',
    '2. read.amazon.co.jp/notebook を開いてログインし、そのブックマークを押します。',
    kindle,
    '',
    '■ Kindle 端末',
    'パソコンにつなぎ、documents の中の「My Clippings.txt」をコピーします。',
    '',
    '■ 保存したファイルを iPhone へ',
    'AirDrop・iCloud Drive・メールの添付のどれかで iPhone に送り、orime の「ほかのアプリから取り込む」→「ファイルを選ぶ」で選びます。',
  ].join('\n');
}
