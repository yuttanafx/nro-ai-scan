// Orb visual
(function(){
  const cv=document.getElementById('c'), ctx=cv.getContext('2d');
  const statusEl=document.getElementById('status');
  const micBtn=document.getElementById('mic');
  let size=0, dpr=1;
  function resize(){
    dpr=Math.min(window.devicePixelRatio||1,2);
    size=cv.clientWidth; cv.width=cv.height=Math.round(size*dpr);
  }
  window.addEventListener('resize',resize); resize();

  // sci-fi scene
  (function(){
    const NS='http://www.w3.org/2000/svg';
    let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const st=document.getElementById('stars'); let h='';
    for(let i=0;i<170;i++){
      const y=Math.pow(rnd(),1.5)*560,x=rnd()*1600,r=rnd()*1.3+.3;
      h+=`<circle class="${i%6===0?'tw':''}" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" opacity="${(.3+rnd()*.6).toFixed(2)}" style="animation-delay:${(rnd()*4).toFixed(1)}s"/>`;
    }
    st.innerHTML=h;
    const layers=[
      {n:70,w:[18,44],h:[50,190],fill:'#1d1a6b',op:.9,win:false},
      {n:34,w:[36,76],h:[110,320],fill:'#100b3d',op:1,win:true},
      {n:13,w:[70,130],h:[190,430],fill:'#070518',op:1,win:true,edge:true}
    ];
    let out='';
    layers.forEach((L,li)=>{
      for(let i=0;i<L.n;i++){
        const w=L.w[0]+rnd()*(L.w[1]-L.w[0]), hh=L.h[0]+rnd()*(L.h[1]-L.h[0]);
        const x=(i/L.n)*1600+(rnd()-.5)*60-10, y=660-hh;
        out+=`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${hh.toFixed(0)}" fill="${L.fill}" opacity="${L.op}"/>`;
        if(L.win) out+=`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${hh.toFixed(0)}" fill="url(#win)" opacity="${li===2?.55:.35}"/>`;
        if(L.edge){
          const c=i%2?'#7ff3ff':'#ff7ad0';
          out+=`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="3" fill="${c}"/>`;
          out+=`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="2" height="${hh.toFixed(0)}" fill="${c}" opacity=".5"/>`;
          if(i%4===1) out+=`<rect x="${(x+w/2-1).toFixed(0)}" y="${(y-60).toFixed(0)}" width="2" height="60" fill="${c}"/>`;
        }
      }
    });
    // central spire with light beam
    out+='<polygon points="780,660 800,150 820,660" fill="#0b0830"/><rect x="798" y="150" width="4" height="510" fill="#7ff3ff" opacity=".8"/><polygon points="800,20 770,660 830,660" fill="url(#beam)" opacity=".35"/><circle cx="800" cy="150" r="7" fill="#fff"/>';
    document.getElementById('city').innerHTML=out;
    document.getElementById('refl').innerHTML=`<g transform="translate(0 1320) scale(1 -1)">${out}</g>`;
    // perspective grid
    let gr='';
    for(let i=-24;i<=24;i++) gr+=`<line x1="800" y1="660" x2="${800+i*170}" y2="900" stroke="${i%2?'#7ff3ff':'#ff7ad0'}" stroke-opacity=".28"/>`;
    for(let t=1;t<=12;t++){ const y=660+Math.pow(t/12,2)*240; gr+=`<line x1="0" y1="${y.toFixed(1)}" x2="1600" y2="${y.toFixed(1)}" stroke="#7ff3ff" stroke-opacity="${(.12+t*.02).toFixed(2)}"/>`; }
    document.getElementById('grid').innerHTML=gr;
  })();

  // sprites: glossy roe-like pearl for each hue
  const HUES=72, SP=48, sprites=[];
  for(let i=0;i<HUES;i++){
    const s=document.createElement('canvas'); s.width=s.height=SP;
    const g=s.getContext('2d'), h=i*360/HUES;
    const halo=g.createRadialGradient(SP/2,SP/2,0,SP/2,SP/2,SP/2);
    halo.addColorStop(0,`hsla(${h},100%,62%,.95)`);
    halo.addColorStop(.35,`hsla(${h},100%,55%,.55)`);
    halo.addColorStop(1,`hsla(${h},100%,50%,0)`);
    g.fillStyle=halo; g.fillRect(0,0,SP,SP);
    const hl=g.createRadialGradient(SP*.42,SP*.4,0,SP*.42,SP*.4,SP*.2);
    hl.addColorStop(0,'rgba(255,255,255,.95)'); hl.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=hl; g.fillRect(0,0,SP,SP);
    sprites.push(s);
  }

  // dots arranged in concentric rings -> one filled circle
  const RINGS=24, dots=[];
  dots.push({a:0,r:0,ri:0});
  for(let i=1;i<=RINGS;i++){
    const n=Math.max(6,Math.round(2*Math.PI*i)); // ~1 unit spacing
    const off=Math.random()*Math.PI;
    for(let k=0;k<n;k++) dots.push({a:(k/n)*Math.PI*2+off*0, r:i, ri:i/RINGS});
  }

  // audio
  let analyser=null, ac=null, stream=null, mode='idle';
  const BINS=96, level=new Float32Array(BINS), freq=new Uint8Array(256);
  let loud=0;

  const MOBILE=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform));
  const HOWTO=MOBILE
    ? (/iPhone|iPad|iPod|Mac/.test(navigator.userAgent)
        ? 'iPhone: แตะไอคอน “aA” ข้างช่องที่อยู่เว็บ → การตั้งค่าเว็บไซต์ → ไมโครโฟน → อนุญาต แล้วโหลดหน้าใหม่'
        : 'Android: แตะไอคอนด้านซ้ายของช่องที่อยู่เว็บ → สิทธิ์ → ไมโครโฟน → อนุญาต แล้วโหลดหน้าใหม่')
    : 'แตะไอคอนด้านซ้ายของช่องที่อยู่เว็บ → ไมโครโฟน → อนุญาต แล้วโหลดหน้าใหม่';
  const DENIED='ไมค์ถูกบล็อกไว้ เบราว์เซอร์จะไม่ถามซ้ำ ต้องเปิดเอง: '+HOWTO;
  async function startMic(){
    try{
      stopAll();
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
        statusEl.textContent='เบราว์เซอร์นี้ใช้ไมค์ไม่ได้ ต้องเปิดผ่าน HTTPS และไม่ใช่เบราว์เซอร์ในแอป (LINE/Facebook)'; return;
      }
      // ขอสิทธิ์ไมค์ก่อน เพื่อให้ป๊อปอัพ “อนุญาต” เด้งขึ้นมา
      let perm='unknown';
      try{ perm=(await navigator.permissions.query({name:'microphone'})).state }catch(e){}
      if(perm==='denied'){ statusEl.textContent=DENIED; return }
      if(perm!=='granted') statusEl.textContent='กำลังขอสิทธิ์ไมค์… กด “อนุญาต” ในป๊อปอัพที่เด้งขึ้น';

      if(MOBILE){
        // มือถือใช้ไมค์ได้ทีละงาน: ขอสิทธิ์แล้วคืนไมค์ ให้ระบบถอดเสียงใช้ต่อ ลูกบอลขยับแบบจำลองแทน
        if(perm!=='granted'){
          const tmp=await navigator.mediaDevices.getUserMedia({audio:true});
          tmp.getTracks().forEach(t=>t.stop());
          await new Promise(r=>setTimeout(r,300));
        }
        startRec();
        mode='demo'; micBtn.classList.add('on'); micBtn.textContent='ปิดไมค์';
        statusEl.textContent='AI กำลังฟังคุณ… (ลูกบอลขยับตามจังหวะ ไม่ตามเสียงจริงบนมือถือ)';
        return;
      }
      ac=new (window.AudioContext||window.webkitAudioContext)();
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const src=ac.createMediaStreamSource(stream);
      analyser=ac.createAnalyser(); analyser.fftSize=512; analyser.smoothingTimeConstant=.78;
      src.connect(analyser);
      startRec();
      mode='mic'; micBtn.classList.add('on'); micBtn.textContent='ปิดไมค์';
      statusEl.textContent='AI กำลังฟังคุณ…';
    }catch(e){
      stopAll();
      const n=(e&&e.name)||'Error';
      const code=' [รหัส: '+n+(e&&e.message?' – '+String(e.message).slice(0,80):'')+']';
      statusEl.textContent=
        (n==='NotAllowedError'||n==='SecurityError') ? DENIED
        : n==='NotFoundError' ? 'ไม่พบไมค์ในเครื่องนี้'+code
        : (n==='NotReadableError'||n==='AbortError'||n==='TrackStartError') ? 'เปิดไมค์ไม่ติด มักเกิดจากแอปอื่นกำลังใช้ไมค์อยู่ หรือไมค์ถูกปิดที่ระดับเครื่อง ปิดแอปอื่น (โทรศัพท์ แอปบันทึกเสียง/วิดีโอ ผู้ช่วยเสียง) แล้วเช็กตัวสลับไมค์ใน ตั้งค่า → ความเป็นส่วนตัว'+code
        : 'เปิดไมค์ไม่ได้'+code;
    }
  }
  function stopAll(){
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
    if(ac){ac.close();ac=null}
    analyser=null; mode='idle';
    try{stopRec()}catch(e){}
    micBtn.classList.remove('on');
    micBtn.textContent='เปิดไมค์';
    statusEl.textContent='แตะ “เปิดไมค์” เพื่อให้ AI เริ่มฟัง';
  }
  micBtn.onclick=()=> micBtn.classList.contains('on')?stopAll():startMic();

  function readAudio(t){
    if(mode==='mic'&&analyser){ analyser.getByteFrequencyData(freq); }
    else if(mode==='demo'){
      const burst=Math.max(0,Math.sin(t*.9)*.7+Math.sin(t*2.3)*.4);
      for(let i=0;i<256;i++){
        const v=burst*(.55+.45*Math.sin(i*.17+t*3))*(1-i/330)+Math.max(0,Math.sin(i*.05-t*4))*.25*burst;
        freq[i]=Math.max(0,Math.min(255,v*255));
      }
    } else freq.fill(0);
    let sum=0;
    for(let b=0;b<BINS;b++){
      const idx=Math.floor(Math.pow(b/BINS,1.6)*150);
      const v=freq[idx]/255;
      level[b]+= (v-level[b])*(v>level[b]?.5:.12);
      sum+=level[b];
    }
    loud+=((sum/BINS)-loud)*.25;
  }

  // ---- logo built from pearl dots ----
  let logoDots=[], logoMode=true;
  try{logoMode=localStorage.getItem('orb_mode')!=='orb'}catch(e){}
  const pearls={}, LG=68;
  function pearl(r,g,b){
    const key=(r>>5)+','+(g>>5)+','+(b>>5);
    if(pearls[key]) return pearls[key];
    const q=v=>Math.min(255,((v>>5)<<5)+16);
    const s=document.createElement('canvas'); s.width=s.height=32; const c=s.getContext('2d');
    const gr=c.createRadialGradient(12,11,1,16,16,15);
    gr.addColorStop(0,'rgba(255,255,255,.95)');
    gr.addColorStop(.22,'rgb('+q(r)+','+q(g)+','+q(b)+')');
    gr.addColorStop(.88,'rgb('+(q(r)*.5|0)+','+(q(g)*.5|0)+','+(q(b)*.5|0)+')');
    gr.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=gr; c.beginPath(); c.arc(16,16,15,0,7); c.fill();
    return pearls[key]=s;
  }
  function buildLogo(){
    const img=document.getElementById('logo'); if(!img||!img.naturalWidth) return;
    try{
      const c2=document.createElement('canvas'); c2.width=c2.height=LG;
      const c=c2.getContext('2d'); c.drawImage(img,0,0,LG,LG);
      const d=c.getImageData(0,0,LG,LG).data; logoDots=[];
      for(let y=0;y<LG;y++)for(let x=0;x<LG;x++){
        const nx=(x+.5)/LG*2-1, ny=(y+.5)/LG*2-1, rr=Math.hypot(nx,ny); if(rr>1) continue;
        const i=(y*LG+x)*4; let r=d[i],g=d[i+1],b=d[i+2];
        const mx=Math.max(r,g,b), mn=Math.min(r,g,b), light=mx>225&&mn>205;
        if(light){r=g=b=235}
        else{const k=mx<170?170/Math.max(mx,1):1; r=Math.min(255,r*k|0); g=Math.min(255,g*k|0); b=Math.min(255,b*k|0)}
        logoDots.push({rr,a:Math.atan2(ny,nx),light,pr:pearl(r,g,b),x:0,y:0,e:0,sz:0});
      }
    }catch(e){logoDots=[]}
  }
  (function(){const im=document.getElementById('logo'); if(!im)return; if(im.complete) buildLogo(); else im.addEventListener('load',buildLogo)})();

  let vis=0; const logoImg=document.getElementById('logo');
  function drawLogo(t,cx,R){
    const Rl=R*1.3, half=Rl/LG, breathe=1+Math.sin(t*1.4)*.01+loud*.05;
    // silent -> crisp real logo; sound -> dissolves into pearl dots
    const target=Math.max(0,Math.min(1,(loud-.03)*9));
    vis+=(target-vis)*(target>vis?.12:.035);
    if(vis<.005) vis=0;
    if(logoImg&&logoImg.complete&&logoImg.naturalWidth&&vis<.98){
      ctx.globalCompositeOperation='source-over';
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cx,Rl*breathe,0,7); ctx.clip();
      ctx.globalAlpha=1-vis*.88;
      ctx.drawImage(logoImg,cx-Rl*breathe,cx-Rl*breathe,Rl*2*breathe,Rl*2*breathe);
      ctx.restore();
    }
    if(vis===0){ctx.globalAlpha=1;return}
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<logoDots.length;i++){
      const d=logoDots[i];
      const f=((d.a/(Math.PI*2))%1+1)%1, m=f<.5?f*2:(1-f)*2;
      const e=level[Math.min(BINS-1,Math.floor(m*BINS))];
      const rad=d.rr*Rl*breathe+e*d.rr*d.rr*Rl*.14;
      d.x=cx+Math.cos(d.a)*rad; d.y=cx+Math.sin(d.a)*rad; d.e=e;
      d.sz=half*(d.light?.5:1.15)*(1+e*.9);
      if(e>.06){
        const hue=((f*360+t*25+d.rr*60)%360+360)%360, hs=d.sz*(1.8+e*2.2);
        ctx.globalAlpha=Math.min(1,e*1.3)*vis;
        ctx.drawImage(sprites[Math.floor(hue/360*HUES)%HUES],d.x-hs,d.y-hs,hs*2,hs*2);
      }
    }
    ctx.globalCompositeOperation='source-over';
    for(let i=0;i<logoDots.length;i++){
      const d=logoDots[i];
      ctx.globalAlpha=(d.light?Math.min(.5,.2+d.e*.3):.96)*vis;
      ctx.drawImage(d.pr,d.x-d.sz,d.y-d.sz,d.sz*2,d.sz*2);
    }
    ctx.globalAlpha=1;
  }
  const bMode=document.getElementById('bMode');
  function setMode(logo){
    logoMode=logo; document.body.classList.toggle('logo',logo);
    bMode.textContent=logo?'ใช้ลูกบอล':'ใช้โลโก้';
    try{localStorage.setItem('orb_mode',logo?'logo':'orb')}catch(e){}
    resize();
  }
  bMode.onclick=()=>setMode(!logoMode);
  setMode(logoMode);

  function frame(ms){
    const t=ms/1000;
    readAudio(t);
    const W=cv.width, cx=W/2, R=W*.30; // base radius in px
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation='source-over';
    ctx.clearRect(0,0,W,W);
    ctx.globalCompositeOperation='lighter';

    // core glow that swells with sound
    const gr=R*(1.05+loud*1.6);
    const cg=ctx.createRadialGradient(cx,cx,0,cx,cx,gr);
    cg.addColorStop(0,`rgba(255,255,255,${.10+loud*.45})`);
    cg.addColorStop(.5,`hsla(${(t*30)%360},100%,60%,${.05+loud*.25})`);
    cg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(cx,cx,gr,0,7); ctx.fill();

    if(logoMode&&logoDots.length){drawLogo(t,cx,R);requestAnimationFrame(frame);return}
    const unit=R/RINGS, breathe=1+Math.sin(t*1.4)*.015+loud*.12;
    const spin=t*.12;
    for(let i=0;i<dots.length;i++){
      const d=dots[i];
      const a=d.a+spin*(1-d.ri*.6);
      const f=((d.a/(Math.PI*2))%1+1)%1;
      const m=f<.5?f*2:(1-f)*2;                // mirror so left/right match
      const e=level[Math.min(BINS-1,Math.floor(m*BINS))];
      const k=d.ri*d.ri;
      const rad=d.r*unit*breathe + e*k*R*.55;
      const x=cx+Math.cos(a)*rad, y=cx+Math.sin(a)*rad;
      const sz=unit*(1.5+e*3.2*(.3+k))+ (1-d.ri)*unit*.3;
      const hue=((f*360+t*25+d.ri*40)%360+360)%360;
      ctx.globalAlpha=Math.min(1,.5+e*.6);
      const s=sprites[Math.floor(hue/360*HUES)%HUES];
      ctx.drawImage(s,x-sz,y-sz,sz*2,sz*2);
    }
    ctx.globalAlpha=1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// Admin, settings, export
(function(){
  const $=id=>document.getElementById(id);
  const DEF={webhook:'',auth:'',lang:'th-TH',fields:[
    {key:'summary',desc:'สรุปใจความสำคัญไม่เกิน 3 ประโยค'},
    {key:'topics',desc:'หัวข้อหลักที่พูดถึง เป็นรายการ'},
    {key:'action_items',desc:'งานหรือสิ่งที่ต้องทำต่อ เป็นรายการ'},
    {key:'sentiment',desc:'อารมณ์โดยรวมของผู้พูด'}]};
  const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
  let cfg=Object.assign({},DEF);

  // ---------- routing + server login ----------
  let authed=false;
  async function loadCfg(){
    try{const r=await fetch('/api/config',{cache:'no-store'});const j=await r.json();cfg=Object.assign({},DEF,j.config||{})}catch(e){}
    if(typeof applyLang==='function') applyLang();
  }
  function route(){
    const h=location.hash.slice(1);
    $('login').classList.remove('show'); $('settings').classList.remove('show');
    if(h==='settings'&&!authed){location.hash='login';return}
    if(h==='login'){$('lTitle').textContent='เข้าสู่ระบบผู้ดูแล';$('lGo').textContent='เข้าสู่ระบบ';$('login').classList.add('show')}
    if(h==='settings'){renderSettings();$('settings').classList.add('show')}
    $('bOut').hidden=!authed;
  }
  window.addEventListener('hashchange',route);
  $('bSet').onclick=()=>{location.hash=authed?'settings':'login'};
  $('bOut').onclick=async()=>{try{await fetch('/api/logout',{method:'POST'})}catch(e){} authed=false;await loadCfg();location.hash='';route()};
  $('lBack').onclick=$('sBack').onclick=()=>{location.hash=''};
  $('lGo').onclick=async()=>{
    const u=$('lu').value.trim(), p=$('lp').value; $('lErr').textContent='';
    if(!u||!p){$('lErr').textContent='กรอกชื่อผู้ใช้และรหัสผ่าน';return}
    try{
      const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({u,p})});
      if(r.status===429){$('lErr').textContent='ลองบ่อยเกินไป รอสักครู่';return}
      if(r.status===500){$('lErr').textContent='เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าผู้ดูแล (ดู README)';return}
      if(!r.ok){$('lErr').textContent='ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';return}
      authed=true; $('lp').value=''; await loadCfg(); location.hash='settings'; route();
    }catch(e){$('lErr').textContent='เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'}
  };
  fetch('/api/me').then(r=>r.json()).then(j=>{authed=!!j.ok;route();if(authed)loadCfg()}).catch(()=>{});

  // ---------- settings ----------
  const MAXL=5; let links=[''];
  function renderLinks(){
    const box=$('sLinks'); box.innerHTML='';
    links.forEach((v,i)=>{
      const r=document.createElement('div'); r.className='lrow';
      const inp=document.createElement('input'); inp.value=v; inp.inputMode='url'; inp.placeholder='https://...'; inp.setAttribute('aria-label','ลิงก์ที่ '+(i+1));
      inp.oninput=()=>{links[i]=inp.value};
      const x=document.createElement('button'); x.textContent='ลบ'; x.setAttribute('aria-label','ลบลิงก์ที่ '+(i+1));
      x.onclick=()=>{links.splice(i,1); if(!links.length) links=['']; renderLinks()};
      r.append(inp,x); box.append(r);
    });
    $('sLinkAdd').disabled=links.length>=MAXL;
  }
  $('sLinkAdd').onclick=()=>{ if(links.length<MAXL){links.push(''); renderLinks(); const ins=$('sLinks').querySelectorAll('input'); ins[ins.length-1].focus()} };
  function renderSettings(){
    $('sWh').value=cfg.webhook; $('sAuth').value=cfg.auth; $('sLang').value=cfg.lang; links=(cfg.ghUrl||'').split(/[\s,]+/).filter(Boolean); if(!links.length) links=['']; renderLinks(); $('sRef').value=cfg.ref||'';
    const box=$('sFields'); box.innerHTML='';
    cfg.fields.forEach((f,i)=>{
      const r=document.createElement('div'); r.className='frow';
      const k=document.createElement('input'); k.value=f.key; k.placeholder='ชื่อฟิลด์'; k.setAttribute('aria-label','ชื่อฟิลด์');
      const d=document.createElement('input'); d.value=f.desc; d.placeholder='ให้ AI ดึงอะไร'; d.setAttribute('aria-label','คำอธิบายฟิลด์');
      const x=document.createElement('button'); x.textContent='ลบ';
      k.oninput=()=>cfg.fields[i].key=k.value; d.oninput=()=>cfg.fields[i].desc=d.value;
      x.onclick=()=>{cfg.fields.splice(i,1);renderSettings()};
      r.append(k,d,x); box.append(r);
    });
  }
  $('sAdd').onclick=()=>{cfg.fields.push({key:'',desc:''});renderSettings()};
  function readCfg(){
    cfg.webhook=$('sWh').value.trim(); cfg.auth=$('sAuth').value.trim(); cfg.lang=$('sLang').value; cfg.ghUrl=links.map(x=>x.trim()).filter(Boolean).slice(0,MAXL).join('\n'); cfg.ref=$('sRef').value.slice(0,12000);
    cfg.fields=cfg.fields.map(f=>({key:f.key.trim().replace(/\s+/g,'_'),desc:f.desc.trim()})).filter(f=>f.key);
  }
  async function save(){
    readCfg();
    const r=await fetch('/api/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json(); cfg=Object.assign({},DEF,j.config||{}); renderSettings(); applyLang();
  }
  $('sSave').onclick=async()=>{$('sMsg').textContent='กำลังบันทึก…';try{await save();$('sMsg').textContent='บันทึกแล้ว เก็บไว้บนเซิร์ฟเวอร์'}catch(e){$('sMsg').textContent='บันทึกไม่สำเร็จ ลองล็อกอินใหม่'}};
  $('sTest').onclick=async()=>{
    $('sMsg').textContent='กำลังบันทึกและส่งทดสอบ…';
    try{
      await save(); if(!cfg.webhook){$('sMsg').textContent='ใส่ Webhook URL ก่อน';return}
      const r=await fetch('/api/webhook-test',{method:'POST'}); const j=await r.json();
      $('sMsg').textContent=j.ok?'ส่งสำเร็จ (HTTP '+j.status+')':'ส่งไม่สำเร็จ: '+(j.error||'ปลายทางไม่ตอบ');
    }catch(e){$('sMsg').textContent='ส่งไม่สำเร็จ'}
  };

  // ---------- speech to text ----------
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition, ta=$('tr');
  let rec=null, want=false, finalText='';
  function applyLang(){ if(rec) rec.lang=cfg.lang }
  const SR_ERR={
    'not-allowed':'ไม่ได้รับอนุญาตให้ใช้ไมค์ '+HOWTO+' (ถ้าเปิดจากแอป LINE/Facebook ให้เปิดลิงก์ใน Chrome หรือ Safari แทน)',
    'service-not-allowed':'เบราว์เซอร์นี้ไม่อนุญาตให้ถอดเสียง ลองเปิดใน Chrome (Android) หรือ Safari (iPhone) และเปิดการสั่งงานด้วยเสียง/Dictation ในตั้งค่าเครื่อง',
    'audio-capture':'ไม่พบไมค์ หรือแอปอื่นกำลังใช้ไมค์อยู่ ปิดแอปที่ใช้ไมค์แล้วลองใหม่',
    'network':'ถอดเสียงต้องต่ออินเทอร์เน็ตตลอดเวลา ตรวจสัญญาณแล้วลองใหม่',
    'language-not-supported':'เบราว์เซอร์ไม่รองรับภาษานี้ ลองเปลี่ยนภาษาในหน้าตั้งค่า'
  };
  let fails=0;
  function startRec(){
    if(!SR){
      ta.placeholder='เบราว์เซอร์นี้ถอดเสียงอัตโนมัติไม่ได้ พิมพ์หรือวางข้อความเองได้';
      statusEl.textContent='เบราว์เซอร์นี้ถอดเสียงไม่ได้ (ลองใช้ Chrome บน Android หรือ Safari บน iPhone ไม่ใช่เบราว์เซอร์ในแอป LINE/Facebook) พิมพ์หรือวางข้อความเองได้';
      return;
    }
    want=true; fails=0; finalText=ta.value?ta.value.trim()+' ':'';
    rec=new SR(); rec.lang=cfg.lang; rec.interimResults=true;
    rec.continuous=!MOBILE; // มือถือ (โดยเฉพาะ Android) โหมดต่อเนื่องทำข้อความซ้ำ/ตัดเสียง จึงใช้ทีละประโยคแล้วเริ่มใหม่
    rec.onresult=e=>{
      fails=0; let it='';
      for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript; if(e.results[i].isFinal) finalText+=t+' '; else it+=t}
      ta.value=finalText+it; ta.scrollTop=ta.scrollHeight;
    };
    rec.onend=()=>{
      if(!want) return;
      if(++fails>25){want=false; statusEl.textContent='ถอดเสียงหยุดทำงาน กด “ปิดไมค์” แล้วเปิดใหม่ หรือพิมพ์/วางข้อความเอง'; return}
      setTimeout(()=>{ if(want){ try{rec.start()}catch(e){} } },MOBILE?200:0);
    };
    rec.onerror=ev=>{
      const msg=SR_ERR[ev.error];
      if(msg){ want=false; statusEl.textContent=msg; micBtn.classList.remove('on'); micBtn.textContent='เปิดไมค์'; mode='idle'; }
      // no-speech / aborted: ไม่ต้องแจ้ง ปล่อยให้เริ่มฟังใหม่เอง
    };
    try{rec.start()}catch(e){}
  }
  function stopRec(){want=false; if(rec){try{rec.stop()}catch(e){}} }

  // ---------- summarize + export ----------
  const fmtVal=v=>Array.isArray(v)?v.map(x=>'- '+x).join('\n'):String(v??'');
  const esc=t=>String(t).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function build(fmt,fields,text,at){
    const date=new Date(at).toLocaleString('th-TH');
    if(fmt==='json') return JSON.stringify({createdAt:at,fields,transcript:text},null,2);
    if(fmt==='csv'){const q=v=>'"'+fmtVal(v).replace(/"/g,'""')+'"';const ks=Object.keys(fields);return '\uFEFF'+['created_at',...ks,'transcript'].join(',')+'\n'+[q(at),...ks.map(k=>q(fields[k])),q(text)].join(',')}
    if(fmt==='html'){return '<!DOCTYPE html><html lang="th"><meta charset="utf-8"><title>สรุปคำพูด</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.7}h2{margin-top:1.6rem;color:#3b3bb0}pre{white-space:pre-wrap;font:inherit;background:#f4f5ff;padding:1rem;border-radius:8px}</style><h1>สรุปคำพูด</h1><p>'+esc(date)+'</p>'+Object.keys(fields).map(k=>'<h2>'+esc(k)+'</h2><pre>'+esc(fmtVal(fields[k]))+'</pre>').join('')+'<h2>ถอดเสียงเต็ม</h2><pre>'+esc(text)+'</pre></html>'}
    const md=fmt==='md';
    return (md?'# สรุปคำพูด\n\n':'สรุปคำพูด\n\n')+date+'\n\n'+Object.keys(fields).map(k=>(md?'## ':'[ ')+k+(md?'':' ]')+'\n'+fmtVal(fields[k])).join('\n\n')+'\n\n'+(md?'## ถอดเสียงเต็ม':'[ ถอดเสียงเต็ม ]')+'\n'+text+'\n';
  }
  function saveFile(name,data,fmt){
    const type={md:'text/markdown',txt:'text/plain',html:'text/html',json:'application/json',csv:'text/csv'}[fmt]||'text/plain';
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([data],{type:type+';charset=utf-8'})); a.download=name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  }
  $('bClear').onclick=()=>{
    if(!ta.value.trim()){$('exStatus').textContent='ไม่มีข้อความให้ลบ';return}
    if(!confirm('ลบข้อความทั้งหมดในกล่องนี้?')) return;
    ta.value=''; finalText=''; $('exStatus').textContent='ลบข้อความแล้ว'; ta.focus();
  };
  $('bExport').onclick=async()=>{
    const st=$('exStatus'), text=ta.value.trim(), fmt=$('fmt').value;
    if(!text){st.textContent='ยังไม่มีคำพูด เปิดไมค์ให้ AI ฟังก่อน หรือวางข้อความลงช่องด้านบน';return}
    st.textContent='AI กำลังสรุปตามกรอบที่ตั้งไว้…';
    const at=new Date().toISOString(); let fields={}, hook='skipped';
    try{
      const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
      if(r.status===429){st.textContent='ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่';return}
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j=await r.json(); fields=j.fields||{}; hook=j.webhook;
    }catch(e){st.textContent='สรุปไม่สำเร็จ ลองใหม่อีกครั้ง';return}
    const name='สรุปคำพูด-'+at.slice(0,16).replace(/[:T]/g,'-')+'.'+fmt;
    saveFile(name,build(fmt,fields,text,at),fmt);
    st.textContent='ดาวน์โหลดแล้ว: '+name+(hook==='sent'?' · ส่ง Webhook แล้ว':hook==='failed'?' · ส่ง Webhook ไม่สำเร็จ':'');
  };

  // ---------- GitHub reference ----------
  [['sWh','webhook'],['sAuth','auth'],['sLang','lang'],['sRef','ref']].forEach(([id,k])=>$(id).addEventListener('input',()=>{cfg[k]=$(id).value}));
  function parseGh(u){return /(^|[\s,])https?:\/\//.test(u)}
  async function loadGh(u){
    const r=await fetch('/api/github',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:u})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
    return j.text;
  }
  async function genFields(ref){
    const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'fields',ref})});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json(); const arr=j.fields||[]; if(!arr.length) throw new Error('empty');
    return arr;
  }
  $('sGhGo').onclick=async()=>{
    const m=$('sGhMsg'); readCfg(); const u=cfg.ghUrl;
    if(!parseGh(u)){m.textContent='ลิงก์ไม่ถูกต้อง ต้องขึ้นต้นด้วย https:// (ใส่ได้หลายลิงก์ คั่นด้วยบรรทัดใหม่)';return}
    m.textContent='กำลังดึงเนื้อหาจากลิงก์…';
    try{
      const t=await loadGh(u); if(t.replace(/###[^\n]*\n/g,'').trim().length<200) throw new Error('thin'); $('sRef').value=t; cfg.ref=t;
      m.textContent='ดึงแล้ว '+t.length+' ตัวอักษร กำลังให้ AI ร่างฟิลด์…';
      readCfg(); cfg.fields=await genFields(t); renderSettings();
      m.textContent='ดึงสคีมาและร่างฟิลด์ '+cfg.fields.length+' รายการแล้ว ตรวจและแก้ไข แล้วกดบันทึก';
    }catch(e){
      const c=e.message;
      m.textContent=c==='nofiles'?'ไม่พบไฟล์สคีมาในลิงก์ GitHub นี้ (รองรับ .sql .prisma .json .yml .md .csv) ชี้ไปที่ไฟล์โดยตรงได้'
        :c==='thin'?'ดึงได้แต่เนื้อหาน้อยมาก เว็บนี้อาจโหลดข้อมูลด้วย JavaScript หรือต้องค้นก่อน ลองลิงก์หน้าตัวบท/คำพิพากษาโดยตรง หรือคัดลอกเนื้อหามาวางในช่องด้านล่าง'
        :c==='blocked'?'ลิงก์นี้ชี้ไปเครือข่ายภายใน ไม่อนุญาต'
        :c==='unsupported'?'ลิงก์นี้เป็นไฟล์ (PDF/รูป/zip) ยังอ่านไม่ได้ ลองลิงก์หน้าเว็บแทน'
        :c.startsWith('http_')?'เว็บปลายทางปฏิเสธการเข้าถึง ('+c.slice(5)+') ลองวางเนื้อหาเองในช่องด้านล่าง'
        :c==='not_found'?'ไม่พบ repo หรือไฟล์นี้ ถ้าเป็น private ให้ตั้ง GITHUB_TOKEN ใน Environment Variables'
        :c==='unauthorized'?'หมดเวลาล็อกอิน ล็อกอินใหม่อีกครั้ง'
        :(c==='empty'||c.startsWith('HTTP'))?'ดึงสคีมาได้แล้ว แต่ร่างฟิลด์อัตโนมัติไม่สำเร็จ กดปุ่ม “ให้ AI ร่างฟิลด์” อีกครั้ง'
        :'ดึงจาก GitHub ไม่ได้ วางเนื้อหาไฟล์ลงช่องด้านล่างแทนได้';
    }
  };
  $('sGen').onclick=async()=>{
    const m=$('sGhMsg'), ref=$('sRef').value.trim();
    if(!ref){m.textContent='ยังไม่มีเนื้อหาฐานข้อมูล ดึงจากลิงก์หรือวางเองก่อน';return}
    m.textContent='AI กำลังอ่านฐานข้อมูลและร่างฟิลด์…';
    try{
      const arr=await genFields(ref); cfg.fields=arr; renderSettings(); m.textContent='ร่างฟิลด์ '+arr.length+' รายการแล้ว ตรวจและแก้ไขก่อนกดบันทึก';
    }catch(e){m.textContent='ร่างฟิลด์อัตโนมัติไม่ได้ ลองอีกครั้ง หรือเพิ่มฟิลด์เอง'}
  };

  // toggle text box (transcript keeps recording while hidden)
  function showTx(on){
    $('export').hidden=!on; $('bTx').textContent=on?'ซ่อนข้อความ':'แสดงข้อความ';
    $('bTx').setAttribute('aria-expanded',on?'true':'false'); ls.set('orb_tx',on?'1':'0');
  }
  $('bTx').onclick=()=>showTx($('export').hidden);
  showTx(ls.get('orb_tx')!=='0');
  route();
})();
