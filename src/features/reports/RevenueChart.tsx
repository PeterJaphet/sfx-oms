import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '@/lib/format'
import type { ReportRow } from './report-model'
export default function RevenueChart({ rows }: { rows: ReportRow[] }) {
  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border bg-card p-4"
      aria-label="Revenue by day"
    >
      <h2 className="text-lg font-bold">Revenue by day</h2>
      <div className="h-56 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={rows} accessibilityLayer>
            <XAxis
              dataKey="business_date"
              tickFormatter={(v) => String(v).slice(5)}
              minTickGap={30}
              tick={{ fontSize: 12 }}
            />
            <YAxis width={55} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(v) => [formatMoney(Number(v), 'TRY'), 'Revenue']}
              labelFormatter={(v) => String(v)}
            />
            <Bar
              dataKey="net_revenue"
              fill="rgb(var(--amber))"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted">
        Exact daily values are in Sales summary and its exports.
      </p>
    </section>
  )
}
