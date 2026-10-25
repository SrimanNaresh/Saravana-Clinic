import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import PrescriptionPrintable from '../components/PrescriptionPrintable.jsx';

// Renders the same PrescriptionPrintable letterhead used on-screen (Print
// Prescription) off-screen, captures it as an image, and paginates it into a
// PDF — so a generated file always looks identical to the printed version.
export async function buildPrescriptionPdf({ clinic, patient, patientAge, items, notes, date, nextVisitDate, labTestNames }) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  document.body.appendChild(container);

  const root = createRoot(container);
  await new Promise((resolve) => {
    root.render(
      <PrescriptionPrintable clinic={clinic} patient={patient} patientAge={patientAge} items={items} notes={notes} date={date} nextVisitDate={nextVisitDate} labTestNames={labTestNames} />
    );
    setTimeout(resolve, 100);
  });

  const canvas = await html2canvas(container, { scale: 2, useCORS: true });
  root.unmount();
  document.body.removeChild(container);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  return pdf.output('blob');
}
