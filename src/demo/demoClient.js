// 🧪 お試しモード（開発専用）— Supabase クライアントの差し替え。
//
// 目的: Supabase に繋がらない環境（プロジェクト停止中・オフライン・CI）でも、
// サンプルデータ入りのアプリを実際に操作して画面を確認できるようにする。
// 本番ビルドには含まれない（lib/supabase.js が import.meta.env.DEV でのみ使う。
// production では DEV=false の定数畳み込みで丸ごと tree-shake される）。
//
// 使い方: `npm run demo` → http://localhost:5173/
//   - 既定: 半年使い込んだユーザーのデータ入り
//   - ?demo=new  : 新規ユーザー（本0冊・初回ガイドから）
//   - ?demo=auth : 未ログイン状態（ログイン画面・LP の確認用。&authfail=1 でログインが通信エラーになる）
//   - ?demo=paywall : 購読なし（有料プランの画面の確認用。&native=1 でアプリ版の表示）
//   - ?demo=free / freeused / freenew : 無料プラン（相談だけ AI・毎月 30 トークン）/ 使い切った / 新規
//     （無料プランの写真から書き起こしは今月 2 回使った＝あと 8 回。&ocr=used で 10 回を使い切った）
//   - ?demo=freegrown : 無料プランでメモが 10 件以上（相談の「相談相手が育ってきました」＝7 日間無料の案内。&trial=off で使えない人の文）
//   - ?demo=trial : 7 日間無料の途中 / ?demo=limit : 今月の 800 トークンを使い切った
//   - ?demo=tokens : 今月の分を使い切り、追加トークンが残っている（「トークンを追加」はその場で足す）
//   - ?demo=webgate : ブラウザの一般利用者に出す「アプリでご利用ください」の確認用
//   - &consent=none : AI に送る内容にまだ同意していない（はじめて AI を使う操作で同意のシートが出る・どのシナリオにも付けられる）
//     &consent=none&consent=slow で、同意・取り消しの保存が 8 秒かかる（処理中のボタンの確認用）
//   - &load=bookmemos : 本の詳細のメモ一覧の読み込みだけ遅らせる（本の詳細の読み込み中の確認用）
//   - &longtag=1 : 「マネジメント」のタグを 50 字の長いタグにする（合いそうなタグのチップがはみ出さないかの確認用）
//   - &purpose=1 : 積読の『LIFE SHIFT』に得たいことを入れる（読書計画シートは無いまま＝「読書を開始する」の確認用・2026-10-04）
//   - &save=slow-memo-update : メモの書き直し（タグを付ける）がなかなか終わらない（保存中のチップの確認用）
//   - &writefail=book_memos:update : メモの書き直しだけ失敗させる（新しいメモの保存は通る・表:操作）
//   - &seen=2026-10-03 : 「新しくなったこと」をその版まで見た人（更新したあとのシートが、それより新しい版で出る）。
//     付けなければ、いまの版を見たことにする（ほかの撮影にシートを重ねない）。新規の人のシナリオは付けても無視
//   - &update=1 : 「アプリの新しい版があります」を出す（Web の新しい版の知らせ）。&bundle=2026-10-04 を足すと、
//     アプリに入っている版をその版にして「何が変わった？」（それより新しい版の中身）を出せる
//   - &fields=zero : 分野の付いた本が 1 冊も無い（自動でも付けない）
//   - &fieldsrv=down|slow : 本の分野のサーバーがつながらない／見立てに 30 秒
//   - &memos=none  : メモを全部外す（記録の「分野」でメモの数が無い行の確認用・2026-10-11）
//   - &fields=none : 本の分野を全部外す（分野なしの本に書名から自動で付く確認用・lib/bookFields.js・2026-10-11）
//   - &focus=start|until|untilrun|timer|count|long|fresh|paused|done|summary : ⏱ 読む（集中モード）を『数値化の鬼』で開く（App.jsx・2026-10-09）。
//     start=始める前のシート・timer=タイマー 30 分の 7 分目・count=計測 32 分・long=計測 1 時間 15 分・fresh=始めて 10 秒（30 秒未満でおわると何も残さず閉じる）・paused=一時停止中・done=タイマーが終わった・summary=おわったとき
// データはメモリ上だけ。再読み込みで初期状態に戻る。
//
// supabase-js のうち、このアプリが実際に使う範囲だけを再現する
// （select/insert/update/upsert/delete、eq/neq/in/is/not/or/contains/order/
// limit/range/single/maybeSingle、埋め込み select、count/head、auth、storage）。

import { buildSeed, DEMO_USER_ID } from './seed';
import { installDemoFetch, LP_SHOT_MEMO } from './demoFetch';
import { demoAdminRpc } from './demoAdmin';
import { AI_CONSENT_VERSION } from '../lib/aiProcessors';
import { CURRENT_RELEASE_ID } from '../lib/releaseNotes';

// &offline=1: つながっていない間は書き込みがすべて失敗する（本物の端末と同じ・オフラインで保存したときの表示の確認用）。
//   window に 'online' の知らせが来たら、つながった状態に戻る（hooks/useOnline.js と同じ決まり）。
//   （本番のバンドルに残らないよう、ここでは何もしない。知らせを聞くのは createDemoClient の中。）
let demoBackOnline = false;

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);
const singular = (t) => (t.endsWith('s') ? t.slice(0, -1) : t);

// select 文字列をトップレベルのカンマで分割する（括弧内は分割しない）。
function splitTop(s) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseEmbeds(select) {
  return splitTop(select || '*')
    .map((item) => item.match(/^(?:([a-zA-Z_]+):)?([a-zA-Z_]+)(?:![a-z_]+)?\((.*)\)$/))
    .filter(Boolean)
    .map(([, alias, table, inner]) => ({ key: alias || table, table, inner }));
}

const likeToRe = (pat, flags) =>
  new RegExp(`^${String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, flags);

function cmp(op, a, v) {
  switch (op) {
    case 'eq': return a === v || (a != null && v != null && String(a) === String(v));
    case 'neq': return !cmp('eq', a, v);
    case 'gt': return a != null && a > v;
    case 'gte': return a != null && a >= v;
    case 'lt': return a != null && a < v;
    case 'lte': return a != null && a <= v;
    case 'like': return a != null && likeToRe(v).test(String(a));
    case 'ilike': return a != null && likeToRe(v, 'i').test(String(a));
    case 'is': return v === null || v === 'null' ? a == null : a === (v === 'true' || v === true);
    case 'in': return (Array.isArray(v) ? v : String(v).replace(/^\(|\)$/g, '').split(','))
      .some((x) => cmp('eq', a, typeof x === 'string' ? x.replace(/^"|"$/g, '') : x));
    case 'contains': return Array.isArray(a) && (Array.isArray(v) ? v : [v]).every((x) => a.includes(x));
    default: return true;
  }
}

class Query {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.op = 'select';
    this.filters = [];
    this.orders = [];
    this.selectStr = '*';
    this.returning = false;
    this.count = null;
    this.head = false;
    this.limitN = null;
    this.rangeAB = null;
    this.singleMode = null;
  }

  select(cols = '*', opts = {}) {
    this.selectStr = cols;
    if (this.op === 'select') { this.count = opts.count || null; this.head = !!opts.head; } else this.returning = true;
    return this;
  }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = rows; this.onConflict = opts.onConflict || 'id'; this.ignoreDuplicates = !!opts.ignoreDuplicates; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }

  _f(fn) { this.filters.push(fn); return this; }
  eq(c, v) { (this.eqCols ||= []).push(c); return this._f((r) => cmp('eq', r[c], v)); }
  neq(c, v) { return this._f((r) => cmp('neq', r[c], v)); }
  gt(c, v) { return this._f((r) => cmp('gt', r[c], v)); }
  gte(c, v) { return this._f((r) => cmp('gte', r[c], v)); }
  lt(c, v) { return this._f((r) => cmp('lt', r[c], v)); }
  lte(c, v) { return this._f((r) => cmp('lte', r[c], v)); }
  like(c, v) { return this._f((r) => cmp('like', r[c], v)); }
  ilike(c, v) { return this._f((r) => cmp('ilike', r[c], v)); }
  is(c, v) { return this._f((r) => cmp('is', r[c], v)); }
  in(c, v) { return this._f((r) => cmp('in', r[c], v)); }
  contains(c, v) { return this._f((r) => cmp('contains', r[c], v)); }
  match(obj) { Object.entries(obj).forEach(([c, v]) => this.eq(c, v)); return this; }
  filter(c, op, v) { return this._f((r) => cmp(op, r[c], v)); }
  not(c, op, v) { return this._f((r) => !cmp(op, r[c], v)); }
  or(expr) {
    const conds = splitTop(expr).map((part) => {
      const [c, op, ...rest] = part.split('.');
      return { c, op, v: rest.join('.') };
    });
    return this._f((r) => conds.some(({ c, op, v }) => cmp(op, r[c], v === 'null' ? null : v)));
  }
  order(c, { ascending = true } = {}) { this.orders.push({ c, ascending }); return this; }
  limit(n) { this.limitN = n; return this; }
  range(a, b) { this.rangeAB = [a, b]; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  abortSignal() { return this; }
  returns() { return this; }
  throwOnError() { return this; }

  then(resolve, reject) {
    // &load=slow: 読み込みがなかなか終わらない（読み込み中の表示の確認用）。読み出しだけ遅らせる。
    const qs = new URLSearchParams(window.location.search);
    // 本とメモの読み出しだけ遅らせる（課金・ログインの確認まで遅らせると、その待ち画面で止まってしまう）。
    // &load=chat: 過去の相談（chat_messages）の読み出しだけ遅らせる（相談の読み込み中の表示の確認用）。
    // &load=memosearch / &dbfail=memosearch: すべての本の検索がメモを読む 1 回だけ遅らせる／失敗させる
    //   （「メモの中を探しています…」「メモの中は探せませんでした」の確認用・hooks/useLibrarySearch.js の select）。
    const memoSearch = this.op === 'select' && this.table === 'book_memos' && /page_number, tags, created_at/.test(String(this.selectStr || ''));
    if (memoSearch && qs.get('dbfail') === 'memosearch') {
      return new Promise((r) => setTimeout(r, 300))
        .then(() => ({ data: null, error: { message: 'network error', code: 'demo' }, count: null }))
        .then(resolve, reject);
    }
    const slow = this.op === 'select' && ((qs.get('load') === 'slow' && ['books', 'book_memos'].includes(this.table))
      || (qs.get('load') === 'chat' && this.table === 'chat_messages')
      || (qs.get('load') === 'memosearch' && memoSearch)
      // &load=memocount: ホームのメモの件数（book_memos の head の数え上げ）だけ遅らせる（育つまでの一行の形の確認用・2026-10-02）。
      || (qs.get('load') === 'memocount' && this.table === 'book_memos' && this.head)
      // &load=bookmemos: 本の詳細のメモ一覧（book_id で絞る読み出し）だけ遅らせる（本の詳細の読み込み中の形の確認用・2026-10-04）。
      || (qs.get('load') === 'bookmemos' && this.table === 'book_memos' && !this.head && (this.eqCols || []).includes('book_id')));
    // &writefail=book_memos: 指定した表への書き込みを失敗させる（保存の失敗の表示の確認用）。
    //   &writefail=book_memos:update のように「表:操作」で、その操作だけを失敗させる。
    const writeFails = (qs.get('writefail') || '').split(',');
    if ((qs.get('offline') === '1' && !demoBackOnline && this.op !== 'select') || (['insert', 'upsert', 'update'].includes(this.op) && (writeFails.includes(this.table) || writeFails.includes(`${this.table}:${this.op}`)))) {
      return new Promise((r) => setTimeout(r, 300))
        .then(() => ({ data: null, error: { message: 'network error', code: 'demo' }, count: null }))
        .then(resolve, reject);
    }
    // &dbfail=books,book_memos: 指定した表の読み出しを失敗させる（読み込み失敗の表示の確認用）。
    const failTables = (qs.get('dbfail') || '').split(',').filter(Boolean);
    if (this.op === 'select' && failTables.includes(this.table)) {
      return new Promise((r) => setTimeout(r, 300))
        .then(() => ({ data: null, error: { message: 'network error', code: 'demo' }, count: null }))
        .then(resolve, reject);
    }
    // &db=fail: 過去の相談の読み込みが失敗する（失敗の表示の確認用）。
    if (this.op === 'select' && qs.get('db') === 'fail' && this.table === 'chat_messages') {
      return new Promise((r) => setTimeout(r, 300))
        .then(() => ({ data: null, error: { message: 'network error', code: 'demo' }, count: null }))
        .then(resolve, reject);
    }
    // &save=slow: 本の保存がなかなか終わらない（取り込み中の表示の確認用）。書き込みだけ遅らせる。
    const slowSave = (this.op !== 'select' && qs.get('save') === 'slow' && this.table === 'books')
      || (this.op === 'update' && qs.get('save') === 'slow-memo-update' && this.table === 'book_memos');
    return new Promise((r) => setTimeout(r, slow || slowSave ? 60000 : 40)).then(() => this._exec()).then(resolve, reject);
  }

  _rows() { return this.store.table(this.table); }

  _embed(row) {
    const out = { ...row };
    for (const { key, table, inner } of parseEmbeds(this.selectStr)) {
      const fk = `${singular(table)}_id`;
      const nested = parseEmbeds(inner);
      const withNested = (r) => {
        if (!nested.length) return r;
        const sub = new Query(this.store, table);
        sub.selectStr = inner;
        return sub._embed(r);
      };
      if (fk in row) {
        const hit = this.store.table(table).find((r) => r.id === row[fk]);
        out[key] = hit ? withNested(hit) : null;
      } else {
        const back = `${singular(this.table)}_id`;
        out[key] = this.store.table(table).filter((r) => r[back] === row.id).map(withNested);
      }
    }
    return out;
  }

  _shape(rows) {
    let data = rows;
    for (const { c, ascending } of [...this.orders].reverse()) {
      data = [...data].sort((a, b) => {
        const x = a[c]; const y = b[c];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    const count = data.length;
    if (this.rangeAB) data = data.slice(this.rangeAB[0], this.rangeAB[1] + 1);
    if (this.limitN != null) data = data.slice(0, this.limitN);
    data = clone(data.map((r) => this._embed(r)));
    if (this.singleMode) {
      if (data.length === 1) return { data: data[0], error: null, count };
      if (data.length === 0 && this.singleMode === 'maybe') return { data: null, error: null, count };
      return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, count };
    }
    return { data, error: null, count };
  }

  _exec() {
    const rows = this._rows();
    const match = (r) => this.filters.every((f) => f(r));
    const now = new Date().toISOString();
    const user = this.store.session?.user;
    const fill = (r) => ({
      id: uuid(), created_at: now, updated_at: now,
      ...(user && !('user_id' in r) && this.table !== 'subscriptions' ? { user_id: user.id } : {}),
      ...(this.table === 'book_memos' ? { recall_count: 0, last_recalled_at: null } : {}),
      ...r,
    });

    if (this.op === 'select') {
      const res = this._shape(rows.filter(match));
      if (this.head) return { data: null, error: null, count: res.count };
      return this.count ? res : { data: res.data, error: res.error };
    }
    if (this.op === 'insert') {
      const added = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(fill);
      rows.push(...added);
      return this.returning || this.singleMode ? this._shape(added) : { data: null, error: null };
    }
    if (this.op === 'upsert') {
      const keys = this.onConflict.split(',').map((s) => s.trim());
      const touched = [];
      for (const r of Array.isArray(this.payload) ? this.payload : [this.payload]) {
        const hit = rows.find((x) => keys.every((k) => r[k] != null && cmp('eq', x[k], r[k])));
        if (hit) {
          if (!this.ignoreDuplicates) Object.assign(hit, r, { updated_at: now });
          touched.push(hit);
        } else {
          const n = fill(r); rows.push(n); touched.push(n);
        }
      }
      return this.returning || this.singleMode ? this._shape(touched) : { data: null, error: null };
    }
    if (this.op === 'update') {
      const hits = rows.filter(match);
      hits.forEach((r) => Object.assign(r, this.payload, { updated_at: now }));
      return this.returning || this.singleMode ? this._shape(hits) : { data: null, error: null };
    }
    if (this.op === 'delete') {
      const hits = rows.filter(match);
      this.store.db[this.table] = rows.filter((r) => !match(r));
      // 本の削除はリレーション（DB の ON DELETE CASCADE 相当）も消す。
      if (this.table === 'books') {
        const ids = new Set(hits.map((h) => h.id));
        ['book_tags', 'book_collections', 'actions', 'book_memos', 'reading_sessions'].forEach((t) => {
          this.store.db[t] = this.store.table(t).filter((r) => !ids.has(r.book_id));
        });
      }
      return this.returning ? this._shape(hits) : { data: null, error: null };
    }
    return { data: null, error: null };
  }
}

function makeSession(user) {
  return {
    access_token: 'demo-access-token', refresh_token: 'demo', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user,
  };
}

export function createDemoClient() {
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => { demoBackOnline = true; });
  }
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('demo') || 'full';
  if (scenario === 'new' || scenario === 'auth' || scenario === 'freenew') {
    // 新規ユーザー体験を毎回まっさらに見るため、端末ローカルの既読フラグも消す。
    try { window.localStorage.clear(); } catch { /* ignore */ }
  } else {
    try {
      window.localStorage.setItem('onboardingCompleted', 'true');
      window.localStorage.setItem('orime-returning', 'true');
      window.localStorage.setItem('orime-activation-v1', JSON.stringify({ book: true, memo: true, review: true }));
      // 新しくなったこと: 既定はいまの版まで見た人（&seen=… でその版まで）。
      window.localStorage.setItem('orime.whatsnew.seen', params.get('seen') || CURRENT_RELEASE_ID);
    } catch { /* ignore */ }
  }
  // &update=1: 新しい版の知らせ（UpdateBanner は window の知らせを待っている・読み込みが終わってから送る）。
  if (params.get('update') === '1') {
    setTimeout(() => { try { window.dispatchEvent(new Event('app-update-available')); } catch { /* ignore */ } }, 1500);
  }

  const demoUser = {
    id: DEMO_USER_ID, aud: 'authenticated', role: 'authenticated',
    email: 'demo@example.com',
    // AI に送る前の同意（lib/aiConsent.js）。既定は同意済み。&consent=none でまだ同意していない人（シートが出る）。
    user_metadata: {
      display_name: scenario === 'new' ? '' : 'さとう',
      ai_consent: params.get('consent') === 'none' ? null : { version: AI_CONSENT_VERSION, at: '2026-10-01T00:00:00.000Z' },
    },
    app_metadata: { provider: 'email' },
    // ?demo=freenew: 登録したばかりの人（無料プランのはじめの月＝今月は 60 トークン・2026-10-09）。
    //   &joined=new: ほかのシナリオでも、今月アカウントを作った人にする（例 ?demo=fewmemos&joined=new・?demo=freeused&joined=new）。
    created_at: new Date(Date.now() - (scenario === 'freenew' || params.get('joined') === 'new' ? 600000 : 200 * 86400000)).toISOString(),
  };

  const db = buildSeed(scenario);
  // &fields=none: 本の分野と前の版のタグを全部外す（開くと書名から分野が自動で付く・2026-10-11）。
  if (params.get('fields') === 'none') db.book_tags = [];
  // &fields=zero: 分野の付いた本が 1 冊も無い人（記録の「分野」が出ない形・自動でも付けない＝本人が選んだ印を付ける・2026-10-11）。
  if (params.get('fields') === 'zero') {
    db.book_tags = [];
    try {
      const marks = Object.fromEntries((db.books || []).map((b) => [b.id, 'user']));
      localStorage.setItem(`orime.fields.stage.v2:${DEMO_USER_ID}`, JSON.stringify(marks));
    } catch { /* 覚えられなくても撮るだけ */ }
  }
  // &memos=none: メモを全部外す（記録の「分野」でメモの数が無い行・2026-10-11）。
  if (params.get('memos') === 'none') db.book_memos = [];
  if (params.get('longtag') === '1') {
    const LONG = 'マネジメント（部下・チーム・1on1・任せ方・評価・育成のことをまとめておくタグ）'.slice(0, 50);
    for (const m of db.book_memos || []) if (Array.isArray(m.tags)) m.tags = m.tags.map((t) => (t === 'マネジメント' ? LONG : t));
  }
  // &lpshot=1: LP の写真用（scripts/lp-shots.mjs）。「部下が報告をくれない」の答えの根拠になる自分の学びを 1 件足す
  //   （答えは demoFetch.js の lpShotAnswer・2026-10-05）。
  if (params.get('lpshot') === '1' && Array.isArray(db.book_memos) && db.book_memos.length) {
    const at = new Date(Date.now() - 20 * 86400000).toISOString();
    db.book_memos.push({
      id: '00000000-0000-4000-8000-0000000c9001', user_id: DEMO_USER_ID, book_id: null, source_type: 'personal',
      page_number: null, text: LP_SHOT_MEMO, photo_path: null, tags: ['マネジメント'],
      last_recalled_at: null, recall_count: 0, created_at: at, updated_at: at,
    });
  }
  if (params.get('purpose') === '1') {
    for (const b of db.books || []) if (b.title === 'LIFE SHIFT') b.invest_purpose = '40 代からの働き方の選択肢を持ちたい';
  }
  const store = {
    db,
    session: scenario === 'auth' ? null : makeSession(demoUser),
    files: new Map(),
    table(name) { if (!this.db[name]) this.db[name] = []; return this.db[name]; },
  };
  const listeners = new Set();
  const emit = (event) => listeners.forEach((cb) => { try { cb(event, store.session); } catch { /* ignore */ } });
  const signIn = (email) => {
    store.session = makeSession({ ...demoUser, email: email || demoUser.email });
    setTimeout(() => emit('SIGNED_IN'), 0);
    return { data: { user: store.session.user, session: store.session }, error: null };
  };
  const unsupported = { data: null, error: { message: 'お試しモードでは使えません（メールでログインしてください）' } };

  installDemoFetch(store);
  // 開発時にコンソールから中身を覗けるように（例: __orimeDemo.db.book_memos）。
  window.__orimeDemo = store;

  return {
    auth: {
      getSession: async () => ({ data: { session: store.session }, error: null }),
      getUser: async () => ({ data: { user: store.session?.user ?? null }, error: null }),
      onAuthStateChange(cb) {
        listeners.add(cb);
        setTimeout(() => { try { cb('INITIAL_SESSION', store.session); } catch { /* ignore */ } }, 0);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      // &authfail=1: 通信の失敗（ログイン画面のエラー表示の確認用）。
      signInWithPassword: async ({ email }) => (params.get('authfail')
        ? { data: null, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } }
        : signIn(email)),
      signUp: async ({ email }) => signIn(email),
      signOut: async () => { store.session = null; setTimeout(() => emit('SIGNED_OUT'), 0); return { error: null }; },
      updateUser: async (attrs) => {
        // &consent=slow（&consent=none と一緒に使う）: アカウントへの同意の保存がなかなか終わらない（「保存しています…」の確認用）。
        if (params.getAll('consent').includes('slow') && attrs?.data && 'ai_consent' in attrs.data) {
          await new Promise((r) => { setTimeout(r, 8000); });
        }
        if (store.session) {
          store.session.user = {
            ...store.session.user,
            ...(attrs.email ? { email: attrs.email } : {}),
            user_metadata: { ...store.session.user.user_metadata, ...(attrs.data || {}) },
          };
          setTimeout(() => emit('USER_UPDATED'), 0);
        }
        return { data: { user: store.session?.user ?? null }, error: null };
      },
      resend: async () => ({ data: {}, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      signInWithOAuth: async () => unsupported,
      signInWithIdToken: async () => unsupported,
      refreshSession: async () => ({ data: { session: store.session }, error: null }),
    },
    from: (table) => new Query(store, table),
    rpc: async (name) => {
      // ?admin=1: 運営ダッシュボードを開ける管理者（demoAdmin.js のサンプル）。
      const isAdminDemo = params.get('admin') === '1';
      if (name === 'is_app_admin') return { data: isAdminDemo, error: null };
      if (isAdminDemo) {
        const hit = demoAdminRpc(name, params);
        if (hit) return hit;
      }
      return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } };
    },
    storage: {
      from: () => ({
        upload: async (path, file) => { store.files.set(path, URL.createObjectURL(file)); return { data: { path }, error: null }; },
        remove: async (paths) => { (paths || []).forEach((p) => store.files.delete(p)); return { data: [], error: null }; },
        createSignedUrl: async (path) => ({ data: { signedUrl: store.files.get(path) || '' }, error: null }),
        createSignedUrls: async (paths) => ({
          data: (paths || []).map((p) => ({ path: p, signedUrl: store.files.get(p) || '', error: null })),
          error: null,
        }),
        getPublicUrl: (path) => ({ data: { publicUrl: store.files.get(path) || '' } }),
      }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => {},
  };
}
