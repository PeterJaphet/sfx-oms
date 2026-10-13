import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  displayCell,
  type Range,
  type Report,
  type ReportDefinition,
} from './report-model'
import { loadReport } from './report-api'
import { downloadCsv, downloadPdf } from './report-export'
export function ReportTable({
  data,
  definition,
  range,
  search = '',
  disabled = false,
}: {
  data: Report
  definition: ReportDefinition
  range: Range
  search?: string
  disabled?: boolean
}) {
  const [exporting, setExporting] = useState(false)
  async function exportData(format: 'csv' | 'pdf') {
    setExporting(true)
    try {
      const full = await loadReport(definition.name, range, 0, 0, search)
      if (full.rows.length !== full.total)
        throw new Error('The complete export was not received; try again')
      if (format === 'csv') downloadCsv(full, definition)
      else await downloadPdf(full, definition)
    } catch (e) {
      toast.error((e as Error).message, { id: 'm9-export-error' })
    } finally {
      setExporting(false)
    }
  }
  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border bg-card p-4"
      aria-label={definition.title}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{definition.title}</h2>
        <div className="flex gap-2">
          <Button
            size="secondary"
            variant="secondary"
            className="px-3 text-sm"
            disabled={disabled || exporting}
            onClick={() => {
              void exportData('csv')
            }}
            aria-label={`Export ${definition.title} CSV`}
          >
            CSV
          </Button>
          <Button
            size="secondary"
            variant="secondary"
            className="px-3 text-sm"
            disabled={disabled || exporting}
            onClick={() => {
              void exportData('pdf')
            }}
            aria-label={`Export ${definition.title} PDF`}
          >
            PDF
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">{definition.note}</p>
      {exporting ? (
        <p role="status" className="text-sm">
          Preparing complete export…
        </p>
      ) : null}
      {data.rows.length ? (
        <div
          className="max-w-full overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={`Scroll ${definition.title} table`}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              {data.from} to {data.to} · {data.total} matching rows
            </caption>
            <thead>
              <tr>
                {definition.columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className="min-w-24 whitespace-nowrap border-b p-3 text-xs font-semibold text-muted"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr
                  key={String(row.id ?? `${data.offset + index}`)}
                  className={
                    row.metric === 'Net profit'
                      ? 'bg-brand-soft font-bold text-brand-deep'
                      : ''
                  }
                >
                  {definition.columns.map((c) => (
                    <td
                      key={c.key}
                      className="max-w-80 border-b p-3 align-top last:border-line"
                    >
                      <span
                        className={
                          c.kind === 'money' || c.kind === 'number'
                            ? 'whitespace-nowrap font-semibold'
                            : 'break-words'
                        }
                      >
                        {displayCell(row, c)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-4 text-sm text-muted">
          No matching records in this report.
        </p>
      )}
      <p className="text-xs text-muted">
        {data.total} matching rows · exports include all matches.
      </p>
    </section>
  )
}
