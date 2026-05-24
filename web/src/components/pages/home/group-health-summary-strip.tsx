'use client';

import { useMemo } from 'react';
import { Activity, CheckCircle2, LoaderCircle, Play, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useGroupHealthEnabled } from '@/api/endpoints/setting';
import { useGroupHealthList, useRunAllGroupHealth } from '@/api/endpoints/group-health';

export function GroupHealthSummaryStrip() {
    const t = useTranslations('home.groupHealth');
    const { enabled } = useGroupHealthEnabled();
    const { data: views = [] } = useGroupHealthList();
    const runAllGroupHealth = useRunAllGroupHealth();

    const summary = useMemo(() => {
        const running = views.filter((view) => view.latest?.status === 'running').length;
        const failed = views.filter((view) => view.latest?.status === 'failed').length;
        const partial = views.filter((view) => view.latest?.status === 'partial').length;
        const success = views.filter((view) => view.latest?.status === 'success').length;
        const idle = views.filter((view) => !view.latest).length;
        return { running, failed, partial, success, idle, total: views.length };
    }, [views]);

    if (!enabled) return null;

    return (
        <section className="rounded-xl border border-border bg-card px-5 py-4 shadow-2xs">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-3 text-lg font-bold tracking-tight text-foreground">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
                            <Activity className="h-5 w-5" />
                        </div>
                        {t('title')}
                        <span className="ml-1 text-xs font-medium text-muted-foreground">{t('total', { count: summary.total })}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <LoaderCircle className="h-4 w-4" />
                            {t('running', { count: summary.running })}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            {t('success', { count: summary.success })}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-amber-500">
                            <Activity className="h-4 w-4" />
                            {t('partial', { count: summary.partial })}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-rose-500">
                            <XCircle className="h-4 w-4" />
                            {t('failed', { count: summary.failed })}
                        </span>
                        {summary.idle ? <span>{t('idle', { count: summary.idle })}</span> : null}
                    </div>
                </div>

                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 px-4 font-semibold md:self-center"
                    onClick={() => runAllGroupHealth.mutate()}
                    disabled={runAllGroupHealth.isPending}
                >
                    {runAllGroupHealth.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {t('runAll')}
                </Button>
            </div>
        </section>
    );
}
