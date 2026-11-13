const http=require('http'); const WebSocket=require('ws');
const get=(p,port)=>new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:Number(port||process.env.CDP_PORT||9222),path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});
async function connect(portOpt){
  const list=JSON.parse(await get('/json/list',portOpt));
  const pages=list.filter(t=>t.type==='page');
  const want=process.env.CDP_TARGET;
  const page=(want&&pages.find(t=>(t.url||'').includes(want)))||pages.find(t=>/^about:blank/.test(t.url||''))||pages[0];
  const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false, maxPayload: 200*1024*1024});
  let id=0; const pend={};
  let sendRaw=null;
  ws.on('message',m=>{const o=JSON.parse(m);
    if(o.method==='Page.javascriptDialogOpening'&&sendRaw){ sendRaw('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{}); console.log('  [dialog] 已自动接受:',(o.params&&o.params.message||'').slice(0,40)); return; }
    if(o.id&&pend[o.id]){pend[o.id](o);delete pend[o.id];}});
  await new Promise(r=>ws.on('open',r));
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
  sendRaw=(m,p)=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method:m,params:p||{}}));});
  sendRaw('Page.enable').catch(()=>{});
  const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r.result&&r.result.result?r.result.result.value:(r.result||{}).value;};
  return {ws,send,ev};
}
module.exports={connect};
