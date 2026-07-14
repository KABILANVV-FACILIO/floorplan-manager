/**
 * Renders a DWG/DXF file to a PNG data URL using @mlightcad/cad-simple-viewer
 * (a pure client-side, WASM-backed CAD parser/renderer — no server round-trip).
 * The heavy parser bundle (~13MB for DWG via LibreDWG) is only fetched lazily,
 * the first time a CAD file is actually opened.
 */
export async function renderCadToDataUrl(file: File): Promise<string> {
  const mod = await import('@mlightcad/cad-simple-viewer');
  const { AcApDocManager } = mod;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '1492px';
  container.style.height = '1054px';
  document.body.appendChild(container);

  try {
    const manager = AcApDocManager.createInstance({
      container,
      width: 1492,
      height: 1054,
      webworkerFileUrls: {
        dxfParser: '/workers/dxf-parser-worker.js',
        dwgParser: '/workers/libredwg-parser-worker.js',
        mtextRender: '/workers/mtext-renderer-worker.js',
      },
    });
    if (!manager) throw new Error('CAD viewer failed to initialize');

    const buffer = await file.arrayBuffer();
    const ok = await manager.openDocument(file.name, buffer, {} as any);
    if (!ok) throw new Error('Could not parse this CAD file');

    // Give the renderer a tick to flush the last frame to the canvas.
    await new Promise((r) => setTimeout(r, 250));

    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('CAD viewer produced no canvas');
    const dataUrl = canvas.toDataURL('image/png');

    await manager.destroy();
    return dataUrl;
  } finally {
    container.remove();
  }
}

export function isCadFile(filename: string): boolean {
  return /\.(dwg|dxf)$/i.test(filename);
}
