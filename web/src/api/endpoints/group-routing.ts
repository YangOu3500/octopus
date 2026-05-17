import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';
import type { GroupMode } from './group';

export interface GroupRoutingCandidate {
    group_item_id: number;
    rank: number;
    channel_id: number;
    channel_name: string;
    channel_key_id?: number;
    site_id?: number;
    site_name?: string;
    site_account_id?: number;
    site_account_name?: string;
    model_name: string;
    priority: number;
    weight: number;
    enabled: boolean;
    health_score: number;
    sample_count: number;
    success_count: number;
    failure_count: number;
    success_rate: number;
    empty_response_rate: number;
    rate_limit_count: number;
    avg_ttfb_ms: number;
    avg_total_ms: number;
    cooling_down: boolean;
    cooldown_remaining_ms: number;
    cooldown_reason?: string;
    quota_status: string;
    quota_balance?: number;
    quota_used?: number;
    effective_score: number;
    decision: string;
    notes?: string[];
}

export interface GroupRoutingPreview {
    group_id: number;
    group_name: string;
    group_mode: GroupMode;
    health_score_enabled: boolean;
    candidates: GroupRoutingCandidate[];
}

function normalizeCandidate(candidate: Partial<GroupRoutingCandidate>): GroupRoutingCandidate {
    return {
        group_item_id: typeof candidate.group_item_id === 'number' ? candidate.group_item_id : 0,
        rank: typeof candidate.rank === 'number' ? candidate.rank : 0,
        channel_id: typeof candidate.channel_id === 'number' ? candidate.channel_id : 0,
        channel_name: candidate.channel_name ?? '',
        channel_key_id: typeof candidate.channel_key_id === 'number' ? candidate.channel_key_id : undefined,
        site_id: typeof candidate.site_id === 'number' ? candidate.site_id : undefined,
        site_name: candidate.site_name ?? '',
        site_account_id: typeof candidate.site_account_id === 'number' ? candidate.site_account_id : undefined,
        site_account_name: candidate.site_account_name ?? '',
        model_name: candidate.model_name ?? '',
        priority: typeof candidate.priority === 'number' ? candidate.priority : 0,
        weight: typeof candidate.weight === 'number' ? candidate.weight : 1,
        enabled: candidate.enabled !== false,
        health_score: typeof candidate.health_score === 'number' ? candidate.health_score : 100,
        sample_count: typeof candidate.sample_count === 'number' ? candidate.sample_count : 0,
        success_count: typeof candidate.success_count === 'number' ? candidate.success_count : 0,
        failure_count: typeof candidate.failure_count === 'number' ? candidate.failure_count : 0,
        success_rate: typeof candidate.success_rate === 'number' ? candidate.success_rate : 0,
        empty_response_rate: typeof candidate.empty_response_rate === 'number' ? candidate.empty_response_rate : 0,
        rate_limit_count: typeof candidate.rate_limit_count === 'number' ? candidate.rate_limit_count : 0,
        avg_ttfb_ms: typeof candidate.avg_ttfb_ms === 'number' ? candidate.avg_ttfb_ms : 0,
        avg_total_ms: typeof candidate.avg_total_ms === 'number' ? candidate.avg_total_ms : 0,
        cooling_down: candidate.cooling_down === true,
        cooldown_remaining_ms: typeof candidate.cooldown_remaining_ms === 'number' ? candidate.cooldown_remaining_ms : 0,
        cooldown_reason: candidate.cooldown_reason ?? '',
        quota_status: candidate.quota_status ?? 'unknown',
        quota_balance: typeof candidate.quota_balance === 'number' ? candidate.quota_balance : undefined,
        quota_used: typeof candidate.quota_used === 'number' ? candidate.quota_used : undefined,
        effective_score: typeof candidate.effective_score === 'number' ? candidate.effective_score : 0,
        decision: candidate.decision ?? 'ready',
        notes: candidate.notes ?? [],
    };
}

function normalizePreview(preview: Partial<GroupRoutingPreview>): GroupRoutingPreview {
    return {
        group_id: typeof preview.group_id === 'number' ? preview.group_id : 0,
        group_name: preview.group_name ?? '',
        group_mode: typeof preview.group_mode === 'number' ? preview.group_mode : 1,
        health_score_enabled: preview.health_score_enabled === true,
        candidates: (preview.candidates ?? []).map(normalizeCandidate),
    };
}

export function useGroupRoutingPreview(groupId: number | undefined, enabled = true) {
    return useQuery({
        queryKey: ['group-routing', groupId],
        queryFn: async () => apiClient.get<GroupRoutingPreview>(`/api/v1/group/routing/${groupId}`),
        select: normalizePreview,
        enabled: enabled && typeof groupId === 'number' && groupId > 0,
        refetchInterval: enabled ? 30000 : false,
    });
}
