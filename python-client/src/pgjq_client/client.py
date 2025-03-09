from enum import Enum
import asyncpg
import json
from typing import Optional, List, Dict, Any, Union, cast, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

@dataclass
class Job:
    job_id: str
    read_ct: int
    enqueued_at: datetime
    dequeued_at: Optional[datetime]
    staled_at: Optional[datetime]
    completed_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    failed_at: Optional[datetime]
    job: Dict[str, Any]
    headers: Optional[Dict[str, Any]]
    status: str
    stale_after: timedelta
    priority: int

@dataclass
class JobListResult:
    total_count: int
    jobs: List[Job]

@dataclass
class TotalMetricsResult:
    total_queues: int
    total_jobs: int
    pending_count: int
    failed_count: int
    staled_count: int
    completed_count: int
    cancelled_count: int
    active_count: int

@dataclass
class MetricsResult:
    queue_name: str
    queue_length: int
    newest_job_age_sec: int
    oldest_job_age_sec: int
    total_jobs: int
    scrape_time: datetime
    queue_visible_length: int
    pending_count: int
    failed_count: int
    staled_count: int
    completed_count: int
    cancelled_count: int
    active_count: int

@dataclass
class JobChartRecord:
    timestamp: datetime
    pending_count: int
    active_count: int
    completed_count: int
    failed_count: int
    cancelled_count: int
    staled_count: int

class JobStatus(Enum):
    PENDING = 'pending'
    ACTIVE = 'active'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'
    STALE = 'stale'

class PGJobQueue:
    def __init__(self, dsn: str):
        self.dsn = dsn
        self._pool: Optional[asyncpg.Pool] = None

    async def connect(self) -> None:
        """Initialize connection pool"""
        if not self._pool:
            self._pool = await asyncpg.create_pool(self.dsn, timeout=10)

    async def close(self) -> None:
        """Close connection pool"""
        if self._pool:
            await self._pool.close()
            self._pool = None

    async def create_queue(self, queue_name: str) -> None:
        """Create a new queue"""
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            await conn.execute('SELECT pgjq.create_queue($1)', queue_name, timeout=10)

    async def drop_queue(self, queue_name: str) -> bool:
        """Drop an existing queue"""
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            return await conn.fetchval('SELECT pgjq.drop_queue($1)', queue_name, timeout=10)

    async def queue_exists(self, queue_name: str) -> bool:
        """Check if a queue exists"""
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            return await conn.fetchval('SELECT pgjq.queue_exists($1)', queue_name, timeout=10)

    async def purge_queue(self, queue_name: str) -> int:
        """Purge all jobs from a queue"""
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            return await conn.fetchval('SELECT pgjq.purge_queue($1)', queue_name, timeout=10)

    async def enqueue(
        self, 
        queue_name: str, 
        job: Dict[str, Any], 
        stale_after: timedelta = timedelta(minutes=10),
        priority: int = 0
    ) -> str:
        """
        Enqueue a job
        
        Args:
            queue_name: Name of the queue
            job: Job data (will be stored as JSONB)
            stale_after: Interval after which the job is considered stale (as string, e.g. "10 minutes")
            priority: Priority of the job (higher values = higher priority)
            
        Returns:
            Job ID
        """
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            job_id = await conn.fetchval(
                'SELECT * FROM pgjq.enqueue($1::text, $2::jsonb, $3::interval, $4::integer)', 
                queue_name, 
                json.dumps(job),
                stale_after,
                priority,
                timeout=10
            )
            return cast(str, job_id)

    async def dequeue(self, queue_name: str) -> Optional[Job]:
        """
        Dequeue a job from the queue
        
        Args:
            queue_name: Name of the queue
            
        Returns:
            Job record or None if no jobs available
        """
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            record = await conn.fetchrow('SELECT * FROM pgjq.dequeue($1)', queue_name, timeout=10)
            if record:
                return Job(
                    job_id=record['job_id'],
                    read_ct=record['read_ct'],
                    enqueued_at=record['enqueued_at'],
                    dequeued_at=record['dequeued_at'],
                    staled_at=record['staled_at'],
                    completed_at=record['completed_at'],
                    cancelled_at=record['cancelled_at'],
                    failed_at=record['failed_at'],
                    job=record['job'],
                    headers=record['headers'],
                    status=record['status'],
                    stale_after=timedelta(seconds=record['stale_after'].total_seconds()),
                    priority=record['priority']
                )
            return None

    async def ack(self, queue_name: str, job_id: str) -> bool:
        """
        Acknowledge a job as completed
        
        Args:
            queue_name: Name of the queue
            job_id: ID of the job to acknowledge
            
        Returns:
            Boolean indicating success
        """
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            return await conn.fetchval('SELECT pgjq.ack($1, $2)', queue_name, job_id, timeout=10)

    async def nack(self, queue_name: str, job_id: str) -> bool:
        """
        Mark a job as failed
        
        Args:
            queue_name: Name of the queue
            job_id: ID of the job to mark as failed
            
        Returns:
            Boolean indicating success
        """
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            return await conn.fetchval('SELECT pgjq.nack($1, $2)', queue_name, job_id, timeout=10)

    async def delete_job(self, queue_name: str, job_id: str) -> bool:
        """
        Delete a job from the queue
        
        Args:
            queue_name: Name of the queue
            job_id: ID of the job to delete
            
        Returns:
            Boolean indicating success
        """
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            return await conn.fetchval('SELECT pgjq.delete_queue($1, $2)', queue_name, job_id, timeout=10)

    async def list_jobs(
        self,
        queue_name: str,
        page: int = 1,
        per_page: int = 50,
        sort_by: str = 'job_id',
        sort_dir: str = 'ASC',
        statuses: Optional[Sequence[JobStatus]] = None
    ) -> JobListResult:
        """
        List jobs in a queue with pagination and filtering.

        Args:
            queue_name: Name of the queue
            page: Page number (1-based)
            per_page: Number of items per page (max 1000)
            sort_by: Column to sort by ('job_id', 'read_ct', 'enqueued_at', 'dequeued_at', 'status', 'priority')
            sort_dir: Sort direction ('ASC' or 'DESC')
            statuses: Optional list of statuses to filter by ('pending', 'active', 'completed', 'failed', 'cancelled', 'stale')

        Returns:
            JobListResult containing total count and list of jobs
        """
        if not self._pool:
            raise RuntimeError("Not connected to database")
            
        async with self._pool.acquire() as conn:
            records = await conn.fetch(
                'SELECT * FROM pgjq.list_jobs($1, $2, $3, $4, $5, $6::pgjq.job_status[])',
                queue_name,
                page,
                per_page,
                sort_by,
                sort_dir,
                [status.value for status in statuses] if statuses else None,
                timeout=10
            )
            
            jobs = []
            for record in records:
                jobs.append(Job(
                    job_id=record['job_id'],
                    read_ct=record['read_ct'],
                    enqueued_at=record['enqueued_at'],
                    dequeued_at=record['dequeued_at'],
                    staled_at=record['staled_at'],
                    completed_at=record['completed_at'],
                    cancelled_at=record['cancelled_at'],
                    failed_at=record['failed_at'],
                    job=record['job'],
                    headers=record['headers'],
                    status=record['status'],
                    stale_after=timedelta(seconds=record['stale_after'].total_seconds()),
                    priority=record['priority']
                ))

            # Get total count for pagination
            total_count = await conn.fetchval(
                'SELECT COUNT(*) FROM pgjq.list_jobs($1, NULL, NULL, $2, $3, $4::pgjq.job_status[])',
                queue_name,
                sort_by,
                sort_dir,
                [status.value for status in statuses] if statuses else None,
                timeout=10
            )

            return JobListResult(total_count=total_count, jobs=jobs)

    async def list_queues(self) -> List[Dict[str, Any]]:
        """List all queues"""
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            records = await conn.fetch('SELECT * FROM pgjq.list_queues()', timeout=10)
            return [dict(r) for r in records]

    async def get_metrics(self, queue_name: str) -> MetricsResult:
        """Get metrics for a specific queue"""
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            record = await conn.fetchrow('SELECT * FROM pgjq.metrics($1)', queue_name, timeout=10)
            return MetricsResult(
                queue_name=record['queue_name'],
                queue_length=record['queue_length'],
                newest_job_age_sec=record['newest_job_age_sec'],
                oldest_job_age_sec=record['oldest_job_age_sec'],
                total_jobs=record['total_jobs'],
                scrape_time=record['scrape_time'],
                queue_visible_length=record['queue_visible_length'],
                pending_count=record['pending_count'],
                failed_count=record['failed_count'],
                staled_count=record['staled_count'],
                completed_count=record['completed_count'],
                cancelled_count=record['cancelled_count'],
                active_count=record['active_count']
            )

    async def get_all_metrics(self) -> List[MetricsResult]:
        """Get metrics for all queues"""
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            records = await conn.fetch('SELECT * FROM pgjq.metrics_all()', timeout=10)
            return [MetricsResult(**dict(r)) for r in records]
        
    async def get_total_metrics(self) -> TotalMetricsResult:
        """Get total metrics for all queues"""
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            record = await conn.fetchrow('SELECT * FROM pgjq.metrics_total()', timeout=10)
            return TotalMetricsResult(
                total_queues=record['total_queues'],
                total_jobs=record['total_jobs'],
                pending_count=record['pending_count'],
                failed_count=record['failed_count'],
                staled_count=record['staled_count'],
                completed_count=record['completed_count'],
                cancelled_count=record['cancelled_count'],
                active_count=record['active_count']
            )

    async def get_jobs_chart(self, queue_name: str) -> List[JobChartRecord]:
        """
        Get the jobs chart for a queue
        
        Args:
            queue_name: Name of the queue
            
        Returns:
            Array of job chart records
        """
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            records = await conn.fetch('SELECT * FROM pgjq.jobs_chart($1)', queue_name, timeout=10)
            return [JobChartRecord(
                timestamp=r['timestamp'],
                pending_count=r['pending_count'],
                active_count=r['active_count'],
                completed_count=r['completed_count'],
                failed_count=r['failed_count'],
                cancelled_count=r['cancelled_count'],
                staled_count=r['staled_count']
            ) for r in records]

    async def mark_stale_jobs(self, queue_name: str) -> Any:
        """
        Mark stale jobs in a queue
        
        Args:
            queue_name: Name of the queue
            
        Returns:
            Result of the operation
        """
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            return await conn.fetch('SELECT pgjq.mark_stale_jobs($1)', queue_name, timeout=10)

    async def get_job(self, queue_name: str, job_id: str) -> Job:
        """
        Get a specific job by ID
        
        Args:
            queue_name: Name of the queue
            job_id: ID of the job to retrieve
            
        Returns:
            Job record
        """
        if not self._pool:
            raise RuntimeError("Not connected to database")
        async with self._pool.acquire() as conn:
            record = await conn.fetchrow('SELECT * FROM pgjq.get_job($1, $2)', queue_name, job_id, timeout=10)
            return Job(
                job_id=record['job_id'],
                read_ct=record['read_ct'],
                enqueued_at=record['enqueued_at'],
                dequeued_at=record['dequeued_at'],
                staled_at=record['staled_at'],
                completed_at=record['completed_at'],
                cancelled_at=record['cancelled_at'],
                failed_at=record['failed_at'],
                job=record['job'],
                headers=record['headers'],
                status=record['status'],
                stale_after=timedelta(seconds=record['stale_after'].total_seconds()),
                priority=record['priority']
            )

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
