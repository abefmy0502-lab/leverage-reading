// 🔌🖼 AI と連携（MCP）の「会話の中に描く画面」（2026-11-07 オーナー「アーティファクトとの連携もできる？ ChatGPT の同様のものも」）。
//
// Claude の MCP Apps（資料 `ui://…`・mimeType text/html;profile=mcp-app・道具の _meta.ui.resourceUri）と、
// ChatGPT の Apps SDK（同じ MCP の拡張・mimeType text/html+skybridge・_meta["openai/outputTemplate"]）に、
// 同じ 1 枚の HTML を出す。描くのは道具の structuredContent（本の一覧・メモのカード・1 冊の詳細）。
// 文字の答え（content）はいつも一緒に返すので、画面を描けない AI でも困らない。
//
// 中の JS は 2 つの受け取り方を持つ:
//   - ChatGPT: window.openai.toolOutput（structuredContent）と 'openai:set_globals' の知らせ
//   - Claude（MCP Apps）: postMessage の JSON-RPC。ui/initialize を送り、ui/notifications/tool-result（structuredContent）を受ける
// どちらも来なければ「読み込んでいます…」のまま（AI の文字の答えが本体）。外へは何も送らない（画像も含めて取りに行かない＝表紙は data: か https の URL をそのまま img に）。

export const WIDGET_URI_MCP = 'ui://orime/cards.html';
export const WIDGET_URI_OPENAI = 'ui://orime/cards-openai.html';
export const WIDGET_MIME_MCP = 'text/html;profile=mcp-app';
export const WIDGET_MIME_OPENAI = 'text/html+skybridge';

const CSS = `
:root{--bg:#fbf9f4;--surface:#fff;--fill:#efece6;--line:#e3dfd6;--text:#1f1b16;--text2:#6b645a;--accent:#8b4a2b;--radius:12px;color-scheme:light dark}
@media(prefers-color-scheme:dark){:root{--bg:#1b1a18;--surface:#232220;--fill:#2d2b28;--line:#3a3733;--text:#f0ece4;--text2:#a8a197;--accent:#e0a07a}}
*{box-sizing:border-box}body{margin:0;background:transparent;color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;padding:4px}
.wrap{display:flex;flex-direction:column;gap:8px}
.h{font-size:13px;color:var(--text2);margin:0 0 4px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 16px;display:flex;gap:12px;align-items:flex-start}
.cover{width:40px;height:56px;border-radius:4px;object-fit:cover;background:var(--fill);flex:none}
.book .t{font-weight:600;margin:0}.book .a{color:var(--text2);font-size:13px;margin:2px 0 0}.book .m{color:var(--text2);font-size:13px;margin:4px 0 0}
.memo{flex-direction:column;gap:6px}
.memo .q{margin:0;font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:16px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}
.memo .m{margin:0;color:var(--text2);font-size:13px}
.tag{display:inline-block;background:var(--fill);border-radius:999px;padding:1px 8px;font-size:12px;margin-right:4px}
.row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--line)}.row:first-child{border-top:0}
.num{font-size:24px;font-weight:600;line-height:1.2}.sub{font-size:13px;color:var(--text2)}
.empty{color:var(--text2);padding:12px 0}
.foot{font-size:12px;color:var(--text2);margin:4px 0 0}
`;

const JS = `
(function(){
  var root=document.getElementById('root');
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function safeUrl(u){u=String(u||'');return /^https:\\/\\//.test(u)||/^data:image\\//.test(u)?u:'';}
  function statusJa(s){return {want:'読みたい',before:'積読',reading:'読書中',done:'読了'}[s]||s||'';}
  function books(list){return list.map(function(b){var c=safeUrl(b.cover);var meta=[statusJa(b.status),b.rating?'★'+b.rating:'',(b.fields||[]).join('・')].filter(Boolean).join(' · ');return '<div class="card book">'+(c?'<img class="cover" src="'+esc(c)+'" alt="">':'<div class="cover"></div>')+'<div><p class="t">'+esc(b.title)+'</p>'+(b.author?'<p class="a">'+esc(b.author)+'</p>':'')+(meta?'<p class="m">'+esc(meta)+'</p>':'')+'</div></div>';}).join('');}
  function memos(list){return list.map(function(m){var head=[m.book_title?'『'+m.book_title+'』':'',m.page_number!=null?'p.'+m.page_number:'',(m.created_at||'').slice(0,10)].filter(Boolean).join(' · ');var tags=(m.tags||[]).map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join('');return '<div class="card memo"><p class="q">'+esc(m.text)+'</p><p class="m">'+esc(head)+(tags?' '+tags:'')+'</p></div>';}).join('');}
  function actions(list){return '<div class="card" style="flex-direction:column;gap:0">'+list.map(function(a){return '<div class="row"><span>'+(a.done?'☑':'☐')+' '+esc(a.text)+'</span><span class="sub">'+esc([a.deadline?'期限 '+a.deadline:'',a.book_title||''].filter(Boolean).join(' · '))+'</span></div>';}).join('')+'</div>';}
  function stats(s){var rows=(s.books||[]).slice(0,6).map(function(b){return '<div class="row"><span>'+esc(b.title)+'</span><span class="sub">'+esc(b.label)+'</span></div>';}).join('');return '<div class="card" style="flex-direction:column;gap:4px"><div style="display:flex;gap:24px"><div><div class="num">'+esc(s.this_week_label)+'</div><div class="sub">今週</div></div><div><div class="num">'+esc(s.this_month_label)+'</div><div class="sub">今月</div></div><div><div class="num">'+esc(s.total_label)+'</div><div class="sub">これまで</div></div></div>'+(rows?'<div style="margin-top:8px">'+rows+'</div>':'')+'</div>';}
  function render(d){
    if(!d||typeof d!=='object'){root.innerHTML='<p class="empty">読み込んでいます…</p>';return;}
    var h='';
    if(d.book){var b=d.book;h+=books([b]);if(d.memos&&d.memos.length){h+='<p class="h">メモ '+d.memos.length+' 件</p>'+memos(d.memos);}if(d.actions&&d.actions.length){h+='<p class="h">行動</p>'+actions(d.actions);}}
    else if(d.books){h+=d.books.length?books(d.books):'<p class="empty">本が見つかりませんでした。</p>';}
    else if(d.memos){h+=d.memos.length?memos(d.memos):'<p class="empty">メモはありませんでした。</p>';}
    else if(d.actions){h+=d.actions.length?actions(d.actions):'<p class="empty">行動はありません。</p>';}
    else if(d.stats){h+=stats(d.stats);}
    else if(d.message){h+='<div class="card">'+esc(d.message)+'</div>';}
    if(d.more){h+='<p class="foot">ほかに '+esc(d.more)+' 件（続きは AI に「次の N 件」と頼んでください）</p>';}
    root.innerHTML='<div class="wrap">'+h+'</div>';
  }
  // ChatGPT（Apps SDK）
  try{if(window.openai&&window.openai.toolOutput){render(window.openai.toolOutput);}}catch(e){}
  window.addEventListener('openai:set_globals',function(){try{render(window.openai&&window.openai.toolOutput);}catch(e){}});
  // Claude（MCP Apps）: postMessage の JSON-RPC
  var seq=1;
  function send(msg){try{window.parent.postMessage(msg,'*');}catch(e){}}
  window.addEventListener('message',function(ev){var m=ev.data;if(!m||m.jsonrpc!=='2.0')return;
    if(m.method==='ui/notifications/tool-result'&&m.params){render(m.params.structuredContent||m.params.result&&m.params.result.structuredContent||null);}
    else if(m.method==='ui/notifications/tool-input'){/* 引数だけ・描くものは無い */}
    else if(m.id===1&&m.result){send({jsonrpc:'2.0',method:'ui/notifications/initialized'});}
  });
  if(!(window.openai&&window.openai.toolOutput)){render(null);send({jsonrpc:'2.0',id:seq,method:'ui/initialize',params:{protocolVersion:'2026-01-26',appInfo:{name:'orime',version:'1.0.0'},appCapabilities:{}}});}
})();
`;

export function widgetHtml() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orime</title><style>${CSS}</style></head><body><div id="root"></div><script>${JS}</script></body></html>`;
}
