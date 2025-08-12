export async function initWebGPU(canvas: HTMLCanvasElement) {
  if (!('gpu' in navigator)) {
    throw new Error('Tu navegador no soporta WebGPU. Usa Chrome/Edge/Firefox nightly con WebGPU habilitado.');
  }
  // Avoid passing powerPreference on Windows where it's ignored and triggers a warning
  const adapter = await navigator.gpu.requestAdapter(
    navigator.userAgent.includes('Windows') ? {} : { powerPreference: 'high-performance' }
  );
  if (!adapter) throw new Error('No se encontró adaptador WebGPU.');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format: canvasFormat, alphaMode: 'premultiplied' });
  return { device, context, canvasFormat, adapter };
}
