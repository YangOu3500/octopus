'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useHomeViewStore, type HomeSectionId } from './store';
import { DashboardSummaryCards } from './dashboard-summary';
import { StatsChart } from './chart';
import { GroupHealthSummaryStrip } from './group-health-summary-strip';
import { ObservabilityPanel } from './observability';
import { TopRankings } from './rank';
import { ActivityHeatmap } from './activity';
import { useStatsObservability } from '@/api/endpoints/stats';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function Home() {
    const t = useTranslations('navbar');
    const sectionsT = useTranslations('home.sections');
    const homeT = useTranslations('home');
    const queryClient = useQueryClient();

    const openSections = useHomeViewStore((state) => state.openSections);
    const setOpenSections = useHomeViewStore((state) => state.setOpenSections);

    const { data: obsData, isFetching } = useStatsObservability('24h');

    const toggleSection = (id: HomeSectionId) => {
        if (openSections.includes(id)) {
            setOpenSections(openSections.filter((x) => x !== id));
        } else {
            setOpenSections([...openSections, id]);
        }
    };

    const handleRefresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ['stats'] });
        await queryClient.invalidateQueries({ queryKey: ['group-health'] });
        toast.success(homeT('refreshed'));
    };

    // Calculate metadata chips for collapsed/expanded headers
    const chips = useMemo(() => {
        if (!obsData) return { workbench: [], analytics: [], activity: [] };

        return {
            workbench: [
                sectionsT('workbenchChip.requests', { count: obsData.total_requests }),
                sectionsT('workbenchChip.failover', { count: obsData.failover_requests }),
                sectionsT('workbenchChip.latency', { latency: obsData.avg_latency_ms.toFixed(0) }),
            ],
            analytics: [
                sectionsT('analyticsChip.models', { count: obsData.top_models?.length ?? 0 }),
                sectionsT('analyticsChip.channels', { count: obsData.top_channels?.length ?? 0 }),
                sectionsT('analyticsChip.keys', { count: obsData.top_api_keys?.length ?? 0 }),
            ],
            activity: [
                sectionsT('activityChip.failures', { count: obsData.recent_failures?.length ?? 0 }),
                sectionsT('activityChip.sources', { count: obsData.source_breakdown?.length ?? 0 }),
            ],
        };
    }, [obsData, sectionsT]);

    return (
        <div className="flex flex-col gap-6 p-6 max-w-(--breakpoint-2xl) mx-auto w-full">
            <PageHeader
                title={t('home')}
                description={homeT('description')}
                actions={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isFetching}
                        className="h-8 font-semibold"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
                        {homeT('refresh')}
                    </Button>
                }
            />

            {/* Health Strip (if active group checks exist) */}
            <GroupHealthSummaryStrip />

            {/* Main Stats Summary Cards */}
            <DashboardSummaryCards />

            {/* Collapsible Section 1: Requests & Traces (Workbench) */}
            <SectionWrapper
                id="workbench"
                isOpen={openSections.includes('workbench')}
                title={sectionsT('workbench.title')}
                description={sectionsT('workbench.description')}
                chips={chips.workbench}
                onToggle={toggleSection}
            >
                <div className="w-full">
                    <ObservabilityPanel />
                </div>
            </SectionWrapper>

            {/* Collapsible Section 2: Trends & Rankings (Analytics) */}
            <SectionWrapper
                id="analytics"
                isOpen={openSections.includes('analytics')}
                title={sectionsT('analytics.title')}
                description={sectionsT('analytics.description')}
                chips={chips.analytics}
                onToggle={toggleSection}
            >
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-6 items-start">
                    <StatsChart className="w-full" />
                    <TopRankings className="w-full" />
                </div>
            </SectionWrapper>

            {/* Collapsible Section 3: Activity Heatmap (Activity) */}
            <SectionWrapper
                id="activity"
                isOpen={openSections.includes('activity')}
                title={sectionsT('activity.title')}
                description={sectionsT('activity.description')}
                chips={chips.activity}
                onToggle={toggleSection}
            >
                <ActivityHeatmap className="w-full" />
            </SectionWrapper>
        </div>
    );
}

interface SectionWrapperProps {
    id: HomeSectionId;
    isOpen: boolean;
    title: string;
    description: string;
    chips: string[];
    onToggle: (id: HomeSectionId) => void;
    children: React.ReactNode;
}

function SectionWrapper({
    id,
    isOpen,
    title,
    description,
    chips,
    onToggle,
    children,
}: SectionWrapperProps) {
    return (
        <article className="border border-border bg-card/30 rounded-xl overflow-hidden shadow-2xs">
            <header
                onClick={() => onToggle(id)}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors select-none"
            >
                <div className="min-w-0 flex items-start gap-3">
                    <div className="mt-0.5 text-muted-foreground">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-foreground">{title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                </div>

                {/* Header Metadata Chips */}
                <div className="flex flex-wrap gap-1.5 items-center pl-7 sm:pl-0">
                    {chips.map((chip, idx) => (
                        <Badge
                            key={idx}
                            variant="secondary"
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted/65 dark:bg-muted/20"
                        >
                            {chip}
                        </Badge>
                    ))}
                </div>
            </header>

            {isOpen && (
                <div className="p-5 border-t border-border bg-background/10 space-y-6">
                    {children}
                </div>
            )}
        </article>
    );
}
