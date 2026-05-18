'use client';

import { Activity } from './activity';
import { StatsChart } from './chart';
import { DashboardSummaryCards } from './dashboard-summary';
import { GatewayOperationsPanel } from './gateway-operations';
import { GroupHealthSummaryStrip } from './group-health-summary-strip';
import { ObservabilityPanel } from './observability';
import { Rank } from './rank';
import { PageWrapper } from '@/components/common/PageWrapper';

export function Home() {
    return (
        <PageWrapper className="h-full min-h-0 overflow-y-auto overscroll-contain space-y-3 pb-24 md:pb-4">
            <DashboardSummaryCards />
            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
                <ObservabilityPanel />
                <div className="space-y-3">
                    <GatewayOperationsPanel />
                    <GroupHealthSummaryStrip />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                <StatsChart />
                <Rank />
            </div>
            <Activity />
        </PageWrapper>
    );
}
