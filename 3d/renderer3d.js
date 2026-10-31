/* Dependency-free orthographic 3D renderer. Polygons and tracer segments are depth sorted. */
class VolumeRenderer {
  constructor(canvas,dims) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.dims=dims;
    this.yaw=.48;this.pitch=.42;this.zoom=1;this.width=900;this.height=600;
    this.sliceCanvas=document.createElement('canvas');this.sliceCache=null;
    const stops=[[18,57,88],[36,126,170],[84,212,195],[215,237,154],[255,215,139]];
    this.colors=Array.from({length:256},(_,i)=>{let t=i/255*4,j=Math.min(3,Math.floor(t));return stops[j].map((v,k)=>Math.round(v+(stops[j+1][k]-v)*(t-j)));});
    this.resize();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
  }
  resize() {
    const r=this.canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
    this.width=r.width;this.height=r.height;this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  basis() {
    const a=Math.cos(this.yaw),b=Math.sin(this.yaw),c=Math.cos(this.pitch),d=Math.sin(this.pitch);
    this.right=[a,0,-b];this.up=[-b*d,c,-a*d];this.toward=[b*c,d,a*c];
    this.scale=Math.min(this.width/(this.dims[0]+this.dims[2])*1.08,this.height/(this.dims[1]+this.dims[2])*1.15)*this.zoom;
  }
  project(v) {
    const p=v.map((x,i)=>x-(this.dims[i]-1)/2),dot=a=>a[0]*p[0]+a[1]*p[1]+a[2]*p[2];
    return [this.width/2+dot(this.right)*this.scale,this.height*.48-dot(this.up)*this.scale,dot(this.toward)];
  }
  ray(x,y) {
    this.basis();const a=(x-this.width/2)/this.scale,b=(this.height*.48-y)/this.scale;
    const distance=Math.hypot(...this.dims)*2;
    return {origin:this.right.map((v,i)=>(this.dims[i]-1)/2+v*a+this.up[i]*b+this.toward[i]*distance),dir:this.toward.map(v=>-v)};
  }
  planePoint(x,y,axis,value) {
    const {origin,dir}=this.ray(x,y);if(Math.abs(dir[axis])<.12)return null;
    const t=(value-origin[axis])/dir[axis];return origin.map((v,i)=>v+t*dir[i]);
  }
  pick(x,y,objects) {
    const {origin,dir}=this.ray(x,y);let nearest=Infinity,picked=null;
    for(const o of objects) {
      const center=[o.x,o.y,o.z],delta=origin.map((v,i)=>v-center[i]);let t;
      if(o.type==='sphere') {
        const b=delta.reduce((s,v,i)=>s+v*dir[i],0),c=delta.reduce((s,v)=>s+v*v,0)-o.w*o.w/4,disc=b*b-c;
        if(disc<0)continue;t=-b-Math.sqrt(disc);
      } else {
        const size=[o.w,o.h,o.d];let lo=-Infinity,hi=Infinity;
        for(let i=0;i<3;i++) {
          if(Math.abs(dir[i])<1e-9){if(Math.abs(delta[i])>size[i]/2){hi=-Infinity;break;}continue;}
          const a=(-size[i]/2-delta[i])/dir[i],b=(size[i]/2-delta[i])/dir[i];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
        }
        if(lo>hi)continue;t=lo;
      }
      if(t>=0&&t<nearest){nearest=t;picked=o;}
    }
    return picked;
  }
  draw({objects,selected,field,slice,slicePos,particles,showParticles,showGrid,u}) {
    this.basis();const ctx=this.ctx,[nx,ny,nz]=this.dims,items=[];
    ctx.clearRect(0,0,this.width,this.height);
    const line=(a,b,color,width=1)=>{a=this.project(a);b=this.project(b);items.push({p:[a,b],z:(a[2]+b[2])/2,color,width});};
    const poly=(points,color,stroke=null)=>{const p=points.map(v=>this.project(v));items.push({p,z:p.reduce((s,v)=>s+v[2],0)/p.length,color,fill:true,stroke});};
    const corners=[];for(let z of [0,nz-1])for(let y of [0,ny-1])for(let x of [0,nx-1])corners.push([x,y,z]);
    for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))line(corners[i],corners[i|bit],'rgba(112,164,189,.36)',.8);
    if(showGrid){for(let x=0;x<nx;x+=8)line([x,0,0],[x,0,nz-1],'rgba(101,153,180,.13)',.65);for(let z=0;z<nz;z+=4)line([0,0,z],[nx-1,0,z],'rgba(101,153,180,.13)',.65);}
    if(field&&slice!=='none') {
      const axes=slice==='xy'?[0,1,2]:slice==='xz'?[0,2,1]:[1,2,0],a=axes[0],b=axes[1],fixed=axes[2];
      const width=this.dims[a]-1,height=this.dims[b]-1;
      if(!this.sliceCache||this.sliceCache.field!==field||this.sliceCache.slice!==slice||this.sliceCache.pos!==slicePos||this.sliceCache.u!==u){
        this.sliceCanvas.width=width;this.sliceCanvas.height=height;
        const sc=this.sliceCanvas.getContext('2d'),image=sc.createImageData(width,height),d=image.data;
        for(let j=1;j<height;j++)for(let i=1;i<width;i++){
          const p=[0,0,0];p[a]=i;p[b]=j;p[fixed]=slicePos;
          const q=(p[2]*ny+p[1])*nx+p[0];if(field.solid[q])continue;
          const speed=Math.hypot(field.ux[q],field.uy[q],field.uz[q]),col=this.colors[Math.min(255,Math.round(speed/(2*u)*255))],offset=4*(j*width+i);
          d[offset]=col[0];d[offset+1]=col[1];d[offset+2]=col[2];d[offset+3]=164;
        }
        sc.putImageData(image,0,0);this.sliceCache={field,slice,pos:slicePos,u};
      }
      // Every cell remains in the texture; small tiles allow approximate depth ordering.
      for(let j=0;j<height;j+=8)for(let i=0;i<width;i+=8){
        const w=Math.min(8,width-i),h=Math.min(8,height-j);
        const points=[[i,j],[i+w,j],[i,j+h]].map(([x,y])=>{const p=[0,0,0];p[a]=x;p[b]=y;p[fixed]=slicePos;return this.project(p);});
        items.push({tile:{x:i,y:j,w,h},p:points,z:(points[1][2]+points[2][2])/2});
      }
    }
    for(const o of objects) {
      const chosen=o.id===selected,base=chosen?[111,175,183]:[121,149,174];
      const shade=(normal)=>{const light=Math.max(.2,.57+normal[0]*-.18+normal[1]*.23+normal[2]*.18);return `rgb(${base.map(v=>Math.round(v*light)).join(',')})`;};
      if(o.type==='sphere') {
        const r=o.w/2,steps=32,rings=20;
        const point=(j,i)=>{const phi=Math.PI*j/rings,theta=2*Math.PI*i/steps;return [o.x+r*Math.sin(phi)*Math.cos(theta),o.y+r*Math.cos(phi),o.z+r*Math.sin(phi)*Math.sin(theta)];};
        for(let j=0;j<rings;j++)for(let i=0;i<steps;i++) {
          const pts=[point(j,i),point(j+1,i),point(j+1,i+1),point(j,i+1)],mid=pts.reduce((a,p)=>a.map((v,k)=>v+p[k]/4),[0,0,0]),normal=mid.map((v,k)=>(v-[o.x,o.y,o.z][k])/r);
          if(normal.reduce((s,v,k)=>s+v*this.toward[k],0)>-.05)poly(pts,shade(normal));
        }
        if(chosen){const c=this.project([o.x,o.y,o.z]);items.push({circle:c,r:r*this.scale+2,z:c[2]+r+.1,color:'#8af5df'});}
      } else {
        const vertices=[];for(let z of [-1,1])for(let y of [-1,1])for(let x of [-1,1])vertices.push([o.x+x*o.w/2,o.y+y*o.h/2,o.z+z*o.d/2]);
        const faces=[[[0,2,6,4],[-1,0,0]],[[1,5,7,3],[1,0,0]],[[0,4,5,1],[0,-1,0]],[[2,3,7,6],[0,1,0]],[[0,1,3,2],[0,0,-1]],[[4,6,7,5],[0,0,1]]];
        for(const [ids,normal] of faces)if(normal.reduce((s,v,i)=>s+v*this.toward[i],0)>0)poly(ids.map(i=>vertices[i]),shade(normal),chosen?'#8af5df':'#7993a8');
      }
    }
    if(showParticles&&field)for(const p of particles) {
      if(p.history.length<2)continue;
      const col=this.colors[Math.min(255,Math.round(p.speed/(2*u)*255))];
      for(let i=1;i<p.history.length;i++)line(p.history[i-1],p.history[i],`rgba(${col.join(',')},${.25+.7*i/p.history.length})`,1.25);
    }
    items.sort((a,b)=>a.z-b.z);
    for(const it of items) {
      if(it.tile){const {x,y,w,h}=it.tile,[p,a,b]=it.p;ctx.save();ctx.transform((a[0]-p[0])/w,(a[1]-p[1])/w,(b[0]-p[0])/h,(b[1]-p[1])/h,p[0],p[1]);ctx.imageSmoothingEnabled=false;ctx.drawImage(this.sliceCanvas,x,y,w,h,0,0,w,h);ctx.restore();continue;}
      if(it.circle){ctx.strokeStyle=it.color;ctx.lineWidth=1.1;ctx.beginPath();ctx.arc(it.circle[0],it.circle[1],it.r,0,2*Math.PI);ctx.stroke();continue;}
      ctx.beginPath();it.p.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
      if(it.fill){ctx.closePath();ctx.fillStyle=it.color;ctx.fill();if(it.stroke){ctx.strokeStyle=it.stroke;ctx.lineWidth=.85;ctx.stroke();}}
      else{ctx.strokeStyle=it.color;ctx.lineWidth=it.width;ctx.stroke();}
    }
    // Orientation triad uses the same camera basis as the volume.
    const origin=[48,this.height-48],axisColors=['#ee9f90','#8fe2c8','#8bbaf5'];
    for(let k=0;k<3;k++) {const end=[origin[0]+this.right[k]*26,origin[1]-this.up[k]*26];ctx.beginPath();ctx.moveTo(...origin);ctx.lineTo(...end);ctx.strokeStyle=axisColors[k];ctx.lineWidth=1.5;ctx.stroke();ctx.font='10px Consolas';ctx.fillStyle=axisColors[k];ctx.fillText('XYZ'[k],end[0]+3,end[1]-3);}
    for(const o of objects){const p=this.project([o.x,o.y+o.h/2+2,o.z]);ctx.fillStyle=o.id===selected?'#adffeb':'#a4b8cb';ctx.textAlign='center';ctx.font='10px Segoe UI';ctx.fillText(`${o.type==='sphere'?'구':'직육면체'} ${o.id}`,p[0],p[1]-4);}ctx.textAlign='left';
  }
}
