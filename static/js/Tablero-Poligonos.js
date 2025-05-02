/*****************************************************************
 *  PARÁMETROS GLOBALES
 *****************************************************************/
const SIDE=40, SNAP_DIST=10, WHEEL_STEP=10*Math.PI/180,
      FILL_CLR='#6699ff', HILITE_CLR='#ff980066', TAU=2*Math.PI;

/* utilidades */
const dist=(a,b,c,d)=>Math.hypot(c-a,d-b),
      angle=(vx,vy)=>Math.atan2(vy,vx),
      radius=n=>SIDE/(2*Math.sin(Math.PI/n)),
      mod=(i,n)=>(i+n)%n;

/* Busca la primera posición libre para un polígono de n lados */
function findFreeSpot(board, n){
  const step   = 50;                     // separación entre pruebas
  const rNew   = radius(n);
  const cx     = board.cv.width  /(2*board.dpr);
  const cy     = board.cv.height /(2*board.dpr);

  /* escaneamos en espiral rectangular */
  for(let distPix = 0; distPix < 1000; distPix += step){
    for(let dx = -distPix; dx <= distPix; dx += step){
      for(let dy of [-distPix, distPix]){
        const x = cx + dx, y = cy + dy;
        if(board._isFree(x,y,rNew)) return {x,y};
      }
    }
    for(let dy = -distPix+step; dy <= distPix-step; dy += step){
      for(let dx of [-distPix, distPix]){
        const x = cx + dx, y = cy + dy;
        if(board._isFree(x,y,rNew)) return {x,y};
      }
    }
  }
  /* fallo: devuélvelo en el centro y que luego lo mueva el usuario */
  return {x:cx, y:cy};
}

/*****************************************************************
 *  POLÍGONO REGULAR
 *****************************************************************/
class RegularPolygon{
  constructor(x,y,n){
    this.x = x; this.y = y; this.n = n; this.a = 0;
    this.joined = Array(n).fill(false);      // ← nuevo
  }
  rotate(r){this.a=(this.a+r+TAU)%TAU;}
  vertices(){
    const r=radius(this.n),c=Math.cos(this.a),s=Math.sin(this.a);
    return Array.from({length:this.n},(_,i)=>{
      const ang=-Math.PI/2+i*TAU/this.n,
            dx=r*Math.cos(ang),dy=r*Math.sin(ang);
      return{ x:this.x+dx*c-dy*s, y:this.y+dx*s+dy*c };
    });
  }
  hit(mx,my,ctx,dpr){
    ctx.beginPath();
    this.vertices().forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));
    ctx.closePath();
    return ctx.isPointInPath(mx*dpr,my*dpr);
  }
  draw(ctx, mark=false){
    /* relleno */
    ctx.beginPath();
    this.vertices().forEach((v,i)=> i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));
    ctx.closePath();
    ctx.fillStyle = mark ? HILITE_CLR : FILL_CLR;
    ctx.fill();

    /* contorno lado a lado */
    const V = this.vertices();
    for(let i=0;i<this.n;i++){
      const j = (i+1)%this.n;
      ctx.beginPath();
      ctx.moveTo(V[i].x, V[i].y);
      ctx.lineTo(V[j].x, V[j].y);
      if(this.joined[i]){
        ctx.strokeStyle = 'rgb(0,0,0)';
        ctx.lineWidth   = 1;
      }else{
        ctx.strokeStyle = 'rgb(13,255,0)';
        ctx.lineWidth   = 2;
      }
      ctx.stroke();
    }
  }
}

/*****************************************************************
 *  TRIÁNGULO REGULAR (hereda de RegularPolygon)
 *****************************************************************/
class RegularTriangle extends RegularPolygon {
  constructor(x, y) {
    super(x, y, 3);
  }
  // Todos los métodos de RegularPolygon ya funcionan para el triángulo,
  // así que no es necesario redefinirlos.
  // Si quieres personalizar el color, puedes sobreescribir draw:
  // draw(ctx,mark=false){
  //   ctx.beginPath();
  //   this.vertices().forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));
  //   ctx.closePath();
  //   ctx.fillStyle=mark?'#ff0':'#0cf'; // ejemplo de color personalizado
  //   ctx.strokeStyle='#000';
  //   ctx.fill();ctx.stroke();
  // }
}

/*****************************************************************
 *  TABLERO
 *****************************************************************/
class Board{
  constructor(canvas){
    this.cv=canvas;this.ctx=canvas.getContext('2d');this.dpr=window.devicePixelRatio||1;
    this.figures=[];this.active=new Map();
    this.drag=null;this.dragId=null;
    this.rot=null;this.rotIds=[];this.rot0vec=0;this.rot0ang=0;
    this.needDraw=true;

    requestAnimationFrame(()=>this.resize());
    window.addEventListener('resize',()=>this.resize());

    /* pointer (mover, rotar, borrar) */
    ['pointerdown','pointermove','pointerup','pointercancel']
      .forEach(e=>canvas.addEventListener(e,ev=>this[e](ev)));
    canvas.addEventListener('wheel',e=>this.wheel(e),{passive:false});
    canvas.addEventListener('contextmenu',e=>this.rmFigure(e));

    /* drag-and-drop para crear piezas */
    canvas.addEventListener('dragover',e=>e.preventDefault());
    canvas.addEventListener('drop',e=>this.dropCreate(e));

    /* ---- preview para el drag ----------------------------------- */
    // Reemplazamos makeDragImage por makeDragCanvas
    function makeDragCanvas(sides){
      const size = 60, r = radius(sides);
      const cvs  = document.createElement('canvas');
      cvs.width = cvs.height = size;
      const ctx  = cvs.getContext('2d');

      /* dibujamos la figura centrada */
      ctx.translate(size/2, size/2);
      ctx.fillStyle = FILL_CLR;
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      for(let i=0;i<sides;i++){
        const ang = -Math.PI/2 + i*TAU/sides;
        const x   = r*Math.cos(ang), y = r*Math.sin(ang);
        i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();

      /* lo insertamos fuera de pantalla para que el motor lo use */
      cvs.style.position = 'fixed';
      cvs.style.top  = '-1000px';
      cvs.style.left = '-1000px';
      document.body.appendChild(cvs);
      return cvs;
    }

    /* botones: click + dragstart */
    document.querySelectorAll('.fab').forEach(btn=>{
      const sides = parseInt(btn.dataset.sides,10);
    
      // click = crea figura en la primera zona libre
      btn.addEventListener('click', () => {
        const spot = findFreeSpot(this, sides);
        // Si es triángulo, usa la clase RegularTriangle
        if (sides === 3) {
          const fig = new RegularTriangle(spot.x, spot.y);
          this.figures.push(fig);
          this._snap(fig);
          this.needDraw = true;
        } else {
          this.addPiece(sides, spot.x, spot.y);
        }
      });
    
      // dragstart = arrastra vista previa
      btn.addEventListener('dragstart', e=>{
        e.dataTransfer.setData('text/plain', sides);
        e.dataTransfer.effectAllowed = 'copy';
    
        /* imagen personalizada */
        const ghost = makeDragCanvas(sides);
        // offset al centro de la figura
        e.dataTransfer.setDragImage(ghost, ghost.width/2, ghost.height/2);
      });
    });

    /* bucle de render */
    const loop=()=>{
      if(this.needDraw){
        this._updateJoins();       // ← nuevo
        this.draw();
        this.needDraw=false;
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

  /*********** CREAR / ELIMINAR ***********************************/
  addPiece(n,x,y){
    const fig = new RegularPolygon(x,y,n);
    this.figures.push(fig);
    this._snap(fig);          // ← aplica imán y rotación al instante
    this.needDraw = true;
    return fig;
  }
  dropCreate(e){
    e.preventDefault();
    const sides=parseInt(e.dataTransfer.getData('text/plain'),10);
    if(!sides) return;
    const rect=this.cv.getBoundingClientRect(),
          x=(e.clientX-rect.left), y=(e.clientY-rect.top);
    // Si es triángulo, usa la clase RegularTriangle
    if (sides === 3) {
      const fig = new RegularTriangle(x, y);
      this.figures.push(fig);
      this._snap(fig);
      this.needDraw = true;
    } else {
      this.addPiece(sides,x,y);
    }
  }
  rmFigure(e){
    e.preventDefault();
    const f=this._figAt(e.clientX,e.clientY);
    if(f){this.figures=this.figures.filter(g=>g!==f);this.needDraw=true;}
  }

  /*********** MOVER / ROTAR **************************************/
  pointerdown(ev){
    const info=this._info(ev);
    this.active.set(ev.pointerId,info);
    this.cv.setPointerCapture(ev.pointerId);

    if(info.fig && !this.drag){
      this.drag=info.fig;this.dragId=ev.pointerId;
      this.drag.offX=info.x-this.drag.x;this.drag.offY=info.y-this.drag.y;
      this.cv.classList.add('grabbing');return;
    }
    /* rotación: 2 dedos misma pieza */
    if(this.active.size===2){
      const [a,b]=[...this.active.values()];
      if(a.fig&&a.fig===b.fig){
        this.rot=a.fig;this.rotIds=[...this.active.keys()];
        this.rot0vec=angle(b.x-a.x,b.y-a.y);this.rot0ang=this.rot.a;
        this.drag=null;this.cv.classList.remove('grabbing');this.cv.classList.add('rotating');
      }
    }
  }
  pointermove(ev){
    if(!this.active.has(ev.pointerId))return;
    const info=this._info(ev);this.active.set(ev.pointerId,info);

    if(this.drag&&ev.pointerId===this.dragId){
      this.drag.x=info.x-this.drag.offX;this.drag.y=info.y-this.drag.offY;
      this._snap(this.drag);this.needDraw=true;
    }
    if(this.rot&&this.rotIds.includes(ev.pointerId)){
      const a=this.active.get(this.rotIds[0]),b=this.active.get(this.rotIds[1]);
      if(a&&b){const angNow=angle(b.x-a.x,b.y-a.y);this.rot.a=this.rot0ang+(angNow-this.rot0vec);this.needDraw=true;}
    }
  }
  pointerup(ev){
    this.active.delete(ev.pointerId);
    if(ev.pointerId===this.dragId){this.drag=null;this.cv.classList.remove('grabbing');}
    if(this.rot&&!this.rotIds.every(id=>this.active.has(id))){this.rot=null;this.cv.classList.remove('rotating');}
  }

  wheel(ev){
    ev.preventDefault();
    const f=this._figAt(ev.clientX,ev.clientY);
    if(f){f.rotate(Math.sign(ev.deltaY)*WHEEL_STEP);this.needDraw=true;}
  }

  /*********** SNAP LADO-A-LADO ***********************************/
  _snap(p){
    for(const o of this.figures){if(o===p)continue;
      const Vp=p.vertices(),Vo=o.vertices(),np=p.n,no=o.n,margen=SNAP_DIST+radius(p.n)+radius(o.n);
      const bp=p.vertices().reduce((b,v)=>({L:Math.min(b.L,v.x),R:Math.max(b.R,v.x),T:Math.min(b.T,v.y),B:Math.max(b.B,v.y)}),
                                    {L:Infinity,R:-Infinity,T:Infinity,B:-Infinity});
      const bo=o.vertices().reduce((b,v)=>({L:Math.min(b.L,v.x),R:Math.max(b.R,v.x),T:Math.min(b.T,v.y),B:Math.max(b.B,v.y)}),
                                    {L:Infinity,R:-Infinity,T:Infinity,B:-Infinity});
      if(bp.R+margen<bo.L||bp.L-margen>bo.R||bp.B+margen<bo.T||bp.T-margen>bo.B)continue;

      for(let i=0;i<np;i++){
        const P1=Vp[i],P2=Vp[mod(i+1,np)];
        for(let j=0;j<no;j++){
          const Q1=Vo[j],Q2=Vo[mod(j+1,no)];
          const okDir=dist(P1.x,P1.y,Q1.x,Q1.y)<=SNAP_DIST&&dist(P2.x,P2.y,Q2.x,Q2.y)<=SNAP_DIST,
                okRev=dist(P1.x,P1.y,Q2.x,Q2.y)<=SNAP_DIST&&dist(P2.x,P2.y,Q1.x,Q1.y)<=SNAP_DIST;
          if(!(okDir||okRev))continue;

          let src1=P1,src2=P2,tgt1=Q1,tgt2=Q2;
          if(okRev){tgt1=Q2;tgt2=Q1;}
          const angS=angle(src2.x-src1.x,src2.y-src1.y),
                angT=angle(tgt2.x-tgt1.x,tgt2.y-tgt1.y);
          p.rotate(angT-angS);
          const Vn=p.vertices()[i];
          p.x+=tgt1.x-Vn.x; p.y+=tgt1.y-Vn.y;
          return;
        }
      }
    }
  }

  /*********** DRAW & HELPERS *************************************/
  resize(){this.cv.width=this.cv.clientWidth*this.dpr;this.cv.height=this.cv.clientHeight*this.dpr;
          this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.needDraw=true;}
  draw(){this.ctx.clearRect(0,0,this.cv.width,this.cv.height);
         this.figures.forEach(f=>f.draw(this.ctx,f===this.drag||f===this.rot));}

  /* --------- recalcula qué lados están unidos --------- */
  _updateJoins(){
    this.figures.forEach(f => f.joined.fill(false));
    for(let a=0; a<this.figures.length; a++){
      for(let b=a+1; b<this.figures.length; b++){
        const F = this.figures[a], G = this.figures[b];
        const Vf = F.vertices(), Vg = G.vertices();
        for(let i=0;i<F.n;i++){
          const i2=(i+1)%F.n;
          for(let j=0;j<G.n;j++){
            const j2=(j+1)%G.n;
            const  v1  = Vf[i],   v2  = Vf[i2];
            const  w1  = Vg[j],   w2  = Vg[j2];
            const  w1r = Vg[j2],  w2r = Vg[j];   // lado invertido
            const close = (p,q)=> dist(p.x,p.y,q.x,q.y) < 1;
            if( (close(v1,w1) && close(v2,w2)) || (close(v1,w1r)&&close(v2,w2r)) ){
              F.joined[i] = true;
              G.joined[j] = true;
            }
          }
        }
      }
    }
  }

  _coords(cX,cY){const r=this.cv.getBoundingClientRect();return{x:(cX-r.left),y:(cY-r.top)};}

  /* ¿Está libre ese centro con radio r? */
  _isFree(x,y,r){
    return !this.figures.some(f => dist(f.x, f.y, x, y) < (radius(f.n)+r+5));
  }

  _info(ev){const {x,y}=this._coords(ev.clientX,ev.clientY);return{x,y,fig:this.figures.find(f=>f.hit(x,y,this.ctx,this.dpr))};}
  _figAt(cX,cY){const {x,y}=this._coords(cX,cY);return this.figures.find(f=>f.hit(x,y,this.ctx,this.dpr));}
}

/* ==================== INICIALIZACIÓN ==================== */
document.addEventListener('DOMContentLoaded',()=>{
  new Board(document.getElementById('board'));
});