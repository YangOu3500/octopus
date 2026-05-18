import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { logger } from '@/lib/logger';
import { formatCount, formatMoney, formatTime } from '@/lib/utils';
import { StatsChannel, type StatsMetricsFormatted } from './stats';
/**
 * 渠道类型枚举
 */
export enum ChannelType {
    OpenAIChat = 0,
    OpenAIResponse = 1,
    Anthropic = 2,
    Gemini = 3,
    Volcengine = 4,
    OpenAIEmbedding = 5,
}

/**
 * 自动分组类型枚举
 */
export enum AutoGroupType {
    None = 0,   // 不自动分组
    Fuzzy = 1,  // 模糊匹配
    Exact = 2,  // 准确匹配
    Regex = 3,  // 正则匹配
}

export type BaseUrl = {
    url: string;
    delay: number;
};

export type CustomHeader = {
    header_key: string;
    header_value: string;
};

export type ChannelKey = {
    id: number;
    channel_id: number;
    enabled: boolean;
    channel_key: string;
    status_code: number;
    last_use_time_stamp: number;
    total_cost: number;
    remark: string;
};

export type ManagedChannelSource = {
    site_id: number;
    site_account_id: number;
    site_user_group_id?: number | null;
    group_key: string;
};

/**
 * 渠道完整数据（与后端 model.Channel 对齐；数组字段在前端保证为 []）
 */
export type Channel = {
    id: number;
    name: string;
    type: ChannelType;
    enabled: boolean;
    base_urls: BaseUrl[];
    keys: ChannelKey[];
    model: string;
    custom_model: string;
    proxy: boolean;
    auto_sync: boolean;
    auto_group: AutoGroupType;
    custom_header: CustomHeader[];
    param_override?: string | null;
    channel_proxy?: string | null;
    match_regex?: string | null;
    managed: boolean;
    managed_source?: ManagedChannelSource | null;
    stats: StatsChannel;
};

// Internal type: backend may return null for slice fields; normalize to [] in select()
type ChannelServer = Omit<Channel, 'base_urls' | 'custom_header' | 'keys'> & {
    base_urls: BaseUrl[] | null;
    custom_header: CustomHeader[] | null;
    keys: ChannelKey[] | null;
};

export type ChannelModelHealthRow = {
    channel_id: number;
    channel_name: string;
    managed: boolean;
    site_id?: number;
    site_name?: string;
    site_account_id?: number;
    site_account_name?: string;
    model_name: string;
    request_count: number;
    success_count: number;
    failure_count: number;
    success_rate: number;
    rpm: number;
    avg_ttfb_ms: number;
    avg_total_ms: number;
    tokens_per_second: number;
    input_tokens: number;
    output_tokens: number;
    cache_tokens: number;
    estimated_cost: number;
    health_score: number;
    health_sample_count: number;
    health_success_count: number;
    health_failure_count: number;
    health_success_rate: number;
    empty_response_rate: number;
    rate_limit_count: number;
    active_selections: number;
    channel_concurrency_active: number;
    channel_concurrency_limit?: number;
    cooling_down: boolean;
    cooldown_remaining_ms: number;
    cooldown_reason?: string;
    quota_status: string;
    quota_reason?: string;
    quota_balance?: number;
    quota_used?: number;
    last_http_status?: number;
    last_failure_reason?: string;
    last_seen_time?: number;
};

export type ChannelModelHealthSummary = {
    time_range: string;
    start_time: number;
    end_time: number;
    health_score_enabled: boolean;
    load_balancing_strategy: string;
    channel_concurrency_enabled: boolean;
    channel_concurrency_max: number;
    total_rows: number;
    total_requests: number;
    success_count: number;
    failure_count: number;
    avg_success_rate: number;
    avg_health_score: number;
    cooling_down_count: number;
    active_selections: number;
    channel_concurrency_active: number;
    estimated_cost: number;
};

export type ChannelModelHealthResult = {
    summary: ChannelModelHealthSummary;
    rows: ChannelModelHealthRow[];
};

export type ChannelModelHealthParams = {
    timeRange?: string;
    channelId?: number | null;
    model?: string;
    source?: string;
    refetchIntervalMs?: number | false;
};

/**
 * 创建渠道请求：必填字段 + 可选字段
 */
export type CreateChannelRequest = {
    name: string;
    type: ChannelType;
    enabled?: boolean;
    base_urls: BaseUrl[];
    keys: Array<Pick<ChannelKey, 'enabled' | 'channel_key' | 'remark'>>;
    model: string;
    custom_model?: string;
    proxy?: boolean;
    auto_sync?: boolean;
    auto_group?: AutoGroupType;
    custom_header?: CustomHeader[];
    channel_proxy?: string | null;
    param_override?: string | null;
    match_regex?: string | null;
};

/**
 * 更新渠道请求：id + 可选字段 + keys diff
 */
export type UpdateChannelRequest = {
    id: number;
    name?: string;
    type?: ChannelType;
    enabled?: boolean;
    base_urls?: BaseUrl[];
    model?: string;
    custom_model?: string;
    proxy?: boolean;
    auto_sync?: boolean;
    auto_group?: AutoGroupType;
    custom_header?: CustomHeader[];
    channel_proxy?: string | null;
    param_override?: string | null;
    match_regex?: string | null;
    // keys diff
    keys_to_add?: Array<Pick<ChannelKey, 'enabled' | 'channel_key' | 'remark'>>;
    keys_to_update?: Array<{ id: number; enabled?: boolean; channel_key?: string; remark?: string }>;
    keys_to_delete?: number[];
};

export type FetchModelRequest = {
    type: ChannelType;
    base_urls: BaseUrl[];
    keys: Array<Pick<ChannelKey, 'enabled' | 'channel_key'>>;
    proxy?: boolean;
    channel_proxy?: string | null;
    match_regex?: string | null;
    custom_header?: CustomHeader[];
};

/**
 * 获取渠道列表 Hook
 * 
 * @example
 * const { data: channels, isLoading, error } = useChannelList();
 * 
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error.message} />;
 * 
 * channels?.forEach(channel => console.log(channel.raw.name));
 */
export function useChannelList() {
    return useQuery({
        queryKey: ['channels', 'list'],
        queryFn: async () => {
            return apiClient.get<ChannelServer[]>('/api/v1/channel/list');
        },
        select: (data) => data.map((item) => ({
            raw: ({
                ...item,
                managed: item.managed ?? false,
                managed_source: item.managed_source ?? null,
                base_urls: item.base_urls ?? [],
                custom_header: item.custom_header ?? [],
                keys: item.keys ?? [],
            }) satisfies Channel,
            formatted: {
                input_token: formatCount(item.stats.input_token),
                output_token: formatCount(item.stats.output_token),
                total_token: formatCount(item.stats.input_token + item.stats.output_token),
                input_cost: formatMoney(item.stats.input_cost),
                output_cost: formatMoney(item.stats.output_cost),
                total_cost: formatMoney(item.stats.input_cost + item.stats.output_cost),
                request_success: formatCount(item.stats.request_success),
                request_failed: formatCount(item.stats.request_failed),
                request_count: formatCount(item.stats.request_success + item.stats.request_failed),
                wait_time: formatTime(item.stats.wait_time),
            }
        })) as Array<{ raw: Channel; formatted: StatsMetricsFormatted }>,
        refetchInterval: 30000,
    });
}

function normalizeChannelModelHealth(data: Partial<ChannelModelHealthResult>): ChannelModelHealthResult {
    const summary: Partial<ChannelModelHealthSummary> = data.summary ?? {};
    return {
        summary: {
            time_range: summary.time_range ?? '24h',
            start_time: typeof summary.start_time === 'number' ? summary.start_time : 0,
            end_time: typeof summary.end_time === 'number' ? summary.end_time : 0,
            health_score_enabled: summary.health_score_enabled === true,
            load_balancing_strategy: summary.load_balancing_strategy ?? 'static_group_mode',
            channel_concurrency_enabled: summary.channel_concurrency_enabled === true,
            channel_concurrency_max: typeof summary.channel_concurrency_max === 'number' ? summary.channel_concurrency_max : 0,
            total_rows: typeof summary.total_rows === 'number' ? summary.total_rows : 0,
            total_requests: typeof summary.total_requests === 'number' ? summary.total_requests : 0,
            success_count: typeof summary.success_count === 'number' ? summary.success_count : 0,
            failure_count: typeof summary.failure_count === 'number' ? summary.failure_count : 0,
            avg_success_rate: typeof summary.avg_success_rate === 'number' ? summary.avg_success_rate : 0,
            avg_health_score: typeof summary.avg_health_score === 'number' ? summary.avg_health_score : 100,
            cooling_down_count: typeof summary.cooling_down_count === 'number' ? summary.cooling_down_count : 0,
            active_selections: typeof summary.active_selections === 'number' ? summary.active_selections : 0,
            channel_concurrency_active: typeof summary.channel_concurrency_active === 'number' ? summary.channel_concurrency_active : 0,
            estimated_cost: typeof summary.estimated_cost === 'number' ? summary.estimated_cost : 0,
        },
        rows: (data.rows ?? []).map((row) => ({
            channel_id: typeof row.channel_id === 'number' ? row.channel_id : 0,
            channel_name: row.channel_name ?? '',
            managed: row.managed === true,
            site_id: typeof row.site_id === 'number' ? row.site_id : undefined,
            site_name: row.site_name ?? '',
            site_account_id: typeof row.site_account_id === 'number' ? row.site_account_id : undefined,
            site_account_name: row.site_account_name ?? '',
            model_name: row.model_name ?? '',
            request_count: typeof row.request_count === 'number' ? row.request_count : 0,
            success_count: typeof row.success_count === 'number' ? row.success_count : 0,
            failure_count: typeof row.failure_count === 'number' ? row.failure_count : 0,
            success_rate: typeof row.success_rate === 'number' ? row.success_rate : 0,
            rpm: typeof row.rpm === 'number' ? row.rpm : 0,
            avg_ttfb_ms: typeof row.avg_ttfb_ms === 'number' ? row.avg_ttfb_ms : 0,
            avg_total_ms: typeof row.avg_total_ms === 'number' ? row.avg_total_ms : 0,
            tokens_per_second: typeof row.tokens_per_second === 'number' ? row.tokens_per_second : 0,
            input_tokens: typeof row.input_tokens === 'number' ? row.input_tokens : 0,
            output_tokens: typeof row.output_tokens === 'number' ? row.output_tokens : 0,
            cache_tokens: typeof row.cache_tokens === 'number' ? row.cache_tokens : 0,
            estimated_cost: typeof row.estimated_cost === 'number' ? row.estimated_cost : 0,
            health_score: typeof row.health_score === 'number' ? row.health_score : 100,
            health_sample_count: typeof row.health_sample_count === 'number' ? row.health_sample_count : 0,
            health_success_count: typeof row.health_success_count === 'number' ? row.health_success_count : 0,
            health_failure_count: typeof row.health_failure_count === 'number' ? row.health_failure_count : 0,
            health_success_rate: typeof row.health_success_rate === 'number' ? row.health_success_rate : 0,
            empty_response_rate: typeof row.empty_response_rate === 'number' ? row.empty_response_rate : 0,
            rate_limit_count: typeof row.rate_limit_count === 'number' ? row.rate_limit_count : 0,
            active_selections: typeof row.active_selections === 'number' ? row.active_selections : 0,
            channel_concurrency_active: typeof row.channel_concurrency_active === 'number' ? row.channel_concurrency_active : 0,
            channel_concurrency_limit: typeof row.channel_concurrency_limit === 'number' ? row.channel_concurrency_limit : undefined,
            cooling_down: row.cooling_down === true,
            cooldown_remaining_ms: typeof row.cooldown_remaining_ms === 'number' ? row.cooldown_remaining_ms : 0,
            cooldown_reason: row.cooldown_reason ?? '',
            quota_status: row.quota_status ?? 'unknown',
            quota_reason: row.quota_reason ?? '',
            quota_balance: typeof row.quota_balance === 'number' ? row.quota_balance : undefined,
            quota_used: typeof row.quota_used === 'number' ? row.quota_used : undefined,
            last_http_status: typeof row.last_http_status === 'number' ? row.last_http_status : undefined,
            last_failure_reason: row.last_failure_reason ?? '',
            last_seen_time: typeof row.last_seen_time === 'number' ? row.last_seen_time : undefined,
        })),
    };
}

export function useChannelModelHealth(params: ChannelModelHealthParams = {}) {
    const timeRange = params.timeRange || '24h';
    const channelId = params.channelId ?? null;
    const model = params.model?.trim() ?? '';
    const source = params.source?.trim() ?? '';
    const refetchIntervalMs = params.refetchIntervalMs === undefined ? 30000 : params.refetchIntervalMs;

    return useQuery({
        queryKey: ['channels', 'model-health', timeRange, channelId, model, source],
        queryFn: async () => {
            const search = new URLSearchParams({ time_range: timeRange });
            if (channelId && channelId > 0) search.set('channel_id', String(channelId));
            if (model) search.set('model', model);
            if (source && source !== 'all') search.set('source', source);
            return apiClient.get<ChannelModelHealthResult>(`/api/v1/channel/model-health?${search.toString()}`);
        },
        select: normalizeChannelModelHealth,
        refetchInterval: refetchIntervalMs,
    });
}

/**
 * 创建渠道 Hook
 * 
 * @example
 * const createChannel = useCreateChannel();
 * 
 * createChannel.mutate({
 *   name: 'OpenAI',
 *   type: ChannelType.OpenAIChat,
 *   base_urls: [{ url: 'https://api.openai.com', delay: 0 }],
 *   keys: [{ enabled: true, channel_key: 'sk-xxx' }],
 *   model: 'gpt-4',
 * });
 */
export function useCreateChannel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateChannelRequest) => {
            return apiClient.post<ChannelServer>('/api/v1/channel/create', data);
        },
        onSuccess: (data) => {
            logger.log('渠道创建成功:', data);
            queryClient.invalidateQueries({ queryKey: ['channels', 'list'] });
            queryClient.invalidateQueries({ queryKey: ['models', 'list'] });
            queryClient.invalidateQueries({ queryKey: ['models', 'channel'] });
        },
        onError: (error) => {
            logger.error('渠道创建失败:', error);
        },
    });
}

/**
 * 更新渠道 Hook
 * 
 * @example
 * const updateChannel = useUpdateChannel();
 * 
 * updateChannel.mutate({
 *   id: 1,
 *   name: 'OpenAI Updated',
 *   type: ChannelType.OpenAIChat,
 *   enabled: true,
 *   base_urls: [{ url: 'https://api.openai.com', delay: 0 }],
 *   keys_to_add: [{ enabled: true, channel_key: 'sk-xxx' }],
 *   model: 'gpt-4-turbo',
 *   proxy: false,
 * });
 */
export function useUpdateChannel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: UpdateChannelRequest) => {
            return apiClient.post<ChannelServer>('/api/v1/channel/update', data);
        },
        onSuccess: (data) => {
            logger.log('渠道更新成功:', data);
            queryClient.invalidateQueries({ queryKey: ['channels', 'list'] });
            queryClient.invalidateQueries({ queryKey: ['models', 'channel'] });
        },
        onError: (error) => {
            logger.error('渠道更新失败:', error);
        },
    });
}

/**
 * 删除渠道 Hook
 * 
 * @example
 * const deleteChannel = useDeleteChannel();
 * 
 * deleteChannel.mutate(1); // 删除 ID 为 1 的渠道
 */
export function useDeleteChannel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: number) => {
            return apiClient.delete<null>(`/api/v1/channel/delete/${id}`);
        },
        onSuccess: () => {
            logger.log('渠道删除成功');
            queryClient.invalidateQueries({ queryKey: ['channels', 'list'] });
            queryClient.invalidateQueries({ queryKey: ['models', 'channel'] });
        },
        onError: (error) => {
            logger.error('渠道删除失败:', error);
        },
    });
}

/**
 * 启用/禁用渠道 Hook
 * 
 * @example
 * const enableChannel = useEnableChannel();
 * 
 * enableChannel.mutate({ id: 1, enabled: true }); // 启用 ID 为 1 的渠道
 * enableChannel.mutate({ id: 1, enabled: false }); // 禁用 ID 为 1 的渠道
 */
export function useEnableChannel() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: { id: number; enabled: boolean }) => {
            return apiClient.post<null>('/api/v1/channel/enable', data);
        },
        onSuccess: () => {
            logger.log('渠道状态更新成功');
            queryClient.invalidateQueries({ queryKey: ['channels', 'list'] });
        },
        onError: (error) => {
            logger.error('渠道状态更新失败:', error);
        },
    });
}

/**
 * 获取渠道模型列表 Hook
 * 
 * @example
 * const fetchModel = useFetchModel();
 * 
 * fetchModel.mutate({
 *   type: ChannelType.OpenAIChat,
 *   base_urls: [{ url: 'https://api.openai.com', delay: 0 }],
 *   keys: [{ enabled: true, channel_key: 'sk-xxx' }],
 *   proxy: false,
 * });
 * 
 * // 在 onSuccess 中获取模型列表
 * fetchModel.data // ['gpt-4', 'gpt-3.5-turbo', ...]
 */
export function useFetchModel() {
    return useMutation({
        mutationFn: async (data: FetchModelRequest) => {
            return apiClient.post<string[]>('/api/v1/channel/fetch-model', data);
        },
        onSuccess: (data) => {
            logger.log('模型列表获取成功:', data);
        },
        onError: (error) => {
            logger.error('模型列表获取失败:', error);
        },
    });
}

/**
 * 获取渠道最后同步时间 Hook
 * 
 * @example
 * const lastSyncTime = useLastSyncTime();
 * 
 * if (lastSyncTime) {
 *   console.log('最后同步时间:', new Date(lastSyncTime).toLocaleString());
 * }
 */
export function useLastSyncTime() {
    return useQuery({
        queryKey: ['channels', 'last-sync-time'],
        queryFn: async () => {
            return apiClient.get<string>('/api/v1/channel/last-sync-time');
        },
        refetchInterval: 30000,
    });
}
/**
 * 同步渠道 Hook
 * 
 * @example
 * const syncChannel = useSyncChannel();
 * 
 * syncChannel.mutate();
 */
export function useSyncChannel() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            return apiClient.post<null>('/api/v1/channel/sync');
        },
        onSuccess: () => {
            logger.log('渠道同步成功');
            queryClient.invalidateQueries({ queryKey: ['channels', 'last-sync-time'] });
        },
        onError: (error) => {
            logger.error('渠道同步失败:', error);
        },
    });
}
