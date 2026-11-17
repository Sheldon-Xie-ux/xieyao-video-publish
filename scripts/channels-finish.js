#!/usr/bin/env node
/** 视频号兜底：封面弹窗注入 + 确认 + 发表（publish-channels.js 封面步骤失败时接管）。
 * 前置：视频已注入、描述/短标题已填、封面弹窗未开。
 * 用法: CDP_PORT=9222 CDP_TARGET=channels.weixin node channels-finish.js <封面.jpg>
 */
const LIB=process.env.PUB_LIB||require('path').join(__dirname,'lib.js');
const {connect}=require(LIB);
const fs=require('fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const COVER=process.argv[2];
const WALK=`function w(r,f){r.querySelectorAll('*').forEach(function(e){f(e);if(e.shadowRoot)w(e.shadowRoot,f);});}`;
function walk(n,out){if(!n)return;const a={};(n.attributes||[]).forEach((v,i,arr)=>{if(i%2===0)a[v]=arr[i+1]});if(n.nodeName==='INPUT'&&(a.type||'')==='file'&&/image/.test(a.accept||''))out.push(n.nodeId);(n.children||[]).forEach(c=>walk(c,out));(n.shadowRoots||[]).forEach(c=>walk(c,out));if(n.contentDocument)walk(n.contentDocument,out)}
(async()=>{const {ws,send,ev}=await connect();
// 1 点"编辑"开弹窗
const edit=await ev(`(function(){var o='';${WALK}w(document,function(e){var t=(e.innerText||'').trim();var b=e.getBoundingClientRect();if(t==='编辑'&&b.width>0)o=Math.round(b.x+b.width/2)+','+Math.round(b.y+b.height/2);});return o||'无';})()`);
if(edit==='无'){console.log('ERR 找不到编辑按钮');ws.close();process.exit(1);}
{const [x,y]=edit.split(',').map(Number);for(const t of ['mouseMoved','mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type:t,x,y,button:'left',clickCount:1});}
await sleep(5000);
// 2 注封面
const d=await send('DOM.getDocument',{depth:-1,pierce:true});let ids=[];walk(d.result.root,ids);
if(!ids.length){console.log('ERR 弹窗内无图片输入框');ws.close();process.exit(1);}
await send('DOM.setFileInputFiles',{files:[COVER],nodeId:ids[ids.length-1]});
await sleep(6000);
// 3 确认
const cfm=await ev(`(function(){var o='';${WALK}w(document,function(e){var t=(e.innerText||'').trim();var b=e.getBoundingClientRect();if(t==='确认'&&b.width>0)o=Math.round(b.x+b.width/2)+','+Math.round(b.y+b.height/2);});return o||'无';})()`);
if(cfm!=='无'){const [x,y]=cfm.split(',').map(Number);for(const t of ['mouseMoved','mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type:t,x,y,button:'left',clickCount:1});}
await sleep(3500);
// 4 发表（scrollIntoView 后取坐标，y 可能超视口）
const geo=await ev(`(function(){var el=null;${WALK}w(document,function(e){var t=(e.innerText||'').trim();if(t==='发表'&&e.getBoundingClientRect().width>0&&/BUTTON|DIV|SPAN/.test(e.tagName))el=e;});if(!el)return '无';el.scrollIntoView({block:'center'});var b=el.getBoundingClientRect();return Math.round(b.x+b.width/2)+','+Math.round(b.y+b.height/2);})()`);
if(geo==='无'){console.log('ERR 找不到发表');ws.close();process.exit(1);}
{const [x,y]=geo.split(',').map(Number);for(const t of ['mouseMoved','mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type:t,x,y,button:'left',clickCount:1});}
for(let i=0;i<20;i++){await sleep(3000);const u=await ev('location.href');if(/post\/list/.test(u)){console.log('OK',u);ws.close();process.exit(0);}}
console.log('ERR 60s未跳转');ws.close();process.exit(1);
})();
