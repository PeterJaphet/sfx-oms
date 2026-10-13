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
let font: Promise<string> | undefined
async function loadFont() {
  font ??= fetch('/fonts/Archivo-Regular.ttf')
    .then(async (r) => {
      if (!r.ok) throw new Error('Could not load the PDF font')
      const bytes = new Uint8Array(await r.arrayBuffer())
      let s = ''
      for (let i = 0; i < bytes.length; i += 8192)
        s += String.fromCharCode(...bytes.subarray(i, i + 8192))
      return btoa(s)
    })
    .catch((e) => {
      font = undefined
      throw e
    })
  return font
}
export async function downloadPdf(data: Report, def: ReportDefinition) {
  const [{ jsPDF }, { autoTable }, ttf] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadFont(),
  ])
  const doc = new jsPDF({
    orientation: def.columns.length > 5 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })
  doc.addFileToVFS('Archivo-Regular.ttf', ttf)
  doc.addFont('Archivo-Regular.ttf', 'Archivo', 'normal')
  doc.setFont('Archivo', 'normal')
  const width = doc.internal.pageSize.getWidth(),
    height = doc.internal.pageSize.getHeight()
  doc.setFontSize(20)
  doc.setTextColor(176, 30, 49)
  doc.text('SFx Burger OMS', 14, 18)
  doc.setFontSize(14)
  doc.setTextColor(28, 22, 21)
  doc.text(def.title, 14, 27)
  doc.setFontSize(9)
  doc.text(
    data.scope === 'current'
      ? `Outstanding now | Business day ${data.business_date} | Europe/Nicosia`
      : `${data.from} to ${data.to} | Business dates 06:00-05:59 Europe/Nicosia`,
    14,
    34,
  )
  const notes = doc.splitTextToSize(def.note, width - 28)
  doc.setTextColor(74, 64, 60)
  doc.text(notes, 14, 41)
  autoTable(doc, {
    startY: 43 + notes.length * 4,
    margin: { top: 15, right: 14, bottom: 18, left: 14 },
    head: [def.columns.map((c) => c.label)],
    body: data.rows.map((row) =>
      def.columns.map((c) => displayCell(row, c).replaceAll('—', '-')),
    ),
    styles: {
      font: 'Archivo',
      fontStyle: 'normal',
      fontSize: 8,
      cellPadding: 3,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [176, 30, 49],
      textColor: [255, 255, 255],
      fontStyle: 'normal',
    },
    alternateRowStyles: { fillColor: [251, 247, 244] },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      doc.setFontSize(8)
      doc.setTextColor(107, 96, 92)
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
