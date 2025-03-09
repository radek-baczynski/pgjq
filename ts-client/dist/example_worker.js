"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("./client");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
}
const client = new client_1.PGJobQueue(DATABASE_URL);
async function main() {
    const queueName = "ts_q2";
    let job = null;
    while (true) {
        try {
            await client.markStaleJobs(queueName);
            job = await client.dequeue(queueName);
            if (!job) {
                console.log("No job found");
                await new Promise((resolve) => setTimeout(resolve, 1000));
                continue;
            }
            console.log(job);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await client.ack(queueName, job.job_id);
        }
        catch (error) {
            console.error(error);
            if (job) {
                await client.nack(queueName, job.job_id);
            }
        }
    }
}
main();
