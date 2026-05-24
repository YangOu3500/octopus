'use client';

import {
    Clock3,
    GitBranch,
    KeyRound,
    ListChecks,
    Radar,
    Server,
    type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useStatsObservability, type StatsObservabilityBreakdown } from '@/api/endpoints/stats';
import { Badge } from '@/components/ui/badge';
import { formatCount, formatMoney, formatTime } from '@/lib/utils';

type OperationItem = {
    id: 'requests' | 'traces' | 'channels' | 'models' | 'apiKeys' | 'performance';
    icon: LucideIcon;
    value: string;
    sub: string;
};

function compactCount(value: number | undefined) {
    const formatted = formatCount(value ?? 0).formatted;
    return `${formatted.value}${formatted.unit}`;
}

function compactMoney(value: number | undefined) {
    const formatted = formatMoney(value ?? 0).formatted;
    if (formatted.unit.endsWith('$')) {
        return `$${formatted.value}${formatted.unit.replace(/\$$/, '')}`;
    }
    return `${formatted.value}${formatted.unit}`;
}

function compactTime(value: number | undefined) {
    const formatted = formatTime(value ?? 0).formatted;
    return `${formatted.value}${formatted.unit}`;
}

function percent(value: number | undefined) {
    return `${((value ?? 0) * 100).toFixed(1)}%`;
}

function BreakdownRows({ title, items }: { title: string; items: StatsObservabilityBreakdown[] }) {
    const t = useTranslations('home.operations');

    return (
        <div className="min-w-0 rounded-xl bg-background/20 p-4 border border-border">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
            <div className="space-y-1">
                {items.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">{t('empty')}</div>
                ) : items.slice(0, 4).map((item) => (
                    <div key={`${item.id ?? item.name}-${item.name}`} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 rounded-lg transition-colors duration-150 hover:bg-muted/40">
                        <div className="min-w-0">
                            <div className="truncate text-xs font-bold text-foreground" title={item.name}>{item.name || '-'}</div>
                            <div className="mt-0.5 text-[10px] font-medium text-muted-foreground/75">
                                {t('breakdownMeta', {
                                    requests: item.requests,
                                    failures: item.failures,
                                    rate: percent(item.success_rate),
                                })}
                            </div>
                        </div>
                        <div className="text-right text-[10px] font-semibold text-muted-foreground tabular-nums flex flex-col justify-center">
                            <div className="text-foreground/80">{compactTime(item.avg_latency_ms)}</div>
                            <div className="mt-0.5">{compactMoney(item.cost)}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function GatewayOperationsPanel() {
    const t = useTranslations('home.operations');
    const { data } = useStatsObservability('24h');

    const operationItems = useMemo<OperationItem[]>(() => [
        {
            id: 'requests',
            icon: ListChecks,
            value: compactCount(data?.total_requests),
            sub: t('items.requests.sub', { failover: data?.failover_requests ?? 0 }),
        },
        {
            id: 'channels',
            icon: Server,
            value: percent(data?.success_rate),
            sub: t('items.channels.sub', { failed: data?.failed_requests ?? 0 }),
        },
        {
            id: 'models',
            icon: GitBranch,
            value: compactCount(data?.top_models?.[0]?.requests),
            sub: data?.top_models?.[0]?.name || t('items.models.empty'),
        },
        {
            id: 'apiKeys',
            icon: KeyRound,
            value: compactCount(data?.top_api_keys?.[0]?.requests),
            sub: data?.top_api_keys?.[0]?.name || t('items.apiKeys.empty'),
        },
        {
            id: 'performance',
            icon: Clock3,
            value: compactTime(data?.avg_latency_ms),
            sub: t('items.performance.sub', { ttfb: compactTime(data?.avg_ttfb_ms) }),
        },
    ], [data, t]);

    return (
        <section>
            <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
                <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 text-lg font-bold tracking-tight text-foreground">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                                <Radar className="h-5 w-5" />
                            </div>
                            {t('title')}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{t('description')}</p>
                    </div>
                    <Badge variant="secondary" className="h-6 w-fit rounded-md px-2.5 text-[10px] font-semibold">
                        {t('window', {
                            stream: data?.stream_requests ?? 0,
                            modelTest: data?.model_test_requests ?? 0,
                        })}
                    </Badge>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {operationItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <article
                                    key={item.id}
                                    className="min-h-[84px] cursor-default rounded-xl border border-border/80 bg-background/40 p-4 text-left transition-colors duration-150 hover:bg-muted/30"
                                >
                                    <div className="flex min-w-0 items-start gap-2.5">
                                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                            <Icon className="h-4.5 w-4.5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t(`items.${item.id}.label`)}</div>
                                            <div className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-primary">{item.value}</div>
                                            <div className="mt-0.5 text-[10px] font-medium text-muted-foreground/80 break-words leading-tight" title={item.sub}>{item.sub}</div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                        <BreakdownRows title={t('apiKeyBreakdown')} items={data?.top_api_keys ?? []} />
                        <BreakdownRows title={t('sourceBreakdown')} items={data?.source_breakdown ?? []} />
                    </div>
                </div>
            </div>
        </section>
    );
}
