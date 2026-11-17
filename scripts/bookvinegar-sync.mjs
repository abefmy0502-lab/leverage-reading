#!/usr/bin/env node
// 📚 bookvinegar が推す本を、AI 選書の推薦用の本の待ち行列に入れる（2026-11-17・オーナー裁定）。
//
//   月に 1 回（スケジュールされたタスク「bookvinegar の新しい本」）:
//     node scripts/bookvinegar-sync.mjs                 直近 35 日に更新された記事を読んで待ち行列へ
//     node scripts/bookvinegar-sync.mjs --days 60       日数を変える
//     node scripts/bookvinegar-sync.mjs --dry-run       読むだけ（待ち行列に入れない）
//   はじめの 1 回（読んだ控えの JSON Lines から）:
//     node scripts/bookvinegar-sync.mjs --from-jsonl <ファイル>   1 行＝{ isbn, title, authors[] }（待ち行列へ）
//     node scripts/bookvinegar-sync.mjs --from-rich <ファイル>    1 行＝{ isbn, url, points, endorsers[], tags[], body }（書評データへ）
//
// 守ること: 読むのは robots.txt の範囲・1.2 秒に 1 回・ログインの要るページは読まない。
//   本の事実（ISBN・書名・著者）は待ち行列へ。推薦の事実（推薦ポイント・推薦者）と要約の文は書評データ（ops_books の ext・
//   advisor_book_ext）へ＝オーナー裁定で文ごと持つ・推薦の AI の参考にだけ使い、画面には出さない（2026-11-17）。
//   待ち行列は同じ本を重ねない（advisor_books_queue の dedupe_key）。書誌と紹介文は楽天から取り、概要はこちらの AI が書く。
//   待ち行列に入れるのは scripts/ops-mcp.mjs（運営の道具 ops_books の add・メモ「bookvinegar」）。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parsePostSitemap, postSitemapUrls, recentPosts, bookFromPage, extFromPage, toAddBooks, chunks } from './bookvinegarCore.js';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, d) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DAYS = Math.max(1, Math.min(365, Number(value('--days', 35)) || 35));
const DRY = flag('--dry-run');
const FROM = value('--from-jsonl', '');
const RICH = value('--from-rich', '');
const GAP_MS = 1200;
const MAX_PAGES = 600; // 1 回に読む記事の上限（多すぎるときは次の月に回る）
const UA = 'Mozilla/5.0 (compatible; OrimeBookResearch/1.0)';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
function get(url) {
  try { return execFileSync('curl', ['-sS', '--max-time', '25', '-A', UA, url], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); } catch { return ''; }
}

function addToQueue(books) {
  let queued = 0; let dup = 0;
  for (const part of chunks(books, 200)) {
    if (DRY) { queued += part.length; continue; }
    const out = execFileSync('node', ['scripts/ops-mcp.mjs', 'ops_books', JSON.stringify({ action: 'add', books: part, note: 'bookvinegar' })], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    const r = JSON.parse(out);
    queued += r.queued || 0; dup += r.duplicates || 0;
  }
  return { queued, dup };
}

function sendExt(items) {
  let saved = 0;
  // 10 冊ずつ（要約 4,000 字 × 50 冊はコマンドの引数 1 つの上限 128KB を超えて送れなかった・2026-11-17）
  for (const part of chunks(items.filter((x) => x && x.isbn), 10)) {
    if (DRY) { saved += part.length; continue; }
    try {
      const out = execFileSync('node', ['scripts/ops-mcp.mjs', 'ops_books', JSON.stringify({ action: 'ext', items: part })], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
      saved += JSON.parse(out).saved || 0;
    } catch (e) { console.error(`書評データを送れませんでした（${String(e?.message || e).split("\n")[0].slice(0, 120)}）`); }
  }
  return saved;
}

async function main() {
  let books = [];
  let ext = [];
  if (RICH) {
    for (const line of readFileSync(RICH, 'utf8').split('\n')) {
      let r = null;
      try { r = JSON.parse(line); } catch { continue; }
      if (r && r.isbn) ext.push({ isbn: r.isbn, url: r.url || '', points: r.points ?? null, endorsers: r.endorsers || [], tags: r.tags || [], summary: r.body || '' });
    }
    const saved = sendExt(ext);
    console.error(`${DRY ? '（読むだけ）' : ''}書評データ ${ext.length} 冊 → 保存 ${saved} 冊`);
    console.log(JSON.stringify({ ext: ext.length, saved, dry_run: DRY }));
    if (!FROM) return;
    ext = [];
  }
  if (FROM) {
    for (const line of readFileSync(FROM, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let r = null;
      try { r = JSON.parse(line); } catch { continue; }
      if (!r || !r.title) continue;
      const isbn = String(r.isbn || '').replace(/[^0-9Xx]/g, '');
      books.push({ isbn: /^(\d{9}[\dXx]|\d{13})$/.test(isbn) ? isbn : '', title: String(r.title), author: (r.authors || []).slice(0, 3).join('、'), pub: r.pub || '' });
    }
    books.sort((a, b) => String(b.pub).localeCompare(String(a.pub))); // 新しい本から
  } else {
    const index = get('https://bookvinegar.jp/sitemap.xml');
    let posts = [];
    for (const u of postSitemapUrls(index)) { await sleep(GAP_MS); posts = posts.concat(parsePostSitemap(get(u))); }
    const recent = recentPosts(posts, { days: DAYS }).slice(0, MAX_PAGES);
    console.error(`記事 ${posts.length} 件のうち、直近 ${DAYS} 日に更新された ${recent.length} 件を読みます`);
    for (const p of recent) {
      await sleep(GAP_MS);
      const html = get(p.loc);
      const b = bookFromPage(html);
      if (b) books.push(b);
      const x = extFromPage(html, p.loc);
      if (x) ext.push(x);
    }
  }
  const list = toAddBooks(books);
  const { queued, dup } = addToQueue(list);
  const saved = ext.length ? sendExt(ext) : 0;
  const line = `${DRY ? '（読むだけ）' : ''}本 ${list.length} 冊（ISBN なし ${list.filter((b) => !b.isbn).length}）→ 待ち行列に ${queued} 冊・もう入っていた ${dup} 冊・書評データ ${saved} 冊`;
  console.error(line);
  console.log(JSON.stringify({ books: list.length, queued, duplicates: dup, ext_saved: saved, dry_run: DRY }));
}

main().catch((e) => { console.error('止まりました: ' + (e?.message || e)); process.exit(1); });
