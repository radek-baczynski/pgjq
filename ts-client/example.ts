import { config } from "dotenv";
import { PGJobQueue } from "./client";
import process from "node:process";

// Load environment variables
config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = new PGJobQueue(DATABASE_URL);

async function main() {
  const queueName = "ts_q";

  try {
    // Create queue if it doesn't exist
    const queues = ["ts_q", "ts_q2", "ts_q3"];
    for (const queue of queues) {
      if (!(await client.queueExists(queue))) {
        await client.createQueue(queue);
      }
    }

    // Enqueue a test job
    for (const queue of queues) {
      for (let i = 0; i < 50; i++) {
        await client.enqueue(queue, { test: "job" });
      }
    }

    // List jobs
    const jobs = await client.listJobs(queueName);
    console.log("Jobs:", jobs);

    // Get metrics for queue
    const metrics = await client.getMetrics(queueName);
    console.log("Queue metrics:", metrics);

    // Get total metrics
    const totalMetrics = await client.getTotalMetrics();
    console.log("Total metrics:", totalMetrics);

    // Get all queue metrics
    const allMetrics = await client.getAllMetrics();
    console.log("All queue metrics:", allMetrics);

    // Get jobs chart
    const jobsChart = await client.getJobsChart(queueName);
    console.log("Jobs chart:", jobsChart);
  } catch (err) {
    console.error("Error:", err);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
