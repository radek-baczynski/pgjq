"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getQueueJobs, getQueueMetrics, getJobsChart, getJob } from "@/app/actions/queue-actions";
import JobsChart from "@/components/JobsChart";

// Define types to fix TypeScript errors
interface Job {
  job_id: string;
  status: string;
  enqueued_at: string;
  job: Record<string, unknown>;
}

interface MetricsResult {
  [key: string]: number;
}

interface JobChartRecord {
  datetime: string;
  operation: string;
  count: number;
}

export default function QueueDetailsPage() {
  const params = useParams();
  const queueName = params.queue_name as string;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortBy, setSortBy] = useState("enqueued_at");
  const [sortDir, setSortDir] = useState("desc");
  const [status, setStatus] = useState("pending");
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<MetricsResult>({});
  const [jobsChart, setJobsChart] = useState<JobChartRecord[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(10); // seconds
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const result = await getQueueJobs(
        queueName,
        page,
        perPage,
        sortBy,
        sortDir,
        [status]
      );

      const metrics = await getQueueMetrics(queueName);
      setMetrics(metrics);

      const jobsChart = await getJobsChart(queueName);
      setJobsChart(jobsChart);

      setJobs(result);
      setTotalJobs(metrics[`${status}_count`] || 0);
      setTotalPages(Math.ceil(result.length / perPage));
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchJobs();
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleSortChange = (column: string) => {
    if (sortBy === column) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  };

  const handleStatusFilter = (newStatus: string) => {
    setStatus(newStatus);
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  const handleRefreshIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRefreshInterval(Number(e.target.value));
  };

  const openJobDetails = async (job: Job) => {
    try {
      const detailedJob = await getJob(queueName, job.job_id);
      setSelectedJob(detailedJob);
      setDrawerOpen(true);
    } catch (error) {
      console.error("Error fetching job details:", error);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedJob(null);
  };

  // Effect for initial load and when filter parameters change
  useEffect(() => {
    fetchJobs();
  }, [queueName, page, perPage, sortBy, sortDir, status]);

  // Effect for auto-refresh
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (autoRefresh) {
      intervalId = setInterval(() => {
        handleRefresh();
      }, refreshInterval * 1000);
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [autoRefresh, refreshInterval, status]);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "active":
        return "bg-blue-100 text-blue-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "staled":
        return "bg-purple-100 text-purple-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Jobs in {queueName}</h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <label htmlFor="autoRefresh" className="mr-2 text-sm">
              Auto-refresh:
            </label>
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={toggleAutoRefresh}
              className="mr-2"
            />
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={handleRefreshIntervalChange}
                className="text-sm border rounded p-1"
              >
                <option value="5">5s</option>
                <option value="10">10s</option>
                <option value="30">30s</option>
                <option value="60">1m</option>
              </select>
            )}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Refreshing...
              </>
            ) : (
              "Refresh"
            )}
          </button>
        </div>
      </div>
      <JobsChart data={jobsChart} />

      <div className="mb-4">
        <div className="text-sm font-medium text-gray-700 mb-2">
          Filter by status:
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            "pending",
            "active",
            "completed",
            "failed",
            "staled",
            "cancelled",
          ].map((statusOption) => (
            <button
              type="button"
              key={statusOption}
              onClick={() => handleStatusFilter(statusOption)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                status === statusOption
                  ? getStatusBadgeColor(statusOption)
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {statusOption} ({metrics[`${statusOption}_count`] || 0})
            </button>
          ))}
        </div>
      </div>

      {(
        <>
          {jobs.length === 0 ? (
            <div className="bg-gray-50 p-8 text-center rounded-lg">
              <p className="text-gray-500">
                No jobs found with the selected filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSortChange("id")}
                      onKeyDown={(e) => e.key === 'Enter' && handleSortChange("id")}
                      tabIndex={0}
                      role="button"
                    >
                      Job ID{" "}
                      {sortBy === "id" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSortChange("status")}
                      onKeyDown={(e) => e.key === 'Enter' && handleSortChange("status")}
                      tabIndex={0}
                      role="button"
                    >
                      Status{" "}
                      {sortBy === "status" && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSortChange("created_at")}
                      onKeyDown={(e) => e.key === 'Enter' && handleSortChange("created_at")}
                      tabIndex={0}
                      role="button"
                    >
                      Enqueued At{" "}
                      {sortBy === "created_at" &&
                        (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Payload
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {jobs.map((job) => (
                    <tr 
                      key={job.job_id} 
                      onClick={() => openJobDetails(job)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {job.job_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${getStatusBadgeColor(
                            job.status
                          )}`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(job.enqueued_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {typeof job.job === "object"
                          ? `${JSON.stringify(job.job).substring(0, 50)}...`
                          : `${String(job.job).substring(0, 50)}...`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">{jobs.length}</span> of{" "}
              <span className="font-medium">{totalJobs}</span> jobs
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className={`px-3 py-1 rounded ${
                  page === 1
                    ? "bg-gray-100 text-gray-400"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Previous
              </button>
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded">
                {page}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(page + 1)}
                disabled={jobs.length < perPage}
                className={`px-3 py-1 rounded ${
                  jobs.length < perPage
                    ? "bg-gray-100 text-gray-400"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Job Details Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 overflow-hidden z-50">
          <div className="absolute inset-0 overflow-hidden">
            <div 
              className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
              onClick={closeDrawer}
            ></div>
            <section className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
              <div className="relative w-screen max-w-xl">
                <div className="h-full flex flex-col py-6 bg-white shadow-xl overflow-y-auto">
                  <div className="px-4 sm:px-6">
                    <div className="flex items-start justify-between">
                      <h2 className="text-lg font-medium text-gray-900">
                        Job Details
                      </h2>
                      <button
                        type="button"
                        onClick={closeDrawer}
                        className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                      >
                        <span className="sr-only">Close panel</span>
                        <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="mt-6 relative flex-1 px-4 sm:px-6">
                    {selectedJob && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Job ID</h3>
                          <p className="mt-1 text-sm text-gray-900">{selectedJob.job_id}</p>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Status</h3>
                          <p className="mt-1">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadgeColor(selectedJob.status)}`}>
                              {selectedJob.status}
                            </span>
                          </p>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Enqueued At</h3>
                          <p className="mt-1 text-sm text-gray-900">
                            {new Date(selectedJob.enqueued_at).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Payload</h3>
                          <div className="mt-1 bg-gray-50 p-4 rounded-md overflow-auto max-h-96">
                            <pre className="text-xs text-gray-900 whitespace-pre-wrap">
                              {typeof selectedJob.job === "object"
                                ? JSON.stringify(selectedJob.job, null, 2)
                                : String(selectedJob.job)}
                            </pre>
                          </div>
                        </div>
                        <div className="flex space-x-3 mt-6">
                          {["completed", "cancelled"].includes(selectedJob.status) && (
                            <button
                              type="button"
                              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                            >
                              View Logs
                            </button>
                          )}
                          {["failed", "staled"].includes(selectedJob.status) && (
                            <button
                              type="button"
                              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                              Retry Job
                            </button>
                          )}
                          {selectedJob.status === "pending" && (
                            <button
                              type="button"
                              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                            >
                              Cancel Job
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
