#!/usr/bin/env node
/**
 * B站投稿自动化（2026-10-30 实测跑通）
 * 特点：封面要 4:3 + 16:9 两张；创作声明必填；投稿按钮在首屏之外
 * 用法: node publish-bili.js --video a.mp4 --cover43 b.jpg --cover169 c.jpg --title ".." --desc ".." [--publish]
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
const TAGS = (opt.tags || 'OPC,企业AI,FDE,创业,人工智能,AI落地').split(',');

async function click(send, x, y) {
  for (const t of ['mouseMoved','mousePressed','mouseReleased'])
    await send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', clickCount: 1 });
}
async function findPos(ev, re, exact) {
  return ev(`(function(){
    var o='';
    document.querySelectorAll('div,span,button,a,input').forEach(function(e){
      var t=(e.textContent||'').trim(); var b=e.getBoundingClientRect();
      if(b.width>0 && b.height>0 && ${exact?`t===${JSON.stringify(re)}`:`${re}.test(t)`}) o=Math.round(b.x+b.width/2)+','+Math.round(b.y+b.height/2);
    });
    return o||'无';
  })()`);
}

(async () => {
  execFileSync(process.execPath,[require('path').join(__dirname,'preflight.js'),
    '--platform','bili','--video',opt.video,'--title',opt.title],{stdio:'inherit'});
  const { ws, send, ev } = await connect();
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1700, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'https://member.bilibili.com/platform/upload/video/frame' });
  await sleep(9000);

  console.log('① 上传视频');
  let doc = await send('DOM.getDocument', { depth: -1, pierce: true });
  let q = await send('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
  await send('DOM.setFileInputFiles', { files: [opt.video], nodeId: q.result.nodeIds[0] });
  // 真实上传完成判定：进度 100% 且「立即投稿」可点（文字 stepper 里有「上传完成」，不能当信号）
  let upOk = false;
  for (let i = 0; i < 90; i++) {
    await sleep(5000);
    const st = await ev(`(function(){
      var t=document.body.innerText||'';
      var pct=(t.match(/(\\d{1,3})\\s*%/)||[])[1]||'';
      var dur=/\\b\\d{2}:\\d{2}\\b/.test(t);
      var b=[...document.querySelectorAll('button,div,span')].filter(e=>e.innerText&&e.innerText.trim()==='立即投稿');
      var e=b[b.length-1];
      var dis=e?(e.disabled===true||e.getAttribute('aria-disabled')==='true'||/disabled/i.test((e.className||'').toString())):true;
      return JSON.stringify({pct:pct,dur:dur,btn:!!e,dis:dis,len:t.length});
    })()`);
    const o = JSON.parse(st || '{}');
    if (i % 4 === 0) console.log('  上传状态:', st);
    if (o.btn && !o.dis && (o.pct === '' || Number(o.pct) >= 100)) { upOk = true; console.log('  上传完成（按钮可点）:', st); break; }
  }
  need(upOk, 'B站 7.5 分钟内未完成上传（按钮仍不可点）');

  console.log('② 标题 + 简介');
  await ev(`(function(){var ti=[...document.querySelectorAll('input')].filter(e=>e.offsetParent).find(e=>/稿件标题/.test(e.placeholder||''));if(ti){ti.focus();ti.select()}return 1})()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4});
  await send('Input.insertText',{text:opt.title});
  await sleep(500);
  console.log('  ', await ev(`(function(){
    var ti=[...document.querySelectorAll('input')].filter(e=>e.offsetParent).find(e=>/稿件标题/.test(e.placeholder||''));
    var de=[...document.querySelectorAll('[contenteditable=true]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>80)[0];
    if(de){ de.focus(); var s=getSelection(),rr=document.createRange(); rr.selectNodeContents(de); s.removeAllRanges(); s.addRange(rr);
      document.execCommand('insertText', false, ${JSON.stringify(opt.desc||'')}); }
    return JSON.stringify({title:ti?ti.value:null, desc:de?(de.innerText||'').length:0});
  })()`));
  need(await ev(`(function(){var ti=[...document.querySelectorAll('input')].filter(e=>e.offsetParent).find(e=>/稿件标题/.test(e.placeholder||''));return ti&&ti.value===${JSON.stringify(opt.title)};})()`),'B站标题写入不一致');

  console.log('③ 标签');
  for (const t of TAGS) {
    await ev(`(function(){
      var el=[...document.querySelectorAll('input')].filter(e=>e.offsetParent).find(e=>/标签/.test(e.placeholder||''));
      if(!el) return 'no';
      el.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(t)});
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));
      el.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',keyCode:13,bubbles:true}));
      return 'ok';
    })()`);
    await sleep(600);
  }
  console.log('   标签数:', await ev(`document.querySelectorAll('[class*=tag] [class*=close], .tag-item').length`));

  console.log('④ 封面（4:3 + 16:9）');
  await ev(`(function(){var e=[...document.querySelectorAll('div,span,button')].filter(x=>x.offsetParent&&x.textContent.trim()==='添加封面');if(e.length)e[e.length-1].click();return 1;})()`);
  await sleep(3000);
  doc = await send('DOM.getDocument', { depth: -1, pierce: true });
  q = await send('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
  await send('DOM.setFileInputFiles', { files: [opt.cover43], nodeId: q.result.nodeIds[1] });
  await sleep(5000);
  doc = await send('DOM.getDocument', { depth: -1, pierce: true });
  q = await send('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
  if ((q.result.nodeIds||[]).length >= 2) { await send('DOM.setFileInputFiles', { files: [opt.cover169], nodeId: q.result.nodeIds[1] }); await sleep(4000); }
  let done = await findPos(ev, '完成', true);
  if (done !== '无') { const [x,y] = done.split(',').map(Number); await click(send, x, y); await sleep(2500); }
  console.log('   封面已设');

  console.log('⑤ 创作声明');
  await ev(`(function(){var el=[...document.querySelectorAll('input')].filter(e=>/创作声明/.test(e.placeholder||''))[0];if(el)el.scrollIntoView({block:'center'});return 1;})()`);
  await sleep(1200);
  const declPos = await ev(`(function(){var el=[...document.querySelectorAll('input')].filter(e=>/创作声明/.test(e.placeholder||''))[0];if(!el)return '无';var b=el.getBoundingClientRect();return Math.round(b.x+b.width/2)+','+Math.round(b.y+b.height/2);})()`);
  if (declPos !== '无') {
    const [x,y] = declPos.split(',').map(Number); await click(send, x, y); await sleep(1800);
    const want = opt.declare||'个人观点，仅供参考';
    const clicked = await ev(`(function(){var want=${JSON.stringify(want)};var e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()===want&&x.getBoundingClientRect().width>0);if(!e)return false;e.click();return true;})()`);
    need(clicked, 'B站创作声明选项不可点');
    await sleep(1200);
  }
  const declVal = await ev(`(function(){var el=[...document.querySelectorAll('input')].filter(e=>/创作声明/.test(e.placeholder||''))[0];return el?el.value:'无';})()`);
  console.log('   已选:', declVal);
  need(declVal && declVal!=='无', 'B站创作声明为空，禁止投稿');

  if (opt.publish) {
    console.log('⑥ 立即投稿');
    const p = await ev(`(function(){var e=document.querySelector('.submit-button-anchor');if(!e)return '无';e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return Math.round(b.x+b.width/2)+','+Math.round(b.y+b.height/2);})()`);
    need(p !== '无', '找不到B站立即投稿按钮');
    const [x,y] = p.split(',').map(Number);
    await click(send, x, y);
    let pubOk = false;
    // 长视频“提交中”可能持续数分钟；不能离开页面，离开会中断投稿
    for (let k = 0; k < 120; k++) {
      await sleep(5000);
      const st = await ev(`(function(){var t=document.body.innerText||'';
        return JSON.stringify({succ:/再投一个|稿件投递成功|投递成功/.test(t), submitting:/提交中/.test(t), list:/upload-manager/.test(location.href)});})()`);
      const o = JSON.parse(st || '{}');
      if (k % 6 === 0) console.log('   投稿状态:', st);
      if (o.succ || o.list) { pubOk = true; break; }
    }
    need(pubOk, 'B站投稿 10 分钟内未出现成功信号（页面可能仍在提交，别重复上传）');
    // 投稿成功信号出现后，稿件进列表有延迟（审核中/转码中）。verify 加 retries，误判失败会让 publish-all 重发造成重复投稿。
    let verified = false;
    for (let v = 0; v < 4; v++) {
      try { await verifyPublished(send, ev, 'bili', opt.title); verified = true; break; }
      catch (e) { if (v < 3) { console.log('   列表暂未收录，8s 后重查…'); await sleep(8000); } }
    }
    need(verified, 'B站发布后列表多次重查仍未找到作品');
  }
  ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
