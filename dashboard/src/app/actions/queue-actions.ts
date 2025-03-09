"use server";

import { PGJobQueue } from "@pgjq/ts-client";
import type {
  Job,
  JobListResult,
  JobStatus,
  MetricsResult,
  JobChartRecord,
} from "@pgjq/ts-client";

// Initialize the queue with the database connection string from environment variables
const getQueueInstance = () => {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return new PGJobQueue(dsn);
};

export async function listAllQueues() {
  const queue = getQueueInstance();
  try {
    const queues = await queue.listQueues();
    console.log(queues);
    return queues;
  } catch (error) {
    console.error("Error listing queues:", error);
    throw error;
  } finally {
    await queue.close();
  }
}

export async function getAllQueueMetrics() {
  const queue = getQueueInstance();
  try {
    return await queue.getAllMetrics();
  } catch (error) {
    console.error("Error getting queue metrics:", error);
    throw error;
  } finally {
    await queue.close();
  }
}

export async function getTotalQueueMetrics() {
  const queue = getQueueInstance();
  try {
    return await queue.getTotalMetrics();
  } catch (error) {
    console.error("Error getting total metrics:", error);
    throw error;
  } finally {
    await queue.close();
  }
}

export async function createNewQueue(queueName: string) {
  const queue = getQueueInstance();
  try {
    await queue.createQueue(queueName);
    return { success: true };
  } catch (error) {
    console.error("Error creating queue:", error);
    throw error;
  } finally {
    await queue.close();
  }
}

export async function deleteQueue(queueName: string) {
  const queue = getQueueInstance();
  try {
    const result = await queue.dropQueue(queueName);
    return { success: result };
  } catch (error) {
    console.error("Error deleting queue:", error);
    throw error;
  } finally {
    await queue.close();
  }
}

export async function purgeQueueJobs(queueName: string) {
  const queue = getQueueInstance();
  try {
    const count = await queue.purgeQueue(queueName);
    return { success: true, count };
  } catch (error) {
    console.error("Error purging queue:", error);
    throw error;
  } finally {
    await queue.close();
  }
}

export async function getQueueMetrics(
  queueName: string
): Promise<MetricsResult> {
  const queue = getQueueInstance();
  try {
    const result = await queue.getMetrics(queueName);
    console.log(result);
    return result;
  } catch (error) {
    console.error("Error getting queue metrics:", error);
    throw error;
  } finally {
    await queue.close();
  }
}

export async function getQueueJobs(
  queueName: string,
  page: number,
  perPage: number,
  sortBy: string,
  sortDir: string,
  statuses: string[]
): Promise<JobListResult> {
  const queue = getQueueInstance();
  try {
    if (!sortBy) {
      sortBy = "enqueued_at";
    }
    if (!sortDir) {
      sortDir = "desc";
    }
    const result = await queue.listJobs(
      queueName,
      page,
      perPage,
      sortBy,
      sortDir,
      statuses
    );
    console.log(result);

    return result;
  } catch (error) {
    console.error("Error getting queue jobs:", error);
    throw error;
  } finally {
    await queue.close();
  }
}

export async function getJobsChart(queueName: string): Promise<JobChartRecord[]> {
  const queue = getQueueInstance();
  try {
    return await queue.getJobsChart(queueName);
  } catch (error) {
    console.error("Error getting jobs chart:", error);
    throw error;
  } finally {
    await queue.close();
  }
}

export async function getJob(queueName: string, jobId: string): Promise<Job> {
  const queue = getQueueInstance();
  try {
    return await queue.getJob(queueName, jobId);
  } catch (error) {
    console.error("Error getting job:", error);
    throw error;
  } finally {
    await queue.close();
  }
}
