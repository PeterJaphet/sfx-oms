import {
  displayCell,
  type Column,
  type Report,
  type ReportDefinition,
} from './report-model'
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(value)
  const raw = String(value)
  let start = 0
  while (
    start < raw.length &&
    (raw.charCodeAt(start) <= 32 || raw[start].trim() === '')
  )
    start++
  const safe = /^[=+\-@]/.test(raw.slice(start)) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}
export function reportCsv(data: Report, columns: Column[]) {
  return (
    '\uFEFF' +
    [
      columns.map((c) => csvCell(c.label)).join(','),
      ...data.rows.map((row) =>
        columns.map((c) => csvCell(row[c.key])).join(','),
      ),
    ].join('\r\n') +
    '\r\n'
  )
}
export function exportName(def: ReportDefinition, data: Report, ext: string) {
  return data.scope === 'current'
    ? `sfx-${def.name}-outstanding-now-${data.business_date}.${ext}`
    : `sfx-${def.name}-${data.from}-to-${data.to}.${ext}`
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
export function downloadCsv(data: Report, def: ReportDefinition) {
  download(
    new Blob([reportCsv(data, def.columns)], {
      type: 'text/csv;charset=utf-8',
    }),
    exportName(def, data, 'csv'),
  )
}
let assets: Promise<{ body: string; regular: string; bold: string; legacy: string; logo: string }> | undefined
async function loadPdfAssets() {
  async function base64(path: string) {
    const response = await fetch(path)
    if (!response.ok) throw new Error('Could not load the PDF brand assets')
    const bytes = new Uint8Array(await response.arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return btoa(text)
  }
  assets ??= Promise.all([
    base64('/fonts/Antic-Regular.ttf'), base64('/fonts/LeagueSpartan-Regular.ttf'),
    base64('/fonts/LeagueSpartan-Bold.ttf'), base64('/fonts/Archivo-Regular.ttf'), base64('/brand/logo-report.png'),
  ]).then(([body, regular, bold, legacy, logo]) => ({ body, regular, bold, legacy, logo: `data:image/png;base64,${logo}` }))
    .catch(error => { assets = undefined; throw error })
  return assets
}
// Antic's supplied face lacks currency and Turkish glyphs. The brand heading face covers them.
// Codepoints in the existing Archivo PDF font but absent from both brand faces.
const legacyGlyphs = new Set([
  306, 307, 329, 383, 413, 461, 463, 465, 467, 469, 471, 473, 475, 626, 697, 698,
  787, 821, 822, 823, 824, 916, 937, 956, 960, 7716, 7717, 7778, 7779, 7788, 7789, 8201,
  8208, 8209, 8213, 8215, 8242, 8243, 8254, 8274, 8304, 8309, 8310, 8311, 8312, 8313, 8319, 8320,
  8321, 8322, 8323, 8324, 8325, 8326, 8327, 8328, 8329, 8345, 8453, 8467, 8471, 8486, 8494, 8592,
  8593, 8594, 8595, 8596, 8597, 8616, 8706, 8709, 8710, 8719, 8721, 8730, 8734, 8735, 8745, 8747,
  8801, 8962, 8976, 8992, 8993, 9674, 10216, 10217, 57599, 61437, 61440, 65279,
])
function bodyFont(text: string) {
  if (Array.from(text).some(char => legacyGlyphs.has(char.codePointAt(0)!))) return 'Archivo'
  return /[^\u0020-\u007e\n]/u.test(text) ? 'LeagueSpartan' : 'Antic'
}
export async function downloadPdf(data: Report, def: ReportDefinition) {
  const [{ jsPDF }, { autoTable }, brand] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadPdfAssets(),
  ])
  const doc = new jsPDF({
    orientation: def.columns.length > 5 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })
  for (const [file, family, style, ttf] of [
    ['Antic-Regular.ttf', 'Antic', 'normal', brand.body],
    ['LeagueSpartan-Regular.ttf', 'LeagueSpartan', 'normal', brand.regular],
    ['LeagueSpartan-Bold.ttf', 'LeagueSpartan', 'bold', brand.bold],
    ['Archivo-Regular.ttf', 'Archivo', 'normal', brand.legacy],
  ]) {
    doc.addFileToVFS(file, ttf)
    doc.addFont(file, family, style)
  }
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight()
  doc.addImage(brand.logo, 'PNG', 12, 10, 64, 26.14)
  doc.setFont('LeagueSpartan', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(44, 44, 44)
  const titles: string[] = doc.splitTextToSize(def.title, width - 28)
  doc.text(titles, 14, 46)
  const metadataY = 46 + (titles.length - 1) * 8 + 8
  const metadata = data.scope === 'current'
    ? `Outstanding now | Business day ${data.business_date} | Europe/Nicosia`
    : `${data.from} to ${data.to} | Business dates 06:00-05:59 Europe/Nicosia`
  doc.setFont('Antic', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(91, 76, 64)
  doc.text(metadata, 14, metadataY)
  doc.setFont(bodyFont(def.note), 'normal')
  const notes: string[] = doc.splitTextToSize(def.note, width - 28)
  doc.text(notes, 14, metadataY + 7)
  autoTable(doc, {
    startY: metadataY + 9 + notes.length * 4,
    margin: { top: 23, right: 14, bottom: 18, left: 14 },
    head: [def.columns.map((c) => c.label)],
    body: data.rows.map((row) =>
      def.columns.map((c) => displayCell(row, c).replaceAll('—', '-')),
    ),
    styles: {
      font: 'Antic',
      fontStyle: 'normal',
      fontSize: 8,
      cellPadding: 3,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [215, 38, 61],
      font: 'LeagueSpartan',
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [255, 247, 235] },
    didParseCell: ({ cell, section }) => { if (section === 'body') cell.styles.font = bodyFont(cell.text.join(' ' )) },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      if (doc.getNumberOfPages() > 1) {
        doc.addImage(brand.logo, 'PNG', 12, 6, 30, 12.25)
        doc.setFont('LeagueSpartan', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(44, 44, 44)
        doc.text(def.title, width - 14, 14, { align: 'right' })
      }
      doc.setFont('Antic', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(100, 91, 80)
      doc.text(
        `Generated ${new Date(data.generated_at).toLocaleString('en-GB', { timeZone: 'Europe/Nicosia' })} | ${data.total} rows`,
        14,
        height - 9,
      )
    },
  })
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.text(`${i} / ${pages}`, width - 14, height - 9, { align: 'right' })
  }
  download(doc.output('blob'), exportName(def, data, 'pdf'))
}
