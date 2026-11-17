#!/usr/bin/env node
// 封面字号/比例硬校验 + 360px 手机预览
// 用法: node cover-lint.js --cover x.jpg --ratio 3:4 --main 100 [--sub 64] [--label xx]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2), opt = {};
for (let i=0;i<args.length;i++) if(args[i].startsWith('--')) {
  const k=args[i].slice(2), v=args[i+1]&&!args[i+1].startsWith('--')?args[++i]:true; opt[k]=v;
}
const MIN = {
  '3:4':  { main: 96, sub: 64 },
  '9:16': { main: 96, sub: 64 },
  '16:9': { main: 120, sub: 72 },
  '4:3':  { main: 100, sub: 64 },
};
const fail = [];
const need = (ok,msg)=>{ if(!ok) fail.push(msg); };
const exists = p => p && fs.existsSync(p) && fs.statSync(p).size>0;
need(exists(opt.cover), '封面不存在或为空');
need(MIN[opt.ratio], `未知比例 ${opt.ratio||'(缺 --ratio)'}`);

let w=0,h=0;
if (exists(opt.cover)) {
  const meta = JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',opt.cover],{encoding:'utf8'}));
  const s=(meta.streams||[])[0]||{}; w=Number(s.width); h=Number(s.height);
  need(w>0&&h>0,'读不到封面尺寸');
}
if (MIN[opt.ratio]) {
  const [rw,rh]=opt.ratio.split(':').map(Number);
  need(Math.abs((w/h)-(rw/rh))/(rw/rh) < 0.02, `封面比例 ${w}x${h} 与 ${opt.ratio} 不符`);
  const main=Number(opt.main||0), sub=Number(opt.sub||0);
  need(main >= MIN[opt.ratio].main, `主标题 ${main}px < 下限 ${MIN[opt.ratio].main}px`);
  if (sub) need(sub >= MIN[opt.ratio].sub, `辅助字 ${sub}px < 下限 ${MIN[opt.ratio].sub}px`);
  if (sub && sub < 56) fail.push(`辅助字 ${sub}px < 56px，手机上不可读`);
}
const outDir = path.join(__dirname,'evidence'); fs.mkdirSync(outDir,{recursive:true});
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
let preview=null;
if (exists(opt.cover) && w>0) {
  preview = path.join(outDir,`${stamp}-${opt.label||'cover'}-360.png`);
  execFileSync('ffmpeg',['-v','error','-y','-i',opt.cover,'-vf','scale=360:-1','-frames:v','1',preview]);
}
const report={cover:path.resolve(opt.cover||''),width:w,height:h,ratio:opt.ratio,main:Number(opt.main||0),sub:Number(opt.sub||0),min:MIN[opt.ratio]||null,preview,passed:fail.length===0,failures:fail};
if (fail.length) { console.error('COVER LINT FAIL\n- '+fail.join('\n- ')); console.error(JSON.stringify(report,null,2)); process.exit(1); }
console.log(`COVER LINT PASS | ${opt.ratio} | ${w}x${h} | main ${opt.main}px${opt.sub?` / sub ${opt.sub}px`:''}`);
console.log(preview);
