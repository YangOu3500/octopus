'use client';

import { useTranslations } from 'next-intl';
import { Download, Play, RotateCcw, Trash2, XCircle } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { TestControls } from './test-controls';
import { TestResults } from './test-results';
import { TestDetail } from './test-detail';
import { useModelTestState } from './use-model-test-state';
import { MODEL_TEST_RESULT_FILTERS } from './test-utils';

export function ModelTest() {
    const t = useTranslations('modelTest');
    const navT = useTranslations('navbar');

    const state = useModelTestState();

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title={navT('modelTest')}
                description="直接测试模型、流和延迟"
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl font-semibold gap-1.5"
                            onClick={state.handleExport}
                            disabled={state.exportableResults.length === 0}
                        >
                            <Download className="size-4" />
                            <span>{t('export.button')}</span>
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl font-semibold gap-1.5"
                            onClick={state.handleClearVisible}
                            disabled={state.visibleResultKeys.length === 0}
                        >
                            <Trash2 className="size-4" />
                            <span>{t('clearVisible')}</span>
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl font-semibold gap-1.5"
                            onClick={state.handleClearAll}
                            disabled={Object.keys(state.results).length === 0}
                        >
                            <RotateCcw className="size-4" />
                            <span>{t('clear')}</span>
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl font-semibold gap-1.5 border-destructive/25 text-destructive hover:bg-destructive/5"
                            onClick={state.handleRetryFailed}
                            disabled={state.isPending || state.failedRows.length === 0}
                        >
                            <XCircle className="size-4" />
                            <span>{t('retryFailed', { count: state.failedRows.length })}</span>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            className="h-9 rounded-xl font-semibold gap-1.5"
                            onClick={state.handleRunSelected}
                            disabled={state.isPending || state.selectedRows.length === 0}
                        >
                            <Play className="size-4" />
                            <span>
                                {state.isPending
                                    ? t('running')
                                    : t('runSelected', { count: state.selectedRows.length })}
                            </span>
                        </Button>
                    </div>
                }
            />

            {/* Quick Summary Badges */}
            <div className="flex flex-wrap items-center gap-2 px-1 shrink-0">
                <Badge variant="outline" className="rounded-md px-2.5 py-1 text-[11px] font-semibold border-border/80 bg-card">
                    {t('summary', {
                        total: state.summaryStats.total,
                        success: state.summaryStats.success,
                        failed: state.summaryStats.failed,
                    })}
                </Badge>
                {state.runStats.total > 0 && (
                    <Badge variant="outline" className="rounded-md px-2.5 py-1 text-[11px] font-semibold border-amber-500/25 bg-amber-500/[0.03] text-amber-500">
                        {t('queueSummary', {
                            running: state.runStats.running,
                            queued: state.runStats.queued,
                            total: state.runStats.total,
                        })}
                    </Badge>
                )}
            </div>

            {/* Config & Search Form Controls */}
            <TestControls
                mode={state.mode}
                setMode={state.setMode}
                channels={state.channels}
                selectedChannelId={state.selectedChannelId}
                setSelectedChannelId={state.setSelectedChannelId}
                modelNames={state.modelNames}
                selectedModelName={state.selectedModelName}
                setSelectedModelName={state.setSelectedModelName}
                prompt={state.prompt}
                setPrompt={state.setPrompt}
                maxTokens={state.maxTokens}
                setMaxTokens={state.setMaxTokens}
                concurrency={state.concurrency}
                setConcurrency={state.setConcurrency}
                stream={state.stream}
                setStream={state.setStream}
                showAdvanced={state.showAdvanced}
                setShowAdvanced={state.setShowAdvanced}
                query={state.query}
                setQuery={setQuery => state.setQuery(setQuery)}
            />

            {/* Result Filters */}
            <div className="flex flex-wrap gap-1.5 shrink-0 py-1 border-t border-border/20">
                {MODEL_TEST_RESULT_FILTERS.map((filter) => (
                    <Button
                        key={filter}
                        variant={state.resultFilter === filter ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 rounded-lg text-[10px] font-bold"
                        onClick={() => state.setResultFilter(filter)}
                    >
                        <span>{t(`filter.${filter}`)}</span>
                        <span className="ml-1.5 font-mono text-[9px] px-1 bg-background/20 rounded-md">
                            {state.resultCounts[filter]}
                        </span>
                    </Button>
                ))}
            </div>

            {/* Virtual Table results */}
            <TestResults
                rows={state.rows}
                selectedKeys={state.selectedKeys}
                onToggleRow={state.handleToggleRow}
                onToggleAll={state.handleToggleAll}
                allVisibleSelected={state.allVisibleSelected}
                results={state.results}
                runStateByKey={state.runStateByKey}
                onRunRows={state.handleRunRows}
                onClearRow={state.handleClearRow}
                onOpenLog={state.handleOpenLog}
                onOpenDetail={state.handleOpenDetail}
                isPending={state.isPending}
                mode={state.mode}
            />

            {/* Detail View Dialog */}
            <TestDetail
                result={state.detailResult}
                open={state.isDetailOpen}
                onOpenChange={state.setIsDetailOpen}
                onViewLog={state.handleOpenLog}
            />
        </div>
    );
}
export default ModelTest;
