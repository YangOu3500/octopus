'use client';

import { ChannelType } from '@/api/endpoints/channel';
import type { ModelTestResult } from '@/api/endpoints/model-test';

export const DEFAULT_PROMPT = '只回复 OK';
export const MAX_CONCURRENCY = 8;
export const MODEL_TEST_EXPORT_VERSION = 1;
export const MODEL_TEST_RESULT_FILTERS = ['all', 'success', 'failed', 'running', 'queued', 'idle'] as const;

export type ModelTestResultFilter = typeof MODEL_TEST_RESULT_FILTERS[number];
export type ModelTestRunStatus = 'running' | 'queued';

export interface ActiveRunPlan {
    keys: string[];
    concurrency: number;
}

export function channelProtocol(type: ChannelType | undefined): string {
    switch (type) {
        case ChannelType.OpenAIResponse:
            return 'openai_response';
        case ChannelType.Anthropic:
            return 'anthropic';
        case ChannelType.Gemini:
            return 'gemini';
        case ChannelType.Volcengine:
            return 'volcengine';
        case ChannelType.OpenAIEmbedding:
            return 'openai_embedding';
        case ChannelType.OpenAIChat:
        default:
            return 'openai_chat';
    }
}

export function splitModels(value: string | undefined): string[] {
    return Array.from(
        new Set(
            (value || '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
        )
    );
}

export function rowKey(channelId: number, modelName: string) {
    return `${channelId}\x00${modelName.toLowerCase()}`;
}

export function resultStatus(result?: ModelTestResult, runStatus?: ModelTestRunStatus): 'running' | 'queued' | 'success' | 'failed' | 'idle' {
    if (runStatus) return runStatus;
    if (!result) return 'idle';
    return result.success ? 'success' : 'failed';
}

export function downloadJson(filename: string, payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function sanitizeModelTestResultForExport(result: ModelTestResult) {
    return {
        index: result.index,
        channel_id: result.channel_id,
        channel_name: result.channel_name,
        channel_key_id: result.channel_key_id,
        group_id: result.group_id,
        group_name: result.group_name,
        model_name: result.model_name,
        protocol: result.protocol,
        success: result.success,
        status: result.status,
        http_status: result.http_status,
        failure_reason: result.failure_reason,
        error_message: result.error_message,
        duration_ms: result.duration_ms,
        ttfb_ms: result.ttfb_ms,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        cache_tokens: result.cache_tokens,
        tokens_per_second: result.tokens_per_second,
        input_cost: result.input_cost,
        output_cost: result.output_cost,
        estimated_cost: result.estimated_cost,
        response_summary_present: Boolean(result.response_text),
        response_summary_length: result.response_text?.length,
        log_id: result.log_id,
        trace_id: result.trace_id,
    };
}
