import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, API_BASE_URL } from '../client';
import { logger } from '@/lib/logger';
import { useAuthStore } from './user';

/**
 * Setting 数据
 */
export interface Setting {
    key: string;
    value: string;
}

export interface HealthCooldownPolicy {
    reason: string;
    scopes: string[];
    base_seconds: number;
    max_seconds: number;
    uses_retry_after: boolean;
    exponential_backoff: boolean;
    model_scoped: boolean;
    cleared_on_success: boolean;
    health_score_required: boolean;
}

export const SettingKey = {
    ProxyURL: 'proxy_url',
    StatsSaveInterval: 'stats_save_interval',
    ModelInfoUpdateInterval: 'model_info_update_interval',
    SyncLLMInterval: 'sync_llm_interval',
    SiteSyncInterval: 'site_sync_interval',
    SiteCheckinInterval: 'site_checkin_interval',
    RelayLogKeepEnabled: 'relay_log_keep_enabled',
    RelayLogKeepPeriod: 'relay_log_keep_period',
    CORSAllowOrigins: 'cors_allow_origins',
    CircuitBreakerThreshold: 'circuit_breaker_threshold',
    CircuitBreakerCooldown: 'circuit_breaker_cooldown',
    CircuitBreakerMaxCooldown: 'circuit_breaker_max_cooldown',
    RelayWSUpgradeEnabled: 'relay_ws_upgrade_enabled',
    SSEHeartbeatInterval: 'sse_heartbeat_interval',
    SSEPreStreamHeartbeatDelay: 'sse_pre_stream_heartbeat_delay',
    StreamFirstValidTimeout: 'stream_first_valid_timeout_seconds',
    StreamFirstValidMaxBuffer: 'stream_first_valid_max_buffer_bytes',
    StreamEmptyDoneAsFailure: 'stream_empty_done_as_failure',
    StreamInvalidSSEAsFailure: 'stream_invalid_sse_as_failure',
    GroupHealthEnabled: 'group_health_enabled',
    HealthScoreEnabled: 'enable_health_score',
    HealthScoreWindowMinutes: 'health_score_window_minutes',
    HealthMinConfidentSample: 'health_min_confident_sample',
    SuccessRatePenaltyWeight: 'success_rate_penalty_weight',
    EmptyResponsePenaltyWeight: 'empty_response_penalty_weight',
    LatencyPenaltyWeight: 'latency_penalty_weight',
    ChannelConcurrencyEnabled: 'channel_concurrency_enabled',
    ChannelConcurrencyMode: 'channel_concurrency_mode',
    ChannelConcurrencyMax: 'channel_concurrency_max_in_flight',
    ChannelConcurrencyQueueMS: 'channel_concurrency_queue_timeout_ms',
    ChannelConcurrencyLeaseMS: 'channel_concurrency_lease_ttl_ms',
    ProbeEnabled: 'probe.enabled',
    ProbeSiteMinInterval: 'probe.site_min_interval_minutes',
    ProbeModelMinInterval: 'probe.model_min_interval_hours',
    ProbeMaxConcurrency: 'probe.max_concurrency',
    ProbeDailyMaxRequests: 'probe.daily_max_requests_per_site',
    ProbePrompt: 'probe.prompt',
    ProbeMaxTokens: 'probe.max_tokens',
    ProbeTemperature: 'probe.temperature',
    ProbeJitterRatio: 'probe.jitter_ratio',
    ProbeStreamEnabled: 'probe.stream_enabled',
    GroupAutoGenerateAssociationMode: 'group_auto_generate_association_mode',
    GroupAutoGenerateAssociationOptions: 'group_auto_generate_association_options',
    GroupAutoGenerateManualAliases: 'group_auto_generate_manual_aliases',
} as const;

/**
 * 获取 Setting 列表 Hook
 * 
 * @example
 * const { data: settings, isLoading, error } = useSettingList();
 * 
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error.message} />;
 * 
 * settings?.forEach(setting => console.log(setting.key, setting.value));
 */
export function useSettingList() {
    return useQuery({
        queryKey: ['settings', 'list'],
        queryFn: async () => {
            return apiClient.get<Setting[]>('/api/v1/setting/list');
        },
        refetchInterval: 30000,
    });
}

export function useHealthCooldownPolicy() {
    return useQuery({
        queryKey: ['settings', 'health-cooldown-policy'],
        queryFn: async () => {
            return apiClient.get<HealthCooldownPolicy[]>('/api/v1/setting/health-cooldown-policy');
        },
        staleTime: 5 * 60 * 1000,
    });
}

export function useSettingValue(key: string, defaultValue = '') {
    const { data: settings, ...query } = useSettingList();
    return {
        ...query,
        value: settings?.find((setting) => setting.key === key)?.value ?? defaultValue,
    };
}

export function useGroupHealthEnabled() {
    const { value, ...query } = useSettingValue(SettingKey.GroupHealthEnabled, 'false');
    return {
        ...query,
        enabled: value === 'true',
    };
}

/**
 * 设置 Setting Hook
 * 
 * @example
 * const setSetting = useSetSetting();
 * 
 * setSetting.mutate({
 *   key: 'theme',
 *   value: 'dark',
 * });
 */
export function useSetSetting() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: Setting) => {
            return apiClient.post<Setting>('/api/v1/setting/set', data);
        },
        onSuccess: (data) => {
            logger.log('Setting 设置成功:', data);
            queryClient.invalidateQueries({ queryKey: ['settings', 'list'] });
        },
        onError: (error) => {
            logger.error('Setting 设置失败:', error);
        },
    });
}

/**
 * 数据库导入/导出
 */
export interface DBImportResult {
    rows_affected: Record<string, number>;
}

export interface DBExportOptions {
    include_logs?: boolean;
    include_stats?: boolean;
}

type ApiResponse<T> = {
    code?: number;
    message?: string;
    data?: T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function getMessageField(value: unknown): string | undefined {
    if (!isRecord(value)) return undefined;
    const msg = value.message;
    return typeof msg === 'string' ? msg : undefined;
}

function getDataField<T>(value: unknown): T | undefined {
    if (!isRecord(value)) return undefined;
    return (value as ApiResponse<T>).data;
}

function getAuthHeader(): string {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error('Not authenticated');
    return `Bearer ${token}`;
}

function parseFilename(contentDisposition: string | null): string | null {
    if (!contentDisposition) return null;
    // e.g. attachment; filename="octopus-export-20250101120000.json"
    const match = contentDisposition.match(/filename="([^"]+)"/i);
    return match?.[1] ?? null;
}

function exportFallbackFilename() {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `octopus-export-${ts}.json`;
}

async function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * 导出数据库（下载 JSON 文件）
 */
export function useExportDB() {
    return useMutation({
        mutationFn: async (options: DBExportOptions = {}) => {
            const params = new URLSearchParams();
            params.set('include_logs', String(!!options.include_logs));
            params.set('include_stats', String(!!options.include_stats));

            const res = await fetch(`${API_BASE_URL}/api/v1/setting/export?${params.toString()}`, {
                method: 'GET',
                headers: {
                    Authorization: getAuthHeader(),
                },
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || res.statusText);
            }

            const blob = await res.blob();
            const filename = parseFilename(res.headers.get('content-disposition')) || exportFallbackFilename();
            await downloadBlob(blob, filename);
            return { filename };
        },
        onError: (error) => {
            logger.error('导出数据库失败:', error);
        },
    });
}

/**
 * 导入数据库（上传 JSON 文件，增量导入）
 */
export function useImportDB() {
    return useMutation({
        mutationFn: async (file: File) => {
            const form = new FormData();
            form.append('file', file);

            const res = await fetch(`${API_BASE_URL}/api/v1/setting/import`, {
                method: 'POST',
                headers: {
                    Authorization: getAuthHeader(),
                },
                body: form,
            });

            const contentType = res.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');
            const data = isJson ? await res.json() : await res.text();

            if (!res.ok) {
                const message = getMessageField(data) ?? (typeof data === 'string' ? data : res.statusText);
                throw new Error(message);
            }

            // 支持后端标准 ApiResponse：{code,message,data:{...}}
            const nested = getDataField<DBImportResult>(data);
            return nested ?? (data as DBImportResult);
        },
        onError: (error) => {
            logger.error('导入数据库失败:', error);
        },
    });
}
