'use client';

import { type ReactNode } from 'react';

import { ArchiveRestore, Bot, Settings2, type LucideIcon } from 'lucide-react';
import { PageWrapper } from '@/components/common/PageWrapper';
import { SettingAppearance } from './Appearance';
import { SettingSystem } from './System';
import { SettingAPIKey } from './APIKey';
import { SettingLLMPrice } from './LLMPrice';
import { SettingAccount } from './Account';
import { SettingInfo } from './Info';
import { SettingLLMSync } from './LLMSync';
import { SettingSiteAutomation } from './SiteAutomation';
import { SettingLog } from './Log';
import { SettingBackup } from './Backup';
import { SettingCircuitBreaker } from './CircuitBreaker';
import { SettingHealthProbe } from './HealthProbe';
import { SettingFusionCapabilities } from './FusionCapabilities';
import { SettingModelAssociation } from './ModelAssociation';

function SettingGroup({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-4 rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl p-5 md:p-6 shadow-sm transition-all hover:bg-card/50">
            <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
                    <Icon className="size-5" />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
            </div>
            <div className="flex flex-col gap-4 mt-2">
                {children}
            </div>
        </section>
    );
}

export function Setting() {
    return (
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
            <PageWrapper childLayout={false} className="pb-24 md:pb-8 max-w-5xl mx-auto space-y-8">
                <SettingGroup title="核心配置" icon={Settings2}>
                    <SettingSystem />
                    <SettingAppearance />
                    <SettingAccount />
                </SettingGroup>

                <SettingGroup title="调度运行" icon={Bot}>
                    <SettingSiteAutomation />
                    <SettingHealthProbe />
                    <SettingCircuitBreaker />
                    <SettingModelAssociation />
                    <SettingFusionCapabilities />
                    <SettingAPIKey />
                    <SettingLLMPrice />
                    <SettingLLMSync />
                </SettingGroup>

                <SettingGroup title="数据维护" icon={ArchiveRestore}>
                    <SettingLog />
                    <SettingBackup />
                    <SettingInfo />
                </SettingGroup>
            </PageWrapper>
        </div>
    );
}
