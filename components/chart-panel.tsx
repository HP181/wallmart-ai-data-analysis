"use client";

import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export type ChartConfig = {
  type: "bar" | "line" | "pie" | "scatter" | "histogram" | "table";
  xKey: string;
  yKey: string;
  title: string;
};

type Props = {
  rows: Record<string, unknown>[];
  chartConfig: ChartConfig;
};

const COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#818cf8",
  "#c4b5fd", "#4f46e5", "#7c3aed", "#9333ea",
];

const tooltipStyle = {
  backgroundColor: "#1c1c1e",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#f4f4f5",
  fontSize: 13,
};
const tooltipLabelStyle = { color: "#a1a1aa", marginBottom: 4 };
const tooltipItemStyle  = { color: "#e4e4e7" };

export function ChartPanel({ rows, chartConfig }: Props) {
  const { type, xKey, yKey, title } = chartConfig;

  if (!rows.length) return null;

  const data = rows.map((r) => ({
    ...r,
    [yKey]: typeof r[yKey] === "string" ? parseFloat(r[yKey] as string) : r[yKey],
  }));

  const axisStyle = { fill: "#a1a1aa", fontSize: 11 };

  // For bar charts: flip to horizontal layout when there are many bars
  const useHorizontal = type === "bar" && data.length > 6;

  // Y-axis label width based on longest label string
  const maxLabelLen = Math.max(...data.map((d) => String(d[xKey] ?? "").length));
  const yAxisWidth = Math.min(Math.max(maxLabelLen * 7, 80), 160);

  // Chart height grows slightly with many horizontal bars
  const chartHeight = useHorizontal ? Math.max(280, data.length * 28) : 288;

  /* Color legend */
  const ColorLegend = () => (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 px-1">
      {data.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: COLORS[i % COLORS.length] }}
          />
          <span className="text-[11px] text-zinc-400">{String(entry[xKey])}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full mt-2">
      <p className="text-sm font-medium text-muted-foreground mb-3">{title}</p>

      <div className="w-full overflow-x-auto">
        <div style={{ width: "100%", height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            {type === "bar" ? (
              useHorizontal ? (
                /* ── Horizontal bar chart for many categories ── */
                <BarChart
                  data={data}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey={xKey}
                    type="category"
                    tick={axisStyle}
                    width={yAxisWidth}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <Bar dataKey={yKey} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {data.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                /* ── Vertical bar chart for few categories ── */
                <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey={xKey} tick={axisStyle} tickLine={false} interval={0} />
                  <YAxis tick={axisStyle} width={48} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <Bar dataKey={yKey} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {data.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              )
            ) : type === "line" ? (
              <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey={xKey} tick={axisStyle} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisStyle} width={48} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey={yKey}
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ fill: "#6366f1", r: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : type === "pie" ? (
              <PieChart>
                <Pie
                  data={data}
                  dataKey={yKey}
                  nameKey={xKey}
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                  isAnimationActive={false}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 11 }} />
              </PieChart>
            ) : type === "scatter" ? (
              <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey={xKey} type="number" tick={axisStyle} name={xKey} />
                <YAxis dataKey={yKey} type="number" tick={axisStyle} name={yKey} width={48} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={data} fill="#6366f1" isAnimationActive={false} />
              </ScatterChart>
            ) : (
              /* histogram */
              <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey={xKey} tick={axisStyle} tickLine={false} />
                <YAxis tick={axisStyle} width={48} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Bar dataKey={yKey} radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Color legend — shown for bar and histogram */}
      {(type === "bar" || type === "histogram") && <ColorLegend />}
    </div>
  );
}
