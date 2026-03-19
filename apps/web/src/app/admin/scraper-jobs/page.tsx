'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  RUNNING: 'bg-blue-100 text-blue-700 animate-pulse',
  SUCCESS: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const REGION_LABELS: Record<string, string> = {
  HK: '🇭🇰 Hong Kong',
  JP: '🇯🇵 Japan',
  EN: '🇺🇸 English',
};

interface ScraperJob {
  id: string;
  source: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt?: string;
  completedAt?: string;
  successCount: number;
  failureCount: number;
  createdAt: string;
  logs?: Array<{ ts: string; line: string }>;
}

interface LogEntry {
  ts: string;
  line: string;
}

export default function ScraperJobsPage() {
  const [source, setSource] = useState('JP');
  const [skipRecent, setSkipRecent] = useState(50);
  const [forceReimport, setForceReimport] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [streamDone, setStreamDone] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  // Job list (auto-refresh every 5s)
  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['scraper-jobs'],
    queryFn: () => apiClient.get('/scraper-jobs'),
    refetchInterval: 5000,
  });

  const jobs: ScraperJob[] = jobsData?.data ?? [];

  // Start job mutation
  const startMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/scraper-jobs', {
        source,
        skipRecentCount: skipRecent,
        forceReimport,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['scraper-jobs'] });
      const jobId = res.data.id;
      setSelectedJobId(jobId);
      openSSEStream(jobId);
    },
  });

  // Cancel job mutation
  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/scraper-jobs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scraper-jobs'] }),
  });

  const openSSEStream = useCallback((jobId: string) => {
    // Close existing stream
    eventSourceRef.current?.close();

    setLiveLogs([]);
    setStreamDone(false);

    const es = new EventSource(`${BASE_URL}/scraper-jobs/${jobId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.log) {
          setLiveLogs((prev) => [...prev, data.log]);
          logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
        if (data.done) {
          setStreamDone(true);
          queryClient.invalidateQueries({ queryKey: ['scraper-jobs'] });
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setStreamDone(true);
      es.close();
    };
  }, [queryClient]);

  // Cleanup on unmount
  useEffect(() => {
    return () => eventSourceRef.current?.close();
  }, []);

  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const displayLogs = liveLogs.length > 0 ? liveLogs : selectedJob?.logs ?? [];

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return '-';
    const s = new Date(start);
    const e = end ? new Date(end) : new Date();
    const secs = Math.floor((e.getTime() - s.getTime()) / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-slate-700 to-gray-600 text-white p-6">
        <h1 className="text-3xl font-bold">Scraper Jobs</h1>
        <p className="text-slate-300 mt-1">Manage tournament data scraping jobs</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-4">
        {/* Left panel: start job + job list */}
        <div className="w-80 shrink-0 space-y-4">
          {/* Start Job form */}
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
            <h2 className="font-semibold text-gray-800">Start New Job</h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Region</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                {Object.entries(REGION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Skip Recent Events</label>
              <input
                type="number"
                value={skipRecent}
                min={0}
                max={500}
                onChange={(e) => setSkipRecent(parseInt(e.target.value) || 0)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">Events already in DB to skip</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="force-reimport"
                checked={forceReimport}
                onChange={(e) => setForceReimport(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="force-reimport" className="text-sm text-gray-600">Force re-import</label>
            </div>
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="w-full px-4 py-2 bg-slate-700 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-40"
            >
              {startMutation.isPending ? 'Starting...' : '▶ Start Scraper'}
            </button>
          </div>

          {/* Job list */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-3 border-b">
              <h3 className="font-medium text-gray-700 text-sm">Recent Jobs</h3>
            </div>
            {isLoading && <p className="text-center py-4 text-gray-400 text-sm">Loading...</p>}
            {jobs.length === 0 && !isLoading && (
              <p className="text-center py-6 text-gray-400 text-sm">No jobs yet.</p>
            )}
            <div className="divide-y">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className={`px-3 py-2 cursor-pointer hover:bg-gray-50 ${selectedJobId === job.id ? 'bg-slate-50 border-l-2 border-slate-600' : ''}`}
                  onClick={() => {
                    setSelectedJobId(job.id);
                    setLiveLogs([]);
                    if (job.status === 'RUNNING') openSSEStream(job.id);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-700">{REGION_LABELS[job.source] ?? job.source}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status]}`}>
                      {job.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                  {(job.successCount > 0 || job.failureCount > 0) && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      ✓{job.successCount} ✗{job.failureCount}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel: job details + logs */}
        <div className="flex-1 space-y-4">
          {!selectedJobId && (
            <div className="bg-white rounded-lg shadow-sm flex items-center justify-center h-64 text-gray-400">
              Select a job to view details
            </div>
          )}

          {selectedJob && (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-800 text-lg">
                    {REGION_LABELS[selectedJob.source] ?? selectedJob.source}
                  </h2>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{selectedJob.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[selectedJob.status]}`}>
                    {selectedJob.status}
                  </span>
                  {selectedJob.status === 'RUNNING' && (
                    <button
                      onClick={() => cancelMutation.mutate(selectedJob.id)}
                      className="px-3 py-1 bg-red-100 text-red-600 rounded text-sm hover:bg-red-200"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs text-gray-500">Duration</p>
                  <p className="font-semibold text-sm">{formatDuration(selectedJob.startedAt, selectedJob.completedAt)}</p>
                </div>
                <div className="bg-green-50 rounded p-2 text-center">
                  <p className="text-xs text-gray-500">Imported</p>
                  <p className="font-semibold text-sm text-green-700">{selectedJob.successCount}</p>
                </div>
                <div className="bg-red-50 rounded p-2 text-center">
                  <p className="text-xs text-gray-500">Failed</p>
                  <p className="font-semibold text-sm text-red-600">{selectedJob.failureCount}</p>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs text-gray-500">Started</p>
                  <p className="font-semibold text-xs">{selectedJob.startedAt ? new Date(selectedJob.startedAt).toLocaleTimeString() : '-'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Log viewer */}
          {selectedJobId && (
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                <h3 className="text-sm font-medium text-gray-300">
                  Live Logs {selectedJob?.status === 'RUNNING' && !streamDone ? '⟳' : ''}
                </h3>
                <span className="text-xs text-gray-500">{displayLogs.length} lines</span>
              </div>
              <div className="h-96 overflow-y-auto p-4 font-mono text-xs text-green-400 space-y-0.5">
                {displayLogs.length === 0 && (
                  <p className="text-gray-500">
                    {selectedJob?.status === 'RUNNING' ? 'Waiting for output...' : 'No logs available.'}
                  </p>
                )}
                {displayLogs.map((entry, i) => (
                  <div key={i} className={`flex gap-2 ${entry.line.includes('[STDERR]') ? 'text-red-400' : 'text-green-400'}`}>
                    <span className="text-gray-600 shrink-0">
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                    <span className="break-all">{entry.line}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
