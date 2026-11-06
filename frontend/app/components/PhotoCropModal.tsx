'use client';

import { useRef, useState, useEffect } from 'react';

const DEFAULT_OUTPUT_SIZE = 800;
const DEFAULT_MAX_BYTES = 80 * 1024; // 80 KB máximo para carga ultrarrápida
const VIEWPORT = 280;

function bytesOf(dataUrl: string) {
  return Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
}

interface PhotoCropModalProps {
  file: File;
  onCancel: () => void;
  onSave: (base64OrBlob: string, blob?: Blob) => void;
  maxDimension?: number;
  maxBytes?: number;
  format?: 'image/webp' | 'image/jpeg';
  title?: string;
}

export default function PhotoCropModal({
  file,
  onCancel,
  onSave,
  maxDimension = DEFAULT_OUTPUT_SIZE,
  maxBytes = DEFAULT_MAX_BYTES,
  format = 'image/webp',
  title = 'Enmarcar fotografía',
}: PhotoCropModalProps) {
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
    if (img) {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setPan({ x: 0, y: 0 });
      setZoom(1);
    }
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

      // El tamaño de salida es como máximo maxDimension (ej. 800px)
      const targetSize = Math.min(maxDimension, 800);
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d')!;

      // Fondo blanco en caso de transparencias
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetSize, targetSize);
      ctx.drawImage(imgRef.current, srcX, srcY, srcSize, srcSize, 0, 0, targetSize, targetSize);

      let quality = 0.82;
      let mimeType = format;
      let dataUrl = canvas.toDataURL(mimeType, quality);

      // Si el navegador no soporta webp en canvas (raro), degradar a jpeg
      if (!dataUrl.startsWith(`data:${mimeType}`)) {
        mimeType = 'image/jpeg';
        dataUrl = canvas.toDataURL(mimeType, quality);
      }

      // 1. Reducir calidad si excede maxBytes (80 KB)
      while (bytesOf(dataUrl) > maxBytes && quality > 0.35) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL(mimeType, quality);
      }

      // 2. Si todavía excede 80 KB, reducir dimensiones progresivamente
      let outSize = targetSize;
      let currentCanvas: HTMLCanvasElement = canvas;
      while (bytesOf(dataUrl) > maxBytes && outSize > 240) {
        outSize = Math.round(outSize * 0.85);
        const smaller = document.createElement('canvas');
        smaller.width = outSize;
        smaller.height = outSize;
        const sCtx = smaller.getContext('2d')!;
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, outSize, outSize);
        sCtx.drawImage(currentCanvas, 0, 0, outSize, outSize);
        currentCanvas = smaller;
        dataUrl = smaller.toDataURL(mimeType, quality);
      }

      // Crear Blob opcional
      const [header, b64] = dataUrl.split(',');
      const byteCharacters = atob(b64);
      const byteArrays = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArrays[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteArrays], { type: mimeType });

      onSave(dataUrl, blob);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2 border-b border-[#1e2d3d]">
          <h3 className="text-base font-bold text-[#dde6ef]">{title}</h3>
          <button onClick={onCancel} className="text-[#7a95aa] hover:text-[#dde6ef] text-lg">✕</button>
        </div>

        <p className="text-xs text-[#7a95aa]">
          Arrastra para centrar el rostro. La imagen se optimiza en <span className="text-[#00e5a0] font-semibold">WebP a máx. 800px (&lt;80 KB)</span> para carga instantánea.
        </p>

        {/* Viewport de recorte con marco circular visible */}
        <div
          className="relative mx-auto rounded-2xl overflow-hidden bg-black touch-none cursor-grab active:cursor-grabbing select-none"
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

          {/* Guía visual circular y esquinas oscurecidas */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[240px] h-[240px] rounded-full border-2 border-dashed border-[#00e5a0] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <span className="text-sm text-[#7a95aa]">🔍</span>
          <input
            type="range"
            min={1}
            max={3.5}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            disabled={!naturalSize}
            className="flex-1 accent-[#00e5a0]"
          />
          <span className="text-xs font-mono text-[#7a95aa] w-10 text-right">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#111820] border border-[#1e2d3d] text-[#dde6ef] text-sm font-semibold rounded-xl hover:border-[#38bdf8] transition active:scale-95"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!naturalSize || saving}
            className="flex-1 min-h-[44px] px-4 py-2.5 bg-[#00e5a0] text-[#051b14] text-sm font-bold rounded-xl hover:opacity-95 transition disabled:opacity-50 active:scale-95 shadow-sm"
          >
            {saving ? 'Optimizando…' : '✓ Enmarcar foto'}
          </button>
        </div>
      </div>
    </div>
  );
}
