#!/usr/bin/env node
// 发布后封面验收：抓平台列表页真实缩略图，保存证据供人工检查。
// 用法: node cover-check.js --platform douyin|xhs|channels|bili [--out 路径]
const fs = require('fs');
const path = require('path');
const { connect } = require('./lib.js');

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const platform = getArg('--platform');
const URLS = {
  douyin: 'https://creator.douyin.com/creator-micro/content/manage',
  xhs: 'https://creator.xiaohongshu.com/new/note-manager',
  channels: 'https://channels.weixin.qq.com/platform/post/list',
  bili: 'https://member.bilibili.com/platform/upload-manager/article',
};
if (!URLS[platform]) {
  console.error('用法: node cover-check.js --platform douyin|xhs|channels|bili [--out 路径]');
  process.exit(2);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const { ws, send, ev } = await connect();
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URLS[platform] });
  await sleep(9000);
  // 回到列表顶部，确保最新作品缩略图在截图里
  await ev('window.scrollTo(0,0)');
  await sleep(800);
  const out = getArg('--out') || path.join(__dirname, 'evidence',
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${platform}-cover.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(out);
  ws.close();
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
