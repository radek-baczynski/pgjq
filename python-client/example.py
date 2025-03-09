import asyncio
import os

from client import JobStatus, PGJobQueue
from devtools import debug
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


async def main():
    queue_name = "other_q"
    async with PGJobQueue(DATABASE_URL) as client:
        if not await client.queue_exists(queue_name):
            await client.create_queue(queue_name)
        await client.enqueue(queue_name, {"test": "job"})
        # msg = await client.pop("test_queue")

        # await client.ack("test_queue", 2)

        jobs = await client.list_jobs(queue_name)
        debug(jobs)

        metrics = await client.get_metrics(queue_name)
        debug(metrics)

        total_metrics = await client.get_total_metrics()
        debug(total_metrics)

        all_metrics = await client.get_all_metrics()
        debug(all_metrics)




if __name__ == "__main__":
    asyncio.run(main())
