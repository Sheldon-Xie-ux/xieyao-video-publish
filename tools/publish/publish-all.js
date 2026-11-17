#!/usr/bin/env node
/**
 * 单入口发布：一个 manifest 跑完多平台，带封面 lint、幂等、重试、回查、封面截图。
 * 用法: node publish-all.js --manifest task.json --publish [--retries 2]
 * 并行：manifest 可配 ports {"douyin":"9222","channels":"9222","xhs":"9334","bili":"9334"}，
 *       不同端口的平台并行发布，同端口串行（一个浏览器同时只能操作一个页面）。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { connect } = require('./lib.js');
const { findPublished } = require('./publish-guard.js');

const args = process.argv.slice(2), opt = {};
for (let i=0;i<args.length;i++) if(args[i].startsWith('--')) {
  const k=args[i].slice(2), v=args[i+1]&&!args[i+1].startsWith('--')?args[++i]:true; opt[k]=v;
}
const PUBLISH = !!opt.publish;
const RETRIES = Math.max(1, Math.min(3, Number(opt.retries||2)));
const M = JSON.parse(fs.readFileSync(opt.manifest,'utf8'));
const ALL_PLATFORMS = M.platforms || ['douyin','xhs','channels','bili'];
const PLATFORMS = opt.platform ? ALL_PLATFORMS.filter(p=>String(opt.platform).split(',').includes(p)) : ALL_PLATFORMS;
const TITLES = M.titles || {};
const COVERS = M.covers || {};
const labels = {douyin:'抖音',xhs:'小红书',channels:'视频号',bili:'B站'};
const evidence = path.join(__dirname,'evidence'); fs.mkdirSync(evidence,{recursive:true});
const stamp = new Date().toISOString().replace(/[:.]/g,'-');

function run(cmd, argv, env={}) {
  const r = spawnSync(cmd, argv, { encoding:'utf8', env:{...process.env,...env}, maxBuffer:20*1024*1024 });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status===0;
}
function coverLint(c, label) {
  if (!c || !c.path) return true;
  return run(process.execPath,[path.join(__dirname,'cover-lint.js'),'--cover',c.path,'--ratio',c.ratio,'--main',String(c.main),'--sub',String(c.sub||0),'--label',label]);
}
function cmdFor(p) {
  const t = TITLES[p], base = path.join(__dirname, p==='douyin'?'publish.js':`publish-${p==='bili'?'bili':'xhs'}.js`);
  if (p==='douyin') return [base,'--platform','douyin','--video',M.video,'--cover',COVERS.douyin?.path||'','--coverH',COVERS.douyinH?.path||'','--title',t,'--desc',M.desc||'',...(PUBLISH?['--publish']:[])];
  if (p==='xhs') return [path.join(__dirname,'publish-xhs.js'),'--video',M.video,'--title',t,'--desc',M.desc||'',...(COVERS.xhs?.path?['--cover',COVERS.xhs.path]:[]),...(PUBLISH?['--publish']:[])];
  if (p==='channels') return [path.join(__dirname,'publish-channels.js'),'--video',M.video,...(COVERS.channels?.path?['--cover',COVERS.channels.path]:[]),'--desc',M.desc||'','--short',M.short||t,...(PUBLISH?['--publish']:[])];
  return [path.join(__dirname,'publish-bili.js'),'--video',M.video,'--cover43',COVERS.bili43?.path||'','--cover169',COVERS.bili169?.path||'','--title',t,'--desc',M.desc||'','--tags',M.tags||'企业AI,FDE,创业',...(PUBLISH?['--publish']:[])];
}
async function listed(p,t,port) {
  const {ws,send,ev} = await connect(port);
  try { return await findPublished(send,ev,p,t); } finally { ws.close(); }
}
(async()=>{
  if (!opt.manifest) { console.error('缺少 --manifest'); process.exit(2); }
  if (!fs.existsSync(M.video)) { console.error('视频不存在:',M.video); process.exit(2); }
  console.log(`任务: ${M.id||M.video}`);
  for (const p of PLATFORMS) if (!TITLES[p]) { console.error('缺少标题:',p); process.exit(2); }
  // 封面是必填发布物料，不允许“先发了再说”。
  for (const p of PLATFORMS) {
    const required = p === 'bili' ? ['bili43','bili169'] : [p];
    for (const key of required) {
      if (!COVERS[key]?.path) { console.error(`缺少 ${p} 的封面配置: ${key}`); process.exit(2); }
      if (!fs.existsSync(COVERS[key].path)) { console.error(`封面文件不存在: ${COVERS[key].path}`); process.exit(2); }
    }
  }
  const lintTargets = [['douyin',COVERS.douyin],['douyinH',COVERS.douyinH],['xhs',COVERS.xhs],['channels',COVERS.channels],['bili43',COVERS.bili43],['bili169',COVERS.bili169]];
  for (const [k,c] of lintTargets) if (c?.path && !coverLint(c,k)) { console.error('封面未通过 lint:',k); process.exit(3); }
  if (!PUBLISH) {
    for (const p of PLATFORMS) {
      const a=[path.join(__dirname,'preflight.js'),'--platform',p,'--video',M.video,'--title',TITLES[p]];
      if(p==='channels') a.push('--short',M.short||TITLES[p]);
      if(!run(process.execPath,a)) { console.error('PREFLIGHT FAIL:',p); process.exit(3); }
    }
    console.log('DRY RUN：封面 lint + preflight 通过，未上传。加 --publish 才发布。'); process.exit(0);
  }
  const results=[];
  // 按浏览器端口分组：不同端口并行（各平台上传互不干扰，总时长=最慢组），同端口串行。
  const PORTS = M.ports || {};
  const portOf = p => String(PORTS[p] || process.env.CDP_PORT || '9222');
  // 每个平台的 tab 关键字：子脚本靠它连上正确的标签页，否则连到 about:blank 干等 25 分钟
  const targetOf = p => ({douyin:'douyin',channels:'channels.weixin',xhs:'xiaohongshu',bili:'bilibili'})[p] || '';
  const groups = {};
  for (const p of PLATFORMS) { const pt=portOf(p); (groups[pt]=groups[pt]||[]).push(p); }
  async function doPlatform(p, pt) {
    const t=TITLES[p];
    console.log(`\n[${labels[p]}] 开始（端口 ${pt}）`);
    if (await listed(p,t,pt)) {
      console.log(`[${labels[p]}] 已存在同标题作品，跳过（幂等）`);
      results.push({platform:p,status:'skipped',title:t}); return;
    }
    let ok=false, tries=0;
    while (!ok && tries<RETRIES) {
      tries++;
      console.log(`[${labels[p]}] 第 ${tries}/${RETRIES} 次`);
      ok = run(process.execPath, cmdFor(p), {CDP_PORT: pt, CDP_TARGET: targetOf(p)});
      if (!ok) {
        // 平台收录有延迟（审核中/转码中），重试前多查几轮，避免误判重发造成重复投稿
        for (let v = 0; v < 3 && !ok; v++) { await new Promise(r=>setTimeout(r,6000)); ok = await listed(p,t,pt); }
      }
    }
    let coverShot=null;
    if (ok) {
      coverShot=path.join(evidence,`${stamp}-${p}-cover.png`);
      run(process.execPath,[path.join(__dirname,'cover-check.js'),'--platform',p,'--out',coverShot],{CDP_PORT:pt, CDP_TARGET: targetOf(p)});
    }
    results.push({platform:p,status:ok?'published':'failed',title:t,coverShot});
    console.log(`[${labels[p]}] ${ok?'完成':'失败'}`);
  }
  await Promise.all(Object.entries(groups).map(async ([pt, ps]) => {
    for (const p of ps) await doPlatform(p, pt);
  }));
  const report=path.join(evidence,`${stamp}-publish-all.json`);
  fs.writeFileSync(report,JSON.stringify({task:M.id,video:M.video,time:new Date().toISOString(),results},null,2));
  console.log('\n| 平台 | 状态 | 标题 | 封面截图 |');
  console.log('|---|---|---|---|');
  for (const r of results) console.log(`| ${labels[r.platform]} | ${r.status} | ${r.title} | ${r.coverShot||'-'} |`);
  console.log('\n报告:',report);
  process.exit(results.some(r=>r.status==='failed')?1:0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
