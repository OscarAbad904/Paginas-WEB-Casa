export function exportCSV(data: {x:number,y:number,z:number,vx:number,vy:number,vz:number,m:number,type:number}[]) {
  const headers = ['x','y','z','vx','vy','vz','m','type'];
  const rows = data.map(d => [d.x,d.y,d.z,d.vx,d.vy,d.vz,d.m,d.type].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'particles.csv';
  a.click();
  URL.revokeObjectURL(url);
}
