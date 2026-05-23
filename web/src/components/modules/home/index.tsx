'use client';

import { Activity as ActivityIcon, BarChart3, Radar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, type ReactNode } from 'react';
import { Activity } from './activity';
import { StatsChart } from './chart';
import { DashboardSummaryCards } from './dashboard-summary';
import { GatewayOperationsPanel } from './gateway-operations';
import { GroupHealthSummaryStrip } from './group-health-summary-strip';
import { ObservabilityPanel } from './observability';
import { Rank } from './rank';
import { useStatsObservability } from '@/api/endpoints/stats';
import { PageWrapper } from '@/components/common/PageWrapper';
import { Badge } from '@/components/ui/badge';

function SectionCard({
    title,
    description,
    icon,
    chips = [],
    children,
}: {
    title: string;
    description: string;
    icon: ReactNode;
    chips?: string[];
    children: ReactNode;
}) {
    return (
        <section className="clay-card flex flex-col overflow-hidden">
            <header className="flex items-center gap-3 px-5 py-4 border-b border-border/40 bg-card/40">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary shadow-inner">
                        {icon}
                    </div>
                    <div className="min-w-0 text-left">
                        <h2 className="truncate text-base font-bold text-foreground/90 tracking-tight">{title}</h2>
                        <p className="line-clamp-1 text-[13px] text-muted-foreground/80">{description}</p>
                    </div>
                </div>
                {chips.length > 0 ? (
                    <div className="hidden flex-wrap items-center justify-end gap-1.5 md:flex">
                        {chips.map((chip) => (
                            <Badge key={chip} variant="outline" className="h-6 rounded-md px-2 text-[11px] font-medium text-muted-foreground bg-muted/30 border-border/50">
                                {chip}
                            </Badge>
                        ))}
                    </div>
                ) : null}
            </header>
            <div className="p-4 flex-1">
                {children}
            </div>
        </section>
    );
}

export function Home() {
    const t = useTranslations('home.sections');
    const { data: observability } = useStatsObservability('24h');

    const sectionChips = useMemo(() => ({
        workbench: [
            t('workbenchChip.requests', { count: observability?.total_requests ?? 0 }),
            t('workbenchChip.failover', { count: observability?.failover_requests ?? 0 }),
            t('workbenchChip.latency', { latency: Math.round(observability?.avg_latency_ms ?? 0) }),
        ],
        analytics: [
            t('analyticsChip.models', { count: observability?.top_models?.length ?? 0 }),
            t('analyticsChip.channels', { count: observability?.top_channels?.length ?? 0 }),
            t('analyticsChip.keys', { count: observability?.top_api_keys?.length ?? 0 }),
        ],
        activity: [
            t('activityChip.failures', { count: observability?.recent_failures?.length ?? 0 }),
            t('activityChip.sources', { count: observability?.source_breakdown?.length ?? 0 }),
        ],
    }), [observability, t]);

    return (
        <PageWrapper className="h-full min-h-0 overflow-y-auto overscroll-contain space-y-4 pb-24 md:pb-6 px-2">
            <section className="space-y-3">
                <DashboardSummaryCards />
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.58fr)_minmax(320px,0.88fr)] items-start">
                    <StatsChart />
                    <div className="space-y-3 w-full">
                        <GatewayOperationsPanel />
                        <GroupHealthSummaryStrip />
                    </div>
                </div>
            </section>

            <div className="space-y-3">
                <SectionCard
                    icon={<Radar className="size-4.5" />}
                    title={t('workbench.title')}
                    description={t('workbench.description')}
                    chips={sectionChips.workbench}
                >
                    <ObservabilityPanel />
                </SectionCard>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <SectionCard
                        icon={<BarChart3 className="size-4.5" />}
                        title={t('analytics.title')}
                        description={t('analytics.description')}
                        chips={sectionChips.analytics}
                    >
                        <Rank />
                    </SectionCard>

                    <SectionCard
                        icon={<ActivityIcon className="size-4.5" />}
                        title={t('activity.title')}
                        description={t('activity.description')}
                        chips={sectionChips.activity}
                    >
                        <Activity />
                    </SectionCard>
                </div>
            </div>
        </PageWrapper>
    );
}
