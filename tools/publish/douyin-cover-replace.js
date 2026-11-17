#!/usr/bin/env node
/** 抖音已发布视频换封面：node douyin-cover-replace.js --title "..." --image x.jpg */
const { connect } = require('./lib.js');
const { need } = require('./publish-guard.js');
const fs = require('fs');
const path = require('path');
let a=process.argv.slice(2),o={};for(let i=0;i<a.length;i++)if(a[i].startsWith('--')){const k=a[i].slice(2);o[k]=a[i+1]&&!a[i+1].startsWith('--')?a[++i]:true;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function clickText(send, ev, text) {
  const geo=await ev(`(function(){
    var els=[...document.querySelectorAll('button,div,span,a')].filter(function(e){
      return (e.textContent||'').trim()===${JSON.stringify(text)} && e.getBoundingClientRect().width>0;
    });
    if(!els.length)return 'none';
    var e=els[els.length-1];e.scrollIntoView({block:'center'});
    var r=e.getBoundingClientRect();return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);
  })()`);
  if(geo==='none')return geo;
  const [x,y]=geo.split(',').map(Number);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  await sleep(250);
  for(const t of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type:t,x,y,button:'left',clickCount:1});
  return 'ok';
}

(async()=>{
  need(o.title,'缺少 --title'); need(o.image,'缺少 --image');
  const {ws,send,ev}=await connect();
  await send('Page.navigate',{url:'https://creator.douyin.com/creator-micro/content/manage'}); await sleep(7000);
  const opened=await ev(`(function(){var e=[...document.querySelectorAll('[class*=info-title-text]')].find(x=>(x.textContent||'').trim().startsWith(${JSON.stringify(o.title)}));if(!e)return 'no';var p=e;for(var i=0;i<9&&p.parentElement;i++){p=p.parentElement;var b=[...p.querySelectorAll('*')].filter(x=>x.children.length===0&&(x.textContent||'').trim()==='编辑作品');if(b.length){b[0].click();return 'ok'}}return 'none'})()`);
  need(opened==='ok','作品管理找不到：'+o.title);
  await sleep(6500);
  need(/post\/video/.test(await ev('location.href')),'未进入编辑页');

  // 关闭 hashtag 联想层。旧版按“亿浏览”找父容器，会误伤整个表单，导致封面操作不稳定。
  await ev(`document.querySelectorAll('[class*=mention-suggest]').forEach(function(e){e.style.display='none';return 1})()`);
  await sleep(500);

  const thumb=await ev(`(function(){var a=[...document.querySelectorAll('[class*="background-i_"]')];if(!a.length)return '无';var e=a.find(x=>{var b=x.getBoundingClientRect();return b.height>80&&b.width/b.height<0.9})||a[0];var b=e.getBoundingClientRect();return Math.round(b.x+b.width/2)+','+Math.round(b.y+b.height/2)})()`);
  need(thumb!=='无','找不到封面缩略图');
  let [x,y]=thumb.split(',').map(Number);
  for(const t of ['mouseMoved','mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type:t,x,y,button:'left',clickCount:1});
  await sleep(2500);
  if(!await ev(`/设置竖封面/.test(document.body.innerText)`)){
    await ev(`(function(){var e=document.querySelector('[class*=background-i_]');if(e)e.click();return 1})()`);
    await sleep(1800);
  }
  need(await ev(`/设置竖封面|设置横封面/.test(document.body.innerText)`),'封面对话框未打开');
  need(await clickText(send,ev,'设置竖封面')==='ok','点不到设置竖封面');
  await sleep(1000);

  // 只选择“上传封面”区域的图片框，不能向视频框或 AI 参考图框写文件。
  const idx=await ev(`(function(){
    var ins=[...document.querySelectorAll('input[type=file]')];
    return ins.findIndex(function(e){
      return /image/.test(e.accept||'') && (e.parentElement&&e.parentElement.parentElement&&(e.parentElement.parentElement.innerText||'').includes('点击上传文件或拖拽文件到这里'));
    });
  })()`);
  need(idx>=0,'找不到封面上传框');
  const d=await send('DOM.getDocument',{depth:-1,pierce:true});
  const q=await send('DOM.querySelectorAll',{nodeId:d.result.root.nodeId,selector:'input[type=file]'});
  const ids=q.result.nodeIds||[];
  need(ids[idx],'封面上传框节点不存在');
  await send('DOM.setFileInputFiles',{files:[o.image],nodeId:ids[idx]});
  await sleep(4500);

  const evidence=path.join(__dirname,'evidence');fs.mkdirSync(evidence,{recursive:true});
  const preview=path.join(evidence,`${new Date().toISOString().replace(/[:.]/g,'-')}-douyin-cover-preview.png`);
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(preview,Buffer.from(shot.result.data,'base64'));
  console.log('封面预览截图:',preview);

  need(await ev(`(function(){var b=[...document.querySelectorAll('button')].find(function(e){return e.textContent.trim()==='完成'&&e.getBoundingClientRect().width>0;});if(!b)return false;b.click();return true;})()`),'点不到完成');
  await sleep(2500);
  if(o.probe){
    const after=path.join(evidence,`${new Date().toISOString().replace(/[:.]/g,'-')}-douyin-cover-after-complete.png`);
    const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(after,Buffer.from(s.result.data,'base64'));
    console.log('完成后截图:',after);ws.close();process.exit(0);
  }
  need(await ev(`(function(){var b=[...document.querySelectorAll('button')].find(function(e){return e.textContent.trim()==='提交修改'&&e.getBoundingClientRect().width>0;});if(!b)return false;b.click();return true;})()`),'点不到提交修改');
  await sleep(8000);

  // 提交后统一回列表，以列表标题和后续 cover-check 的真实缩略图为准。
  await send('Page.navigate',{url:'https://creator.douyin.com/creator-micro/content/manage'});
  await sleep(6000);
  const listed=await ev(`document.body.innerText.includes(${JSON.stringify(o.title)})`);
  need(listed,'提交后回列表找不到目标作品');
  console.log('OK '+o.title); ws.close(); process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
