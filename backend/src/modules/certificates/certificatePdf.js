/**
 * IntelliCore V2.0 — Pure Node.js Standard Vector PDF Certificate Generator
 * 
 * Generates an on-demand standard PDF-1.4 landscape certificate of completion
 * with vector borders, typography, metadata, and online verification code.
 * Zero external dependencies.
 */

export function buildCertificatePdf({
  recipientName = 'Candidate Name',
  positionTitle = 'Software Engineering Intern',
  departmentName = 'Software Engineering',
  commencementDate = '2026-01-01',
  completionDate = '2026-06-30',
  certificateCode = 'IC-CERT-2026-SAMPLE',
  verificationUrl = 'https://www.intellicoretechnologies.in/verify'
} = {}) {
  // Format dates cleanly
  const formatDate = (d) => {
    try {
      return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return String(d);
    }
  };

  const formattedStart = formatDate(commencementDate);
  const formattedEnd = formatDate(completionDate);
  const issuedDate = formatDate(new Date());

  // Vector graphics and text stream (792 x 612 Landscape Letter)
  // Coordinates: 0,0 is bottom-left, 792,612 is top-right
  const streamCommands = [
    // Outer Border (Dark Indigo / Navy)
    'q',
    '0.05 0.08 0.18 rg', // Fill background with deep dark theme
    '0 0 792 612 re f',
    // Elegant Outer Gold Border
    '0.85 0.70 0.35 RG', // Gold stroke
    '4 w',
    '30 30 732 552 re S',
    // Inner Cyan Accent Border
    '0.0 0.85 0.95 RG', // Cyan stroke
    '1.5 w',
    '38 38 716 536 re S',
    'Q',

    // Text Content Block
    'BT',
    // Organization Brand
    '/F1 26 Tf',
    '0.0 0.85 0.95 rg', // Cyan text
    '120 515 Td (INTELLICORE TECHNOLOGIES) Tj',

    // Subtitle
    '/F2 14 Tf',
    '0.85 0.88 0.92 rg', // Light silver
    '0 -28 Td (CERTIFICATE OF INTERNSHIP COMPLETION) Tj',

    // Honors kicker
    '/F2 12 Tf',
    '0.65 0.70 0.80 rg', // Muted slate
    '0 -36 Td (THIS IS PROUDLY PRESENTED TO) Tj',

    // Recipient Name (Bold, Prominent Gold)
    '/F1 30 Tf',
    '0.95 0.80 0.40 rg', // Rich Gold
    `0 -44 Td (${escapePdfText(recipientName)}) Tj`,

    // Achievement text
    '/F2 13 Tf',
    '0.85 0.88 0.92 rg',
    `0 -38 Td (for outstanding performance and successful completion of the internship as) Tj`,

    // Position & Department
    '/F1 16 Tf',
    '0.0 0.85 0.95 rg',
    `0 -26 Td (${escapePdfText(positionTitle)}  -  Department of ${escapePdfText(departmentName)}) Tj`,

    // Duration
    '/F2 12 Tf',
    '0.75 0.80 0.88 rg',
    `0 -28 Td (Tenure: ${formattedStart} to ${formattedEnd}) Tj`,

    // Verification Footer Box
    '/F2 10 Tf',
    '0.60 0.65 0.75 rg',
    `0 -52 Td (Official Verification Code: ${escapePdfText(certificateCode)}) Tj`,
    `0 -18 Td (Verify online authenticity at: ${escapePdfText(verificationUrl)}) Tj`,

    // Signature Placeholders
    '/F1 11 Tf',
    '0.85 0.70 0.35 rg',
    '0 -55 Td (Abhishek Kumar) Tj',
    '380 0 Td (Director of Talent & HR) Tj',

    '/F2 9 Tf',
    '0.60 0.65 0.75 rg',
    '-380 -14 Td (Founder & Principal Architect) Tj',
    '380 0 Td (IntelliCore People Operations) Tj',

    `0 -20 Td (Issued on: ${issuedDate}) Tj`,
    'ET'
  ].join('\n');

  const streamBytes = Buffer.from(streamCommands, 'latin1');
  const streamLength = streamBytes.length;

  let pdf = '%PDF-1.4\n';
  const offsets = [];

  function appendObj(str) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += str + '\n';
  }

  // 1. Catalog
  appendObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  // 2. Pages (1 landscape page)
  appendObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');

  // 3. Page Object (792 x 612 pt)
  appendObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 6 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> >>\nendobj');

  // 4. Primary Font (Helvetica-Bold)
  appendObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj');

  // 5. Secondary Font (Helvetica)
  appendObj('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj');

  // 6. Content Stream
  const streamHeader = `6 0 obj\n<< /Length ${streamLength} >>\nstream\n`;
  offsets.push(Buffer.byteLength(pdf));
  pdf += streamHeader;
  
  // Convert and add stream
  const pdfPart1 = Buffer.from(pdf, 'latin1');
  const pdfPart2 = Buffer.from('\nendstream\nendobj\n', 'latin1');

  // Calculate xref offset
  const xrefOffset = pdfPart1.length + streamBytes.length + pdfPart2.length;

  let tail = 'xref\n0 7\n0000000000 65535 f \n';
  for (const o of offsets) {
    tail += o.toString().padStart(10, '0') + ' 00000 n \n';
  }
  tail += `trailer\n<< /Size 7 /Root 1 0 R /Info << /Title (Certificate of Completion - ${escapePdfText(recipientName)}) /Producer (IntelliCore V2.0 Document Engine) >> >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.concat([pdfPart1, streamBytes, pdfPart2, Buffer.from(tail, 'latin1')]);
}

function escapePdfText(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
