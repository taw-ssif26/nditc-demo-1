const C=JSON.parse(document.getElementById('c').textContent);
const N={home:'Command Deck',about:'Origin Vault',activities:'Launch Bay',projects:'Reactor Lab',executives:'Crew Manifest',publication:'Archive Stacks',blog:'Signal Logs',contact:'Comms Relay',developers:'Dev Forge',policy:'Protocol Hall',app:'Pocket Node'};
const R=Object.keys(N),$=s=>document.querySelector(s),PAPER=['about','publication','policy'];
const P=r=>r==='home'?'/':r==='app'?'/mobile-app':'/'+r;
const route=()=>{const p=location.pathname.replace(/\/+$/,'')||'/';return R.find(r=>P(r)===p)||'home'};
const nav=r=>{if(P(r)!==location.pathname){history.pushState({},'',P(r));go()}};
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="/"]');if(!a||a.target||e.metaKey||e.ctrlKey||e.shiftKey)return;const r=R.find(x=>P(x)===a.getAttribute('href'));if(r){e.preventDefault();$('#wr').classList.remove('on');nav(r)}});
const E=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const RM=matchMedia('(prefers-reduced-motion:reduce)').matches,z=i=>String(i+1).padStart(2,'0');
const img=s=>s?`<img src="${E(s)}" alt="">`:'';
const ix=a=>a.map((r,i)=>`<div class="rw rv"><span>${z(i)}</span><div><h3>${E(r[0])}</h3>${r[2]?`<img class="th" src="${E(r[2])}" alt="${E(r[0])}" loading="lazy">`:''}</div><p>${E(r[1]||'')}</p></div>`).join('');
const two=(l,b)=>`<section class="two"><h2>${E(l)}</h2><div>${b}</div></section>`;
const hd=(t,m,x)=>`<header class="hero"><p class="mt">${m}</p><h1>${t}</h1>${x||''}</header>`;
const pend=n=>hd(E(N[n]),'No signal yet')+`<div class="pend rv">Content for this page is not in the content block yet. Add it there and extend V.${n}.</div>`;
const foot=()=>`<footer>${E(C.copy)} · <a href="mailto:${E(C.email)}">${E(C.email)}</a> · ${E(C.address)} · <a href="/portal">Student portal</a></footer>`;
const acts=()=>ix(C.activities.map(a=>[a.t,a.d,a.img]));
const V={
home:()=>hd('NDITC',E(C.badge),`<p class="lead" data-ty="${E(C.lead)}"></p><a class="bt" href="/about">${E(C.cta)}</a><a class="bt" href="/portal#register">Join as a student</a>`)
+two('Departments',ix(C.departments.map(d=>[d])))
+two('Featured project',`<div class="rv">${img(C.project.img)}<p class="bp">${E(C.project.name)}</p><p>${E(C.project.desc)}</p><a class="bt" href="/projects">${E(C.cta)}</a></div>`)
+two('Our activities include',acts())+two('Why join NDITC?',ix(C.why.map(a=>[a.t,a.d])))
+two(C.news.t,`<p class="rv">${E(C.news.d)}</p><p class="rv"><input id="em" type="email" placeholder="you@domain.com" aria-label="email"><button class="bt" id="sub">Subscribe</button></p><p id="sm" class="mt"></p>`)
+two('Mobile application',`<p class="rv">${E(C.app)}</p>`)+foot(),
about:()=>hd('About','Est. 2018',`<p class="bp rv">“${E(C.motto)}”</p>`)
+two('History',`<p class="rv">${E(C.history)}</p>`)+two('Objectives',`<p class="rv">${E(C.objectives)}</p>`)
+two('In numbers',`<div class="st rv">${C.stats.map(s=>`<div><span class="num" data-n="${s[1]}" data-s="${s[2]}">0</span><p>${E(s[0])}</p></div>`).join('')}</div>`)
+two('Timeline',`<div class="tl">${C.timeline.map(t=>`<div class="rw rv"><span>${E(t[0])}</span><p>${t[1]?E(t[1]):'Entry pending.'}</p></div>`).join('')}</div>`)+foot(),
activities:()=>hd('Activities','What we do')+two('Our activities include',acts())+((C.events||[]).length?two('Events',ix(C.events.map(e=>[e.t,e.d,e.img]))):'')+foot(),
projects:()=>hd('Projects','R&D')+two('Featured',ix((C.projects||[{t:C.project.name,d:C.project.desc}]).map(p=>[p.t,p.d,p.img])))+foot(),
publication:()=>hd('Publication','Annual')+two('Recursion',ix([['RECURSION',(C.activities[3]||{}).d||''],...(C.publications||[]).map(p=>[p.t,p.d,p.img])]))+foot(),
app:()=>hd('Mobile App','Pocket Node',`<p class="lead">${E(C.app)}</p>`)+`<div class="pend rv">APK / store link goes here.</div>`+foot(),
contact:()=>hd('Contact','Open a channel')+two('Email',`<a class="bp rv" href="mailto:${E(C.email)}">${E(C.email)}</a>`)+two('Address',`<p class="bp rv">${E(C.address)}</p>`)+foot()
};
const lst=(n,m,k)=>()=>(C[k]||[]).length?hd(E(N[n]),m)+two('Entries',ix(C[k].map(e=>[e.t,e.d,e.img])))+foot():pend(n)+foot();
V.executives=lst('executives','Crew manifest','executives');V.blog=lst('blog','Signal logs','blog');
['developers','policy'].forEach(n=>V[n]=()=>(C.pg&&C.pg[n])?hd(E(N[n]),'')+two(N[n],`<p class="rv" style="white-space:pre-line">${E(C.pg[n])}</p>`)+foot():pend(n)+foot());

/* graph-paper background: dot grid that reacts to the pointer */
const cv=$('#bg'),x=cv.getContext('2d');let W,H,mx=-1e3,my=-1e3,rgb='233,229,218';
function rs(){W=cv.width=innerWidth;H=cv.height=innerHeight;if(RM)dr(0)}
addEventListener('pointermove',e=>{mx=e.clientX;my=e.clientY});
function dr(t){x.clearRect(0,0,W,H);const g=30;for(let i=g/2;i<W;i+=g)for(let j=g/2;j<H;j+=g){const k=Math.max(0,1-Math.hypot(i-mx,j-my)/170),w=RM?0:Math.sin(t/1500+i*.01+j*.013)*.03,s=1+k*2.5;x.fillStyle=`rgba(${rgb},${.1+k*.7+w})`;x.fillRect(i-s/2,j-s/2,s,s)}if(!RM)requestAnimationFrame(dr)}
addEventListener('resize',rs);rs();if(!RM)dr(0);

let busy=0;
function go(){
 const r=route();
 if(busy)return;busy=1;
 const ld=$('#ld'),lb=$('#lb');
 $('#lt').innerHTML=`<small>${z(R.indexOf(r))} / ${R.length}</small><b>${E(N[r])}</b>`;
 ld.classList.remove('off');lb.style.transition='none';lb.style.transform='scaleX(0)';
 requestAnimationFrame(()=>{lb.style.transition=`transform ${RM?0:.8}s cubic-bezier(.7,0,.2,1)`;lb.style.transform='scaleX(1)'});
 setTimeout(()=>{
  document.body.dataset.w=r;$('#view').innerHTML=V[r]();scrollTo(0,0);
  document.title=(r==='home'?'':N[r]+' — ')+'NDITC — Notre Dame Information Technology Club';
  rgb=getComputedStyle(document.body).getPropertyValue('--rgb').trim();if(RM)dr(0);
  hydrate();ld.classList.add('off');busy=0;
 },RM?60:950);
}
function hydrate(){
 const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);e.target.querySelectorAll('.num').forEach(cnt)}}),{threshold:.12});
 document.querySelectorAll('.rv').forEach(e=>io.observe(e));
 const t=$('[data-ty]');if(t){const s=t.dataset.ty;let i=0;const k=()=>{t.textContent=s.slice(0,i++);if(i<=s.length)setTimeout(k,RM?0:16)};k()}
 const sb=$('#sub');if(sb)sb.onclick=()=>{const v=$('#em').value.trim();$('#sm').textContent=/^\S+@\S+\.\S+$/.test(v)?'Queued. (Demo: connect the API to store it.)':'Invalid address.'};
}
function cnt(n){const to=+n.dataset.n,s=n.dataset.s||'';let v=0;const st=()=>{v+=Math.ceil(to/40);if(v>=to)v=to;n.textContent=v+s;if(v<to&&!RM)requestAnimationFrame(st)};st()}
addEventListener('popstate',go);

/* index navigation */
const wr=$('#wr');
R.forEach((r,i)=>{const l=document.createElement('a');l.className='mi';l.href=P(r);l.innerHTML=`<i>${z(i)}</i>${E(N[r])}`;l.onclick=()=>wr.classList.remove('on');wr.appendChild(l)});
{const pl=document.createElement('a');pl.className='mi';pl.href='/portal';pl.innerHTML='<i>→</i>Student portal';wr.appendChild(pl)}
$('#core').onclick=()=>wr.classList.toggle('on');

/* terminal */
const tm=$('#tm'),to=$('#to'),ti=$('#ti'),H2=[];let hi=0;
const out=s=>{to.textContent+=s+'\n';to.scrollTop=1e9};
const find=q=>{q=q.toLowerCase();return C.departments.find((d,i)=>d.toLowerCase().includes(q)||String(i+1)===q)};
const CM={
help:()=>'commands: help about motto stats ls cat <name|n> events projects goto <world> join contact worlds whoami clear sudo',
about:()=>C.history,motto:()=>`"${C.motto}"`,
stats:()=>C.stats.map(s=>`${s[0].padEnd(18)} ${s[1]}${s[2]}`).join('\n'),
ls:()=>C.departments.map((d,i)=>`${i+1}. ${d}`).join('\n'),
cat:a=>/quantum/i.test(a)?`${C.project.name}: ${C.project.desc}`:(find(a)||'cat: not found. try: cat quantum | cat 1'),
events:()=>C.activities[0].d,projects:()=>`${C.project.name}\nHashTech\nEvya AI`,
worlds:()=>R.join(' '),join:()=>{location.href='/portal#register';return 'opening registration...'},
contact:()=>`${C.email}\n${C.address}`,
goto:a=>R.includes(a)?(nav(a),'warping to '+N[a]+'...'):'goto: unknown world. try: worlds',
whoami:()=>'guest@nditc, clearance: public',
sudo:()=>'nice try. this incident will be reported (to nobody).',
clear:()=>{to.textContent='';return ''}
};
function run(l){out('$ '+l);const[c,...a]=l.trim().split(/\s+/);if(!c)return;const f=CM[c.toLowerCase()];const r=f?f(a.join(' ')):`${c}: command not found. type help`;if(r)out(r)}
ti.addEventListener('keydown',e=>{if(e.key==='Enter'){const v=ti.value;H2.push(v);hi=H2.length;ti.value='';run(v)}else if(e.key==='ArrowUp'){hi=Math.max(0,hi-1);ti.value=H2[hi]||''}else if(e.key==='ArrowDown'){hi=Math.min(H2.length,hi+1);ti.value=H2[hi]||''}});
const tg=()=>{tm.classList.toggle('on');if(tm.classList.contains('on')){if(!to.textContent)out('NDITC lab terminal v1.0, type "help"');ti.focus()}};
$('#tb').onclick=tg;
addEventListener('keydown',e=>{if(e.key==='Escape'){wr.classList.remove('on');tm.classList.remove('on')}else if(e.key==='`'&&document.activeElement!==ti){e.preventDefault();tg()}});
go();
