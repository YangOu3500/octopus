import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { logger } from '@/lib/logger';

export type ModelTestMode = 'channel' | 'model';

export interface ModelTestTarget {
    channel_id: number;
    model_name: string;
    group_id?: number;
    group_name?: string;
}

export interface ModelTestRunRequest {
    mode: ModelTestMode;
    targets: ModelTestTarget[];
    prompt: string;
    max_tokens: number;
    temperature?: number;
    concurrency: number;
    stream?: boolean;
}

export interface ModelTestResult {
    index: number;
    channel_id: number;
    channel_name: string;
    channel_key_id?: number;
    group_id?: number;
    group_name?: string;
    model_name: string;
    protocol: string;
    success: boolean;
    status: string;
    http_status: number;
    failure_reason?: string;
    error_message?: string;
    duration_ms: number;
    ttfb_ms?: number;
    input_tokens?: number;
    output_tokens?: number;
    cache_tokens?: number;
    tokens_per_second?: number;
    input_cost?: number;
    output_cost?: number;
    estimated_cost?: number;
    response_text?: string;
    log_id?: number;
    trace_id?: string;
}

export interface ModelTestRunResponse {
    mode: ModelTestMode;
    prompt?: string;
    stream: boolean;
    concurrency: number;
    total: number;
    success: number;
    failed: number;
    results: ModelTestResult[];
}

export function useRunModelTest() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: ModelTestRunRequest) => {
            return apiClient.post<ModelTestRunResponse>('/api/v1/model-test/run', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['logs', 'list'] });
            queryClient.invalidateQueries({ queryKey: ['stats', 'observability'] });
            queryClient.invalidateQueries({ queryKey: ['group-health', 'list'] });
        },
        onError: (error) => {
            logger.error('model test run failed:', error);
        },
    });
}
