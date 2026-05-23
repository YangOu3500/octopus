'use client';

import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArchiveRestore, Bot, Settings2, ShieldCheck, Database, Key, Network, Palette, Info, type LucideIcon } from 'lucide-react';
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

type TabKey = 'general' | 'brand' | 'routing' | 'models' | 'storage' | 'backup';

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
    const [activeTab, setActiveTab] = useState<TabKey>('general');

    const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
        { key: 'general', label: '常规', icon: Settings2 },
        { key: 'brand', label: '品牌', icon: Palette },
        { key: 'routing', label: '调度与重试', icon: Network },
        { key: 'models', label: '模型与密钥', icon: Key },
        { key: 'storage', label: '存储与日志', icon: Database },
        { key: 'backup', label: '备份恢复', icon: ArchiveRestore },
    ];

    return (
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
            <PageWrapper childLayout={false} className="pb-24 md:pb-8 max-w-5xl mx-auto space-y-6">
                
                {/* Horizontal Tabs Header */}
                <div className="flex flex-wrap items-center gap-2 p-1 rounded-2xl bg-muted/50 border border-border/50 shadow-sm backdrop-blur-xl w-fit">
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
                        {activeTab === 'general' && (
                            <SettingGroup key="general">
                                <SettingSystem />
                                <SettingAppearance />
                                <SettingAccount />
                            </SettingGroup>
                        )}
                        {activeTab === 'brand' && (
                            <SettingGroup key="brand">
                                <SettingInfo />
                            </SettingGroup>
                        )}
                        {activeTab === 'routing' && (
                            <SettingGroup key="routing">
                                <SettingSiteAutomation />
                                <SettingHealthProbe />
                                <SettingCircuitBreaker />
                                <SettingModelAssociation />
                                <SettingFusionCapabilities />
                            </SettingGroup>
                        )}
                        {activeTab === 'models' && (
                            <SettingGroup key="models">
                                <SettingAPIKey />
                                <SettingLLMPrice />
                                <SettingLLMSync />
                            </SettingGroup>
                        )}
                        {activeTab === 'storage' && (
                            <SettingGroup key="storage">
                                <SettingLog />
                            </SettingGroup>
                        )}
                        {activeTab === 'backup' && (
                            <SettingGroup key="backup">
                                <SettingBackup />
                            </SettingGroup>
                        )}
                    </AnimatePresence>
                </div>

            </PageWrapper>
        </div>
    );
}
