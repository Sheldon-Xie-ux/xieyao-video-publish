#!/usr/bin/env node
/**
 * 小红书自动发布
 * 特点：标题≤20字；发布按钮在闭合 shadow DOM 中，须用 CDP 直接点击真实 button。
 * 封面：传入 --cover 后，发布成功自动提取 noteId，调用 xhs-cover-replace.js 并验收。
 * 用法: node publish-xhs.js --video <mp4> --title "≤20字" --desc "..." [--publish]
 */
const { connect } = require('./lib.js');
const { need, waitUpload, verifyPublished } = require('./publish-guard.js');
const { execFileSync } = require('child_process');
const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = args[i+1] && !args[i+1].startsWith('--') ? args[++i] : true; opt[k] = v; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  execFileSync(process.execPath,[require('path').join(__dirname,'preflight.js'),
    '--platform','xhs','--video',opt.video,'--title',opt.title],{stdio:'inherit'});
  const { ws, send, ev } = await connect();
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride',{width:1400,height:1700,deviceScaleFactor:1,mobile:false});
  // 页面已渲染就直接用（小红书重复 navigate 会白屏），否则导航 + 兜底重载
  const curUrl = await ev('location.href');
  const alreadyOk = curUrl.includes('/publish/publish') && await ev(`/拖拽视频到此或点击上传|上传视频/.test(document.body.innerText)`);
  if (!alreadyOk) {
    await send('Page.navigate', { url: 'https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=video' });
    await sleep(9000);
  }
  // 页面是否就绪看上传区文本，不看 body 长度/高度；正常上传页 body 可能只有 241 字且高度等于视口。
  for (let k=0;k<5;k++){
    const ok = await ev(`/拖拽视频到此或点击上传|视频大小/.test(document.body.innerText)`);
    if (ok) break;
    console.log('  上传区未就绪，重载第 '+(k+1)+' 次');
    await send('Page.reload', { ignoreCache: true });
    await sleep(9000);
  }
  need(await ev(`/拖拽视频到此或点击上传|视频大小/.test(document.body.innerText)`), '小红书发布页未渲染出上传区');

  console.log('① 设置视频文件');
  const doc = await send('DOM.getDocument', { depth: -1, pierce: true });
  const q = await send('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
  const ids = q.result.nodeIds || [];
  if (!ids.length) { console.error('找不到文件框'); ws.close(); process.exit(3); }
  await send('DOM.setFileInputFiles', { files: [opt.video], nodeId: ids[0] });
  await waitUpload(ev, 'xhs');

  console.log('② 填标题 + 正文');
  const r = await ev(`(function(){
    var t=[...document.querySelectorAll('input,textarea')].filter(e=>e.offsetParent).find(e=>/标题/.test(e.placeholder||'')) ||
          [...document.querySelectorAll('input')].filter(e=>e.offsetParent)[0];
    var res={};
    if(t){ var p=t.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p,'value').set.call(t, ${JSON.stringify(opt.title||'')});
      t.dispatchEvent(new Event('input',{bubbles:true}));
      t.dispatchEvent(new Event('change',{bubbles:true})); res.title=t.value; }
    var d=document.querySelector('div[contenteditable="true"]');
    if(d){ d.focus(); var s=getSelection(), rr=document.createRange();
      rr.selectNodeContents(d); s.removeAllRanges(); s.addRange(rr);
      document.execCommand('insertText', false, ${JSON.stringify(opt.desc||'')});
      res.desc=(d.innerText||'').length; }
    return JSON.stringify(res);
  })()`);
  console.log('  ', r);
  const filled=JSON.parse(r);
  need(filled.title===opt.title,'标题写入不一致');
  need(filled.desc>0,'正文写入失败');
  await sleep(1500);

  const check = await ev(`(document.body.innerText.match(/(\\d+)\\s*\\/\\s*20/g)||['']).slice(0,2).join(',')`);
  console.log('③ 标题字数:', check || '(无限制提示)');

  if (opt.publish) {
    // 话题联想层会盖住发布按钮：先点空白，再隐藏残留面板
    await ev(`(function(){var e=document.elementFromPoint(200,300);if(e)e.click();
      var p=[...document.querySelectorAll('*')].find(x=>/亿浏览|万浏览/.test(x.textContent||'')&&x.getBoundingClientRect().width>300);
      if(p){var q=p;for(var i=0;i<6&&q.parentElement;i++)q=q.parentElement;q.style.display='none';}
      return 1;})()`);
    await sleep(800);
    // 发布按钮在闭合 shadow DOM 里，JS 递归进不去；用 CDP 完整 DOM 树穿透定位后直接 click（2026-11-12 实证）。
    function __walkText(n,out,parent){if(!n)return;const p=n.nodeId;if(n.nodeName==='#text'&&(n.nodeValue||'').trim()==='发布')out.push(parent||p);(n.children||[]).forEach(c=>__walkText(c,out,p));(n.shadowRoots||[]).forEach(c=>__walkText(c,out,p));if(n.contentDocument)__walkText(n.contentDocument,out,p);}
    const __d=await send('DOM.getDocument',{depth:-1,pierce:true});
    let __btn=[];__walkText(__d.result.root,__btn,null);
    console.log('④ 发布按钮节点:', __btn.length);
    need(__btn.length>0,'找不到小红书发布按钮');
    const __r=await send('DOM.resolveNode',{nodeId:__btn[__btn.length-1]});
    await send('Runtime.callFunctionOn',{objectId:__r.result.object.objectId,functionDeclaration:'function(){this.click();return true;}',returnByValue:true});
    // 点击后给页面 20s 跳转，然后以列表回查为准（URL 跳转不可靠，笔记可能直接进审核）
    for(let i=0;i<7;i++){ await sleep(3000); const u=await ev('location.href'); if(/published=true|editSuccess/.test(u))break; }
    await sleep(5000);
    let posted=false;
    for(let i=0;i<4;i++){
      try { await verifyPublished(send, ev, 'xhs', opt.title); posted=true; break; }
      catch(e){ if(i<3) await sleep(5000); }
    }
    need(posted,'小红书发布后列表未找到作品');
    if (opt.cover) {
      // 发布成功后必须补封面：从笔记卡片提取 noteId，再走正式换封面脚本。
      const noteId = await ev(`(function(){
        var t=[...document.querySelectorAll('span.note-card__title')].find(function(x){return (x.textContent||'').trim()===${JSON.stringify(opt.title)};});
        if(!t)return '';
        var c=t.closest('.note-card');if(!c)return '';
        try{return JSON.parse(c.getAttribute('data-impression')).noteTarget.value.noteId;}catch(e){return '';}
      })()`);
      need(noteId,'已发布但无法从笔记卡片提取 noteId，封面未处理');
      console.log('⑤ 上传封面:', noteId);
      execFileSync(process.execPath,[require('path').join(__dirname,'xhs-cover-replace.js'),
        '--id',noteId,'--image',opt.cover],{stdio:'inherit',env:process.env});
      const shot=require('path').join(__dirname,'evidence',`${new Date().toISOString().replace(/[:.]/g,'-')}-xhs-cover.png`);
      execFileSync(process.execPath,[require('path').join(__dirname,'cover-check.js'),
        '--platform','xhs','--out',shot],{stdio:'inherit',env:process.env});
    }
  } else {
    console.log('④ 未发布（加 --publish）');
  }
  ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
