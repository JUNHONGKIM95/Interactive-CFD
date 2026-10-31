/* D3Q19 BGK lattice Boltzmann solver. dx=dt=rho0=1. No dependencies. */
(function (root) {
  class FlowSolver3D {
    constructor(nx=72, ny=32, nz=32) {
      this.nx=nx; this.ny=ny; this.nz=nz; this.n=nx*ny*nz;
      this.c=[[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
        [1,1,0],[-1,-1,0],[1,-1,0],[-1,1,0],[1,0,1],[-1,0,-1],[1,0,-1],[-1,0,1],
        [0,1,1],[0,-1,-1],[0,1,-1],[0,-1,1]];
      this.opp=[0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15,18,17];
      this.weights=this.c.map((_,k)=>k===0?1/3:k<7?1/18:1/36);
      this.f=new Float32Array(19*this.n); this.g=new Float32Array(19*this.n);
      this.ux=new Float32Array(this.n); this.uy=new Float32Array(this.n); this.uz=new Float32Array(this.n);
      this.rho=new Float32Array(this.n); this.solid=new Uint8Array(this.n);
      // Only 19 fixed offsets are needed: Y/Z wall cells never stream.
      this.offsets=this.c.map(([x,y,z])=>x+y*nx+z*nx*ny);
      this.u=.06; this.nu=.025; this.t=0;this.regularized=false;this.smagorinsky=.18;
      this.setObjects([]); this.reset();
    }
    index(x,y,z) { return (z*this.ny+y)*this.nx+x; }
    eq(k,r,u,v,w) {
      const c=this.c[k],cu=c[0]*u+c[1]*v+c[2]*w;
      return this.weights[k]*r*(1+3*cu+4.5*cu*cu-1.5*(u*u+v*v+w*w));
    }
    initCell(p,u=this.u) {
      this.ux[p]=u; this.uy[p]=0; this.uz[p]=0; this.rho[p]=1;
      for(let k=0;k<19;k++)this.f[k*this.n+p]=this.eq(k,1,u,0,0);
    }
    reset() {
      for(let p=0;p<this.n;p++)this.initCell(p,this.solid[p]?0:this.u);
      this.g.fill(0); this.t=0;
    }
    setObjects(objects) {
      const old=this.solid.slice(),{nx,ny,nz}=this;
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++) {
        const p=this.index(x,y,z);
        let wall=y===0||y===ny-1||z===0||z===nz-1;
        if(!wall)for(const o of objects) {
          const dx=x-o.x,dy=y-o.y,dz=z-o.z;
          if(o.type==='sphere'?dx*dx+dy*dy+dz*dz<=o.w*o.w/4:
            Math.abs(dx)<=o.w/2&&Math.abs(dy)<=o.h/2&&Math.abs(dz)<=o.d/2) {wall=true;break;}
        }
        this.solid[p]=wall?1:0;
        if(old[p]!==this.solid[p])this.initCell(p,wall?0:this.u);
      }
    }
    step() {
      const {n,nx,ny,nz,f,g,c,weights,opp,offsets,solid,ux,uy,uz,rho}=this,omega=1/(.5+3*this.nu);
      for(let p=0;p<n;p++) {
        if(solid[p])continue;
        let r=0,u=0,v=0,w=0,pxx=0,pyy=0,pzz=0,pxy=0,pxz=0,pyz=0;
        for(let k=0;k<19;k++){const a=f[k*n+p],cx=c[k][0],cy=c[k][1],cz=c[k][2];r+=a;u+=a*cx;v+=a*cy;w+=a*cz;if(this.regularized){pxx+=a*cx*cx;pyy+=a*cy*cy;pzz+=a*cz*cz;pxy+=a*cx*cy;pxz+=a*cx*cz;pyz+=a*cy*cz;}}
        u/=r;v/=r;w/=r;
        if(!Number.isFinite(r)||r<.4||r>2||u*u+v*v+w*w>.16)return false;
        rho[p]=r;ux[p]=u;uy[p]=v;uz[p]=w;
        const usq=1.5*(u*u+v*v+w*w),x=p%nx;
        let localOmega=omega;
        if(this.regularized){
          pxx-=r*(1/3+u*u);pyy-=r*(1/3+v*v);pzz-=r*(1/3+w*w);pxy-=r*u*v;pxz-=r*u*w;pyz-=r*v*w;
          const norm=Math.sqrt(2*(pxx*pxx+pyy*pyy+pzz*pzz+2*(pxy*pxy+pxz*pxz+pyz*pyz))),tau=.5+3*this.nu;
          localOmega=2/(tau+Math.sqrt(tau*tau+18*this.smagorinsky*this.smagorinsky*norm/r));
        }
        for(let k=0;k<19;k++) {
          if((x===0&&c[k][0]<0)||(x===nx-1&&c[k][0]>0))continue;
          const q=p+offsets[k];
          const cu=c[k][0]*u+c[k][1]*v+c[k][2]*w;
          const equilibrium=weights[k]*r*(1+3*cu+4.5*cu*cu-usq);
          let a;
          if(this.regularized){const [cx,cy,cz]=c[k];const stress=(cx*cx-1/3)*pxx+(cy*cy-1/3)*pyy+(cz*cz-1/3)*pzz+2*(cx*cy*pxy+cx*cz*pxz+cy*cz*pyz);a=equilibrium+(1-localOmega)*4.5*weights[k]*stress;}
          else a=(1-omega)*f[k*n+p]+omega*equilibrium;
          if(solid[q])g[opp[k]*n+p]=a;else g[k*n+q]=a;
        }
      }
      // Non-equilibrium extrapolation: prescribed velocity at inlet, density at outlet.
      for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let side=0;side<2;side++) {
        const p=this.index(side?nx-1:0,y,z),q=p+(side?-1:1);
        let r=0,u=0,v=0,w=0;
        for(let k=0;k<19;k++){const a=g[k*n+q];r+=a;u+=a*c[k][0];v+=a*c[k][1];w+=a*c[k][2];}
        u/=r;v/=r;w/=r;
        for(let k=0;k<19;k++)g[k*n+p]=this.eq(k,side?1:r,side?u:this.u,side?v:0,side?w:0)+g[k*n+q]-this.eq(k,r,u,v,w);
      }
      this.f=g; this.g=f; this.t++; return true;
    }
  }
  root.FlowSolver3D=FlowSolver3D;
  if(typeof module!=='undefined')module.exports=FlowSolver3D;
})(typeof window==='undefined'?globalThis:window);
