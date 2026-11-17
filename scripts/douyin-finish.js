const LIB=process.env.PUB_LIB||require('path').join(__dirname,'lib.js');
const {connect}=require(LIB);
const fs=require('fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const TITLE=process.argv[2], DESC=process.argv[3], COVER=process.argv[4];
(async()=>{
  const {ws,send,ev}=await connect();
  await send('Emulation.setDeviceMetricsOverride',{width:1400,height:1700,deviceScaleFactor:1,mobile:false});
  await sleep(1200);
  const r1=await ev(`(function(){
    var t=[...document.querySelectorAll('input,textarea')].find(e=>/填写作品标题/.test(e.placeholder||''));
    if(!t) return 'no-title';
    var p=t.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(p,'value').set.call(t, ${JSON.stringify(TITLE)});
    t.dispatchEvent(new Event('input',{bubbles:true}));
    t.dispatchEvent(new Event('change',{bubbles:true}));
    return t.value;
  })()`);
  console.log('标题:',r1);
  const r2=await ev(`(function(){
    var d=[...document.querySelectorAll('div[contenteditable="true"],textarea')].find(e=>/添加作品简介|简介/.test(e.getAttribute('placeholder')||e.getAttribute('data-placeholder')||''));
    if(!d) return 'no-desc';
    d.focus();
    var s=getSelection(), rr=document.createRange(); rr.selectNodeContents(d); s.removeAllRanges(); s.addRange(rr);
    document.execCommand('insertText', false, ${JSON.stringify(DESC)});
    return (d.innerText||d.value||'').length;
  })()`);
  console.log('简介:',r2);
  await sleep(600);
  // 关话题联想层（真实类名）
  await ev(`document.querySelectorAll('[class*=mention-suggest]').forEach(function(e){e.style.display='none';return 1})()`);
  await sleep(400);
  // 封面
  const r3=await ev(`(function(){var e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim()==='选择封面'&&x.getBoundingClientRect().width>0);if(!e)return 'no-btn';e.click();return 'clicked'})()`);
  console.log('封面按钮:',r3);
  await sleep(2500);
  const d=await send('DOM.getDocument',{depth:-1,pierce:true});
  const q=await send('DOM.querySelectorAll',{nodeId:d.result.root.nodeId,selector:'input[type=file][accept*="image"]'});
  const ids=q.result.nodeIds||[];
  console.log('图片框:',ids.length);
  if(ids.length){ await send('DOM.setFileInputFiles',{files:[COVER],nodeId:ids[ids.length-1]}); console.log('封面已注入'); }
  await sleep(5000);
  // 完成按钮 DOM 点击（上次验证过坐标会被吃掉）
  const r4=await ev(`(function(){var b=[...document.querySelectorAll('button')].find(function(e){return e.textContent.trim()==='完成'&&e.getBoundingClientRect().width>0;});if(!b)return 'no';b.click();return 'ok'})()`);
  console.log('封面完成:',r4);
  await sleep(2500);
  // 发布
  const r5=await ev(`(function(){var b=[...document.querySelectorAll('button')].find(function(e){return e.textContent.trim()==='发布'&&e.getBoundingClientRect().width>0;});if(!b)return 'no';b.click();return 'ok'})()`);
  console.log('发布:',r5);
  for(let i=0;i<20;i++){
    await sleep(3000);
    const u=await ev('location.href');
    if(/content\/manage/.test(u)){ console.log('成功:',u); break; }
    if(i%4===3){ console.log('等待…',u.slice(0,60)); await ev(`(function(){var m=[...document.querySelectorAll('button')].find(e=>/仍要发布|确认发布|确定/.test(e.textContent.trim())&&e.getBoundingClientRect().width>0);if(m)m.click();return 1})()`); }
  }
  ws.close(); process.exit(0);
})();
