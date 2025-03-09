"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const client_1 = require("./client");
const node_process_1 = __importDefault(require("node:process"));
// Load environment variables
(0, dotenv_1.config)();
const DATABASE_URL = node_process_1.default.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
}
const client = new client_1.PGJobQueue(DATABASE_URL);
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
    }
    catch (err) {
        console.error("Error:", err);
    }
}
if (require.main === module) {
    main().catch(console.error);
}
