// 🏷 本の分野を裏で整える（2026-10-11・lib/bookFields.js・lib/bookFieldsAuto.js）。
//
//   0. 前の版の分野の名前（大分類 3・分野 18／大分類 4・分野 19）を新しい名前（大分類 4・分野 20）に置きかえる
//        （lib/bookFields.js の renameOldFields・決まった置きかえ・前の名前のある本だけ・何度流しても同じ。
//        「物語・エッセイ」は書名と端末に控えた紹介文から 小説・物語 か エッセイ・ノンフィクション に）
//   1. 前の版の本のタグを移す（アカウントごと・端末ごとに 1 回・何度流しても同じ結果）:
//        分野に結びつくタグ → その分野に置きかえる / 結びつかないタグ → 同じ名前のフォルダへ移してからタグを外す
//        （フォルダに入れられなかったときはタグのまま残す＝言葉を消さない）
//   2. 分野が 1 つも無い本に、書名（と端末に控えた紹介文・目次・ジャンル）から分野を付ける（静かに・知らせなし・まとめて）
//   3. サーバーに本の分野を聞いて決め直す（2026-10-11 の 3 回目・オーナー「この本以外の精度が上がるように仕組みを
//      根本的に修正してね」）。分野は本ごとに 1 回だけサーバーが決めて全員で使う（/api/cover?fields=1＝書店のジャンル →
//      AI（公開の書誌だけ）→ 言葉の仕分け・lib/bookFieldsServer.js）。サーバーにつながらないときだけ、紹介文・目次・
//      楽天ブックスのジャンル（商品説明）を取ってきて端末の言葉の仕分けで決める:
//        - 本を追加した直後（検索・手で入力・取り込み）＝ refineSoon(book)
//        - 開いたときに、分野が無いか自動の分野の本を 1 回に REFINE_PER_LAUNCH 冊まで
//        - 本の詳細で紹介文が届いたとき（onBookInfo・取りに行かない）
//      取りに行くのは REFINE_GAP_MS ずつ空けて 1 冊ずつ（/api/cover は IP ごとに 1 分 30 回まで・控えはサーバー 24 時間
//      と端末 30 日）。本人が選んだ本・前の版のタグから移した分野は変えない。1 冊 1 回だけ（orime.fields.refined.v4）。
import { useCallback, useEffect, useRef } from 'react';
import { isDemo } from '../lib/supabase';
import { classifyBook, fieldsOf, nonFieldTags, renameOldFields, splitLegacyTags, withFields } from '../lib/bookFields';
import {
  backupLegacyTags, canAutoFill, canRefine, isMigrated, markFieldStage, markRefined, readFieldStages, readRefined, setMigrated,
} from '../lib/bookFieldsAuto';
import { genresFor, hasBookInfo, loadBookInfo, peekBookInfo } from '../lib/bookInfo';
import { fetchServerFields } from '../lib/bookFieldsServer';

const BACKFILL_MAX = 60; // 1 回に書名から自動で付ける本の数（多い本棚でも通信を詰まらせない）
export const REFINE_PER_LAUNCH = 5; // 開いたときに紹介文を取ってきて決め直す本の数
export const REFINE_GAP_MS = 3000; // 1 冊ずつ空ける時間（1 分 20 冊まで＝表紙の取得の分を残す）
const REFINE_QUEUE_MAX = 20; // 取り込みなどでまとめて足した本も、1 回に決め直すのはここまで（残りは次に開いたとき）

/** 紹介文・目次・ジャンル（book を渡すと、検索で選んだときのジャンルも）。 */
export function infoFeatures(info, book = null) {
  const genreIds = book ? genresFor(book, info ?? null) : (info && Array.isArray(info.genreIds) ? info.genreIds : []);
  if (!info) return genreIds.length ? { genreIds } : {};
  return { description: info.description || '', toc: Array.isArray(info.toc) ? info.toc : [], genreIds };
}

const sameFields = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export function useBookFieldsAuto({ userId, books, loading, saveBookTaxonomy, skipBookId = null }) {
  const live = useRef({});
  live.current = { books, saveBookTaxonomy, skipBookId };
  const ranFor = useRef(null);
  const queue = useRef({ ids: [], running: false, count: 0 });

  // 取ってきた（か届いた）紹介文・ジャンルで決め直す。info が無い（見つからない本）ときは、分野の無い本にだけ書名から。
  const applyInfo = useCallback(async (bookId, info) => {
    if (!userId) return;
    const cur = live.current.books.find((x) => x.id === bookId);
    if (!cur || cur.id === live.current.skipBookId) return;
    const stages = readFieldStages(userId);
    const have = fieldsOf(cur);
    if (!canRefine(userId, stages, readRefined(userId), cur, have.length > 0)) return;
    const features = infoFeatures(info, cur);
    const useful = hasBookInfo(info) || (features.genreIds || []).length > 0;
    markRefined(userId, cur.id);
    if (!useful && have.length) return; // 手がかりが増えないなら、付いている分野は変えない
    const auto = classifyBook({ title: cur.title, ...features });
    markFieldStage(userId, cur.id, useful ? 'info' : 'title');
    if (!auto.length || sameFields(auto, have)) return;
    await live.current.saveBookTaxonomy(cur.id, { tags: withFields(cur.tags, auto) });
  }, [userId]);

  // サーバーが決めた分野で置きかえる（自動の分野の本だけ・本人が選んだ本は canRefine で外れる）。
  const applyServer = useCallback(async (bookId, server) => {
    if (!userId) return false;
    const cur = live.current.books.find((x) => x.id === bookId);
    if (!cur || cur.id === live.current.skipBookId) return false;
    const stages = readFieldStages(userId);
    const have = fieldsOf(cur);
    if (!canRefine(userId, stages, readRefined(userId), cur, have.length > 0)) return true;
    markRefined(userId, cur.id);
    markFieldStage(userId, cur.id, 'info');
    if (sameFields(server.fields, have)) return true;
    await live.current.saveBookTaxonomy(cur.id, { tags: withFields(cur.tags, server.fields) });
    return true;
  }, [userId]);

  const pump = useCallback(async () => {
    const q = queue.current;
    if (q.running) return;
    q.running = true;
    try {
      while (q.ids.length) {
        const id = q.ids.shift();
        const book = live.current.books.find((x) => x.id === id);
        if (!book) continue;
        // まずサーバー（本ごとに 1 回決めた分野）。答えがあれば、それで決まり。
        // eslint-disable-next-line no-await-in-loop
        const server = await fetchServerFields(book).catch(() => null);
        // eslint-disable-next-line no-await-in-loop
        if (server && await applyServer(id, server)) {
          // eslint-disable-next-line no-await-in-loop
          if (q.ids.length) await new Promise((r) => setTimeout(r, REFINE_GAP_MS));
          continue;
        }
        const known = peekBookInfo(book);
        // eslint-disable-next-line no-await-in-loop
        const info = known !== undefined ? known : await loadBookInfo(book).catch(() => null);
        // 取りに行けなかった（通信の失敗＝控えに入らない）本は、次に開いたときにもう一度
        if (known === undefined && peekBookInfo(book) === undefined) continue;
        // eslint-disable-next-line no-await-in-loop
        await applyInfo(id, info);
        // eslint-disable-next-line no-await-in-loop
        if (known === undefined && q.ids.length) await new Promise((r) => setTimeout(r, REFINE_GAP_MS));
      }
    } finally {
      q.running = false;
    }
  }, [applyInfo, applyServer]);

  /** 本を足した直後に、紹介文・ジャンルを取ってきて分野を決め直す（本人が選んだ本は何もしない）。 */
  const refineSoon = useCallback((bookOrBooks) => {
    if (!userId) return;
    const list = (Array.isArray(bookOrBooks) ? bookOrBooks : [bookOrBooks]).filter((b) => b?.id);
    const q = queue.current;
    for (const b of list) {
      if (q.count >= REFINE_QUEUE_MAX) break;
      if (q.ids.includes(b.id)) continue;
      q.ids.push(b.id);
      q.count += 1;
    }
    // 保存のあと本の一覧に入るのを待ってから
    setTimeout(() => { pump(); }, 600);
  }, [userId, pump]);

  useEffect(() => {
    if (!userId || loading || !Array.isArray(books) || books.length === 0) return undefined;
    if (ranFor.current === userId) return undefined;
    ranFor.current = userId;
    let alive = true;
    (async () => {
      // 0. 前の版の分野の名前を新しい名前に（本人が選んだ分野も同じ置きかえ・分野でないタグは触らない）
      for (const b of [...live.current.books]) {
        if (!alive) return;
        const next = renameOldFields(b.tags, { title: b.title, ...infoFeatures(peekBookInfo(b), b) });
        if (!next) continue;
        // eslint-disable-next-line no-await-in-loop
        await live.current.saveBookTaxonomy(b.id, { tags: next });
      }
      // 1. 前の版のタグの移し替え
      if (isDemo || !isMigrated(userId)) {
        let allOk = true;
        for (const b0 of [...live.current.books]) {
          if (!alive) return;
          const b = live.current.books.find((x) => x.id === b0.id) || b0;
          const legacy = nonFieldTags(b);
          if (!legacy.length) continue;
          backupLegacyTags(userId, b.id, b.tags || []);
          const { fields: mapped, folders } = splitLegacyTags(b.tags || []);
          const fields = mapped.length ? mapped : fieldsOf(b);
          // まずフォルダへ（分野は足す・前のタグはまだ残す）→ フォルダに入ったら前のタグを外す
          // eslint-disable-next-line no-await-in-loop
          const first = await live.current.saveBookTaxonomy(b.id, { tags: [...fields, ...folders], addCollections: folders });
          if (!first.ok) { allOk = false; continue; }
          if (folders.length && !first.foldersOk) { allOk = false; continue; }
          if (folders.length) {
            // eslint-disable-next-line no-await-in-loop
            const second = await live.current.saveBookTaxonomy(b.id, { tags: fields });
            if (!second.ok) allOk = false;
          }
        }
        if (allOk) setMigrated(userId);
      }
      // 2. 分野の無い本に、書名（と控えた紹介文・ジャンル）から
      const stages = readFieldStages(userId);
      let n = 0;
      for (const b of [...live.current.books]) {
        if (!alive || n >= BACKFILL_MAX) break;
        if (b.id === live.current.skipBookId) continue;
        // 移し替えのあとの最新の本（live）で確かめる
        const cur = live.current.books.find((x) => x.id === b.id) || b;
        if (fieldsOf(cur).length) continue;
        const info = peekBookInfo(cur);
        const withInfo = !!info;
        if (!canAutoFill(stages, cur, { withInfo })) continue;
        const auto = classifyBook({ title: cur.title, ...infoFeatures(info, cur) });
        markFieldStage(userId, cur.id, withInfo ? 'info' : 'title');
        if (!auto.length) continue;
        n += 1;
        // eslint-disable-next-line no-await-in-loop
        await live.current.saveBookTaxonomy(cur.id, { tags: withFields(cur.tags, auto) });
      }
      if (!alive) return;
      // 3. 紹介文・ジャンルを取ってきて決め直す（分野の無い本から・1 回に REFINE_PER_LAUNCH 冊）
      const st = readFieldStages(userId);
      const refined = readRefined(userId);
      const cands = live.current.books
        .filter((b) => b.id !== live.current.skipBookId && canRefine(userId, st, refined, b, fieldsOf(b).length > 0))
        .sort((a, b) => fieldsOf(a).length - fieldsOf(b).length);
      if (cands.length) refineSoon(cands.slice(0, REFINE_PER_LAUNCH));
    })();
    return () => { alive = false; ranFor.current = null; };
  }, [userId, loading, books.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // 本の詳細を開いて紹介文・目次が届いたとき: まだ決め直していない自動の分野の本なら、サーバーに聞く（つながらなければ届いた紹介文で）
  const onBookInfo = useCallback(async (book, info) => {
    if (!userId || !book?.id || !info) return;
    const cur = live.current.books.find((x) => x.id === book.id) || book;
    if (!canRefine(userId, readFieldStages(userId), readRefined(userId), cur, fieldsOf(cur).length > 0)) return;
    refineSoon(cur);
  }, [userId, refineSoon]);

  return { onBookInfo, refineSoon };
}
