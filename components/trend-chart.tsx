"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#2837a1", "#1e7d50", "#a63d3d", "#9a6c11", "#5b3f8c"];

export function TrendChart({
  series,
  keywords,
}: {
  series: Array<Record<string, string | number>>;
  keywords: string[];
}) {
  return (
    <div className="h-[360px] rounded-3xl border border-border bg-surface p-5 shadow-soft">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6dfd2" />
          <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: "#e6dfd2" }} />
          <YAxis tickLine={false} axisLine={{ stroke: "#e6dfd2" }} />
          <Tooltip />
          <Legend />
          {keywords.map((keyword, index) => (
            <Line
              key={keyword}
              type="monotone"
              dataKey={keyword}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2.5}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
