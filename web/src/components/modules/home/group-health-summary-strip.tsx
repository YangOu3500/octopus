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
        <section className="clay-card px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-3 text-base font-bold tracking-tight text-foreground/90">
                        <div className="flex size-10 items-center justify-center rounded-[12px] clay-pressed text-primary shadow-none">
                            <Activity className="size-4.5" />
                        </div>
                        {t('title')}
                        <span className="ml-1 text-[13px] font-medium text-muted-foreground/80">{t('total', { count: summary.total })}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <LoaderCircle className="size-4" />
                            {t('running', { count: summary.running })}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-4" />
                            {t('success', { count: summary.success })}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <Activity className="size-4" />
                            {t('partial', { count: summary.partial })}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-destructive">
                            <XCircle className="size-4" />
                            {t('failed', { count: summary.failed })}
                        </span>
                        {summary.idle ? <span>{t('idle', { count: summary.idle })}</span> : null}
                    </div>
                </div>

                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="clay-pressed border-none h-10 rounded-xl px-5 text-[13px] font-bold hover:bg-muted/50 transition-colors md:self-center"
                    onClick={() => runAllGroupHealth.mutate()}
                    disabled={runAllGroupHealth.isPending}
                >
                    {runAllGroupHealth.isPending ? <LoaderCircle className="size-4.5 animate-spin" /> : <Play className="size-4.5" />}
                    {t('runAll')}
                </Button>
            </div>
        </section>
    );
}
