import { jsPDF } from 'jspdf';

const MAX_BYTES = 8 * 1024 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve(img); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name} as an image`)); };
    img.src = url;
  });
}

// Redraws the image onto a canvas capped at maxDimension on its longer side
// and re-encodes it as a JPEG at the given quality — this is what actually
// shrinks a multi-MB camera photo down to a size that fits in a shared PDF.
function toCompressedEntry(img, maxDimension, quality) {
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width, height };
}

// Combines up to a handful of photos into a single PDF (one photo per page,
// sized to that photo's own aspect ratio), auto-compressing in progressively
// smaller/lower-quality passes until the whole file fits under maxBytes —
// phone camera photos routinely run several MB each, and several of those
// need to fit together in one 8 MB attachment.
export async function buildPdfFromImages(files, { maxBytes = MAX_BYTES } = {}) {
  if (!files?.length) throw new Error('No photos to convert');

  const images = await Promise.all(files.map(loadImage));

  const attempts = [
    { maxDimension: 1600, quality: 0.75 },
    { maxDimension: 1400, quality: 0.6 },
    { maxDimension: 1100, quality: 0.5 },
    { maxDimension: 900, quality: 0.4 },
    { maxDimension: 700, quality: 0.3 },
  ];

  for (const { maxDimension, quality } of attempts) {
    const entries = images.map((img) => toCompressedEntry(img, maxDimension, quality));
    const first = entries[0];
    const pdf = new jsPDF({
      unit: 'pt',
      format: [first.width, first.height],
      orientation: first.width >= first.height ? 'landscape' : 'portrait',
    });
    entries.forEach((entry, i) => {
      if (i > 0) pdf.addPage([entry.width, entry.height], entry.width >= entry.height ? 'landscape' : 'portrait');
      pdf.addImage(entry.dataUrl, 'JPEG', 0, 0, entry.width, entry.height);
    });
    const blob = pdf.output('blob');
    if (blob.size <= maxBytes) return blob;
  }

  throw new Error('Could not compress these photos below 8 MB — try fewer or smaller photos.');
}
