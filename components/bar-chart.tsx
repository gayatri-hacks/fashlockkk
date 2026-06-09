"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function BarChartPanel({
  data,
  xKey,
  yKey,
  color = "#2837a1",
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  color?: string;
}) {
  return (
    <div className="h-[320px] rounded-3xl border border-border bg-surface p-5 shadow-soft">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6dfd2" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: "#e6dfd2" }} />
          <YAxis tickLine={false} axisLine={{ stroke: "#e6dfd2" }} />
          <Tooltip />
          <Bar dataKey={yKey} fill={color} radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
