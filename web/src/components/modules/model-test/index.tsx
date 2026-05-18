'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Circle, Download, FlaskConical, FileSearch, LoaderCircle, Play, RotateCcw, Search, Trash2, XCircle } from 'lucide-react';
import { useChannelList, ChannelType, type Channel } from '@/api/endpoints/channel';
import { useModelChannelList } from '@/api/endpoints/model';
import { useRunModelTest, type ModelTestMode, type ModelTestResult, type ModelTestTarget } from '@/api/endpoints/model-test';
import { useNavStore } from '@/components/modules/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/common/Toast';
import { cn } from '@/lib/utils';
import { VirtualizedGrid } from '@/components/common/VirtualizedGrid';

type TestRow = {
    key: string;
    channelId: number;
    channelName: string;
    modelName: string;
    protocol: string;
    enabled: boolean;
};

type ModelTestResultFilter = 'all' | 'success' | 'failed' | 'running' | 'idle';
type ModelTestResultStatus = Exclude<ModelTestResultFilter, 'all'>;

const DEFAULT_PROMPT = '只回复 OK';
const MAX_CONCURRENCY = 8;
const MODEL_TEST_GRID_COLUMNS = '2.5rem minmax(16rem,1.4fr) 7rem 9rem 5rem 6rem 6rem 9rem 6rem 7rem minmax(18rem,1.2fr) 8rem';
const MODEL_TEST_EXPORT_VERSION = 1;
const MODEL_TEST_RESULT_FILTERS: ModelTestResultFilter[] = ['all', 'success', 'failed', 'running', 'idle'];

function channelProtocol(type: ChannelType | undefined): string {
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

function protocolLabel(protocol: string): string {
    switch (protocol) {
        case 'openai_response':
            return 'Responses';
        case 'anthropic':
            return 'Anthropic';
        case 'gemini':
            return 'Gemini';
        case 'volcengine':
            return 'Volcengine';
        case 'openai_embedding':
            return 'Embedding';
        case 'openai_chat':
        default:
            return 'Chat';
    }
}

function splitModels(value: string | undefined): string[] {
    return Array.from(new Set((value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)));
}

function rowKey(channelId: number, modelName: string) {
    return `${channelId}\x00${modelName.toLowerCase()}`;
}

function formatMS(value?: number) {
    if (!value || value <= 0) return '-';
    if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
    return `${Math.round(value)}ms`;
}

function formatCount(value?: number) {
    if (!value || value <= 0) return '-';
    return new Intl.NumberFormat().format(value);
}

function formatSpeed(value?: number) {
    if (!value || value <= 0) return '-';
    return value.toFixed(1);
}

function formatCost(value?: number) {
    if (!value || value <= 0) return '-';
    return `$${value.toFixed(6)}`;
}

function resultStatus(result?: ModelTestResult, running = false): ModelTestResultStatus {
    if (running) return 'running';
    if (!result) return 'idle';
    if (result.success) return 'success';
    return 'failed';
}

function modelSourceLabel(row: TestRow) {
    return `${row.channelName} · ${protocolLabel(row.protocol)}`;
}

function exportTimestamp() {
    return new Date().toISOString();
}

function exportFilenameTimestamp() {
    return exportTimestamp().replace(/[:.]/g, '-');
}

function compactObject<T extends Record<string, unknown>>(input: T) {
    return Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
}

function downloadJson(filename: string, payload: unknown) {
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

function sanitizeModelTestResultForExport(result: ModelTestResult) {
    return compactObject({
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
    });
}

export function ModelTest() {
    const t = useTranslations('modelTest');
    const { data: channelsData } = useChannelList();
    const { data: modelChannels } = useModelChannelList();
    const runModelTest = useRunModelTest();
    const openLogTarget = useNavStore((state) => state.openLogTarget);

    const channels = useMemo(() => (channelsData || []).map((item) => item.raw), [channelsData]);
    const channelById = useMemo(() => {
        const map = new Map<number, Channel>();
        for (const channel of channels) {
            map.set(channel.id, channel);
        }
        return map;
    }, [channels]);

    const [mode, setMode] = useState<ModelTestMode>('channel');
    const [selectedChannelId, setSelectedChannelId] = useState<string>('');
    const [selectedModelName, setSelectedModelName] = useState<string>('');
    const [query, setQuery] = useState('');
    const [resultFilter, setResultFilter] = useState<ModelTestResultFilter>('all');
    const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
    const [maxTokens, setMaxTokens] = useState(8);
    const [concurrency, setConcurrency] = useState(2);
    const [stream, setStream] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [results, setResults] = useState<Record<string, ModelTestResult>>({});
    const [runningKeys, setRunningKeys] = useState<Set<string>>(new Set());

    const modelNames = useMemo(() => {
        const names = new Set<string>();
        for (const item of modelChannels || []) {
            if (item.name?.trim()) names.add(item.name.trim());
        }
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }, [modelChannels]);

    useEffect(() => {
        if (!selectedChannelId && channels.length > 0) {
            queueMicrotask(() => setSelectedChannelId(String(channels[0].id)));
        }
    }, [channels, selectedChannelId]);

    useEffect(() => {
        if (!selectedModelName && modelNames.length > 0) {
            queueMicrotask(() => setSelectedModelName(modelNames[0]));
        }
    }, [modelNames, selectedModelName]);

    const filterableRows = useMemo<TestRow[]>(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const allRows: TestRow[] = [];

        if (mode === 'channel') {
            const channelId = Number(selectedChannelId);
            const channel = channelById.get(channelId);
            if (!channel) return [];

            const fromSynced = (modelChannels || [])
                .filter((item) => item.channel_id === channelId)
                .map((item) => item.name);
            const names = fromSynced.length > 0
                ? Array.from(new Set(fromSynced.map((item) => item.trim()).filter(Boolean)))
                : splitModels(`${channel.model},${channel.custom_model}`);
            for (const name of names.sort((a, b) => a.localeCompare(b))) {
                allRows.push({
                    key: rowKey(channel.id, name),
                    channelId: channel.id,
                    channelName: channel.name,
                    modelName: name,
                    protocol: channelProtocol(channel.type),
                    enabled: channel.enabled,
                });
            }
        } else {
            const selected = selectedModelName.trim().toLowerCase();
            for (const item of modelChannels || []) {
                if (item.name.trim().toLowerCase() !== selected) continue;
                const channel = channelById.get(item.channel_id);
                allRows.push({
                    key: rowKey(item.channel_id, item.name),
                    channelId: item.channel_id,
                    channelName: item.channel_name || channel?.name || `Channel #${item.channel_id}`,
                    modelName: item.name,
                    protocol: channelProtocol(channel?.type),
                    enabled: item.enabled && (channel?.enabled ?? true),
                });
            }
            allRows.sort((a, b) => a.channelName.localeCompare(b.channelName));
        }

        const searchedRows = normalizedQuery
            ? allRows.filter((row) => (
                row.modelName.toLowerCase().includes(normalizedQuery) ||
                row.channelName.toLowerCase().includes(normalizedQuery) ||
                protocolLabel(row.protocol).toLowerCase().includes(normalizedQuery)
            ))
            : allRows;
        return searchedRows;
    }, [channelById, mode, modelChannels, query, selectedChannelId, selectedModelName]);

    const resultCounts = useMemo<Record<ModelTestResultFilter, number>>(() => {
        const counts: Record<ModelTestResultFilter, number> = {
            all: filterableRows.length,
            success: 0,
            failed: 0,
            running: 0,
            idle: 0,
        };
        for (const row of filterableRows) {
            counts[resultStatus(results[row.key], runningKeys.has(row.key))] += 1;
        }
        return counts;
    }, [filterableRows, results, runningKeys]);

    const rows = useMemo<TestRow[]>(() => {
        if (resultFilter === 'all') return filterableRows;
        return filterableRows.filter((row) => resultStatus(results[row.key], runningKeys.has(row.key)) === resultFilter);
    }, [filterableRows, resultFilter, results, runningKeys]);

    useEffect(() => {
        queueMicrotask(() => setSelectedKeys(new Set(rows.filter((row) => row.enabled).map((row) => row.key))));
    }, [rows]);

    const selectedRows = useMemo(() => rows.filter((row) => selectedKeys.has(row.key)), [rows, selectedKeys]);
    const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedKeys.has(row.key));

    const handleToggleAll = () => {
        if (allVisibleSelected) {
            setSelectedKeys(new Set());
            return;
        }
        setSelectedKeys(new Set(rows.filter((row) => row.enabled).map((row) => row.key)));
    };

    const handleToggleRow = (key: string) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleRunRows = (rowsToRun: TestRow[], runConcurrency = concurrency) => {
        if (rowsToRun.length === 0) {
            toast.error(t('emptySelection'));
            return;
        }
        const rowKeys = rowsToRun.map((row) => row.key);
        const targets: ModelTestTarget[] = rowsToRun.map((row) => ({
            channel_id: row.channelId,
            model_name: row.modelName,
        }));
        setRunningKeys((previous) => {
            const next = new Set(previous);
            for (const key of rowKeys) {
                next.add(key);
            }
            return next;
        });
        setResults((previous) => {
            const next = { ...previous };
            for (const key of rowKeys) {
                delete next[key];
            }
            return next;
        });
        runModelTest.mutate({
            mode,
            targets,
            prompt,
            max_tokens: maxTokens,
            temperature: 0,
            concurrency: runConcurrency,
            stream,
        }, {
            onSuccess: (data) => {
                setResults((previous) => {
                    const nextResults = { ...previous };
                    for (const item of data.results) {
                        nextResults[rowKey(item.channel_id, item.model_name)] = item;
                    }
                    return nextResults;
                });
                setRunningKeys((previous) => {
                    const next = new Set(previous);
                    for (const key of rowKeys) {
                        next.delete(key);
                    }
                    return next;
                });
                toast.success(t('runComplete', { success: data.success, failed: data.failed }));
            },
            onError: (error) => {
                setRunningKeys((previous) => {
                    const next = new Set(previous);
                    for (const key of rowKeys) {
                        next.delete(key);
                    }
                    return next;
                });
                const message = error instanceof Error ? error.message : t('runFailed');
                toast.error(message);
            },
        });
    };

    const handleRun = () => handleRunRows(selectedRows);

    const failedRows = useMemo(
        () => rows.filter((row) => {
            const result = results[row.key];
            return row.enabled && !!result && !result.success && !runningKeys.has(row.key);
        }),
        [results, rows, runningKeys],
    );

    const handleRetryFailed = () => handleRunRows(failedRows);

    const visibleResultKeys = useMemo(
        () => rows.filter((row) => Boolean(results[row.key])).map((row) => row.key),
        [results, rows],
    );

    const handleClearVisible = () => {
        const keysToClear = new Set(visibleResultKeys);
        if (keysToClear.size === 0) return;
        setResults((previous) => {
            const next = { ...previous };
            for (const key of keysToClear) {
                delete next[key];
            }
            return next;
        });
        toast.success(t('clearVisibleSuccess', { count: keysToClear.size }));
    };

    const handleClear = () => setResults({});

    const summary = useMemo(() => {
        const values = Object.values(results);
        const success = values.filter((item) => item.success).length;
        return { total: values.length, success, failed: values.length - success };
    }, [results]);

    const exportableResults = useMemo(
        () => rows.map((row) => results[row.key]).filter((result): result is ModelTestResult => Boolean(result)),
        [results, rows],
    );

    const handleExport = () => {
        const values = exportableResults;
        if (values.length === 0) {
            toast.warning(t('export.empty'));
            return;
        }
        const exportSummary = {
            total: values.length,
            success: values.filter((item) => item.success).length,
            failed: values.filter((item) => !item.success).length,
        };
        try {
            const exportedAt = exportTimestamp();
            downloadJson(`octopus-model-test-${exportFilenameTimestamp()}.json`, {
                export_version: MODEL_TEST_EXPORT_VERSION,
                exported_at: exportedAt,
                config: {
                    mode,
                    stream,
                    concurrency,
                    max_tokens: maxTokens,
                    prompt_length: prompt.length,
                    result_filter: resultFilter,
                    result_status_counts: resultCounts,
                    selected_count: selectedRows.length,
                    visible_count: rows.length,
                },
                summary: exportSummary,
                results: values.map(sanitizeModelTestResultForExport),
            });
            toast.success(t('export.success'), { description: t('export.safe') });
        } catch (error) {
            toast.error(t('export.failed'), { description: error instanceof Error ? error.message : String(error) });
        }
    };

    const handleClearRow = (key: string) => {
        setResults((previous) => {
            const next = { ...previous };
            delete next[key];
            return next;
        });
    };

    const handleOpenLog = (result: ModelTestResult) => {
        if (!result.log_id && !result.trace_id) return;
        openLogTarget({
            logId: result.log_id,
            traceId: result.trace_id,
            source: 'model_test',
        });
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="shrink-0 rounded-lg border border-border bg-card p-3">
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setMode('channel')}
                                className={cn(
                                    'h-9 rounded-lg border px-3 text-sm font-medium transition-colors',
                                    mode === 'channel' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/20 hover:bg-muted'
                                )}
                            >
                                {t('mode.channel')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('model')}
                                className={cn(
                                    'h-9 rounded-lg border px-3 text-sm font-medium transition-colors',
                                    mode === 'model' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/20 hover:bg-muted'
                                )}
                            >
                                {t('mode.model')}
                            </button>
                            <Badge variant="outline" className="rounded-md">
                                {t('summary', { total: summary.total, success: summary.success, failed: summary.failed })}
                            </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={exportableResults.length === 0}>
                                <Download className="size-4" />
                                {t('export.button')}
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={handleClearVisible} disabled={visibleResultKeys.length === 0}>
                                <Trash2 className="size-4" />
                                {t('clearVisible')}
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={Object.keys(results).length === 0}>
                                <RotateCcw className="size-4" />
                                {t('clear')}
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={handleRetryFailed} disabled={runModelTest.isPending || failedRows.length === 0}>
                                <XCircle className="size-4" />
                                {t('retryFailed', { count: failedRows.length })}
                            </Button>
                            <Button type="button" size="sm" onClick={handleRun} disabled={runModelTest.isPending || selectedRows.length === 0}>
                                <Play className="size-4" />
                                {runModelTest.isPending ? t('running') : t('runSelected', { count: selectedRows.length })}
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(12rem,18rem)_minmax(20rem,1fr)_8rem_8rem_auto]">
                        {mode === 'channel' ? (
                            <label className="grid gap-1">
                                <span className="text-xs font-medium text-muted-foreground">{t('channel')}</span>
                                <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                                    <SelectTrigger className="w-full rounded-lg">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {channels.map((channel) => (
                                            <SelectItem key={channel.id} value={String(channel.id)}>
                                                {channel.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                        ) : (
                            <label className="grid gap-1">
                                <span className="text-xs font-medium text-muted-foreground">{t('model')}</span>
                                <Select value={selectedModelName} onValueChange={setSelectedModelName}>
                                    <SelectTrigger className="w-full rounded-lg">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {modelNames.map((name) => (
                                            <SelectItem key={name} value={name}>
                                                {name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </label>
                        )}

                        <label className="grid gap-1">
                            <span className="text-xs font-medium text-muted-foreground">{t('prompt')}</span>
                            <Input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="rounded-lg" />
                        </label>

                        <label className="grid gap-1">
                            <span className="text-xs font-medium text-muted-foreground">{t('maxTokens')}</span>
                            <Input
                                type="number"
                                min={1}
                                max={256}
                                value={maxTokens}
                                onChange={(event) => setMaxTokens(Math.max(1, Math.min(256, Number(event.target.value) || 1)))}
                                className="rounded-lg"
                            />
                        </label>

                        <label className="grid gap-1">
                            <span className="text-xs font-medium text-muted-foreground">{t('concurrency')}</span>
                            <Input
                                type="number"
                                min={1}
                                max={MAX_CONCURRENCY}
                                value={concurrency}
                                onChange={(event) => setConcurrency(Math.max(1, Math.min(MAX_CONCURRENCY, Number(event.target.value) || 1)))}
                                className="rounded-lg"
                            />
                        </label>

                        <div className="flex items-end gap-3">
                            <label className="grid gap-1">
                                <span className="text-xs font-medium text-muted-foreground">{t('protocol')}</span>
                                <Select value="auto" disabled>
                                    <SelectTrigger className="w-28 rounded-lg">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="auto">{t('protocolAuto')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </label>
                            <label className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground">
                                <Switch checked={stream} onCheckedChange={setStream} />
                                {t('stream')}
                            </label>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
                            <div className="text-xs text-muted-foreground">{t('stats.visible')}</div>
                            <div className="mt-1 text-lg font-semibold tabular-nums">{rows.length}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
                            <div className="text-xs text-muted-foreground">{t('stats.selected')}</div>
                            <div className="mt-1 text-lg font-semibold tabular-nums">{selectedRows.length}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
                            <div className="text-xs text-muted-foreground">{t('stats.concurrency')}</div>
                            <div className="mt-1 text-lg font-semibold tabular-nums">{concurrency}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
                            <div className="text-xs text-muted-foreground">{t('stats.requestMode')}</div>
                            <div className="mt-1 text-lg font-semibold">{stream ? t('stats.stream') : t('stats.nonStream')}</div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 md:flex-row">
                        <div className="relative min-w-0 flex-1">
                            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={mode === 'channel' ? t('searchModel') : t('searchChannel')}
                                className="rounded-lg pl-9"
                            />
                        </div>
                        <Select value={resultFilter} onValueChange={(value) => setResultFilter(value as ModelTestResultFilter)}>
                            <SelectTrigger className="w-full rounded-lg md:w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('filter.all')}</SelectItem>
                                <SelectItem value="success">{t('filter.success')}</SelectItem>
                                <SelectItem value="failed">{t('filter.failed')}</SelectItem>
                                <SelectItem value="running">{t('filter.running')}</SelectItem>
                                <SelectItem value="idle">{t('filter.idle')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {MODEL_TEST_RESULT_FILTERS.map((filter) => (
                            <button
                                key={filter}
                                type="button"
                                onClick={() => setResultFilter(filter)}
                                className={cn(
                                    'inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                                    resultFilter === filter
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border bg-background/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                                )}
                            >
                                <span>{t(`filter.${filter}`)}</span>
                                <span
                                    className={cn(
                                        'min-w-6 rounded-md bg-muted px-1.5 py-0.5 text-center font-semibold tabular-nums text-foreground',
                                        resultFilter === filter && 'bg-primary-foreground/20 text-primary-foreground',
                                    )}
                                >
                                    {resultCounts[filter]}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
                <div className="h-full overflow-x-auto">
                    <div className="flex h-full min-w-[76rem] flex-col">
                        <div
                            className="grid border-b border-border bg-muted/90 text-left text-xs uppercase text-muted-foreground backdrop-blur"
                            style={{ gridTemplateColumns: MODEL_TEST_GRID_COLUMNS }}
                        >
                            <div className="px-3 py-3">
                                <button type="button" onClick={handleToggleAll} className="flex size-5 items-center justify-center rounded border border-border">
                                    {allVisibleSelected && <Circle className="size-3 fill-current" />}
                                </button>
                            </div>
                            <div className="px-3 py-3">{mode === 'channel' ? t('table.model') : t('table.channel')}</div>
                            <div className="px-3 py-3">{t('table.protocol')}</div>
                            <div className="px-3 py-3">{t('table.status')}</div>
                            <div className="px-3 py-3">{t('table.http')}</div>
                            <div className="px-3 py-3">{t('table.ttfb')}</div>
                            <div className="px-3 py-3">{t('table.duration')}</div>
                            <div className="px-3 py-3">{t('table.tokens')}</div>
                            <div className="px-3 py-3">{t('table.speed')}</div>
                            <div className="px-3 py-3">{t('table.cost')}</div>
                            <div className="px-3 py-3">{t('table.response')}</div>
                            <div className="px-3 py-3">{t('table.actions')}</div>
                        </div>
                        {rows.length === 0 ? (
                            <div className="px-3 py-12 text-center text-muted-foreground">
                                <FlaskConical className="mx-auto mb-2 size-6" />
                                {t('emptyRows')}
                            </div>
                        ) : (
                            <div className="min-h-0 flex-1">
                                <VirtualizedGrid
                                    items={rows}
                                    layout="list"
                                    columns={{ default: 1 }}
                                    estimateItemHeight={86}
                                    gap={0}
                                    overscan={12}
                                    getItemKey={(row) => row.key}
                                    renderItem={(row) => {
                                        const isRunning = runningKeys.has(row.key);
                                        const result = results[row.key];
                                        const status = resultStatus(result, isRunning);
                                        return (
                                            <div
                                                className="grid border-b border-border/60 text-sm align-top last:border-0"
                                                style={{ gridTemplateColumns: MODEL_TEST_GRID_COLUMNS }}
                                            >
                                                <div className="px-3 py-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => row.enabled && handleToggleRow(row.key)}
                                                        disabled={!row.enabled}
                                                        className={cn(
                                                            'flex size-5 items-center justify-center rounded border border-border',
                                                            selectedKeys.has(row.key) && 'border-primary bg-primary text-primary-foreground',
                                                            !row.enabled && 'cursor-not-allowed opacity-40'
                                                        )}
                                                    >
                                                        {selectedKeys.has(row.key) && <Circle className="size-3 fill-current" />}
                                                    </button>
                                                </div>
                                                <div className="min-w-0 px-3 py-3">
                                                    <div className="truncate font-medium text-foreground">
                                                        {mode === 'channel' ? row.modelName : row.channelName}
                                                    </div>
                                                    <div className="mt-1 truncate text-xs text-muted-foreground">
                                                        {mode === 'channel' ? modelSourceLabel(row) : row.modelName}
                                                    </div>
                                                </div>
                                                <div className="px-3 py-3">
                                                    <Badge variant="outline" className="rounded-md">
                                                        {protocolLabel(row.protocol)}
                                                    </Badge>
                                                </div>
                                                <div className="px-3 py-3">
                                                    {status === 'running' ? (
                                                        <Badge variant="outline" className="rounded-md">
                                                            <LoaderCircle className="size-3 animate-spin" />
                                                            {t('status.running')}
                                                        </Badge>
                                                    ) : status === 'success' ? (
                                                        <Badge className="rounded-md bg-emerald-600 text-white">
                                                            <CheckCircle2 className="size-3" />
                                                            {t('status.success')}
                                                        </Badge>
                                                    ) : status === 'failed' ? (
                                                        <Badge variant="destructive" className="rounded-md">
                                                            <XCircle className="size-3" />
                                                            {t('status.failed')}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="rounded-md">
                                                            {row.enabled ? t('status.idle') : t('status.disabled')}
                                                        </Badge>
                                                    )}
                                                    {result?.failure_reason && (
                                                        <div className="mt-1 max-w-40 truncate text-xs text-destructive" title={result.failure_reason}>
                                                            {result.failure_reason}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="px-3 py-3 tabular-nums">{result?.http_status || '-'}</div>
                                                <div className="px-3 py-3 tabular-nums">{formatMS(result?.ttfb_ms)}</div>
                                                <div className="px-3 py-3 tabular-nums">{formatMS(result?.duration_ms)}</div>
                                                <div className="px-3 py-3 tabular-nums">
                                                    <div>{formatCount(result?.input_tokens)} / {formatCount(result?.output_tokens)}</div>
                                                    <div className="text-xs text-muted-foreground">{t('cache')}: {formatCount(result?.cache_tokens)}</div>
                                                </div>
                                                <div className="px-3 py-3 tabular-nums">{formatSpeed(result?.tokens_per_second)}</div>
                                                <div className="px-3 py-3 tabular-nums">{formatCost(result?.estimated_cost)}</div>
                                                <div className="min-w-0 px-3 py-3">
                                                    <div className="line-clamp-3 text-sm text-foreground/90" title={result?.response_text || result?.error_message || ''}>
                                                        {isRunning ? t('running') : result?.response_text || result?.error_message || '-'}
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-1 px-3 py-3">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        title={t('runOne')}
                                                        aria-label={t('runOne')}
                                                        disabled={runModelTest.isPending || !row.enabled}
                                                        onClick={() => handleRunRows([row], 1)}
                                                    >
                                                        <Play className="size-3.5" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        title={t('clearOne')}
                                                        aria-label={t('clearOne')}
                                                        disabled={!result}
                                                        onClick={() => handleClearRow(row.key)}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                    {result?.log_id || result?.trace_id ? (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            title={t('viewLog')}
                                                            aria-label={t('viewLog')}
                                                            onClick={() => handleOpenLog(result)}
                                                        >
                                                            <FileSearch className="size-3.5" />
                                                        </Button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
