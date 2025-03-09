import { Job, TotalMetricsResult, MetricsResult, JobChartRecord } from "./types";
import postgres from "postgres";

export class PGJobQueue {
  private readonly sql: postgres.Sql;

  constructor(private readonly dsn: string) {
    this.dsn = dsn;
    this.sql = postgres(this.dsn);
  }


  /**
   * Create a new queue
   * @param queueName Name of the queue to create
   */
  async createQueue(queueName: string): Promise<void> {
    await this.sql`SELECT pgjq.create_queue(${queueName})`;
  }

  /**
   * Check if a queue exists
   * @param queueName Name of the queue to check
   * @returns Boolean indicating if the queue exists
   */
  async queueExists(queueName: string): Promise<boolean> {
    const result = await this.sql`SELECT pgjq.queue_exists(${queueName})`;
    return result[0].queue_exists;
  }

  /**
   * Drop a queue
   * @param queueName Name of the queue to drop
   * @returns Boolean indicating success
   */
  async dropQueue(queueName: string): Promise<boolean> {
    const result = await this.sql`SELECT pgjq.drop_queue(${queueName})`;
    return result[0].drop_queue;
  }

  /**
   * Purge all jobs from a queue
   * @param queueName Name of the queue to purge
   * @returns Number of jobs purged
   */
  async purgeQueue(queueName: string): Promise<number> {
    const result = await this.sql`SELECT pgjq.purge_queue(${queueName})`;
    return result[0].purge_queue;
  }

  /**
   * Enqueue a job
   * @param queueName Name of the queue
   * @param job Job data (will be stored as JSONB)
   * @param staleAfter Interval after which the job is considered stale
   * @param priority Priority of the job (higher values = higher priority)
   * @returns Job ID
   */
  async enqueue(
    queueName: string,
    job: any,
    staleAfter: string = "10 minutes",
    priority: number = 0
  ): Promise<string> {
    const result = await this
      .sql`SELECT * FROM pgjq.enqueue(${queueName}, ${job}, ${staleAfter}::interval, ${priority})`;
    return result[0].enqueue;
  }

  /**
   * Dequeue a job from the queue
   * @param queueName Name of the queue
   * @returns Job record or null if no jobs available
   */
  async dequeue(queueName: string): Promise<Job | null> {
    const result = await this.sql<Job[]>`SELECT * FROM pgjq.dequeue(${queueName})`;
    return result.length > 0 ? result[0] as Job : null;
  }

  /**
   * Acknowledge a job as completed
   * @param queueName Name of the queue
   * @param jobId ID of the job to acknowledge
   * @returns Boolean indicating success
   */
  async ack(queueName: string, jobId: string): Promise<boolean> {
    const result = await this.sql`SELECT pgjq.ack(${queueName}, ${jobId})`;
    return result[0].ack;
  }

  /**
   * Mark a job as failed
   * @param queueName Name of the queue
   * @param jobId ID of the job to mark as failed
   * @returns Boolean indicating success
   */
  async nack(queueName: string, jobId: string): Promise<boolean> {
    const result = await this.sql`SELECT pgjq.nack(${queueName}, ${jobId})`;
    return result[0].nack;
  }

  /**
   * Delete a job from the queue
   * @param queueName Name of the queue
   * @param jobId ID of the job to delete
   * @returns Boolean indicating success
   */
  async deleteJob(queueName: string, jobId: string): Promise<boolean> {
    const result = await this
      .sql`SELECT pgjq.delete_queue(${queueName}, ${jobId})`;
    return result[0].delete_queue;
  }

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
  async listJobs(
    queueName: string,
    page: number = 1,
    perPage: number = 50,
    sortBy: string = "job_id",
    sortDir: string = "ASC",
    statuses: string[] | null = null
  ): Promise<Job[]> {
    if (statuses) {
      return await this
        .sql`SELECT * FROM pgjq.list_jobs(${queueName}, ${page}, ${perPage}, ${sortBy}, ${sortDir}, ${statuses}::pgjq.job_status[])`;
    } else {
      return await this
        .sql`SELECT * FROM pgjq.list_jobs(${queueName}, ${page}, ${perPage}, ${sortBy}, ${sortDir})`;
    }
  }

  /**
   * Get metrics for a specific queue
   * @param queueName Name of the queue
   * @returns Queue metrics
   */
  async getMetrics(queueName: string): Promise<MetricsResult> {
    const result = await this.sql<MetricsResult[]>`SELECT * FROM pgjq.metrics(${queueName})`;
    return result[0] as MetricsResult;
  }

  /**
   * Get metrics for all queues
   * @returns Array of queue metrics
   */
  async getAllMetrics(): Promise<MetricsResult[]> {
    return await this.sql`SELECT * FROM pgjq.metrics_all()`;
  }

  /**
   * Get total metrics across all queues
   * @returns Total metrics
   */
  async getTotalMetrics(): Promise<TotalMetricsResult> {
    const result = await this.sql<TotalMetricsResult[]>`SELECT * FROM pgjq.metrics_total()`;
    return result[0] as TotalMetricsResult;
  }

  /**
   * List all queues
   * @returns Array of queue records
   */
  async listQueues(): Promise<any[]> {
    return await this.sql`SELECT * FROM pgjq.list_queues()`;
  }

  /**
   * Get the jobs chart for a queue
   * @param queueName Name of the queue
   * @returns Array of job records
   */
  async getJobsChart(queueName: string): Promise<JobChartRecord[]> {
    
    return await this.sql`SELECT * FROM pgjq.jobs_chart(${queueName})`;
  }

  async markStaleJobs(queueName: string) {
    const result = await this.sql`SELECT pgjq.mark_stale_jobs(${queueName})`;
    return result
  }

  async getJob(queueName: string, jobId: string): Promise<Job> {
    const result = await this.sql`SELECT * FROM pgjq.get_job(${queueName}, ${jobId})`;
    return result[0] as Job;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    await this.sql.end();
  }
}

