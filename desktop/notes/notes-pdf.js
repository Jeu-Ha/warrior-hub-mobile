/* Offline PDF writer: each notebook section becomes an A4 page with a full-resolution JPEG. */
(() => {
  'use strict';
  const encode = value => new TextEncoder().encode(value);
  class NotebookPDF {
    constructor() { this.pages = []; }
    async addCanvas(canvas) {
      const jpeg = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not render PDF page')), 'image/jpeg', .94));
      this.pages.push({ bytes: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height });
    }
    toBlob() {
      if (!this.pages.length) throw new Error('There are no pages to export');
      const chunks = [], offsets = [0]; let length = 0;
      const append = value => { const bytes = typeof value === 'string' ? encode(value) : value; chunks.push(bytes); length += bytes.length; };
      const object = (id, parts) => { offsets[id] = length; append(`${id} 0 obj\n`); parts.forEach(append); append('\nendobj\n'); };
      append('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
      object(2, [`<< /Type /Pages /Count ${this.pages.length} /Kids [${this.pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`]);
      this.pages.forEach((page, i) => {
        const id = 3 + i * 3, w = 595.276, h = 841.89, margin = 12;
        const scale = Math.min((w - margin * 2) / page.width, (h - margin * 2) / page.height);
        const pw = page.width * scale, ph = page.height * scale;
        const content = encode(`q\n${pw.toFixed(4)} 0 0 ${ph.toFixed(4)} ${((w - pw) / 2).toFixed(4)} ${((h - ph) / 2).toFixed(4)} cm\n/Im0 Do\nQ\n`);
        object(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`]);
        object(id + 1, [`<< /Length ${content.length} >>\nstream\n`, content, 'endstream']);
        object(id + 2, [`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`, page.bytes, '\nendstream']);
      });
      const start = length, count = offsets.length;
      append(`xref\n0 ${count}\n0000000000 65535 f \n`);
      for (let id = 1; id < count; id++) append(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
      append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
      return new Blob(chunks, { type: 'application/pdf' });
    }
  }
  window.NotebookPDF = NotebookPDF;
})();
