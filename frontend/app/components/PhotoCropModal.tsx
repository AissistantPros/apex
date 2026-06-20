'use client';

import { useRef, useState, useEffect } from 'react';

const OUTPUT_SIZE = 480;
const MAX_BYTES = 250 * 1024;
const VIEWPORT = 280;

function bytesOf(dataUrl: string) {
  return Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
}

export default function PhotoCropModal({ file, onCancel, onSave }: {
  file: File; onCancel: () => void; onSave: (base64: string) => void;
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragging = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (ev) => setImgSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, [file]);

  const baseScale = naturalSize ? Math.max(VIEWPORT / naturalSize.w, VIEWPORT / naturalSize.h) : 1;
  const dispW = naturalSize ? naturalSize.w * baseScale * zoom : 0;
  const dispH = naturalSize ? naturalSize.h * baseScale * zoom : 0;
  const maxPanX = Math.max(0, (dispW - VIEWPORT) / 2);
  const maxPanY = Math.max(0, (dispH - VIEWPORT) / 2);
  const clampPan = (x: number, y: number) => ({
    x: Math.min(maxPanX, Math.max(-maxPanX, x)),
    y: Math.min(maxPanY, Math.max(-maxPanY, y)),
  });

  useEffect(() => { setPan(p => clampPan(p.x, p.y)); }, [zoom, naturalSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImgLoad = () => {
    const img = imgRef.current;
    if (img) { setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight }); setPan({ x: 0, y: 0 }); setZoom(1); }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragging.current.x;
    const dy = e.clientY - dragging.current.y;
    setPan(clampPan(dragging.current.panX + dx, dragging.current.panY + dy));
  };
  const onPointerUp = () => { dragging.current = null; };

  const handleSave = () => {
    if (!naturalSize || !imgRef.current) return;
    setSaving(true);
    try {
      const scale = baseScale * zoom;
      const srcSize = VIEWPORT / scale;
      const srcX = (dispW / 2 - VIEWPORT / 2 - pan.x) / scale;
      const srcY = (dispH / 2 - VIEWPORT / 2 - pan.y) / scale;

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imgRef.current, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      let quality = 0.9;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (bytesOf(dataUrl) > MAX_BYTES && quality > 0.35) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      let outSize = OUTPUT_SIZE;
      let src: HTMLCanvasElement = canvas;
      while (bytesOf(dataUrl) > MAX_BYTES && outSize > 120) {
        outSize = Math.round(outSize * 0.8);
        const smaller = document.createElement('canvas');
        smaller.width = outSize; smaller.height = outSize;
        smaller.getContext('2d')!.drawImage(src, 0, 0, outSize, outSize);
        src = smaller;
        dataUrl = smaller.toDataURL('image/jpeg', 0.8);
      }

      onSave(dataUrl);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[#dde6ef] mb-1">Ajustar foto</h3>
        <p className="text-xs text-[#3d5870] mb-4">Arrastra para reencuadrar. Se comprime automáticamente a menos de 250 KB.</p>

        <div
          className="relative mx-auto rounded-xl overflow-hidden bg-black touch-none cursor-grab active:cursor-grabbing select-none"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {imgSrc && (
            <img
              ref={imgRef}
              src={imgSrc}
              alt="recorte"
              onLoad={handleImgLoad}
              draggable={false}
              className="absolute top-1/2 left-1/2 select-none pointer-events-none"
              style={{
                width: naturalSize ? naturalSize.w * baseScale : 'auto',
                height: naturalSize ? naturalSize.h * baseScale : 'auto',
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            />
          )}
          <div className="absolute inset-0 pointer-events-none rounded-xl ring-1 ring-white/20" />
        </div>

        <div className="flex items-center gap-3 mt-4">
          <span className="text-xs text-[#3d5870]">🔍</span>
          <input type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            disabled={!naturalSize}
            className="flex-1" />
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-[#1e2d3d] text-[#dde6ef] text-sm font-semibold rounded-xl hover:bg-[#2a3a4d] transition">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!naturalSize || saving}
            className="flex-1 px-4 py-2.5 bg-[#00e5a0] text-black text-sm font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50">
            {saving ? 'Procesando…' : 'Guardar foto'}
          </button>
        </div>
      </div>
    </div>
  );
}
