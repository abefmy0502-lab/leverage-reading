// 🧪 お試しモードのフォロー（&social=1・2026-11-21）。supabase_follows.sql の関数と同じ形で答える（メモリだけ）。
const people = {
  k7mna2pqrs: { public_id: 'k7mna2pqrs', nickname: 'さくら', avatar: 'leaf', bio: '人事の仕事。組織づくりと習慣の本が好きです。', fav_title: '７つの習慣', fav_author: 'スティーブン・R・コヴィー', fav_cover: '', fav_line: '主体的であれ。反応を選ぶ自由は自分にある。' },
  t3xbw9hjuv: { public_id: 't3xbw9hjuv', nickname: 'けんた', avatar: 'mountain' },
  q8rfz4mncd: { public_id: 'q8rfz4mncd', nickname: 'あおい', avatar: 'moon' },
  w2ycd5kpne: { public_id: 'w2ycd5kpne', nickname: 'ゆう', avatar: '' },
  m5hqv8tzab: { public_id: 'm5hqv8tzab', nickname: 'はるか', avatar: 'sun' },
  p4nrs6dwxe: { public_id: 'p4nrs6dwxe', nickname: 'なおき', avatar: 'book' },
  r9jkt3wfyc: { public_id: 'r9jkt3wfyc', nickname: 'みなみ', avatar: '' },
};
// 相手のフォロー中・フォロワー（2026-11-23・さくらさんだけ）。'me' はお試しの自分（フォロワーの中の「あなた」）。
// &socialstate=hiddenlists でさくらさんが一覧を隠している。
const connections = {
  k7mna2pqrs: { following: ['m5hqv8tzab', 't3xbw9hjuv', 'p4nrs6dwxe'], followers: ['me', 'r9jkt3wfyc', 'm5hqv8tzab'] },
};
const ME = { public_id: 'demo0me001', nickname: 'ふみ', avatar: 'leaf' };
let followsVisible = true;
// &socialstate=empty で 0 件の画面（フォロー中・フォロワー・申し込みが無い）。
const socialState = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('socialstate') : '';
const empty = socialState === 'empty';
const state = empty
  ? { following: [], followers: [], requests: [], sent: [], blocked: [] }
  : { following: ['k7mna2pqrs'], followers: ['k7mna2pqrs', 't3xbw9hjuv'], requests: ['q8rfz4mncd'], sent: [], blocked: ['w2ycd5kpne'] };
const shelves = {
  k7mna2pqrs: [
    { id: '7b1e0000-0000-4000-8000-000000000001', title: 'イシューからはじめよ', author: '安宅和人', status: 'reading', rating: 0, isbn: '9784862760852', summary: '' },
    { id: '7b1e0000-0000-4000-8000-000000000002', title: '７つの習慣', author: 'スティーブン・R・コヴィー', status: 'done', rating: 5, isbn: '', summary: '影響の輪に集中する。\n反応する前に一拍おいて、自分で選ぶ。\nチームの 1on1 でも、相手の関心の輪ではなく影響の輪の話をするようにした。' },
    { id: '7b1e0000-0000-4000-8000-000000000003', title: '心理的安全性のつくりかた', author: '石井遼介', status: 'done', rating: 4, isbn: '', summary: '安全性は「ぬるさ」ではない。話しやすさ・助け合い・挑戦・新奇歓迎の 4 つ。' },
    { id: '7b1e0000-0000-4000-8000-000000000004', title: 'エッセンシャル思考', author: 'グレッグ・マキューン', status: 'want', rating: 0, isbn: '', summary: '' },
    { id: '7b1e0000-0000-4000-8000-000000000005', title: 'リーダーの仮面', author: '安藤広大', status: 'done', rating: 3, isbn: '', summary: '' },
    { id: '7b1e0000-0000-4000-8000-000000000006', title: '嫌われる勇気', author: '岸見一郎・古賀史健', status: 'done', rating: 5, isbn: '', summary: '課題の分離。他人の課題に踏み込まない。' },
    { id: '7b1e0000-0000-4000-8000-000000000007', title: '考え方', author: '稲盛和夫', status: 'reading', rating: 0, isbn: '', summary: '' },
    { id: '7b1e0000-0000-4000-8000-000000000008', title: '確率思考の戦略論', author: '森岡毅・今西聖貴', status: 'reading', rating: 0, isbn: '', summary: '' },
    { id: '7b1e0000-0000-4000-8000-000000000009', title: 'チームが自然に生まれ変わる', author: '李英俊', status: 'before', rating: 0, isbn: '', summary: '' },
  ],
};
const person = (id) => ({ public_id: id, nickname: people[id]?.nickname || '', avatar: people[id]?.avatar || '', since: '2026-11-20T10:00:00Z' });
const del = (arr, id) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); };

export function demoSocialRpc(name, args = {}) {
  const id = String(args.p_public_id || '');
  switch (name) {
    case 'my_follows':
      return { ...Object.fromEntries(Object.entries(state).map(([k, ids]) => [k, ids.map(person)])), me: { follows_visible: followsVisible } };
    case 'set_follows_visible':
      followsVisible = !!args.p_visible;
      return true;
    case 'followee_connections': {
      if (!state.following.includes(id)) return null;
      if (socialState === 'hiddenlists') return { visible: false };
      const c = connections[id] || { following: [], followers: [] };
      const rel = (pid) => (pid === 'me' ? 'self' : state.following.includes(pid) ? 'accepted' : state.sent.includes(pid) ? 'pending' : 'none');
      const row = (pid) => (pid === 'me' ? { ...ME, since: '2026-11-20T10:00:00Z', relation: 'self' } : { ...person(pid), relation: rel(pid) });
      return { visible: true, following: c.following.filter((p) => !state.blocked.includes(p)).map(row), followers: c.followers.filter((p) => !state.blocked.includes(p)).map(row) };
    }
    case 'follow_request':
      if (!people[id] || state.blocked.includes(id)) return 'not_found';
      if (state.following.includes(id)) return 'accepted';
      if (!state.sent.includes(id)) state.sent.unshift(id);
      return 'pending';
    case 'follow_respond':
      if (!state.requests.includes(id)) return 'not_found';
      del(state.requests, id);
      if (args.p_accept) { state.followers.unshift(id); return 'accepted'; }
      return 'declined';
    case 'follow_remove':
      if (args.p_as === 'follower') del(state.followers, id); else { del(state.following, id); del(state.sent, id); }
      return true;
    case 'block_user':
      ['following', 'followers', 'requests', 'sent'].forEach((k) => del(state[k], id));
      if (!state.blocked.includes(id)) state.blocked.unshift(id);
      return true;
    case 'unblock_user':
      del(state.blocked, id);
      return true;
    case 'profile_preview': {
      if (!people[id] || state.blocked.includes(id)) return null;
      const relation = state.following.includes(id) ? 'accepted' : state.sent.includes(id) ? 'pending' : 'none';
      return { ...people[id], relation };
    }
    case 'report_profile':
      // &report=fail で送れなかったときの画面
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('report') === 'fail') throw Object.assign(new Error('demo report failed'), { code: '500' });
      return people[id] ? 'ok' : 'not_found';
    case 'followee_shelf':
      if (!state.following.includes(id)) return null;
      return { profile: people[id], books: shelves[id] || [] };
    default:
      return undefined;
  }
}
