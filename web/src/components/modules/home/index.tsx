'use client';

import { Activity as ActivityIcon, BarChart3, Radar } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Activity } from './activity';
import { StatsChart } from './chart';
import { DashboardSummaryCards } from './dashboard-summary';
import { GatewayOperationsPanel } from './gateway-operations';
import { GroupHealthSummaryStrip } from './group-health-summary-strip';
import { ObservabilityPanel } from './observability';
import { Rank } from './rank';
import { type HomeSectionId, useHomeViewStore } from './store';
import { PageWrapper } from '@/components/common/PageWrapper';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

function SectionCard({
    title,
    description,
    icon,
    children,
    value,
}: {
    title: string;
    description: string;
    icon: ReactNode;
    children: ReactNode;
    value: HomeSectionId;
}) {
    return (
        <AccordionItem value={value} className="overflow-hidden rounded-lg border border-border/70 bg-card/80 shadow-sm transition-shadow duration-200 hover:shadow-md">
            <AccordionTrigger className="px-3.5 py-3 hover:no-underline hover:bg-muted/30">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary">
                        {icon}
                    </div>
                    <div className="min-w-0 text-left">
                        <div className="truncate text-sm font-semibold text-foreground">{title}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">{description}</div>
                    </div>
                </div>
            </AccordionTrigger>
            <AccordionContent className="border-t border-border/60 px-3 pb-3 pt-3">
                {children}
            </AccordionContent>
        </AccordionItem>
    );
}

export function Home() {
    const t = useTranslations('home.sections');
    const openSections = useHomeViewStore((state) => state.openSections);
    const setOpenSections = useHomeViewStore((state) => state.setOpenSections);

    return (
        <PageWrapper className="h-full min-h-0 overflow-y-auto overscroll-contain space-y-4 pb-24 md:pb-4">
            <DashboardSummaryCards />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
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
                >
                    <ObservabilityPanel />
                </SectionCard>

                <SectionCard
                    value="analytics"
                    icon={<BarChart3 className="size-4" />}
                    title={t('analytics.title')}
                    description={t('analytics.description')}
                >
                    <Rank />
                </SectionCard>

                <SectionCard
                    value="activity"
                    icon={<ActivityIcon className="size-4" />}
                    title={t('activity.title')}
                    description={t('activity.description')}
                >
                    <Activity />
                </SectionCard>
            </Accordion>
        </PageWrapper>
    );
}
