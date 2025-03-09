import { Job, TotalMetricsResult, MetricsResult, JobChartRecord } from "./types";
import postgres from "postgres";
export declare class PGJobQueue {
    private readonly dsn;
    private readonly sql;
    constructor(dsn: string);
    /**
     * Create a new queue
     * @param queueName Name of the queue to create
     */
    createQueue(queueName: string): Promise<void>;
    /**
     * Check if a queue exists
     * @param queueName Name of the queue to check
     * @returns Boolean indicating if the queue exists
     */
    queueExists(queueName: string): Promise<boolean>;
    /**
     * Drop a queue
     * @param queueName Name of the queue to drop
     * @returns Boolean indicating success
     */
    dropQueue(queueName: string): Promise<boolean>;
    /**
     * Purge all jobs from a queue
     * @param queueName Name of the queue to purge
     * @returns Number of jobs purged
     */
    purgeQueue(queueName: string): Promise<number>;
    /**
     * Enqueue a job
     * @param queueName Name of the queue
     * @param job Job data (will be stored as JSONB)
     * @param staleAfter Interval after which the job is considered stale
     * @param priority Priority of the job (higher values = higher priority)
     * @returns Job ID
     */
    enqueue(queueName: string, job: any, staleAfter?: string, priority?: number): Promise<string>;
    /**
     * Dequeue a job from the queue
     * @param queueName Name of the queue
     * @returns Job record or null if no jobs available
     */
    dequeue(queueName: string): Promise<Job | null>;
    /**
     * Acknowledge a job as completed
     * @param queueName Name of the queue
     * @param jobId ID of the job to acknowledge
     * @returns Boolean indicating success
     */
    ack(queueName: string, jobId: string): Promise<boolean>;
    /**
     * Mark a job as failed
     * @param queueName Name of the queue
     * @param jobId ID of the job to mark as failed
     * @returns Boolean indicating success
     */
    nack(queueName: string, jobId: string): Promise<boolean>;
    /**
     * Delete a job from the queue
     * @param queueName Name of the queue
     * @param jobId ID of the job to delete
     * @returns Boolean indicating success
     */
    deleteJob(queueName: string, jobId: string): Promise<boolean>;
    /**
     * List jobs in a queue with pagination and filtering
     * @param queueName Name of the queue
     * @param page Page number (starting from 1)
     * @param perPage Number of jobs per page
     * @param sortBy Field to sort by
     * @param sortDir Sort direction ('ASC' or 'DESC')
     * @param statuses Array of statuses to filter by
     * @returns Array of job records
     */
    listJobs(queueName: string, page?: number, perPage?: number, sortBy?: string, sortDir?: string, statuses?: string[] | null): Promise<Job[]>;
    /**
     * Get metrics for a specific queue
     * @param queueName Name of the queue
     * @returns Queue metrics
     */
    getMetrics(queueName: string): Promise<MetricsResult>;
    /**
     * Get metrics for all queues
     * @returns Array of queue metrics
     */
    getAllMetrics(): Promise<MetricsResult[]>;
    /**
     * Get total metrics across all queues
     * @returns Total metrics
     */
    getTotalMetrics(): Promise<TotalMetricsResult>;
    /**
     * List all queues
     * @returns Array of queue records
     */
    listQueues(): Promise<any[]>;
    /**
     * Get the jobs chart for a queue
     * @param queueName Name of the queue
     * @returns Array of job records
     */
    getJobsChart(queueName: string): Promise<JobChartRecord[]>;
    markStaleJobs(queueName: string): Promise<postgres.RowList<postgres.Row[]>>;
    getJob(queueName: string, jobId: string): Promise<Job>;
    /**
     * Close the database connection
     */
    close(): Promise<void>;
}
