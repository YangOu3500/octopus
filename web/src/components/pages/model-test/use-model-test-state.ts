'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useChannelList, type Channel } from '@/api/endpoints/channel';
import { useModelChannelList } from '@/api/endpoints/model';
import { useRunModelTest, type ModelTestMode, type ModelTestResult, type ModelTestTarget } from '@/api/endpoints/model-test';
import { useNavStore } from '@/stores/nav';
import {
    DEFAULT_PROMPT,
    MAX_CONCURRENCY,
    MODEL_TEST_EXPORT_VERSION,
    channelProtocol,
    splitModels,
    rowKey,
    resultStatus,
    downloadJson,
    sanitizeModelTestResultForExport,
    type ModelTestResultFilter,
    type ModelTestRunStatus,
    type ActiveRunPlan,
} from './test-utils';
import type { TestRow } from './test-results';

export function useModelTestState() {
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
    
    const [deselectedKeys, setDeselectedKeys] = useState<Set<string>>(new Set());
    const [results, setResults] = useState<Record<string, ModelTestResult>>({});
    const [runningKeys, setRunningKeys] = useState<Set<string>>(new Set());
    const [activeRunPlan, setActiveRunPlan] = useState<ActiveRunPlan | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Detail Modal State
    const [detailResult, setDetailResult] = useState<ModelTestResult | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const modelNames = useMemo(() => {
        const names = new Set<string>();
        for (const item of modelChannels || []) {
            if (item.name?.trim()) names.add(item.name.trim());
        }
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }, [modelChannels]);

    // Active fallbacks for values when first rendering
    const activeChannelId = useMemo(() => {
        return selectedChannelId || (channels[0] ? String(channels[0].id) : '');
    }, [selectedChannelId, channels]);

    const activeModelName = useMemo(() => {
        return selectedModelName || (modelNames[0] || '');
    }, [selectedModelName, modelNames]);

    const filterableRows = useMemo<TestRow[]>(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const allRows: TestRow[] = [];

        if (mode === 'channel') {
            const channelId = Number(activeChannelId);
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
            const selected = activeModelName.trim().toLowerCase();
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

        if (normalizedQuery) {
            return allRows.filter((row) => (
                row.modelName.toLowerCase().includes(normalizedQuery) ||
                row.channelName.toLowerCase().includes(normalizedQuery)
            ));
        }
        return allRows;
    }, [channelById, mode, modelChannels, query, activeChannelId, activeModelName]);

    const runStateByKey = useMemo(() => {
        const states = new Map<string, ModelTestRunStatus>();
        if (!activeRunPlan) return states;
        const activeLimit = Math.max(1, Math.min(activeRunPlan.concurrency, activeRunPlan.keys.length));
        activeRunPlan.keys.forEach((key, index) => {
            if (!runningKeys.has(key)) return;
            states.set(key, index < activeLimit ? 'running' : 'queued');
        });
        return states;
    }, [activeRunPlan, runningKeys]);

    const runStats = useMemo(() => {
        let running = 0;
        let queued = 0;
        for (const state of runStateByKey.values()) {
            if (state === 'running') running += 1;
            if (state === 'queued') queued += 1;
        }
        return { running, queued, total: running + queued };
    }, [runStateByKey]);

    const resultCounts = useMemo<Record<ModelTestResultFilter, number>>(() => {
        const counts: Record<ModelTestResultFilter, number> = {
            all: filterableRows.length,
            success: 0,
            failed: 0,
            running: 0,
            queued: 0,
            idle: 0,
        };
        for (const row of filterableRows) {
            counts[resultStatus(results[row.key], runStateByKey.get(row.key))] += 1;
        }
        return counts;
    }, [filterableRows, results, runStateByKey]);

    const rows = useMemo<TestRow[]>(() => {
        if (resultFilter === 'all') return filterableRows;
        return filterableRows.filter((row) => resultStatus(results[row.key], runStateByKey.get(row.key)) === resultFilter);
    }, [filterableRows, resultFilter, results, runStateByKey]);

    const selectedKeys = useMemo(() => {
        const keys = new Set<string>();
        for (const row of rows) {
            if (row.enabled && !deselectedKeys.has(row.key)) {
                keys.add(row.key);
            }
        }
        return keys;
    }, [rows, deselectedKeys]);

    const selectedRows = useMemo(() => rows.filter((row) => selectedKeys.has(row.key)), [rows, selectedKeys]);
    
    const allVisibleSelected = useMemo(() => {
        const enabledRows = rows.filter((row) => row.enabled);
        return enabledRows.length > 0 && enabledRows.every((row) => selectedKeys.has(row.key));
    }, [rows, selectedKeys]);

    const handleToggleAll = () => {
        if (allVisibleSelected) {
            setDeselectedKeys((prev) => {
                const next = new Set(prev);
                for (const row of rows) {
                    if (row.enabled) {
                        next.add(row.key);
                    }
                }
                return next;
            });
        } else {
            setDeselectedKeys((prev) => {
                const next = new Set(prev);
                for (const row of rows) {
                    if (row.enabled) {
                        next.delete(row.key);
                    }
                }
                return next;
            });
        }
    };

    const handleToggleRow = (key: string) => {
        setDeselectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const handleRunRows = (rowsToRun: TestRow[], runConcurrency = concurrency) => {
        if (rowsToRun.length === 0) {
            toast.error(t('emptySelection'));
            return;
        }
        const boundedConcurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(runConcurrency) || 1));
        const rowKeys = rowsToRun.map((row) => row.key);
        const targets: ModelTestTarget[] = rowsToRun.map((row) => ({
            channel_id: row.channelId,
            model_name: row.modelName,
        }));

        setActiveRunPlan({ keys: rowKeys, concurrency: boundedConcurrency });
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

        runModelTest.mutate(
            {
                mode,
                targets,
                prompt,
                max_tokens: maxTokens,
                temperature: 0,
                concurrency: boundedConcurrency,
                stream,
            },
            {
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
                    setActiveRunPlan(null);
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
                    setActiveRunPlan(null);
                    const message = error instanceof Error ? error.message : t('runFailed');
                    toast.error(message);
                },
            }
        );
    };

    const handleRunSelected = () => handleRunRows(selectedRows);

    const failedRows = useMemo(() => {
        return rows.filter((row) => {
            const result = results[row.key];
            return row.enabled && !!result && !result.success && !runningKeys.has(row.key);
        });
    }, [results, rows, runningKeys]);

    const handleRetryFailed = () => handleRunRows(failedRows);

    const visibleResultKeys = useMemo(
        () => rows.filter((row) => Boolean(results[row.key])).map((row) => row.key),
        [results, rows]
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

    const handleClearAll = () => {
        setResults({});
    };

    const summaryStats = useMemo(() => {
        const values = Object.values(results);
        const success = values.filter((item) => item.success).length;
        return { total: values.length, success, failed: values.length - success };
    }, [results]);

    const exportableResults = useMemo(
        () => rows.map((row) => results[row.key]).filter((result): result is ModelTestResult => Boolean(result)),
        [results, rows]
    );

    const handleExport = () => {
        if (exportableResults.length === 0) {
            toast.warning(t('export.empty'));
            return;
        }
        const exportSummary = {
            total: exportableResults.length,
            success: exportableResults.filter((item) => item.success).length,
            failed: exportableResults.filter((item) => !item.success).length,
        };
        try {
            downloadJson(`octopus-model-test-${Date.now()}.json`, {
                export_version: MODEL_TEST_EXPORT_VERSION,
                exported_at: new Date().toISOString(),
                config: {
                    mode,
                    stream,
                    concurrency,
                    max_tokens: maxTokens,
                },
                summary: exportSummary,
                results: exportableResults.map(sanitizeModelTestResultForExport),
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

    const handleOpenDetail = (result: ModelTestResult) => {
        setDetailResult(result);
        setIsDetailOpen(true);
    };

    return {
        mode,
        setMode,
        channels,
        selectedChannelId,
        setSelectedChannelId,
        modelNames,
        selectedModelName,
        setSelectedModelName,
        query,
        setQuery,
        resultFilter,
        setResultFilter,
        prompt,
        setPrompt,
        maxTokens,
        setMaxTokens,
        concurrency,
        setConcurrency,
        stream,
        setStream,
        selectedKeys,
        selectedRows,
        results,
        runningKeys,
        runStateByKey,
        runStats,
        resultCounts,
        rows,
        allVisibleSelected,
        handleToggleAll,
        handleToggleRow,
        handleRunRows,
        handleRunSelected,
        failedRows,
        handleRetryFailed,
        visibleResultKeys,
        handleClearVisible,
        handleClearAll,
        summaryStats,
        exportableResults,
        handleExport,
        handleClearRow,
        handleOpenLog,
        handleOpenDetail,
        showAdvanced,
        setShowAdvanced,
        detailResult,
        isDetailOpen,
        setIsDetailOpen,
        isPending: runModelTest.isPending,
    };
}
export type ModelTestState = ReturnType<typeof useModelTestState>;
