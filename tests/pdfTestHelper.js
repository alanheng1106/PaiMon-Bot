/**
 * Generates a spec-compliant minimal multi-page PDF buffer with valid cross-reference table.
 * Used across test suites to test PDF parsing and attachment workflows.
 */
export function buildPdfWithPages(pageTexts) {
    let body = '%PDF-1.4\n';
    const offsets = [];

    offsets[1] = body.length;
    body += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';

    const kids = [];
    let currentObjNum = 3;
    for (let i = 0; i < pageTexts.length; i++) {
        kids.push(currentObjNum + ' 0 R');
        currentObjNum += 2;
    }

    offsets[2] = body.length;
    body += '2 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pageTexts.length + ' >>\nendobj\n';

    currentObjNum = 3;
    const fontObjNum = currentObjNum + pageTexts.length * 2;

    for (let i = 0; i < pageTexts.length; i++) {
        const pageObj = currentObjNum;
        const contentObj = currentObjNum + 1;
        currentObjNum += 2;

        offsets[pageObj] = body.length;
        body +=
            pageObj +
            ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' +
            contentObj +
            ' 0 R /Resources << /Font << /F1 ' +
            fontObjNum +
            ' 0 R >> >> >>\nendobj\n';

        const stream = 'BT\n/F1 24 Tf\n100 700 Td\n(' + pageTexts[i] + ') Tj\nET';
        offsets[contentObj] = body.length;
        body += contentObj + ' 0 obj\n<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream\nendobj\n';
    }

    offsets[fontObjNum] = body.length;
    body += fontObjNum + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

    const startxref = body.length;
    const totalObjs = fontObjNum + 1;
    body += 'xref\n0 ' + totalObjs + '\n0000000000 65535 f\n';
    for (let i = 1; i < totalObjs; i++) {
        const off = String(offsets[i]).padStart(10, '0');
        body += off + ' 00000 n\n';
    }
    body += 'trailer\n<< /Size ' + totalObjs + ' /Root 1 0 R >>\nstartxref\n' + startxref + '\n%%EOF';

    return new TextEncoder().encode(body);
}
