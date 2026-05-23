'use client';

import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
import { cn } from '@/lib/utils';

type TabKey = 'core' | 'routing' | 'data';

function SettingGroup({ children }: { children: ReactNode }) {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-6"
        >
            {children}
        </motion.div>
    );
}

export function Setting() {
    const [activeTab, setActiveTab] = useState<TabKey>('core');

    const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
        { key: 'core', label: '核心配置', icon: Settings2 },
        { key: 'routing', label: '调度运行', icon: Bot },
        { key: 'data', label: '数据维护', icon: ArchiveRestore },
    ];

    return (
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
            <PageWrapper childLayout={false} className="pb-24 md:pb-8 max-w-5xl mx-auto space-y-6">
                
                {/* Horizontal Tabs Header */}
                <div className="flex items-center gap-2 p-1 rounded-2xl bg-muted/50 border border-border/50 shadow-sm backdrop-blur-xl w-fit">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    "relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300",
                                    isActive ? "text-primary shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                                )}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="setting-tab-indicator"
                                        className="absolute inset-0 bg-background rounded-xl shadow-sm border border-border/50"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-2">
                                    <tab.icon className={cn("size-4", isActive ? "text-primary" : "opacity-70")} />
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                <div className="pt-2">
                    <AnimatePresence mode="wait">
                        {activeTab === 'core' && (
                            <SettingGroup key="core">
                                <SettingSystem />
                                <SettingAppearance />
                                <SettingAccount />
                            </SettingGroup>
                        )}
                        {activeTab === 'routing' && (
                            <SettingGroup key="routing">
                                <SettingSiteAutomation />
                                <SettingHealthProbe />
                                <SettingCircuitBreaker />
                                <SettingModelAssociation />
                                <SettingFusionCapabilities />
                                <SettingAPIKey />
                                <SettingLLMPrice />
                                <SettingLLMSync />
                            </SettingGroup>
                        )}
                        {activeTab === 'data' && (
                            <SettingGroup key="data">
                                <SettingLog />
                                <SettingBackup />
                                <SettingInfo />
                            </SettingGroup>
                        )}
                    </AnimatePresence>
                </div>

            </PageWrapper>
        </div>
    );
}
