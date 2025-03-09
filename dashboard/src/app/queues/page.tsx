"use client";

import { useEffect, useState } from "react";
import {
  listAllQueues,
  getAllQueueMetrics,
  getTotalQueueMetrics,
} from "../actions/queue-actions";
import QueueTable from "../../components/QueueTable";

export default function QueuesPage() {
  const [queues, setQueues] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [totalMetrics, setTotalMetrics] = useState({
    total_jobs: 0,
    completed_count: 0,
    active_count: 0,
    pending_count: 0,
    failed_count: 0,
    staled_count: 0,
    cancelled_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds default

  const fetchData = async () => {
    try {
      // Fetch data in parallel
      const [queuesData, metricsData, totalMetricsData] = await Promise.all([
        listAllQueues(),
        getAllQueueMetrics(),
        getTotalQueueMetrics(),
      ]);

      setQueues(queuesData);
      setMetrics(metricsData);
      setTotalMetrics(totalMetricsData);
    } catch (error) {
      console.error("Error fetching queue data:", error);
    } finally {
    }
  };

  useEffect(() => {
    fetchData();

    // Set up auto-refresh
    let intervalId: NodeJS.Timeout | undefined;
    if (autoRefresh) {
      intervalId = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval, fetchData]);

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  const handleRefreshIntervalChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setRefreshInterval(Number(e.target.value));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Queue Management</h1>
        <p className="text-gray-600">Manage your PostgreSQL Job Queues</p>
      </div>

      <div className="mb-4 flex items-center">
        <button
          onClick={fetchData}
          className="mr-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          type="button"
        >
          Refresh Now
        </button>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="autoRefresh"
            checked={autoRefresh}
            onChange={toggleAutoRefresh}
            className="mr-2"
          />
          <label htmlFor="autoRefresh" className="mr-4">
            Auto-refresh
          </label>
        </div>
        {autoRefresh && (
          <div className="flex items-center">
            <label htmlFor="refreshInterval" className="mr-2">
              Refresh every:
            </label>
            <select
              id="refreshInterval"
              value={refreshInterval}
              onChange={handleRefreshIntervalChange}
              className="border rounded p-1"
            >
              <option value={2000}>2 seconds</option>
              <option value={5000}>5 seconds</option>
              <option value={10000}>10 seconds</option>
              <option value={30000}>30 seconds</option>
              <option value={60000}>1 minute</option>
            </select>
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium mb-4">System Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Total Jobs</p>
            <p className="text-2xl font-bold">{totalMetrics.total_jobs}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-green-600">Completed Jobs</p>
            <p className="text-2xl font-bold">{totalMetrics.completed_count}</p>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-600">Active Jobs</p>
            <p className="text-2xl font-bold">{totalMetrics.active_count}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <p className="text-sm text-purple-600">Pending Jobs</p>
            <p className="text-2xl font-bold">{totalMetrics.pending_count}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <p className="text-sm text-red-600">Failed Jobs</p>
            <p className="text-2xl font-bold">{totalMetrics.failed_count}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <p className="text-sm text-red-600">Staled Jobs</p>
            <p className="text-2xl font-bold">{totalMetrics.staled_count}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <p className="text-sm text-red-600">Cancelled Jobs</p>
            <p className="text-2xl font-bold">{totalMetrics.cancelled_count}</p>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium mb-4">All Queues</h2>
        {<QueueTable queues={queues} metrics={metrics} />}
      </div>
    </div>
  );
}
