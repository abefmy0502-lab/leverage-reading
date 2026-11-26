// 📚 Kindle のノートブック（read.amazon.co.jp/notebook）を、全部の本まとめて 1 つのファイルに（2026-11-26 体験した人の声
//   「Kindle は 1 冊ずつしか書き出せない・何十冊のハイライトを移すのが大変」）。
//   読書メーターのブックマークレット（lib/bookmeterBookmarklet.js）と同じ作り: 本人のブラウザで、本人がログインしている
//   ノートブックのページから、左の本の一覧を読み、1 冊ずつハイライトとメモを読む（0.8 秒あけて・Amazon に負担をかけない）。
//   保存するのは Kindle アプリの「エクスポート」と同じ形の HTML（.bookTitle・.authors・.noteHeading・.noteText）を
//   本の数だけ並べたもの＝orime は今の読み取り（parseKindleNotebookHtml・何冊でも読める）で読む。外には何も送らない。
//   ⚠️ Amazon のページの作りが変わると読めなくなる。読めなかった本は数えて知らせる（黙って欠けさせない）。

const CODE = `(async()=>{
if(!/(^|\\.)read\\.amazon\\./.test(location.hostname)||location.pathname.indexOf('/notebook')<0){alert('read.amazon.co.jp/notebook（Kindle のノートブック）を開いてから押してください。');return;}
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const txt=el=>el?el.textContent.replace(/\\s+/g,' ').trim():'';
const lib=[...document.querySelectorAll('.kp-notebook-library-each-book')];
if(!lib.length){alert('本の一覧が見つかりませんでした。ログインして、左に本が並んだ状態で押してください。');return;}
let out='';let books=0;let notes=0;let failed=0;
for(const el of lib){
const asin=el.id;const title=txt(el.querySelector('h2'));const author=txt(el.querySelector('p')).replace(/^(著者|By)\\s*[:：]\\s*/i,'');
if(!asin||!title)continue;
let token='';let state='';let part='';let ok=true;
for(let p=0;p<40;p++){
let r;try{r=await fetch(location.origin+'/notebook?asin='+encodeURIComponent(asin)+'&contentLimitState='+encodeURIComponent(state)+(token?'&token='+encodeURIComponent(token):''),{credentials:'include'});}catch(e){ok=false;break;}
if(!r.ok){ok=false;break;}
const d=new DOMParser().parseFromString(await r.text(),'text/html');
d.querySelectorAll('[id="highlight"],.kp-notebook-highlight').forEach(h=>{
const row=h.closest('.a-row.a-spacing-base')||h.parentElement;const t=txt(h);if(!t)return;
const head=txt(row&&row.querySelector('[id="annotationHighlightHeader"]'));
const pg=(head.match(/(?:ページ|Page)\\s*[:：]?\\s*(\\d+)/i)||[])[1];const loc=(head.match(/(?:位置|Location)\\s*[:：]?\\s*(\\d+)/i)||[])[1];
const nt=txt(row&&row.querySelector('[id="note"]'));
part+='<div class="noteHeading">ハイライト - '+(pg?'ページ '+pg:(loc?'位置 '+loc:''))+'</div><div class="noteText">'+esc(t)+(nt?'<br><br>メモ：'+esc(nt):'')+'</div>';notes++;
});
const nx=d.querySelector('.kp-notebook-annotations-next-page-start');const st=d.querySelector('.kp-notebook-content-limit-state');
token=nx?nx.value:'';state=st?st.value:'';
if(!token)break;
await new Promise(s=>setTimeout(s,800));
}
if(!ok)failed++;
if(part){out+='<div class="bookTitle">'+esc(title)+'</div><div class="authors">'+esc(author)+'</div>'+part;books++;}
document.title='orime に保存中… '+books+' 冊';
await new Promise(s=>setTimeout(s,800));
}
if(!books){alert(failed?'Amazon につながりませんでした。少し待って、もう一度押してください。':'ハイライトのある本が見つかりませんでした。');return;}
const html='<!doctype html><html><head><meta charset="utf-8"><title>Kindle のハイライト</title></head><body>'+out+'</body></html>';
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));
a.download='kindle-notebook.html';document.body.appendChild(a);a.click();
alert(books+' 冊・ハイライト '+notes+' 件を保存しました。'+(failed?failed+' 冊は読めませんでした。':'')+'orime の「ほかのアプリから取り込む」で、このファイルを選んでください。');
})();`;

/** ブックマークの URL 欄に貼る 1 行（javascript:…）。 */
export const KINDLE_BOOKMARKLET = `javascript:${encodeURIComponent(CODE.replace(/\n/g, ''))}`;
/** テストで中身を確かめるための元のコード。 */
export const KINDLE_BOOKMARKLET_SOURCE = CODE;
