type Job = {
    job_id: string;
    read_ct: number;
    enqueued_at: string;
    dequeued_at: string;
    staled_at: string;
    completed_at: string | null;
    cancelled_at: string | null;
    failed_at: string | null;
    job: Record<string, any>;
    headers: Record<string, any> | null;
    status: JobStatus;
    stale_after: string;
    priority: number;
};
type JobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled' | 'stale';
type TotalMetricsResult = {
    total_queues: number;
    total_jobs: number;
    pending_count: number;
    failed_count: number;
    staled_count: number;
    completed_count: number;
    cancelled_count: number;
    active_count: number;
};
type MetricsResult = {
    queue_name: string;
    queue_length: number;
    newest_job_age_sec: number;
    oldest_job_age_sec: number;
    total_jobs: number;
    scrape_time: string;
    queue_visible_length: number;
    pending_count: number;
    failed_count: number;
    staled_count: number;
    completed_count: number;
    cancelled_count: number;
    active_count: number;
};
type JobChartRecord = {
    datetime: string;
    operation: string;
    count: number;
};
export type { Job, JobStatus, TotalMetricsResult, MetricsResult, JobChartRecord };
