/* D2Q9 BGK, lattice units: dx=dt=rho0=1. */
(function(root){
class FlowSolver {
 constructor(w=320,h=160){this.w=w;this.h=h;this.n=w*h;this.cx=[0,1,0,-1,0,1,-1,-1,1];this.cy=[0,0,1,0,-1,1,1,-1,-1];this.opp=[0,3,4,1,2,7,8,5,6];this.weights=[4/9,1/9,1/9,1/9,1/9,1/36,1/36,1/36,1/36];this.f=new Float32Array(this.n*9);this.g=new Float32Array(this.n*9);this.ux=new Float32Array(this.n);this.uy=new Float32Array(this.n);this.rho=new Float32Array(this.n);this.solid=new Uint8Array(this.n);this.u=.065;this.nu=.025;this.t=0;this.reset();}
 equilibrium(i,r,u,v){let cu=this.cx[i]*u+this.cy[i]*v;return this.weights[i]*r*(1+3*cu+4.5*cu*cu-1.5*(u*u+v*v));}
 initCell(p,u=this.u,v=0,r=1){this.ux[p]=u;this.uy[p]=v;this.rho[p]=r;for(let k=0;k<9;k++)this.f[k*this.n+p]=this.equilibrium(k,r,u,v);}
 reset(){for(let p=0;p<this.n;p++)this.initCell(p,this.solid[p]?0:this.u);this.t=0;}
 setObjects(objects){const prev=this.solid.slice(),w=this.w,h=this.h;this.solid.fill(0);for(let x=0;x<w;x++){this.solid[x]=1;this.solid[(h-1)*w+x]=1;}for(const o of objects){for(let y=Math.max(1,Math.floor(o.y-o.h/2));y<=Math.min(h-2,Math.ceil(o.y+o.h/2));y++)for(let x=Math.max(1,Math.floor(o.x-o.w/2));x<=Math.min(w-2,Math.ceil(o.x+o.w/2));x++){if(o.type==='rect'||((x-o.x)**2+(y-o.y)**2<=o.w*o.w/4))this.solid[y*w+x]=1;}}for(let p=0;p<this.n;p++)if(prev[p]!==this.solid[p])this.initCell(p,this.solid[p]?0:this.u);}
 step(){const {w,h,n,f,g,solid,cx,cy,opp,weights,ux,uy,rho}=this,omega=1/(3*this.nu+.5);let valid=true;
 // Collide, then stream; halfway bounce-back on stationary solid links.
 for(let y=1;y<h-1;y++)for(let x=0;x<w;x++){const p=y*w+x;if(solid[p])continue;let r=0,u=0,v=0;for(let k=0;k<9;k++){let a=f[k*n+p];r+=a;u+=a*cx[k];v+=a*cy[k];}u/=r;v/=r;if(!Number.isFinite(r)||r<.3||r>3||u*u+v*v>.25){valid=false;continue;}rho[p]=r;ux[p]=u;uy[p]=v;let usq=1.5*(u*u+v*v);for(let k=0;k<9;k++){const cu=cx[k]*u+cy[k]*v,a=f[k*n+p]*(1-omega)+omega*weights[k]*r*(1+3*cu+4.5*cu*cu-usq),xx=x+cx[k],yy=y+cy[k];if(xx<0||xx>=w)continue;const q=yy*w+xx;if(solid[q])g[opp[k]*n+p]=a;else g[k*n+q]=a;}}
 // Zou/He velocity inlet; zero-gradient populations at outlet.
 for(let y=1;y<h-1;y++){let p=y*w,u=this.u;let r=(g[p]+g[2*n+p]+g[4*n+p]+2*(g[3*n+p]+g[6*n+p]+g[7*n+p]))/(1-u);g[n+p]=g[3*n+p]+2*r*u/3;g[5*n+p]=g[7*n+p]+(g[4*n+p]-g[2*n+p])/2+r*u/6;g[8*n+p]=g[6*n+p]+(g[2*n+p]-g[4*n+p])/2+r*u/6;p+=w-1;for(let k=0;k<9;k++)g[k*n+p]=g[k*n+p-1];}
 this.f=g;this.g=f;this.t++;return valid;
 }
}
root.FlowSolver=FlowSolver;if(typeof module!=='undefined')module.exports=FlowSolver;
})(typeof window!=='undefined'?window:globalThis);
