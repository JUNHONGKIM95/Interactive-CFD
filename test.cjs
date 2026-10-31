const assert=require('node:assert/strict');
const FlowSolver=require('./solver.js');
function run(s,n){for(let i=0;i<n;i++)assert.ok(s.step(),`unstable at step ${i}`);for(let p=0;p<s.n;p++){assert.ok(Number.isFinite(s.ux[p]));assert.ok(Number.isFinite(s.rho[p]));}}
const uniform=new FlowSolver(100,50);uniform.setObjects([]);uniform.reset();run(uniform,10);assert.ok(Math.abs(uniform.ux[25*100+50]-.065)<1e-5,'interior uniform equilibrium preserved before wall disturbance arrives');
const s=new FlowSolver();let obs=[{type:'circle',x:90,y:80,w:28,h:28}];s.setObjects(obs);s.reset();run(s,1600);assert.equal(s.ux[80*s.w+90],0);assert.ok(s.ux[80*s.w+115]<s.u*.8,'wake slows behind cylinder');
obs=[{type:'rect',x:140,y:65,w:35,h:48},{type:'circle',x:80,y:110,w:20,h:20}];s.setObjects(obs);run(s,1200);assert.equal(s.solid[65*s.w+140],1);assert.equal(s.solid[80*s.w+90],0);
s.setObjects([]);run(s,500);
for(const [u,nu] of [[.025,.12],[.09,.015]]){s.u=u;s.nu=nu;s.setObjects([{type:'circle',x:90,y:80,w:28,h:28}]);s.reset();run(s,1200);}
console.log('PASS: equilibrium, wake, obstacle edits/removal, parameter extremes, finite fields');
