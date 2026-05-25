'use client';

import { useLogState } from './use-log-state';
import { LogFilters } from './log-filters';
import { LogTable } from './log-table';
import { LogDetail } from './log-detail';
import { ActiveDebug } from './active-debug';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-react';

export function Log() {
    const state = useLogState();

    return (
        <div className="flex flex-col gap-4 text-xs h-full min-h-0 p-6 overflow-hidden relative">
            {/* Page Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">请求日志</h1>
                    <p className="text-xs text-muted-foreground/80 font-medium">网关历史 API 请求流、响应载荷、多渠道尝试与重试详情审计</p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => state.setActiveDebugOpen(true)}
                    className="h-9 rounded-lg gap-1.5 px-3 font-bold"
                >
                    <Activity className="size-4 text-primary" />
                    <span>活跃请求 Debug</span>
                </Button>
            </div>

            {/* Filters */}
            <LogFilters state={state} />

            {/* Virtualized log list */}
            <LogTable
                logs={state.logsQuery.logs}
                total={state.logsQuery.total}
                isLoading={state.logsQuery.isLoading}
                isFetching={state.logsQuery.isFetching}
                hasMore={state.logsQuery.hasMore}
                loadMore={state.logsQuery.loadMore}
                onViewDetail={state.setSelectedLogId}
            />

            {/* Log Detail Dialog */}
            <LogDetail
                logId={state.selectedLogId}
                open={state.selectedLogId !== null}
                onOpenChange={(open) => {
                    if (!open) state.setSelectedLogId(null);
                }}
            />

            {/* Active Debug Streaming Drawer */}
            <ActiveDebug
                open={state.activeDebugOpen}
                onClose={() => state.setActiveDebugOpen(false)}
                state={state}
            />
        </div>
    );
}

export default Log;
