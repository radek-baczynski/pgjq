import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import type { JobChartRecord } from "@pgjq/ts-client";

interface JobsChartProps {
  data: JobChartRecord[];
}

const JobsChart: React.FC<JobsChartProps> = ({ data }) => {
  const [chartData, setChartData] = useState<JobChartRecord[]>([]);
  const [operations, setOperations] = useState<string[]>([]);

  // Colors for different operations
  const operationColors: Record<string, string> = {
    enqueue: "#4CAF50",
    dequeue: "#2196F3",
    complete: "#9C27B0",
    fail: "#F44336",
    delete: "#FF9800",
    stale: "#795548",
  };

  useEffect(() => {
    if (!data || data.length === 0) return;

    // Extract unique operations
    const uniqueOperations = Array.from(
      new Set(data.map((item) => item.operation))
    );
    setOperations(uniqueOperations);

    // Group data by datetime
    const groupedData = data.reduce((acc, item) => {
      const date = new Date(item.datetime);
      const formattedDate = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (!acc[formattedDate]) {
        acc[formattedDate] = { time: formattedDate };
      }

      acc[formattedDate][item.operation] = item.count;
      return acc;
    }, {} as Record<string, any>);

    // Convert to array for chart
    const chartData = Object.values(groupedData);
    setChartData(chartData);
  }, [data]);

  return (
    <div className="w-full h-80 bg-white p-4 rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-4">Job Operations Over Time</h2>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Legend />
          {operations.map((operation) => (
            <Line
              key={operation}
              type="monotone"
              dataKey={operation}
              stroke={operationColors[operation] || "#000000"}
              activeDot={{ r: 8 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default JobsChart;
