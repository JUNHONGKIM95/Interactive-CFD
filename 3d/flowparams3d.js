(function(root){
  const FlowParams3D={
    minSpeed:.005,maxSpeed:125,
    fromSlider(value){return .005*Math.pow(125/.005,value/1000);},
    toSlider(speed){return 1000*Math.log(speed/.005)/Math.log(125/.005);},
    lattice(speed,nu,dx){
      if(!(speed>=.005&&speed<=125&&nu>=.02&&nu<=.1&&dx>0))throw new Error('유동 설정 범위를 확인하세요.');
      // Keep the inlet lattice Mach number below 0.104 without changing Re.
      const dt=Math.min(dx*dx,.06*dx/speed);
      return {u:speed*dt/dx,nu:nu*dt/(dx*dx),dt,mach:speed*dt/dx*Math.sqrt(3)};
    },
    speedForRe(re,nu,diameter){if(!(re>=1&&re<=5000&&diameter>0))throw new Error('Re는 1–5000, 기준 길이는 양수여야 합니다.');return re*nu/diameter;}
  };root.FlowParams3D=FlowParams3D;if(typeof module!=='undefined')module.exports=FlowParams3D;
})(typeof window==='undefined'?globalThis:window);
