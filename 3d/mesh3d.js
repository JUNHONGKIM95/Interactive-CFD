/* User-space dimensions stay fixed when the computational mesh is refined. */
(function(root){
  const Mesh3D={
    plan(lengths,dx){
      if(![1,.75,.5].includes(dx))throw new Error('격자 간격은 1, 0.75, 0.5 중에서 선택하세요.');
      const min=[72,30,30],max=[240,96,96];
      if(lengths.length!==3||lengths.some((v,i)=>!Number.isFinite(v)||v<min[i]||v>max[i]))throw new Error('도메인 범위: X 72–240, Y/Z 30–96 u.');
      const dims=lengths.map(v=>Math.round(v/dx)+1),cells=dims.reduce((a,b)=>a*b,1);
      if(cells>2500000)throw new Error(`선택한 격자는 ${cells.toLocaleString()}개입니다. 최대 250만 개 이내로 도메인을 줄이거나 Δx를 늘려 주세요.`);
      return {dx,dims,lengths:dims.map(n=>(n-1)*dx),cells,dt:dx*dx,memoryMB:Math.ceil(cells*215/1048576)};
    },
    rescale(objects,oldDx,newDx){return objects.map(o=>{const copy={...o};for(const k of ['x','y','z','w','h','d'])copy[k]*=oldDx/newDx;return copy;});}
  };
  root.Mesh3D=Mesh3D;if(typeof module!=='undefined')module.exports=Mesh3D;
})(typeof window==='undefined'?globalThis:window);
