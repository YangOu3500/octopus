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
        <div className="min-w-0 rounded-2xl bg-background/30 p-4 border border-border/30">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</div>
            <div className="space-y-2">
                {items.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">{t('empty')}</div>
                ) : items.slice(0, 4).map((item) => (
                    <div key={`${item.id ?? item.name}-${item.name}`} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 rounded-[12px] transition-all duration-200 hover:bg-background/50">
                        <div className="min-w-0">
                            <div className="truncate text-[13px] font-bold text-foreground" title={item.name}>{item.name || '-'}</div>
                            <div className="mt-1 text-[11px] font-medium text-muted-foreground/80">
                                {t('breakdownMeta', {
                                    requests: item.requests,
                                    failures: item.failures,
                                    rate: percent(item.success_rate),
                                })}
                            </div>
                        </div>
                        <div className="text-right text-[11px] font-medium text-muted-foreground tabular-nums flex flex-col justify-center">
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
            <div className="fluent-card p-5">
                <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 text-lg font-black tracking-tight text-foreground">
                            <div className="flex size-11 items-center justify-center rounded-[12px] bg-primary text-white shadow-sm">
                                <Radar className="size-5" />
                            </div>
                            {t('title')}
                        </div>
                        <p className="mt-1.5 text-[13px] font-semibold text-muted-foreground">{t('description')}</p>
                    </div>
                    <Badge variant="outline" className="bg-background/40 border-none h-7 w-fit rounded-lg px-3 text-[11px] font-bold text-muted-foreground">
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
                                    className="min-h-[84px] cursor-default rounded-2xl bg-background/30 border border-border/20 p-4 text-left transition-all duration-200"
                                >
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-primary/10 text-primary shadow-sm">
                                            <Icon className="size-4.5" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{t(`items.${item.id}.label`)}</div>
                                            <div className="mt-1 text-xl font-black tabular-nums tracking-tight text-primary drop-shadow-sm">{item.value}</div>
                                            <div className="mt-1 line-clamp-2 text-[11px] font-bold text-muted-foreground/80" title={item.sub}>{item.sub}</div>
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
