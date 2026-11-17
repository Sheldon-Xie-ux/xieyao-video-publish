#!/usr/bin/env node
/**
 * 小红书已发布视频换封面（2026-11-09 实测）
 * 用法: node xhs-cover-replace.js --id <noteId> --image <jpg>
 */
const { connect } = require('./lib.js');
const { need } = require('./publish-guard.js');
let args=process.argv.slice(2), opt={};
for(let i=0;i<args.length;i++) if(args[i].startsWith('--')){const k=args[i].slice(2);opt[k]=args[i+1]&&!args[i+1].startsWith('--')?args[++i]:true;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  need(opt.id,'缺少 --id'); need(opt.image,'缺少 --image');
  const {ws,send,ev}=await connect();
  // 视口高度必须够高，否则底部发布按钮被裁在视口外，点击落空（2026-11-09 实测）
  await send('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`https://creator.xiaohongshu.com/publish/update?id=${opt.id}&noteType=video`});
  await sleep(8000);
  // 关闭平台引导弹窗（“视频可以PK封面啦”等），否则遮罩挡住封面区
  for(let k=0;k<3;k++){
    const closed=await ev(`(function(){var b=[...document.querySelectorAll('button,div,span')].find(x=>['我知道了','知道了','知道了！'].includes((x.textContent||'').trim())&&x.getBoundingClientRect().width>0&&x.getBoundingClientRect().width<200);if(b){b.click();return true;}return false;})()`);
    if(!closed) break;
    await sleep(800);
  }
  const pos=await ev(`(function(){var s=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()==='设置封面');if(!s)return '无';var p=s.parentElement;for(var i=0;i<5&&p.parentElement;i++){p=p.parentElement;if(p.querySelector('img,[style*=background-image]'))break;}var m=p.querySelector('img,[style*=background-image]');if(!m)return '无';var b=m.getBoundingClientRect();return Math.round(b.x+b.width/2)+','+Math.round(b.y+b.height/2);})()`);
  need(pos!=='无','找不到封面缩略图');
  let [x,y]=pos.split(',').map(Number); await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y}); await sleep(800);
  need(await ev(`(function(){var e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()==='编辑封面'&&x.getBoundingClientRect().width>0);if(!e)return false;e.click();return true;})()`),'找不到编辑封面');
  await sleep(1500);
  need(await ev(`(function(){var e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()==='上传'&&x.getBoundingClientRect().width>0);if(!e)return false;e.click();return true;})()`),'找不到上传');
  await sleep(1000);
  const d=await send('DOM.getDocument',{depth:-1,pierce:true}); const q=await send('DOM.querySelectorAll',{nodeId:d.result.root.nodeId,selector:'input[type=file]'});
  const ii=await ev(`[...document.querySelectorAll('input[type=file]')].findIndex(e=>/image/.test(e.accept||''))`);
  need(ii>=0,'找不到图片输入框');
  await send('DOM.setFileInputFiles',{files:[opt.image],nodeId:q.result.nodeIds[ii]});
  await sleep(3200);
  need(await ev(`(function(){var e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()==='完成'&&x.getBoundingClientRect().width>0);if(!e)return false;e.click();return true;})()`),'找不到完成');
  await sleep(2200);
  await send('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(2000);
  const pub=await ev(`(function(){var el=document.querySelector('xhs-publish-btn');if(!el)return null;var r=el.getBoundingClientRect();if(r.width<=0)return null;return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);})()`);
  need(pub,'找不到发布按钮');
  const [bx,by]=pub.split(',').map(Number);
  for(const t of ['mouseMoved','mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type:t,x:bx,y:by,button:'left',clickCount:1});
  let ok=false;
  for(let i=0;i<20;i++){ await sleep(1000); if(/note-manager|editSuccess/.test(await ev('location.href'))){ok=true;break;} }
  need(ok,'点击发布后未返回列表');
  await send('Emulation.clearDeviceMetricsOverride');
  console.log(`OK ${opt.id}`);
  ws.close(); process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
