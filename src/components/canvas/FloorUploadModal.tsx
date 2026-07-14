import { useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import { Modal, ModalFooter, ModalHeader } from '../primitives/Modal';
import { Button } from '../primitives/Button';
import { isCadFile } from '../../lib/cadPreview';
import { analyzeCadFile } from '../../lib/cadAnalyze';
import type { CadGroup } from '../../lib/cadAnalyze';
import { renderPdfToDataUrl } from '../../lib/pdfPreview';
import { isFacilioApiConfigured } from '../../lib/facilioApi';
import { uploadFloorplanFile } from '../../lib/facilioApiDataSource';
import { measureImageDataUrl } from '../../lib/geoReference';
import styles from './FloorUploadModal.module.css';

const ACCEPT = '.png,.jpg,.jpeg,.pdf,.dwg,.dxf,image/png,image/jpeg,application/pdf';

export function FloorUploadModal() {
  const { state, actions } = useFloorplan();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  if (!state.uploadOpen) return null;

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus('working');
    setError(null);
    try {
      const isPlainImage = /\.(png|jpe?g)$/i.test(file.name);
      let previewUrl: string;
      let cadGroups: CadGroup[] = [];
      if (isCadFile(file.name)) {
        // One document-open pass renders the snapshot AND extracts the
        // drawing's mappable structure (blocks/polylines/circles by layer)
        // for the auto-map modal.
        const analysis = await analyzeCadFile(file);
        previewUrl = analysis.previewUrl;
        cadGroups = analysis.groups;
      } else if (/\.pdf$/i.test(file.name)) {
        previewUrl = await renderPdfToDataUrl(file);
      } else if (isPlainImage) {
        previewUrl = await fileToDataUrl(file);
      } else {
        throw new Error('Unsupported file type');
      }

      let uploadedFileId: number | null = null;
      let attachedToFloorPlan = false;
      if (isFacilioApiConfigured) {
        try {
          // Measured off the already-rendered preview (not the raw file) so it works
          // uniformly for PDF/DWG/DXF too — sizes the synthetic geo-reference quad
          // (see geoReference.ts) to this plan's actual aspect ratio.
          const dimensions = await measureImageDataUrl(previewUrl).catch(() => undefined);
          const uploaded = await uploadFloorplanFile(state.floorId, state.planId, file, dimensions);
          uploadedFileId = uploaded.fileId;
          attachedToFloorPlan = uploaded.attachedToFloorPlan;
          // The server round-trip (GET .../files/preview/{fileId}) returns the ORIGINAL
          // uploaded bytes — for a plain image that's a valid <img> source, so it's fine
          // (better, even — proves the real round-trip) to switch to it. For PDF/DWG/DXF
          // it's the raw PDF/CAD bytes, which an <img> can't render — keep the local
          // rendered snapshot as the actual displayed preview for those.
          if (isPlainImage) previewUrl = uploaded.previewUrl;
          if (!uploaded.attachedToFloorPlan) {
            // eslint-disable-next-line no-console
            console.warn('[FloorUploadModal] Uploaded to Facilio but could not attach to this floor\'s indoorfloorplan record:', uploaded.attachError);
          }
        } catch (uploadErr) {
          // eslint-disable-next-line no-console
          console.warn('[FloorUploadModal] Facilio upload failed, keeping the local render only', uploadErr);
        }
      }

      actions.setFloorImage(state.floorId, state.planId, previewUrl);
      actions.showToast(
        uploadedFileId
          ? attachedToFloorPlan
            ? `Floorplan uploaded to Facilio (file #${uploadedFileId})`
            : `Uploaded to Facilio (file #${uploadedFileId}) — couldn't link it to this floor's plan record`
          : `Floorplan updated from ${file.name}`
      );
      actions.setUploadOpen(false);
      setStatus('idle');
      if (isCadFile(file.name)) actions.storeCadAnalysis(state.floorId, state.planId, cadGroups);
      if (cadGroups.length > 0) {
        actions.openAutoMap(cadGroups);
      } else if (isCadFile(file.name)) {
        actions.showToast(`Floorplan updated from ${file.name} — no mappable CAD metadata found`);
      }
    } catch (err) {
      setStatus('error');
      setError(isCadFile(file.name) ? 'Could not render this CAD file in the browser. You can still store it and view it in AutoCAD.' : (err as Error).message || 'Could not read this file.');
    }
  }

  function onDrop(e: ReactDragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <Modal onClose={() => actions.setUploadOpen(false)} width={460}>
      <ModalHeader title="Upload floorplan" subtitle="PNG, JPG, PDF, DWG, or DXF" onClose={() => actions.setUploadOpen(false)} />
      <div className={styles.body}>
        <div
          className={styles.dropzone}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--ink-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M17 8l-5-5-5 5M12 3v12" />
          </svg>
          <div className={styles.dzText}>Drag a file here, or click to browse</div>
          <div className={styles.dzSub}>Supports .png .jpg .pdf .dwg .dxf</div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className={styles.hiddenInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
        {status === 'working' && <p className={styles.status}>Rendering {fileName}…</p>}
        {status === 'error' && <p className={styles.error}>{error}</p>}
        <p className={styles.note}>
          DWG/DXF files are parsed and rendered entirely in your browser (via an embedded, open-source CAD engine) — no file is uploaded to a
          conversion server.
        </p>
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={() => actions.setUploadOpen(false)}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
