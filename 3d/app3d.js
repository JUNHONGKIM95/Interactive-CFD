'use strict';
const $=id=>document.getElementById(id);
let mesh=Mesh3D.plan([120,48,48],.75),dims=mesh.dims;
const renderer=new VolumeRenderer($('scene'),dims);
let objects=Mesh3D.rescale([{id:1,type:'sphere',x:30,y:24,z:24,w:10,h:10,d:10}],1,mesh.dx),selected=1,nextId=2;
let field=null,paused=false,busy=false,worker=null,revision=0,pendingGeometry=true,resetPending=false,completedSteps=0,lastSteps=0;
let particles=[],drag=null,lastTime=performance.now(),frames=0,rateStart=performance.now(),rateSteps=0,solverRate=0,noticeTimer;
let settings={u:.06,nu:.025},lastCompute=0,physicalTime=0;
function flow(){return FlowParams3D.lattice(settings.u,settings.nu,mesh.dx);}
function notice(text,temporary=true){$('notice').textContent=text;$('notice').hidden=false;clearTimeout(noticeTimer);if(temporary)noticeTimer=setTimeout(()=>$('notice').hidden=true,7000);}
function chosen(){return objects.find(o=>o.id===selected);}
function constrain(o){const min=4/mesh.dx,max=Math.min(24/mesh.dx,dims[1]-8,dims[2]-8);o.w=Math.max(min,Math.min(max,o.w));o.h=o.type==='sphere'?o.w:Math.max(min,Math.min(max,o.h));o.d=o.type==='sphere'?o.w:Math.max(min,Math.min(max,o.d));for(const [i,key,size] of [[0,'x','w'],[1,'y','h'],[2,'z','d']])o[key]=Math.max(o[size]/2+3,Math.min(dims[i]-4-o[size]/2,o[key]));}
function sync(){const o=chosen();$('objects').replaceChildren(...objects.map(ob=>{const option=document.createElement('option');option.value=ob.id;option.textContent=`${ob.type==='sphere'?'구':'직육면체'} ${ob.id}`;option.selected=ob.id===selected;return option;}));$('objectControls').hidden=!o;if(o){$('wLabel').textContent=o.type==='sphere'?'지름':'너비 X';$('boxDimensions').hidden=o.type==='sphere';for(const key of ['w','h','d','x','y','z']){$('obj'+key.toUpperCase()).value=o[key]*mesh.dx;$(key+'Val').textContent=(o[key]*mesh.dx).toFixed(1)+' u';}}$('speedVal').textContent=settings.u.toFixed(3)+' u/t';$('speed').value=FlowParams3D.toSlider(settings.u);$('speedInput').value=Number(settings.u.toPrecision(8));$('nuVal').textContent=settings.nu.toFixed(3)+' u²/t';const re=o?settings.u*Math.max(o.h,o.d)*mesh.dx/settings.nu:0;$('re').textContent=o?Math.round(re):'—';$('applyRe').disabled=!o;const p=flow();$('flowInfo').textContent=`범위 0.005–125 u/t · SGS 모델 적용 · 유입 Ma ${p.mach.toFixed(3)}${o?' · 기준 길이 '+Math.max(o.h,o.d).toFixed(1)+' 격자':''}${re>5000?' · Re 5000 초과: 미검증 범위':''}`;}
function updateMeshControls(){
  for(const [i,k] of ['X','Y','Z'].entries()){$('obj'+k).max=mesh.lengths[i];$('domain'+k).value=mesh.lengths[i];}
  for(const k of ['W','H','D']){$('obj'+k).max=24;$('obj'+k).step=.5;}
  $('grid').textContent=`${dims.join(' × ')} · Δx ${mesh.dx}`;
  document.querySelector('footer > span').textContent=`D3Q19 / REGULARIZED SGS · ${mesh.cells.toLocaleString()} CELLS · CPU WORKER`;
  sliceChanged();sync();estimateMesh();
}
function estimateMesh(){try{const plan=Mesh3D.plan(['X','Y','Z'].map(k=>+$('domain'+k).value),+$('meshDx').value);$('meshEstimate').textContent=`${plan.dims.join(' × ')} / ${plan.cells.toLocaleString()}개\n적용 길이 ${plan.lengths.join(' × ')} u\n메모리 약 ${plan.memoryMB} MB + 브라우저`;$('applyMesh').disabled=false;}catch(e){$('meshEstimate').textContent=e.message;$('applyMesh').disabled=true;}}
for(const id of ['domainX','domainY','domainZ','meshDx'])$(id).oninput=estimateMesh;
$('applyMesh').onclick=()=>{
  let next;try{next=Mesh3D.plan(['X','Y','Z'].map(k=>+$('domain'+k).value),+$('meshDx').value);}catch(e){notice(e.message);return;}
  worker?.terminate();worker=null;busy=false;drag=null;
  objects=Mesh3D.rescale(objects,mesh.dx,next.dx);mesh=next;dims=mesh.dims;renderer.dims=dims;objects.forEach(constrain);
  field=null;particles=[];revision++;pendingGeometry=true;resetPending=false;physicalTime=completedSteps=lastSteps=rateSteps=0;rateStart=performance.now();
  updateMeshControls();$('state').textContent='● 격자 생성 중';createWorker();
  notice(`${mesh.lengths.join(' × ')} u / Δx ${mesh.dx} / ${mesh.cells.toLocaleString()}개 격자 적용. 유동을 초기화했습니다.`);
};
function edited(){objects.forEach(constrain);pendingGeometry=true;revision++;particles=[];sync();requestCompute();}
function workerMain(){
  let sim,time=0;
  self.onmessage=({data:m})=>{
    try {
      if(m.type==='init')sim=new FlowSolver3D(...m.dims);
      sim.u=m.u;sim.nu=m.nu;sim.regularized=true;
      if(m.objects)sim.setObjects(m.objects);
      if(m.reset||m.type==='init'){sim.reset();time=0;}
      let unstable=false;const start=performance.now();
      for(let i=0;i<m.steps;i++){if(!sim.step()){sim.reset();time=0;unstable=true;break;}time+=m.dt;}
      const ux=sim.ux.slice(),uy=sim.uy.slice(),uz=sim.uz.slice(),solid=sim.solid.slice();
      self.postMessage({type:'field',ux,uy,uz,solid,t:sim.t,time,u:m.u,dt:m.dt,revision:m.revision,unstable,ms:performance.now()-start},[ux.buffer,uy.buffer,uz.buffer,solid.buffer]);
    }catch(error){self.postMessage({type:'error',message:error.message});}
  };
}
function createWorker(){
  try {
    const blob=new Blob([`const FlowSolver3D=${FlowSolver3D.toString()};(${workerMain.toString()})();`],{type:'text/javascript'}),url=URL.createObjectURL(blob);
    worker=new Worker(url);URL.revokeObjectURL(url);
    worker.onerror=e=>{worker?.terminate();worker=null;paused=true;busy=false;$('pause').textContent='▶ 재생';$('state').textContent='● 오류';notice('계산 스레드 오류입니다. 격자 간격을 늘리고 다시 적용해 주세요. '+e.message,false);};
    worker.onmessage=({data:m})=>{
      busy=false;
      if(m.type==='error'){worker?.terminate();worker=null;paused=true;$('pause').textContent='▶ 재생';$('state').textContent='● 오류';notice('계산 오류: '+m.message+' 격자 수를 줄이고 다시 적용해 주세요.',false);return;}
      // Ignore stale geometry snapshots when a drag/resize has already superseded them.
      if(m.revision===revision){field=m;physicalTime=m.time;const delta=Math.max(0,m.t-lastSteps);completedSteps=m.t;lastSteps=m.t;lastCompute=m.ms;rateSteps+=delta;if(!paused)advanceParticles(Math.min(delta,12));}
      if(m.unstable&&m.revision===revision){particles=[];paused=true;$('pause').textContent='▶ 재생';notice('수치 불안정: 유동을 초기화하고 정지했습니다. Re를 낮추거나 격자를 세분화한 후 재생하세요.',false);lastSteps=0;}
      $('state').textContent=paused?'● PAUSED':'● LIVE 3D';
    };
    busy=true;worker.postMessage({type:'init',dims,...flow(),objects,steps:0,revision});pendingGeometry=false;
  }catch(e){notice('이 브라우저는 계산용 Web Worker를 시작하지 못했습니다. Edge 또는 Chrome에서 실행해 주세요. '+e.message,false);}
}
function requestCompute(){
  if(!worker||busy||paused&&!pendingGeometry&&!resetPending)return;
  const m={type:'step',...flow(),steps:paused?0:+$('steps').value,revision};
  if(pendingGeometry){m.objects=objects;pendingGeometry=false;}
  if(resetPending){m.reset=true;resetPending=false;physicalTime=lastSteps=completedSteps=0;}
  busy=true;worker.postMessage(m);
}
function sample(p){
  const [nx,ny,nz]=dims;if(!field||p[0]<1||p[0]>=nx-2||p[1]<1||p[1]>=ny-2||p[2]<1||p[2]>=nz-2)return null;
  const base=p.map(Math.floor),f=p.map((v,i)=>v-base[i]),velocity=[0,0,0];
  const nearest=(Math.round(p[2])*ny+Math.round(p[1]))*nx+Math.round(p[0]);if(field.solid[nearest])return null;
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++) {
    const q=((base[2]+z)*ny+base[1]+y)*nx+base[0]+x,weight=(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);
    velocity[0]+=field.ux[q]*weight;velocity[1]+=field.uy[q]*weight;velocity[2]+=field.uz[q]*weight;
  }return velocity;
}
function spawn(initial=false){const p=[initial?2+Math.random()*(dims[0]-5):2+Math.random()*2,2+Math.random()*(dims[1]-5),2+Math.random()*(dims[2]-5)];return {pos:p,history:[p.slice()],speed:field?.u||flow().u,age:0};}
function advanceParticles(dt){
  if(!$('particles').checked)return;
  if(!particles.length)particles=Array.from({length:950},()=>spawn(true));
  for(let i=0;i<particles.length;i++) {
    const p=particles[i],v=sample(p.pos);
    if(!v||p.age>3*dims[0]/(field?.u||flow().u)){particles[i]=spawn();continue;}
    // Midpoint integration in actual lattice time; visuals never accelerate the solver.
    const mid=p.pos.map((x,k)=>x+v[k]*dt/2),v2=sample(mid)||v;
    p.pos=p.pos.map((x,k)=>x+v2[k]*dt);p.age+=dt;p.speed=Math.hypot(...v2);
    if(!sample(p.pos)){particles[i]=spawn();continue;}
    p.history.push(p.pos.slice());if(p.history.length>5)p.history.shift();
  }
}
for(const key of ['w','h','d','x','y','z'])$('obj'+key.toUpperCase()).oninput=e=>{const o=chosen();if(o){o[key]=+e.target.value/mesh.dx;edited();}};
$('objects').onchange=e=>{selected=+e.target.value;sync();};
for(const [id,type] of [['addSphere','sphere'],['addBox','box']])$(id).onclick=()=>{if(objects.length>=8){notice('장애물은 최대 8개까지 추가할 수 있습니다.');return;}const o={id:nextId++,type,x:dims[0]*.4+objects.length*3/mesh.dx,y:dims[1]/2,z:dims[2]/2,w:8/mesh.dx,h:(type==='sphere'?8:12)/mesh.dx,d:8/mesh.dx};objects.push(o);selected=o.id;edited();};
$('remove').onclick=()=>{objects=objects.filter(o=>o.id!==selected);selected=objects[0]?.id;edited();};
function changeFlow(){resetPending=true;particles=[];revision++;sync();requestCompute();}
$('speed').oninput=e=>{settings.u=FlowParams3D.fromSlider(+e.target.value);changeFlow();};
function applySpeed(){const u=+$('speedInput').value;if(!Number.isFinite(u)||u<.005||u>125){notice('유입 속도는 0.005–125 u/t 범위로 입력하세요.');sync();return;}settings.u=u;changeFlow();}
$('applySpeed').onclick=applySpeed;
$('speedInput').onkeydown=e=>{if(e.key==='Enter')applySpeed();};
$('nu').oninput=e=>{settings.nu=+e.target.value;changeFlow();};
$('applyRe').onclick=()=>{const o=chosen();if(!o)return;try{const u=FlowParams3D.speedForRe(+$('targetRe').value,settings.nu,Math.max(o.h,o.d)*mesh.dx);if(u<.005||u>125)throw new Error('이 Re는 현재 속도 범위 밖입니다. 기준 길이 또는 점성을 조절하세요.');settings.u=u;changeFlow();notice(`Re ${$('targetRe').value} → 유입 속도 ${u.toFixed(3)} u/t. 유동을 초기화했습니다.`);}catch(e){notice(e.message);}};
$('steps').oninput=e=>$('stepsVal').textContent=e.target.value+' step/update';
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'▶ 재생':'Ⅱ 일시정지';$('state').textContent=paused?'● PAUSED':'● LIVE 3D';};
$('reset').onclick=()=>{resetPending=true;particles=[];revision++;requestCompute();};
function sliceChanged(){const type=$('slice').value,axis=type==='yz'?0:type==='xz'?1:2;$('sliceControl').hidden=type==='none';$('slicePos').max=dims[axis]-2;$('slicePos').value=Math.floor(dims[axis]/2);sliceLabel();}
function sliceLabel(){const type=$('slice').value;$('sliceVal').textContent=`${type==='yz'?'X':type==='xz'?'Y':'Z'} = ${(+$('slicePos').value*mesh.dx).toFixed(2)} u`;}
$('slice').onchange=sliceChanged;$('slicePos').oninput=sliceLabel;
function view(yaw,pitch,plane){renderer.yaw=yaw;renderer.pitch=pitch;renderer.zoom=1;if(plane)$('dragPlane').value=plane;}
$('perspective').onclick=$('home').onclick=()=>view(.48,.42,'xy');$('front').onclick=()=>view(0,0,'xy');$('top').onclick=()=>view(0,Math.PI/2,'xz');$('side').onclick=()=>view(Math.PI/2,0,'yz');
const canvas=$('scene');
function pointer(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
canvas.onpointerdown=e=>{
  if(e.button!==0)return;const [x,y]=pointer(e),o=renderer.pick(x,y,objects);
  canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';
  if(o){selected=o.id;sync();const plane=$('dragPlane').value,axis=plane==='xy'?2:plane==='xz'?1:0,center=[o.x,o.y,o.z],p=renderer.planePoint(x,y,axis,center[axis]);
    if(!p){notice('현재 시점에서는 선택 평면이 옆면으로 보입니다. 이동 평면을 바꾸거나 시점을 회전해 주세요.');return;}
    drag={type:'object',axis,value:center[axis],start:p,center,id:o.id};
  }else drag={type:'camera',x,y,yaw:renderer.yaw,pitch:renderer.pitch};
};
canvas.onpointermove=e=>{if(!drag)return;const [x,y]=pointer(e);if(drag.type==='camera'){renderer.yaw=drag.yaw+(x-drag.x)*.007;renderer.pitch=Math.max(-1.55,Math.min(1.55,drag.pitch+(y-drag.y)*.007));}else{const p=renderer.planePoint(x,y,drag.axis,drag.value),o=objects.find(o=>o.id===drag.id);if(p&&o){[o.x,o.y,o.z]=drag.center.map((v,i)=>v+p[i]-drag.start[i]);edited();}}};
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{drag=null;canvas.style.cursor='grab';};
canvas.addEventListener('wheel',e=>{e.preventDefault();renderer.zoom=Math.max(.55,Math.min(2.2,renderer.zoom*Math.exp(-e.deltaY*.001)));},{passive:false});
function frame(now){
  requestCompute();renderer.draw({objects,selected,field,slice:$('slice').value,slicePos:+$('slicePos').value,particles,showParticles:$('particles').checked,showGrid:$('gridLines').checked,u:field?.u||flow().u});
  frames++;if(now-lastTime>1000){const fps=Math.round(frames*1000/(now-lastTime));solverRate=Math.round(rateSteps*1000/(now-rateStart));$('stats').textContent=`${fps} FPS · ${solverRate} step/s · t=${physicalTime.toFixed(3)}`;frames=0;rateSteps=0;rateStart=now;lastTime=now;}
  requestAnimationFrame(frame);
}
window.addEventListener('pagehide',()=>worker?.terminate());
updateMeshControls();createWorker();requestAnimationFrame(frame);
