// 🏆 Reading milestones — celebrates the user's Nth completed book.
//
// Tiers picked to keep celebration rare enough to feel meaningful:
// 1, 5, 10, 25, 50, 100. The first one is a 「初の 1 冊」moment that we
// don't want to skip — it's the strongest motivational hook.
//
// "Already celebrated" set lives in localStorage per user. Counting
// happens against the in-memory books list (no extra query needed).

export const READING_MILESTONES = [1, 5, 10, 25, 50, 100];

const KEY = (userId) => `readMilestones:${userId || 'anon'}`;

function read(userId) {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function write(userId, list) {
  try { localStorage.setItem(KEY(userId), JSON.stringify(list)); } catch { /* ignore */ }
}

export function getCompletedCount(books) {
  if (!Array.isArray(books)) return 0;
  return books.filter((b) => b && b.status === 'done').length;
}

// Returns the milestone that's been newly hit (and not yet celebrated)
// for the given completed-count, or null if nothing new.
export function pendingReadingMilestone(userId, completedCount) {
  const celebrated = new Set(read(userId));
  for (const m of READING_MILESTONES) {
    if (completedCount >= m && !celebrated.has(m)) {
      return m;
    }
  }
  return null;
}

export function markReadingMilestoneCelebrated(userId, milestone) {
  const list = read(userId);
  if (list.includes(milestone)) return;
  write(userId, [...list, milestone]);
}

export function getCelebratedReadingMilestones(userId) {
  return read(userId);
}

// Copy bank for each milestone. Keep it warm and book-flavoured.
export const READING_MILESTONE_COPY = {
  1: {
    title: '🎉 初めての 1 冊、読了！',
    body: '記念すべき最初の本を読み終えました。\nここから、あなたの読書投資が始まります。',
  },
  5: {
    title: '📚 5 冊読破！',
    body: '習慣の芽が出てきました。\nこの調子で、本の知恵を生活に取り入れていきましょう。',
  },
  10: {
    title: '🌟 10 冊読了！',
    body: '読書家の仲間入りです。\n10 冊分の知恵が、あなたの中に蓄積されました。',
  },
  25: {
    title: '💎 25 冊達成！',
    body: '25 冊の本があなたの世界を広げています。\n本気で読書を投資にしている姿、素晴らしいです。',
  },
  50: {
    title: '🏆 50 冊の偉業！',
    body: '半年〜数年分の読書が積み上がりました。\n今読み返すと、最初に読んだ本の見え方が変わるかも。',
  },
  100: {
    title: '👑 100 冊達成 — 伝説級！',
    body: 'これは本当にすごい。\n100 冊の本があなたの中で繋がり、独自の知の体系になっています。\n本田直之氏のレバレッジ・リーディングを地で行く境地です。',
  },
};

// Streak (consecutive-day) celebrations live alongside reading
// milestones — same modal, different copy bank.
export const STREAK_MILESTONE_COPY = {
  3: {
    title: '🔥 3 日連続！',
    body: '習慣化の兆しが見えてきました。\nこのペースを大切に。',
  },
  7: {
    title: '🔥 1 週間連続！',
    body: '1 週間続けられたあなたは強い。\n読書が日常に組み込まれ始めました。',
  },
  14: {
    title: '🔥 2 週間連続！',
    body: '2 週間の継続は確かな力。\nこのまま月単位の習慣に育てていきましょう。',
  },
  30: {
    title: '🌟 30 日連続！',
    body: '丸 1 ヶ月、毎日読書を続けたあなた。\nこれは「習慣」と呼んで間違いない領域です。',
  },
  50: {
    title: '🏆 50 日連続！',
    body: '50 日の継続は、ほとんどの人が辿り着けない場所。\nあなたの読書投資は、確実に複利で増えています。',
  },
  100: {
    title: '👑 100 日連続 — 伝説級の継続力！',
    body: 'これは本当に、本当に、すごいことです。\n\n100 日連続で読書と向き合ったあなたは、もう「読む人」を超えて「変わる人」。\n本田直之氏も同じことを言うはずです。\n\nこの記念すべき節目を、心から祝福します 🥂',
  },
};
