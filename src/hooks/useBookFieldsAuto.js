// 🏷 本の分野を裏で整える（2026-10-11・lib/bookFields.js・lib/bookFieldsAuto.js）。
//
//   0. 前の版の分野の名前（大分類 3・分野 18）を新しい名前（大分類 4・分野 19）に置きかえる（2026-10-11・
//        lib/bookFields.js の renameOldFields・決まった置きかえ・前の名前のある本だけ・何度流しても同じ。
//        「物語・エッセイ」は書名と端末に控えた紹介文から 小説・物語 か エッセイ・ノンフィクション に）
//   1. 前の版の本のタグを移す（アカウントごと・端末ごとに 1 回・何度流しても同じ結果）:
//        分野に結びつくタグ → その分野に置きかえる / 結びつかないタグ → 同じ名前のフォルダへ移してからタグを外す
//        （フォルダに入れられなかったときはタグのまま残す＝言葉を消さない）
//   2. 分野が 1 つも無い本に、書名（と端末に控えた紹介文・目次）から分野を付ける（静かに・知らせなし・まとめて）
//   3. 本の詳細で紹介文・目次が届いたとき、まだ分野の無い本なら、それも見て付ける（onBookInfo）
// 付いている分野は変えない。本人が選んだ本（stage 'user'）には自動で付けない。
import { useCallback, useEffect, useRef } from 'react';
import { isDemo } from '../lib/supabase';
import { classifyBook, fieldsOf, nonFieldTags, renameOldFields, splitLegacyTags, withFields } from '../lib/bookFields';
import { backupLegacyTags, canAutoFill, isMigrated, markFieldStage, readFieldStages, setMigrated } from '../lib/bookFieldsAuto';
import { peekBookInfo } from '../lib/bookInfo';

const BACKFILL_MAX = 60; // 1 回に自動で付ける本の数（多い本棚でも通信を詰まらせない）

export function infoFeatures(info) {
  return info ? { description: info.description || '', toc: Array.isArray(info.toc) ? info.toc : [] } : {};
}

export function useBookFieldsAuto({ userId, books, loading, saveBookTaxonomy, skipBookId = null }) {
  const live = useRef({});
  live.current = { books, saveBookTaxonomy, skipBookId };
  const ranFor = useRef(null);

  useEffect(() => {
    if (!userId || loading || !Array.isArray(books) || books.length === 0) return undefined;
    if (ranFor.current === userId) return undefined;
    ranFor.current = userId;
    let alive = true;
    (async () => {
      // 0. 前の版の分野の名前を新しい名前に（本人が選んだ分野も同じ置きかえ・分野でないタグは触らない）
      for (const b of [...live.current.books]) {
        if (!alive) return;
        const next = renameOldFields(b.tags, { title: b.title, ...infoFeatures(peekBookInfo(b)) });
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
      // 2. 分野の無い本に自動で
      const stages = readFieldStages(userId);
      let n = 0;
      for (const b of live.current.books) {
        if (!alive || n >= BACKFILL_MAX) return;
        if (b.id === live.current.skipBookId) continue;
        // 移し替えのあとの最新の本（live）で確かめる
        const cur = live.current.books.find((x) => x.id === b.id) || b;
        if (fieldsOf(cur).length) continue;
        const info = peekBookInfo(cur);
        const withInfo = !!info;
        if (!canAutoFill(stages, cur, { withInfo })) continue;
        const auto = classifyBook({ title: cur.title, ...infoFeatures(info) });
        markFieldStage(userId, cur.id, withInfo ? 'info' : 'title');
        if (!auto.length) continue;
        n += 1;
        // eslint-disable-next-line no-await-in-loop
        await live.current.saveBookTaxonomy(cur.id, { tags: withFields(cur.tags, auto) });
      }
    })();
    return () => { alive = false; ranFor.current = null; };
  }, [userId, loading, books.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. 本の詳細で紹介文・目次が届いたとき
  const onBookInfo = useCallback(async (book, info) => {
    if (!userId || !book?.id || !info) return;
    const cur = live.current.books.find((x) => x.id === book.id) || book;
    if (fieldsOf(cur).length) return;
    const stages = readFieldStages(userId);
    if (!canAutoFill(stages, cur, { withInfo: true })) return;
    markFieldStage(userId, cur.id, 'info');
    const auto = classifyBook({ title: cur.title, ...infoFeatures(info) });
    if (auto.length) await live.current.saveBookTaxonomy(cur.id, { tags: withFields(cur.tags, auto) });
  }, [userId]);

  return { onBookInfo };
}
