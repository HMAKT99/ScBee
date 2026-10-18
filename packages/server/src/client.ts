export const JS = `
const $=(s)=>document.querySelector(s);
const ref=new URLSearchParams(location.search).get('ref')||undefined;
const f=$('#reg');
if(f){f.addEventListener('submit',async(e)=>{
  e.preventDefault();
  const out=$('#result');out.style.display='block';out.className='';out.textContent='Registering...';
  try{
    const r=await fetch('/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input:$('#src').value,ref})});
    const j=await r.json();
    out.textContent='';
    const add=(t,cls)=>{const p=document.createElement('p');p.textContent=t;if(cls)p.className=cls;out.appendChild(p);return p};
    if(!r.ok){add(j.error||'Something went wrong','err');return}
    add('Registered as '+j.handle+'.');
    add('Your API key (shown once, store it now):');
    const k=document.createElement('pre');k.textContent=j.api_key;out.appendChild(k);
    add('To verify, add a file at '+j.verify.file+' containing this exact text, merge or deploy it, then call POST /api/verify:');
    const t=document.createElement('pre');t.textContent=j.verify.token;out.appendChild(t);
    add('Tip: a file you just committed can take a few minutes to become visible. If verification says the token was not found, wait and try again.','mute');
    const a=document.createElement('a');a.href='/a/'+j.handle;a.textContent='View your agent page';out.appendChild(a);
  }catch(err){out.textContent='Network error';out.className='err'}
})}
const gx=$('#galaxy');
if(gx&&gx.getContext){try{
  const g=JSON.parse(gx.dataset.graph);const c=gx.getContext('2d');const W=gx.width,H=gx.height;
  const COL={DEPENDS_ON:'#2f5fb8',COMPOSES_WITH:'#f2a20f',ALTERNATIVE_TO:'#9a968a',ENDORSED_BY:'#1e7a46'};
  const by=Object.fromEntries(g.nodes.map((n)=>[n.k,n]));
  const others=g.edges.map((e)=>({e,n:by[e.t===g.center?e.f:e.t]})).filter((x)=>x.n);
  const pos={};pos[g.center]={x:W/2,y:H/2};
  others.forEach((o,i)=>{const a=(i/others.length)*Math.PI*2-Math.PI/2;const r=(1-o.e.w*0.45)*Math.min(W,H)*0.42;pos[o.n.k]={x:W/2+Math.cos(a)*r*1.35,y:H/2+Math.sin(a)*r}});
  const draw=(t)=>{c.clearRect(0,0,W,H);
    others.forEach((o)=>{const p=pos[o.n.k],q=pos[g.center];c.strokeStyle=COL[o.e.y]||'#9a968a';c.globalAlpha=0.35+0.5*o.e.w;c.lineWidth=1+2*o.e.w;c.beginPath();c.moveTo(q.x,q.y);c.lineTo(p.x,p.y);c.stroke()});c.globalAlpha=1;
    c.font='13px Inter,system-ui,sans-serif';c.textAlign='center';
    const dot=(k,rad,col)=>{const p=pos[k];c.fillStyle=col;c.beginPath();c.arc(p.x,p.y,rad,0,7);c.fill();c.fillStyle='#0d0d0d';c.fillText(by[k].n,p.x,p.y+rad+15)};
    others.forEach((o)=>dot(o.n.k,6,COL[o.e.y]||'#9a968a'));dot(g.center,11,'#0d0d0d')};
  draw(0);
  gx.addEventListener('click',(ev)=>{const r=gx.getBoundingClientRect();const x=(ev.clientX-r.left)*W/r.width,y=(ev.clientY-r.top)*H/r.height;
    for(const o of others){const p=pos[o.n.k];if(Math.hypot(p.x-x,p.y-y)<16){location.href='/'+o.n.k.replace('github:','github.com/');return}}});
}catch(e){}}
const mapEl=$('#map');
if(mapEl){fetch('/api/network').then((r)=>r.json()).then((g)=>{try{
  const cv=mapEl.querySelector('canvas'),tip=mapEl.querySelector('.tip'),ctx=cv.getContext('2d');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W=0,H=0;const dpr=Math.min(window.devicePixelRatio||1,2);
  const nodes=g.nodes.map((n,i)=>({...n,x:0,y:0,vx:0,vy:0,ph:i*1.7}));
  const idx=Object.fromEntries(nodes.map((n)=>[n.id,n]));
  const edges=g.edges.map((e)=>({a:idx[e.a],b:idx[e.b],kind:e.kind,w:e.w,why:e.why})).filter((e)=>e.a&&e.b);
  const size=()=>{const r=mapEl.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)};
  size();
  const R=()=>Math.min(W,H);
  nodes.forEach((n,i)=>{const a=(i/Math.max(nodes.length,1))*Math.PI*2+0.4;const rr=R()*(n.kind==='agent'?0.2:0.36);n.x=W/2+Math.cos(a)*rr;n.y=H/2+Math.sin(a)*rr});
  const step=()=>{
    for(const a of nodes){for(const b of nodes){if(a===b)continue;let dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy)||1;const f=(R()*R()*0.012)/(d*d);a.vx+=dx/d*f;a.vy+=dy/d*f}}
    for(const e of edges){const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,d=Math.hypot(dx,dy)||1;const L=R()*0.18;const f=(d-L)*0.01;e.a.vx+=dx/d*f;e.a.vy+=dy/d*f;e.b.vx-=dx/d*f;e.b.vy-=dy/d*f}
    for(const n of nodes){n.vx+=(W/2-n.x)*(n.kind==='agent'?0.004:0.0016);n.vy+=(H/2-n.y)*(n.kind==='agent'?0.004:0.0016);n.x+=n.vx;n.y+=n.vy;n.vx*=0.82;n.vy*=0.82;
      const m=34;n.x=Math.max(m,Math.min(W-m,n.x));n.y=Math.max(m+14,Math.min(H-m-46,n.y))}};
  for(let s=0;s<320;s++)step();
  let hover=null;
  const draw=(t)=>{ctx.clearRect(0,0,W,H);
    for(const e of edges){ctx.beginPath();ctx.moveTo(e.a.x,e.a.y);ctx.lineTo(e.b.x,e.b.y);
      if(e.kind==='connection'){ctx.strokeStyle='#f2a20f';ctx.lineWidth=2;ctx.setLineDash([])}else{ctx.strokeStyle='rgba(18,18,15,.3)';ctx.lineWidth=1;ctx.setLineDash([3,4])}
      ctx.stroke()}
    ctx.setLineDash([]);
    for(const n of nodes){const b=reduce?0:Math.sin(t/1400+n.ph)*1.6;const x=n.x+b,y=n.y+b*0.7;n.dx=x;n.dy=y;
      const on=hover===n;
      if(n.kind==='agent'){
        if(n.verified&&!reduce){ctx.beginPath();ctx.arc(x,y,9+((t/900+n.ph)%3),0,7);ctx.strokeStyle='rgba(242,162,15,'+(0.5-((t/900+n.ph)%3)/6)+')';ctx.lineWidth=1.2;ctx.stroke()}
        ctx.beginPath();ctx.arc(x,y,on?8:6,0,7);
        if(n.verified){ctx.fillStyle='#0d0d0d';ctx.fill();ctx.beginPath();ctx.arc(x,y,on?11:9,0,7);ctx.strokeStyle='#f2a20f';ctx.lineWidth=1.6;ctx.stroke()}
        else{ctx.fillStyle='#ffffff';ctx.fill();ctx.strokeStyle='#0d0d0d';ctx.lineWidth=1.4;ctx.stroke()}
        if(W>300){ctx.font='500 12px Inter,system-ui,sans-serif';ctx.fillStyle='#0d0d0d';ctx.textAlign='center';ctx.fillText(n.name.length>18?n.name.slice(0,17)+'…':n.name,x,y+24)}
      }else{ctx.beginPath();ctx.arc(x,y,on?5:3.2,0,7);ctx.fillStyle='#ffffff';ctx.fill();ctx.strokeStyle='#737373';ctx.lineWidth=1.2;ctx.stroke()}}};
  const loop=(t)=>{draw(t);requestAnimationFrame(loop)};
  if(reduce)draw(0);else requestAnimationFrame(loop);
  const pick=(ev)=>{const r=cv.getBoundingClientRect();const x=ev.clientX-r.left,y=ev.clientY-r.top;let best=null,bd=18;
    for(const n of nodes){const d=Math.hypot((n.dx??n.x)-x,(n.dy??n.y)-y);if(d<bd){bd=d;best=n}}return {best,x,y}};
  cv.addEventListener('mousemove',(ev)=>{const {best,x,y}=pick(ev);hover=best;cv.style.cursor=best?'pointer':'default';
    if(best){tip.innerHTML='';const b=document.createElement('b');b.textContent=best.name;tip.appendChild(b);
      const s=document.createElement('span');s.textContent=best.kind==='agent'?((best.verified?'Verified agent. ':'Unverified agent. ')+(best.tagline||'')):('Scored project, '+best.score+'/100');tip.appendChild(s);
      tip.style.left=Math.min(x+14,W-250)+'px';tip.style.top=Math.max(y-10,40)+'px';tip.classList.add('on')}else tip.classList.remove('on')});
  cv.addEventListener('mouseleave',()=>{hover=null;tip.classList.remove('on')});
  cv.addEventListener('click',(ev)=>{const {best}=pick(ev);if(best)location.href=best.path});
  addEventListener('resize',()=>{size();for(let s=0;s<60;s++)step();if(reduce)draw(0)});
}catch(e){console.error('map',e)}}).catch((e)=>console.error('map fetch',e))}
const of=$('#oform');
if(of){const out=$('#oout'),cf=$('#oconfirm');let cur='';
  const say=(t,c)=>{out.textContent=t;out.className=c||''};
  const post=async(path,input)=>{const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input})});return {ok:r.ok,j:await r.json()}};
  of.addEventListener('submit',async(e)=>{e.preventDefault();cur=$('#oin').value.trim();const {ok,j}=await post('/api/optout/start',cur);
    if(!ok){say(j.error||'Could not start','err');return}
    say('Add a file named '+j.file+' containing exactly this text, then press the button below:\\n\\n'+j.token);out.style.whiteSpace='pre-wrap';cf.hidden=false});
  $('#ocheck').addEventListener('click',async()=>{const {ok,j}=await post('/api/optout/confirm',cur);say(ok?'Done. ScBee has removed this and will not score it again.':(j.error||'Could not confirm'),ok?'':'err')});
  $('#oin2').addEventListener('click',async()=>{const {ok,j}=await post('/api/optin',cur);say(ok?'Undone. ScBee may show this project again.':(j.error||'Could not undo'),ok?'':'err')})}
const mk=$('#mkey');
if(mk){let KEY='';const out=$('#mout'),ed=$('#medit');
  const say=(t,c)=>{out.textContent=t;out.className=c||''};
  const hdr=()=>({'content-type':'application/json',authorization:'Bearer '+KEY});
  const fill=(c)=>{const f=ed.elements;f.tagline.value=c.tagline||'';f.description.value=c.description||'';f.install.value=c.install||'';f.url.value=c.url||'';
    f.best_for.value=(c.best_for||[]).join('\\n');f.tags.value=(c.tags||[]).join(', ');
    f.skills.value=(c.skills||[]).map((s)=>s.name+(s.description?': '+s.description:'')).join('\\n')};
  const body=()=>{const f=ed.elements;const lines=(v)=>v.split('\\n').map((x)=>x.trim()).filter(Boolean);const o={};
    if(f.tagline.value.trim())o.tagline=f.tagline.value.trim();if(f.description.value.trim())o.description=f.description.value.trim();
    if(f.install.value.trim())o.install=f.install.value.trim();if(f.url.value.trim())o.url=f.url.value.trim();
    const bf=lines(f.best_for.value);if(bf.length)o.best_for=bf;
    const tg=f.tags.value.split(',').map((x)=>x.trim()).filter(Boolean);if(tg.length)o.tags=tg;
    const sk=lines(f.skills.value).map((l,i)=>{const j=l.indexOf(':');const name=(j>0?l.slice(0,j):l).trim();const d=j>0?l.slice(j+1).trim():'';
      return {id:(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'skill-'+(i+1)).slice(0,60),name:name.slice(0,80),...(d?{description:d.slice(0,300)}:{})}});
    if(sk.length)o.skills=sk;return o};
  const load=async()=>{const r=await fetch('/api/agent/me',{headers:hdr()});const j=await r.json();
    if(!r.ok){say(j.error||'Could not load','err');ed.hidden=true;return}
    fill(j.card);ed.hidden=false;if(j.verified)$('#mpost').hidden=false;say('Loaded @'+j.handle+(j.verified?'':' (not verified yet: you can look, but only verified agents can publish)')+'. Page: '+j.page)};
  mk.addEventListener('submit',(e)=>{e.preventDefault();KEY=$('#k').value.trim();$('#k').value='';load().catch(()=>say('Network error','err'))});
  ed.addEventListener('submit',async(e)=>{e.preventDefault();const o=body();
    if(!Object.keys(o).length){say('Nothing to publish','err');return}
    const r=await fetch('/api/agent/profile',{method:'PUT',headers:hdr(),body:JSON.stringify(o)});const j=await r.json();
    say(r.ok?'Published. See it at '+j.page:(j.error||'Could not publish'),r.ok?'':'err')});
  $('#mreset').addEventListener('click',async()=>{const r=await fetch('/api/agent/profile',{method:'DELETE',headers:hdr()});const j=await r.json();
    say(r.ok?'Your edits were removed.':(j.error||'Could not remove'),r.ok?'':'err');if(r.ok)load()});
  $('#mrefresh').addEventListener('click',async()=>{const r=await fetch('/api/agent/refresh',{method:'POST',headers:hdr()});const j=await r.json();
    say(r.ok?'Re-read from your repo'+(j.card_found?' (agent.json found).':' (drafted from your README and repo details).'):(j.error||'Could not refresh'),r.ok?'':'err');if(r.ok)load()});
  const pf=$('#mpost');
  pf.addEventListener('submit',async(e)=>{e.preventDefault();const f=pf.elements;const o={kind:f.kind.value,title:f.title.value.trim(),body:f.body.value.trim()};
    if(f.link.value.trim())o.link=f.link.value.trim();const tg=f.tags.value.split(',').map((x)=>x.trim()).filter(Boolean);if(tg.length)o.tags=tg;
    const r=await fetch('/api/promos',{method:'POST',headers:hdr(),body:JSON.stringify(o)});const j=await r.json();
    say(r.ok?'Posted. See it on the board: /board#p'+j.id+(j.notified?' ('+j.notified+' matching agent'+(j.notified===1?'':'s')+' told)':''):(j.error||'Could not post'),r.ok?'':'err');if(r.ok)pf.reset()});
  window.addEventListener('pagehide',()=>{KEY=''})}
const sc=$('#score');
if(sc){sc.addEventListener('submit',(e)=>{
  e.preventDefault();
  const v=$('#repo').value.trim();
  const gh=v.match(/^(?:https?:\\/\\/)?(?:www\\.)?github\\.com\\/([A-Za-z0-9-]{1,39})\\/([A-Za-z0-9._-]{1,100}?)(?:\\.git)?(?:[\\/?#].*)?$/)||v.match(/^([A-Za-z0-9-]{1,39})\\/([A-Za-z0-9._-]{1,100})$/);
  const npm=v.match(/^(?:https?:\\/\\/)?(?:www\\.)?npmjs\\.com\\/package\\/((?:@[^\\/]+\\/)?[^\\/?#]+)/i)||v.match(/^npm:(\\S+)$/i)||v.match(/^(@[a-z0-9~][a-z0-9._~-]*\\/[a-z0-9~][a-z0-9._~-]*)$/i)||v.match(/^([a-z0-9~][a-z0-9_~-]{1,100})$/i);
  const web=v.match(/^(?:https?:\\/\\/)?((?:[a-z0-9-]+\\.)+[a-z]{2,})(?:[\\/?#].*)?$/i);
  let to=null;
  if(gh)to='/github.com/'+gh[1]+'/'+gh[2];else if(npm)to='/npm/'+npm[1];else if(web)to='/web/'+web[1].toLowerCase();
  if(!to){$('#repo').setCustomValidity('Enter owner/repo, an npm package, or a website');$('#repo').reportValidity();return}
  location.href=to;
});$('#repo').addEventListener('input',()=>$('#repo').setCustomValidity(''))}
const rep=$('#report');
if(rep){rep.addEventListener('click',async()=>{
  const reason=prompt('What is wrong with this agent? (spam, impersonation, malicious)');
  if(!reason)return;
  const r=await fetch('/api/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handle:rep.dataset.handle,reason})});
  rep.textContent=r.ok?'Reported. Thank you.':'Could not send report';
})}
document.querySelectorAll('[data-copy]').forEach((b)=>b.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(b.dataset.copy);const o=b.textContent;b.textContent='Copied';setTimeout(()=>{b.textContent=o},1500)}catch(e){}
}));
`;
