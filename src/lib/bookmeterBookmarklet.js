// 📚 読書メーターの本棚を全ページまとめて 1 つのファイルに（2026-11-25 オーナー「引越し機能をどのアプリよりもレベル高く」・
//   調査 company/research/tsundokuka-and-migration-2026-11.md の B-9）。
//   読書メーターには公式の書き出しが無く、いまは「リスト表示のページを 1 つずつ保存」（1,000 冊で 25〜50 回）。
//   このブックマークレットは、本人のブラウザで、本人がログインしている読書メーターの一覧のページを 1 ページずつ読み
//   （0.8 秒あけて・読書メーターに負担をかけない）、本の行（li.group__book＝感想つき）だけを 1 つの HTML にまとめて保存する。
//   orime はその HTML を今の読み取り（parseBookmeterHtml）で読む＝新しい読み取りは足さない。外には何も送らない。
//   棚（読んだ本・読んでる本・積読本・読みたい本）は、保存元の URL（canonical）とページの題で決まる。

const CODE = `(async()=>{
const m=location.pathname.match(/\\/users\\/(\\d+)\\/books\\/(read|reading|stacked|wish)/);
if(location.hostname.indexOf('bookmeter.com')<0||!m){alert('読書メーターで「読んだ本」などの一覧のページを開いてから押してください。');return;}
const shelf={read:'読んだ本',reading:'読んでる本',stacked:'積読本',wish:'読みたい本'}[m[2]];
const base=location.origin+location.pathname;let body='';let got=0;
for(let p=1;p<=300;p++){
const r=await fetch(base+'?display_type=list&page='+p,{credentials:'include'});
if(!r.ok)break;
const d=new DOMParser().parseFromString(await r.text(),'text/html');
const items=d.querySelectorAll('li.group__book');
if(!items.length)break;
items.forEach(li=>{body+=li.outerHTML;});
got+=items.length;document.title='orime に保存中… '+got+' 冊';
await new Promise(s=>setTimeout(s,800));
}
if(!got){alert('本が見つかりませんでした。ログインしてから、一覧のページで押してください。');return;}
const html='<!doctype html><html><head><meta charset="utf-8"><title>'+shelf+' - 読書メーター</title><link rel="canonical" href="'+base+'"></head><body><ul class="book-list__group">'+body+'</ul></body></html>';
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));
a.download='bookmeter-'+m[2]+'.html';document.body.appendChild(a);a.click();
alert(shelf+' '+got+' 冊を保存しました。orime の「ほかのアプリから取り込む」で、このファイルを選んでください。');
})();`;

/** ブックマークの URL 欄に貼る 1 行（javascript:…）。 */
export const BOOKMETER_BOOKMARKLET = `javascript:${encodeURIComponent(CODE.replace(/\n/g, ''))}`;
/** テストで中身を確かめるための元のコード。 */
export const BOOKMETER_BOOKMARKLET_SOURCE = CODE;
