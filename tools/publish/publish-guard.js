const fs = require('fs');
const path = require('path');

class GateError extends Error {}
function need(ok, msg) { if (!ok) throw new GateError(msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(ev, expression, opt = {}) {
  const label = opt.label || '条件';
  const timeoutMs = opt.timeoutMs || 25 * 60 * 1000;
  const intervalMs = opt.intervalMs || 5000;
  const start = Date.now();
  let last = false;
  while (Date.now() - start < timeoutMs) {
    last = await ev(expression);
    if (last) return last;
    if ((Date.now() - start) % 30000 < intervalMs)
      console.log(`  等待${label}… ${Math.round((Date.now()-start)/1000)}s`);
    await sleep(intervalMs);
  }
  throw new GateError(`等待超时：${label}（${Math.round(timeoutMs/60000)} 分钟）`);
}

async function waitUpload(ev, platform) {
  const map = {
    douyin: [/上传完成/, '抖音视频上传完成'],  // 兼容：进入编辑页(content/post/video)也算完成
    xhs: [/检测为高清/, '小红书视频上传完成'],
    bili: [/上传完成/, 'B站视频上传完成'],
  };
  if (platform === 'channels') {
    return waitFor(ev, `(function(){var ok=false;function w(r){r.querySelectorAll('*').forEach(function(e){if(!ok&&(e.innerText||'').trim()==='删除')ok=true;if(e.shadowRoot)w(e.shadowRoot);});}w(document);return ok;})()`,
      { label: '视频号视频进入编辑器', timeoutMs: 8 * 60 * 1000, intervalMs: 4000 });
  }
  const [re, label] = map[platform] || [];
  need(re, `未知平台上传信号：${platform}`);
  // 关键：编辑器会先用本地 blob 预览，只有上传到服务端后 currentSrc 才是 http(s) CDN 地址
  const expr = platform === 'douyin'
    ? `(function(){var v=document.querySelector('video');if(!v||!(v.duration>1))return false;
        var u=v.currentSrc||v.src||'';return u.indexOf('http')===0 && /content\/post\/video/.test(location.href);})()`
    : platform === 'xhs'
    ? `(function(){var v=document.querySelector('video');return !!(v&&v.duration>1)&&/检测为高清/.test(document.body.innerText);})()`
    : `${re}.test(document.body.innerText)`;
  return waitFor(ev, expr, { label, timeoutMs: 25 * 60 * 1000 });
}

function evidencePath(platform) {
  const dir = path.join(__dirname, 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${new Date().toISOString().replace(/[:.]/g,'-')}-${platform}.png`);
}

async function screenshot(send, file) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
  return file;
}

function normTitle(t){return String(t||'').replace(/[\s，。？！｜|：:、,._-]/g,'').slice(0,14);}

async function listText(send, ev, platform){
  const listUrls = {
    douyin: 'https://creator.douyin.com/creator-micro/content/manage',
    xhs: 'https://creator.xiaohongshu.com/new/note-manager',
    channels: 'https://channels.weixin.qq.com/platform/post/list',
    bili: 'https://member.bilibili.com/platform/upload-manager/article',
  };
  const url = listUrls[platform];
  need(url, `未知平台回查地址：${platform}`);
  await send('Page.navigate', { url });
  await sleep(11000);
  await send('Page.reload', {});
  await sleep(9000);
  if(platform==='channels') return await ev("(function(){var o='';function w(r){r.querySelectorAll('*').forEach(function(e){if(e.innerText)o+=e.innerText+'\\n';if(e.shadowRoot)w(e.shadowRoot);});}w(document);return o;})()");
  return await ev('document.body.innerText');
}

async function findPublished(send, ev, platform, title){
  const text = await listText(send, ev, platform);
  return typeof text === 'boolean' ? text : String(text).includes(normTitle(title).slice(0,8));
}

async function verifyPublished(send, ev, platform, title) {
  let found = false;
  for (let i=0;i<3;i++){
    const text = await listText(send, ev, platform);
    if (typeof text === 'boolean' ? text : String(text).includes(normTitle(title).slice(0,8))) { found = true; break; }
    await sleep(5000);
  }
  need(found, `发布后列表未找到作品：${normTitle(title).slice(0,8)}`);
  const file = await screenshot(send, evidencePath(platform));
  console.log(`  列表回查通过：${normTitle(title).slice(0,8)}`);
  console.log(`  证据截图：${file}`);
  return file;
}

module.exports = { GateError, need, sleep, waitFor, waitUpload, verifyPublished, findPublished, screenshot };
