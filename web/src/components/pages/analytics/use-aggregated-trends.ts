'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { type RelayLog } from '@/api/endpoints/log';
import dayjs from 'dayjs';

export type Dimension = 'model' | 'channel' | 'status' | 'source';
export type Metric = 'requests' | 'tokens' | 'cost' | 'latency';

function getLogCost(log: RelayLog) {
    if (log.total_attempt_cost && log.total_attempt_cost > 0) return log.total_attempt_cost;
    if (log.final_success_cost && log.final_success_cost > 0) return log.final_success_cost;
    return log.cost ?? 0;
}

export function useAggregatedTrends(dimension: Dimension, metric: Metric) {
    const { data: logs = [], isLoading } = useQuery({
        queryKey: ['analytics', 'logs', 'bulk'],
        queryFn: async () => {
            const res = await apiClient.get<{ items: RelayLog[] }>('/api/v1/log/list', {
                page: 1,
                page_size: 1500,
            });
            return res.items || [];
        },
        staleTime: 60000,
    });

    const chartData = useMemo(() => {
        if (!logs.length) return { data: [], keys: [] };

        const sortedLogs = [...logs].sort((a, b) => a.time - b.time);
        
        const firstTime = sortedLogs[0].time * 1000;
        const lastTime = sortedLogs[sortedLogs.length - 1].time * 1000;
        const durationHours = (lastTime - firstTime) / (1000 * 60 * 60);
        
        let formatStr = 'HH:mm';
        let bucketMs = 1000 * 60 * 10;
        if (durationHours > 24) {
            formatStr = 'MM-DD HH:00';
            bucketMs = 1000 * 60 * 60 * 2;
        } else if (durationHours > 6) {
            formatStr = 'HH:00';
            bucketMs = 1000 * 60 * 60;
        }

        const buckets = new Map<string, Record<string, number>>();
        const allKeys = new Set<string>();

        sortedLogs.forEach((log) => {
            const timeMs = log.time * 1000;
            const bucketTime = Math.floor(timeMs / bucketMs) * bucketMs;
            const bucketLabel = dayjs(bucketTime).format(formatStr);

            if (!buckets.has(bucketLabel)) {
                buckets.set(bucketLabel, {});
            }
            const bucket = buckets.get(bucketLabel)!;

            let dimKey = 'Unknown';
            if (dimension === 'model') {
                dimKey = log.request_model_name || 'unknown';
            } else if (dimension === 'channel') {
                dimKey = log.channel_name || `#${log.channel}`;
            } else if (dimension === 'status') {
                dimKey = log.final_status || (log.error ? 'failed' : 'success');
            } else if (dimension === 'source') {
                dimKey = log.request_source || 'relay';
            }
            allKeys.add(dimKey);

            if (metric === 'requests') {
                bucket[dimKey] = (bucket[dimKey] || 0) + 1;
            } else if (metric === 'tokens') {
                const tokens = (log.input_tokens || 0) + (log.output_tokens || 0);
                bucket[dimKey] = (bucket[dimKey] || 0) + tokens;
            } else if (metric === 'cost') {
                bucket[dimKey] = (bucket[dimKey] || 0) + getLogCost(log);
            } else if (metric === 'latency') {
                bucket[dimKey] = (bucket[dimKey] || 0) + (log.total_latency_ms || log.use_time || 0);
                bucket[`${dimKey}_count`] = (bucket[`${dimKey}_count`] || 0) + 1;
            }
        });

        const result = Array.from(buckets.entries()).map(([time, values]) => {
            const row: Record<string, string | number> = { time };
            allKeys.forEach((key) => {
                if (metric === 'latency') {
                    const sum = values[key] || 0;
                    const count = values[`${key}_count`] || 1;
                    row[key] = Math.round(sum / count);
                } else if (metric === 'cost') {
                    row[key] = Number((values[key] || 0).toFixed(4));
                } else {
                    row[key] = values[key] || 0;
                }
            });
            return row;
        });

        return {
            data: result,
            keys: Array.from(allKeys),
        };
    }, [logs, dimension, metric]);

    return { ...chartData, isLoading };
}
