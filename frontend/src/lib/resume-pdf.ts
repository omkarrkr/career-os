import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export async function readResumePdf(file: File) {
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) throw new Error('Choose a PDF file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a PDF under 10 MB.');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer(), stopAtErrors: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 15) throw new Error('Choose a PDF with 15 pages or fewer.');
    const pages: string[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim());
      page.cleanup();
    }
    const text = pages.join('\n\n').trim();
    if (!text) throw new Error('This PDF has no selectable text. If it is scanned, use a text-enabled copy or paste the text.');
    return text;
  } finally {
    await task.destroy();
  }
}
