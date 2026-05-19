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
import { type HomeSectionId, useHomeViewStore } from './store';
import { useStatsObservability } from '@/api/endpoints/stats';
import { PageWrapper } from '@/components/common/PageWrapper';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

function SectionCard({
    title,
    description,
    icon,
    chips = [],
    children,
    value,
}: {
    title: string;
    description: string;
    icon: ReactNode;
    chips?: string[];
    children: ReactNode;
    value: HomeSectionId;
}) {
    return (
        <AccordionItem value={value} className="overflow-hidden rounded-xl border border-border/70 bg-card/90 shadow-sm transition-shadow duration-200 hover:shadow-md">
            <AccordionTrigger className="items-center px-4 py-3.5 hover:no-underline hover:bg-muted/30">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                        {icon}
                    </div>
                    <div className="min-w-0 text-left">
                        <div className="truncate text-sm font-semibold text-foreground">{title}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">{description}</div>
                    </div>
                </div>
                {chips.length > 0 ? (
                    <div className="hidden items-center gap-1.5 lg:flex">
                        {chips.map((chip) => (
                            <Badge key={chip} variant="outline" className="h-6 rounded-md px-2 text-[11px] font-normal text-muted-foreground">
                                {chip}
                            </Badge>
                        ))}
                    </div>
                ) : null}
            </AccordionTrigger>
            <AccordionContent className="border-t border-border/60 px-4 pb-4 pt-4">
                {children}
            </AccordionContent>
        </AccordionItem>
    );
}

export function Home() {
    const t = useTranslations('home.sections');
    const openSections = useHomeViewStore((state) => state.openSections);
    const setOpenSections = useHomeViewStore((state) => state.setOpenSections);
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
        <PageWrapper className="h-full min-h-0 overflow-y-auto overscroll-contain space-y-4 pb-24 md:pb-4">
            <DashboardSummaryCards />
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
                <StatsChart />
                <div className="space-y-3">
                    <GatewayOperationsPanel />
                    <GroupHealthSummaryStrip />
                </div>
            </div>
            <Accordion
                type="multiple"
                value={openSections}
                onValueChange={(value) => setOpenSections(value as HomeSectionId[])}
                className="space-y-2.5"
            >
                <SectionCard
                    value="workbench"
                    icon={<Radar className="size-4" />}
                    title={t('workbench.title')}
                    description={t('workbench.description')}
                    chips={sectionChips.workbench}
                >
                    <ObservabilityPanel />
                </SectionCard>

                <SectionCard
                    value="analytics"
                    icon={<BarChart3 className="size-4" />}
                    title={t('analytics.title')}
                    description={t('analytics.description')}
                    chips={sectionChips.analytics}
                >
                    <Rank />
                </SectionCard>

                <SectionCard
                    value="activity"
                    icon={<ActivityIcon className="size-4" />}
                    title={t('activity.title')}
                    description={t('activity.description')}
                    chips={sectionChips.activity}
                >
                    <Activity />
                </SectionCard>
            </Accordion>
        </PageWrapper>
    );
}
