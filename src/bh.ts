
/**
 * Quadtree 2D (x,z) CPU builder for Barnes–Hut traversal on GPU.
 * We rebuild every K frames and upload to GPU buffers.
 */
export type BHBuffers = {
  nodesA: GPUBuffer; // [cx, cz, half, mass]
  nodesB: GPUBuffer; // [mx, mz, pad0, pad1] (center of mass x,z)
  children: GPUBuffer; // u32x4 indices (or 0xffffffff if none)
  count: number;
};
type Node = {
  cx:number, cz:number, half:number,
  mass:number, mx:number, mz:number,
  child:[number,number,number,number], // indices
  leafCount:number
};

const MAX_NODES_FACTOR = 4; // up to ~4N

function makeNode(): Node {
  return { cx:0, cz:0, half:0, mass:0, mx:0, mz:0, child:[-1,-1,-1,-1], leafCount:0 };
}

export function buildQuadtreeXZ(pos: Float32Array, mass: Float32Array, alive: Float32Array, N: number, theta: number) {
  // Compute bounds
  let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
  for (let i=0;i<N;i++) {
    if (alive[4*i+2] < 0.5) continue;
    const x=pos[4*i], z=pos[4*i+2];
    if (x<minx)minx=x; if (x>maxx)maxx=x; if (z<minz)minz=z; if (z>maxz)maxz=z;
  }
  const cx = 0.5*(minx+maxx), cz = 0.5*(minz+maxz);
  let half = Math.max(maxx-minx, maxz-minz)*0.6 + 1e-3;
  if (!isFinite(half) || half<=0) { half = 1.0; }

  const nodes: Node[] = [];
  const root = makeNode();
  root.cx=cx; root.cz=cz; root.half=half;
  nodes.push(root);

  function insert(idx:number, x:number, z:number, m:number) {
    let n = 0; // root
    for (let depth=0; depth<24; depth++) {
      const node = nodes[n];
      // update mass & com
      const M = node.mass + m;
      node.mx = (node.mx*node.mass + x*m) / (M || 1);
      node.mz = (node.mz*node.mass + z*m) / (M || 1);
      node.mass = M;
      node.leafCount++;
      // choose quadrant
      const right = x >= node.cx;
      const down  = z >= node.cz;
      const q = (right?1:0) + (down?2:0); // 0 tl,1 tr,2 bl,3 br (x left/right, z up/down)
      if (node.child[q] === -1) {
        // create new leaf placeholder
        const child = makeNode();
        child.half = node.half*0.5;
        child.cx = node.cx + (right?+child.half:-child.half);
        child.cz = node.cz + (down? +child.half:-child.half);
        nodes[n].child[q] = nodes.length;
        nodes.push(child);
      }
      // go down
      n = node.child[q];
      if (nodes[n].half < 1e-3) break;
    }
  }

  for (let i=0;i<N;i++) {
    if (alive[4*i+2] < 0.5) continue;
    const x=pos[4*i], z=pos[4*i+2]; const m=mass[4*i+3];
    insert(i, x, z, m);
  }

  return nodes;
}

export function uploadBH(device: GPUDevice, nodes: ReturnType<typeof buildQuadtreeXZ>): BHBuffers {
  const count = nodes.length;
  const arrA = new Float32Array(count*4);
  const arrB = new Float32Array(count*4);
  const arrC = new Uint32Array(count*4);
  for (let i=0;i<count;i++) {
    const n = nodes[i];
    arrA[4*i+0] = n.cx; arrA[4*i+1] = n.cz; arrA[4*i+2] = n.half; arrA[4*i+3] = n.mass;
    arrB[4*i+0] = n.mx; arrB[4*i+1] = n.mz; arrB[4*i+2] = 0; arrB[4*i+3] = 0;
    arrC[4*i+0] = n.child[0] < 0 ? 0xffffffff : n.child[0];
    arrC[4*i+1] = n.child[1] < 0 ? 0xffffffff : n.child[1];
    arrC[4*i+2] = n.child[2] < 0 ? 0xffffffff : n.child[2];
    arrC[4*i+3] = n.child[3] < 0 ? 0xffffffff : n.child[3];
  }
  const nodesA = device.createBuffer({ size: arrA.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'bh_nodesA' });
  const nodesB = device.createBuffer({ size: arrB.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'bh_nodesB' });
  const children = device.createBuffer({ size: arrC.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'bh_children' });
  device.queue.writeBuffer(nodesA, 0, arrA);
  device.queue.writeBuffer(nodesB, 0, arrB);
  device.queue.writeBuffer(children, 0, arrC);
  return { nodesA, nodesB, children, count };
}
