import { client } from '@/features/menu/menu-api'
import {
  dashboardSchema,
  findDefinition,
  periodsSchema,
  reportSchema,
  type Range,
} from './report-model'
export async function loadPeriods() {
  const r = await client().rpc('report_periods')
  if (r.error) throw new Error(r.error.message)
  return periodsSchema.parse(r.data)
}
export async function loadReport(
  name: string,
  range: Range,
  offset = 0,
  limit = 100,
  search = '',
) {
  const r = await client().rpc('get_report', {
    p_report: name,
    p_from: range.from,
    p_to: range.to,
    p_offset: offset,
    p_limit: limit,
    p_search: search,
  })
  if (r.error) throw new Error(r.error.message)
  const parsed = reportSchema.parse(r.data)
  if (parsed.report !== name)
    throw new Error('The requested report was not received')
  const def = findDefinition(name)
  if (def && parsed.scope !== (def.current ? 'current' : 'period'))
    throw new Error('The report scope was not received; try again')
  if (
    def &&
    parsed.rows.some((row) =>
      def.columns.some((column) => !(column.key in row)),
    )
  )
    throw new Error('The report is missing required columns; try again')
  return parsed
}
export async function loadDashboard(range: Range) {
  const r = await client().rpc('get_dashboard', {
    p_from: range.from,
    p_to: range.to,
  })
  if (r.error) throw new Error(r.error.message)
  return dashboardSchema.parse(r.data)
}
