import { SimParams, PresetName } from './types';

export function gatherParams(): SimParams {
  const get = (id: string) => (document.getElementById(id) as HTMLInputElement);
  return {
    G: parseFloat(get('G').value),
    eps: parseFloat(get('eps').value),
    theta: parseFloat(get('theta').value),
    gamma: parseFloat(get('gamma').value),
    kpress: parseFloat(get('kpress').value),
    hKernel: parseFloat(get('hKernel').value),
    nu: parseFloat(get('nu').value),
    tau: parseFloat(get('tau').value),
    rhoThresh: parseFloat(get('rhoThresh').value),
    vMax: parseFloat(get('vMax').value),
    gravMode: (document.getElementById('gravMode') as HTMLSelectElement).value as any,
    quality: (document.getElementById('quality') as HTMLSelectElement).value as any,
    autoReduceN: (document.getElementById('autoReduceN') as HTMLInputElement).checked,
    dtMax: parseFloat(get('dtMax').value),
    warp: parseFloat((document.getElementById('warp') as HTMLSelectElement).value),
    enableGas: (document.getElementById('toggleGas') as HTMLInputElement).checked,
    enableDrag: (document.getElementById('toggleDrag') as HTMLInputElement).checked,
    enableCollisions: (document.getElementById('toggleCollisions') as HTMLInputElement).checked,
    Mstar: 1.0,
    collisionsEvery: 4,
    volumeScale: 1.0,
    useAdaptiveDt: false,
    cfl: 0.25,
    eta: 0.2,
  };
}

export function hookUI(opts: {
  onLoadPreset: (name: PresetName) => void;
  onPlayPause: () => void;
  onReset: () => void;
  onExport: () => void;
}) {
  const btnLoad = document.getElementById('btnLoadPreset')!;
  const selPreset = document.getElementById('preset') as HTMLSelectElement;
  btnLoad.addEventListener('click', () => opts.onLoadPreset(selPreset.value as PresetName));
  document.getElementById('btnPlayPause')!.addEventListener('click', opts.onPlayPause);
  document.getElementById('btnReset')!.addEventListener('click', opts.onReset);
  document.getElementById('btnExport')!.addEventListener('click', opts.onExport);
}

export function readBasicControls() {
  const seed = parseInt((document.getElementById('seed') as HTMLInputElement).value, 10);
  const nParticles = parseInt((document.getElementById('nParticles') as HTMLInputElement).value, 10);
  const gasFrac = parseFloat((document.getElementById('gasFrac') as HTMLInputElement).value);
  return { seed, nParticles, gasFrac };
}

export function setHUD(values: { fps?: number; N?: number; dE?: number; dL?: number; planets?: number; }) {
  if (values.fps !== undefined) (document.getElementById('fps')!).textContent = values.fps.toFixed(0);
  if (values.N !== undefined) (document.getElementById('hudN')!).textContent = String(values.N);
  if (values.dE !== undefined) (document.getElementById('hudE')!).textContent = values.dE.toFixed(3);
  if (values.dL !== undefined) (document.getElementById('hudL')!).textContent = values.dL.toFixed(3);
  if (values.planets !== undefined) (document.getElementById('hudPlan')!).textContent = String(values.planets);
}


export function getAutoFrame(): boolean {
  const el = document.getElementById('toggleAutoFrame') as HTMLInputElement | null;
  return !!el?.checked;
}
