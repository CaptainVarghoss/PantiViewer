import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

function LogViewer() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const limit = 50;

    const fetchLogs = async ({ queryKey }) => {
        const [_key, { page, limit }] = queryKey;
        const response = await fetch(`/api/logs/?skip=${(page - 1) * limit}&limit=${limit}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    };

    const clearLogs = async () => {
        const response = await fetch('/api/logs/', {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        if (!response.ok) {
            throw new Error('Failed to clear logs');
        }
    };

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['logs', { page, limit }],
        queryFn: fetchLogs,
        keepPreviousData: true,
        enabled: !!token,
    });

    const clearMutation = useMutation({
        mutationFn: clearLogs,
        onSuccess: () => {
            queryClient.invalidateQueries(['logs']);
            // The backend sends a toast on success, so no need to add one here.
        },
        onError: (error) => {
            toast.error(`Failed to clear logs: ${error.message}`);
        }
    });

    const handleClearLogs = () => {
        if (window.confirm('Are you sure you want to delete all log entries? This action cannot be undone.')) {
            clearMutation.mutate();
        }
    };

    const logs = data?.logs ?? [];
    const total = data?.total ?? 0;

    return (
        <div className="log-viewer-container">
            <div className="log-viewer-header">
                <h2>System Logs</h2>
                <button onClick={handleClearLogs} className="btn-base btn-red" disabled={clearMutation.isLoading || logs.length === 0}>
                    {clearMutation.isLoading ? 'Clearing...' : 'Clear All Logs'}
                </button>
            </div>

            {isLoading && <div>Loading logs...</div>}
            {isError && <div>Error loading logs: {error.message}</div>}

            <div className="log-list-container hide-scrollbar">
                {logs.length > 0 ? (
                    logs.map(log => (
                        <div key={log.id} className="log-item">
                            <span className="log-item-timestamp">{new Date(log.timestamp).toLocaleString()}</span>
                            <span className={`log-item-level ${log.level.toLowerCase()}`}>{log.level}</span>
                            <span className="log-item-message">{log.message}</span>
                        </div>
                    ))
                ) : (
                    !isLoading && <p>No log entries found.</p>
                )}
            </div>
            <div className="pagination-controls">
                <span>Page {page} of {Math.ceil(total / limit)}</span>
                <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1}>
                    Previous
                </button>
                <button onClick={() => setPage(p => (p * limit < total ? p + 1 : p))} disabled={page * limit >= total}>
                    Next
                </button>
            </div>
        </div>
    );
}

export default LogViewer;