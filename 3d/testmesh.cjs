const assert=require('node:assert/strict'),Mesh=require('./mesh3d.js'),Solver=require('./solver3d.js');
const base={type:'sphere',x:30,y:24,z:24,w:10,h:10,d:10};
assert.throws(()=>Mesh.plan([240,96,96],.5),/250/);
assert.throws(()=>Mesh.plan([NaN,48,48],.75));
assert.throws(()=>Mesh.plan([120,48,48],0));
for(const dx of [1,.75,.5]){
  const plan=Mesh.plan([120,48,48],dx),o=Mesh.rescale([base],1,dx)[0];
  for(const key of ['x','y','z','w','h','d'])assert.ok(Math.abs(o[key]*dx-base[key])<1e-10);
  assert.ok(Math.abs((.06*dx)*o.w/.025-24)<1e-10,'Re must remain unchanged');
  const sim=new Solver(...plan.dims);sim.u=.06*dx;sim.nu=.025;sim.setObjects([o]);sim.reset();
  const start=performance.now();for(let i=0;i<30;i++)assert.ok(sim.step(),`dx=${dx}, step=${i}`);
  assert.equal(sim.solid[sim.index(Math.round(o.x),Math.round(o.y),Math.round(o.z))],1);
  console.log(`PASS dx=${dx}: ${plan.dims.join('×')}, ${plan.cells} cells, ${((performance.now()-start)/30).toFixed(1)} ms/step`);
}
const roundTrip=Mesh.rescale(Mesh.rescale([base],1,.5),.5,1)[0];assert.deepEqual(roundTrip,base);
console.log('PASS mesh limits, physical geometry preservation, Re invariance, refinement and coarsening');
