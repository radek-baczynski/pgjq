'use client';

import { useState } from 'react';
import { createNewQueue } from '../app/actions/queue-actions';

export default function CreateQueueForm() {
  const [queueName, setQueueName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!queueName.trim()) {
      setError('Queue name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      await createNewQueue(queueName);
      setSuccess(true);
      setQueueName('');
      // Refresh the page to show the new queue
      window.location.reload();
    } catch (err) {
      console.error('Error creating queue:', err);
      setError(err instanceof Error ? err.job : 'Failed to create queue');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <h2 className="text-lg font-medium mb-4">Create New Queue</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          Queue created successfully!
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-grow">
            <label htmlFor="queueName" className="block text-sm font-medium text-gray-700 mb-1">
              Queue Name
            </label>
            <input
              type="text"
              id="queueName"
              value={queueName}
              onChange={(e) => setQueueName(e.target.value)}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
              placeholder="my_queue"
              disabled={isSubmitting}
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Queue'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
} 