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
        <AccordionItem value={value} className="overflow-hidden rounded-xl border border-border/70 bg-card/70 shadow-sm">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                        {icon}
                    </div>
                    <div className="min-w-0 text-left">
                        <div className="truncate text-sm font-semibold text-foreground">{title}</div>
                        <div className="truncate text-xs text-muted-foreground">{description}</div>
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
        <PageWrapper className="h-full min-h-0 overflow-y-auto overscroll-contain space-y-3 pb-24 md:pb-4">
            <DashboardSummaryCards />
            <Accordion
                type="multiple"
                value={openSections}
                onValueChange={(value) => setOpenSections(value as HomeSectionId[])}
                className="space-y-3"
            >
                <SectionCard
                    value="workbench"
                    icon={<Radar className="size-4" />}
                    title={t('workbench.title')}
                    description={t('workbench.description')}
                >
                    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
                        <ObservabilityPanel />
                        <div className="space-y-3">
                            <GatewayOperationsPanel />
                            <GroupHealthSummaryStrip />
                        </div>
                    </div>
                </SectionCard>

                <SectionCard
                    value="analytics"
                    icon={<BarChart3 className="size-4" />}
                    title={t('analytics.title')}
                    description={t('analytics.description')}
                >
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
                        <StatsChart />
                        <Rank />
                    </div>
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
