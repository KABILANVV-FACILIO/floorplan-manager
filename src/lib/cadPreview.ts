/**
 * Renders a DWG/DXF file to a PNG data URL using @mlightcad/cad-simple-viewer
 * (a pure client-side, WASM-backed CAD parser/renderer — no server round-trip).
 * The heavy parser bundle (~13MB for DWG via LibreDWG) is only fetched lazily,
 * the first time a CAD file is actually opened.
 */
export async function renderCadToDataUrl(file: File): Promise<string> {
  const mod = await import('@mlightcad/cad-simple-viewer');
  const { AcApDocManager, AcApOpenViewMode } = mod;

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
      // Skip fetching the default CAD font manifest from the library's CDN — this app only
      // needs a snapshot of the drawing's geometry, not exact text-glyph fidelity, and that
      // fetch failing (e.g. no network access to cdn.jsdelivr.net) was throwing an uncaught
      // error during initialization.
      notLoadDefaultFonts: true,
      webworkerFileUrls: {
        dxfParser: '/workers/dxf-parser-worker.js',
        dwgParser: '/workers/libredwg-parser-worker.js',
        mtextRender: '/workers/mtext-renderer-worker.js',
      },
    });
    if (!manager) throw new Error('CAD viewer failed to initialize');

    const buffer = await file.arrayBuffer();
    // Without an explicit view mode, the default open mode restores the drawing's saved
    // AutoCAD viewport (VPORT `*ACTIVE`) rather than framing the actual geometry — for a
    // snapshot render (not an interactive edit session) that saved view can easily point at an
    // empty region, producing a blank canvas even though the drawing parsed fine. Forcing
    // `Extents` always fits the camera to the real content.
    const ok = await manager.openDocument(file.name, buffer, { openViewMode: AcApOpenViewMode.Extents });
    if (!ok) throw new Error('Could not parse this CAD file');

    // `openDocument()` resolving doesn't mean entity conversion is done — for DWG especially
    // (parsed off-thread via a web worker), batch conversion keeps running afterward, and the
    // library's own docs warn that "parsing can report 100% before this reaches zero." A real
    // building-scale DWG confirmed this: openDocument resolved, but the canvas was still fully
    // blank moments later. Wait for `isProcessingEntities` to clear, then fit the camera
    // ourselves rather than trust the auto-fit's internal timing against our own snapshot delay.
    const deadline = Date.now() + 15000;
    while (manager.curView.isProcessingEntities && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
    }
    manager.curView.zoomToFitDrawing();
    // The fit itself isn't synchronous either (confirmed against the real building DWG: the
    // camera's position/zoom were still at their pre-fit default a tick after this call, and
    // only settled onto the drawing's actual bounds after roughly a second) — 300ms wasn't
    // enough on top of the isProcessingEntities wait above, so this is deliberately generous.
    await new Promise((r) => setTimeout(r, 1200));

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
