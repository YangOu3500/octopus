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
        <div className="min-w-0">
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">{title}</div>
            <div className="divide-y divide-border rounded-md border">
                {items.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">{t('empty')}</div>
                ) : items.slice(0, 4).map((item) => (
                    <div key={`${item.id ?? item.name}-${item.name}`} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium" title={item.name}>{item.name || '-'}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                                {t('breakdownMeta', {
                                    requests: item.requests,
                                    failures: item.failures,
                                    rate: percent(item.success_rate),
                                })}
                            </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground tabular-nums">
                            <div>{compactTime(item.avg_latency_ms)}</div>
                            <div>{compactMoney(item.cost)}</div>
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
            id: 'traces',
            icon: Radar,
            value: compactCount(data?.total_attempts),
            sub: t('items.traces.sub', { max: data?.max_attempts ?? 0 }),
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
            <div className="rounded-lg border bg-card/95 p-4 text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md">
                <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <Radar className="size-4 text-primary" />
                            {t('title')}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
                    </div>
                    <Badge variant="outline" className="w-fit rounded-md">
                        {t('window', {
                            stream: data?.stream_requests ?? 0,
                            modelTest: data?.model_test_requests ?? 0,
                        })}
                    </Badge>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)]">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {operationItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <article
                                    key={item.id}
                                    className="cursor-default rounded-md border bg-background/45 p-3 text-left transition-all duration-200 hover:-translate-y-px hover:border-primary/20 hover:bg-background/80 hover:shadow-sm"
                                >
                                    <div className="flex items-start gap-2">
                                        <div className="flex size-8 items-center justify-center rounded-md border bg-card text-primary">
                                            <Icon className="size-3.5" />
                                        </div>
                                    </div>
                                    <div className="mt-3 text-xs text-muted-foreground">{t(`items.${item.id}.label`)}</div>
                                    <div className="mt-1 text-xl font-semibold tabular-nums tracking-normal">{item.value}</div>
                                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={item.sub}>{item.sub}</div>
                                </article>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <BreakdownRows title={t('apiKeyBreakdown')} items={data?.top_api_keys ?? []} />
                        <BreakdownRows title={t('sourceBreakdown')} items={data?.source_breakdown ?? []} />
                    </div>
                </div>
            </div>
        </section>
    );
}
