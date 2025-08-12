export class OrbitCamera {
  target = [0,0,0];
  distance = 5;
  phi = Math.PI/6;    // elevation
  theta = Math.PI/4;  // azimuth

  attach(canvas: HTMLCanvasElement) {
    let dragging = false;
    let lastX = 0, lastY = 0;
    canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('mouseup', () => dragging = false);
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = (e.clientX - lastX) * 0.01;
      const dy = (e.clientY - lastY) * 0.01;
      this.theta += dx;
      this.phi = Math.min(Math.max(0.1, this.phi + dy), Math.PI-0.1);
      lastX = e.clientX; lastY = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
      this.distance *= Math.pow(1.1, e.deltaY * 0.01);
    });
  }

  viewProj(aspect: number): Float32Array {
    const eye = [
      this.target[0] + this.distance * Math.sin(this.phi) * Math.cos(this.theta),
      this.target[1] + this.distance * Math.cos(this.phi),
      this.target[2] + this.distance * Math.sin(this.phi) * Math.sin(this.theta),
    ];
    const view = lookAt(eye, this.target, [0,1,0]);
    const proj = perspective(60*Math.PI/180, aspect, 0.01, 100.0);
    const vp = multiply(proj, view);
    return new Float32Array(vp);
  }
}

// Minimal mat4 helpers
function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1.0 / Math.tan(fovy/2);
  const nf = 1 / (near - far);
  return [
    f/aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far+near)*nf, -1,
    0, 0, (2*far*near)*nf, 0
  ];
}

function normalize(v: number[]) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0]/l, v[1]/l, v[2]/l];
}

function cross(a: number[], b: number[]) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}

function subtract(a: number[], b: number[]) {
  return [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
}

function lookAt(eye: number[], center: number[], up: number[]) {
  const z = normalize(subtract(eye, center));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [
     x[0], y[0], z[0], 0,
     x[1], y[1], z[1], 0,
     x[2], y[2], z[2], 0,
    -(x[0]*eye[0] + x[1]*eye[1] + x[2]*eye[2]),
    -(y[0]*eye[0] + y[1]*eye[1] + y[2]*eye[2]),
    -(z[0]*eye[0] + z[1]*eye[1] + z[2]*eye[2]),
     1
  ];
}

function multiply(a: number[], b: number[]) {
  const out = new Array(16).fill(0);
  for (let i=0;i<4;i++) for (let j=0;j<4;j++) {
    out[i*4+j] = a[i*4+0]*b[0*4+j] + a[i*4+1]*b[1*4+j] + a[i*4+2]*b[2*4+j] + a[i*4+3]*b[3*4+j];
  }
  return out;
}
