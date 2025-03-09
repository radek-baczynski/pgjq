'use client';

import { useState } from 'react';
import { deleteQueue, purgeQueueJobs } from '../app/actions/queue-actions';
import Link from 'next/link';

interface QueueTableProps {
  // @ts-ignore
  queues: any[];
  // @ts-ignore
  metrics: any[];
}

export default function QueueTable({ queues, metrics }: QueueTableProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState<string | null>(null);

  // Merge queue data with metrics
  const queuesWithMetrics = queues.map(queue => {
    const queueMetrics = metrics.find(m => m.queue_name === queue.queue_name) || {};
    return { ...queue, ...queueMetrics };
  });

  const handleDelete = async (queueName: string) => {
    if (confirm(`Are you sure you want to delete the queue "${queueName}"? This action cannot be undone.`)) {
      setIsDeleting(queueName);
      try {
        await deleteQueue(queueName);
        // Refresh the page to show updated list
        window.location.reload();
      } catch (error) {
        console.error('Error deleting queue:', error);
        alert(`Failed to delete queue: ${String(error)}`);
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const handlePurge = async (queueName: string) => {
    if (confirm(`Are you sure you want to purge all jobs from "${queueName}"? This action cannot be undone.`)) {
      setIsPurging(queueName);
      try {
        const result = await purgeQueueJobs(queueName);
        alert(`Successfully purged ${result.count} jobs from queue "${queueName}"`);
        // Refresh the page to show updated metrics
        window.location.reload();
      } catch (error) {
        console.error('Error purging queue:', error);
        alert(`Failed to purge queue: ${String(error)}`);
      } finally {
        setIsPurging(null);
      }
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Queue Name
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Jobs
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Pending
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Active
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Completed
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Failed
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Staled
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {queuesWithMetrics.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                No queues found. Create your first queue to get started.
              </td>
            </tr>
          ) : (
            queuesWithMetrics.map((queue) => (
              <tr key={queue.queue_name}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link 
                    href={`/queues/${queue.queue_name}`}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    {queue.queue_name}
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {queue.total_jobs || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {queue.pending_count || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {queue.active_count || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {queue.completed_count || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {queue.failed_count || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {queue.staled_count || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePurge(queue.queue_name)}
                      disabled={isPurging === queue.queue_name}
                      className="text-yellow-600 hover:text-yellow-900 disabled:opacity-50"
                    >
                      {isPurging === queue.queue_name ? 'Purging...' : 'Purge'}
                    </button>
                    <button
                      onClick={() => handleDelete(queue.queue_name)}
                      disabled={isDeleting === queue.queue_name}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50 ml-2"
                    >
                      {isDeleting === queue.queue_name ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
} 