const assert=require('node:assert/strict'),Solver=require('./solver3d.js'),P=require('./flowparams3d.js');
for(const dx of [1,.75,.5])for(const re of [100,1000,5000]){const speed=P.speedForRe(re,.025,10),p=P.lattice(speed,.025,dx);assert.ok(p.u<=.060000001);assert.ok(Math.abs(p.u*(10/dx)/p.nu-re)<1e-8);assert.ok(Math.abs(P.fromSlider(P.toSlider(speed))-speed)<1e-8);}
for(const type of ['sphere','box']){
  const s=new Solver(64,32,32);s.regularized=true;s.u=.06;s.nu=.06*10/5000;s.setObjects([{type,x:20,y:16,z:16,w:10,h:10,d:10}]);s.reset();
  const start=performance.now();for(let i=0;i<1800;i++){assert.ok(s.step(),`${type} Re5000 unstable at ${i}`);if(i%600===599)console.log(`${type}: ${i+1} steps passed`);}
  for(let p=0;p<s.n;p++)assert.ok(Number.isFinite(s.ux[p])&&Number.isFinite(s.uy[p])&&Number.isFinite(s.uz[p]));
  assert.ok(s.ux[s.index(27,16,16)]<s.u,'wake remains slower');
  console.log(`PASS ${type} Re5000: ${((performance.now()-start)/1800).toFixed(1)} ms/step`);
}
const defaultGrid=new Solver(161,65,65),params=P.lattice(12.5,.025,.75);defaultGrid.regularized=true;defaultGrid.u=params.u;defaultGrid.nu=params.nu;
defaultGrid.setObjects([{type:'sphere',x:40,y:32,z:32,w:10/.75,h:10/.75,d:10/.75}]);defaultGrid.reset();
for(let i=0;i<120;i++)assert.ok(defaultGrid.step(),`default mesh Re5000 unstable at ${i}`);
console.log('PASS default 680,225-cell grid Re5000 (120 steps)');
console.log('PASS Re conversion, inlet Mach bound, regularized SGS sphere/box finite-time stability. Not turbulence validation.');
