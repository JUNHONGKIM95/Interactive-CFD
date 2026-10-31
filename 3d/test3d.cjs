const assert=require('node:assert/strict');
const Solver=require('./solver3d.js');
function run(s,n,label){for(let i=0;i<n;i++)assert.ok(s.step(),`${label}: unstable at ${i}`);for(let p=0;p<s.n;p++){assert.ok(Number.isFinite(s.ux[p])&&Number.isFinite(s.uy[p])&&Number.isFinite(s.uz[p]));assert.ok(Number.isFinite(s.rho[p]));}console.log(`PASS ${label} (${n} steps)`);}
const s=new Solver(48,24,24);
assert.ok(Math.abs(s.weights.reduce((a,b)=>a+b,0)-1)<1e-12);
for(let i=0;i<19;i++)for(let j=0;j<3;j++)assert.equal(s.c[i][j]+s.c[s.opp[i]][j],0);
run(s,5,'equilibrium');assert.ok(Math.abs(s.ux[s.index(24,12,12)]-s.u)<1e-6);
const sphere={id:1,type:'sphere',x:16,y:12,z:12,w:8,h:8,d:8};
s.setObjects([sphere]);s.reset();run(s,650,'sphere');
assert.equal(s.ux[s.index(16,12,12)],0,'solid velocity is zero');
assert.ok(s.ux[s.index(22,12,12)]<s.u*.8,'slower wake behind sphere');
assert.ok(Math.abs(s.uy[s.index(16,18,12)])>.0001,'nonzero Y flow around sphere');
assert.ok(Math.abs(s.uz[s.index(16,12,18)])>.0001,'nonzero Z flow around sphere');
assert.ok(Math.abs(s.uy[s.index(16,18,12)]-s.uz[s.index(16,12,18)])<1e-5,'Y/Z symmetry');
s.setObjects([{type:'box',x:29,y:11,z:10,w:8,h:10,d:6}]);run(s,400,'moved/resized box');
assert.equal(s.solid[s.index(29,11,10)],1);assert.equal(s.solid[s.index(16,12,12)],0);
s.setObjects([]);run(s,250,'all obstacles removed');
for(const [u,nu] of [[.025,.1],[.08,.02]]){s.u=u;s.nu=nu;s.setObjects([sphere]);s.reset();run(s,450,`u=${u}, nu=${nu}`);}
const full=new Solver();full.setObjects([{...sphere,x:24,y:16,z:16,w:10,h:10,d:10}]);full.reset();const start=performance.now();run(full,150,'default 72×32×32 grid');console.log(`Default grid: ${((performance.now()-start)/150).toFixed(1)} ms/step`);
console.log('All 3D numerical checks passed. These checks are not quantitative CFD validation.');
