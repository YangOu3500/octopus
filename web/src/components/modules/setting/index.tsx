'use client';

import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArchiveRestore, Bot, Settings2, ShieldCheck, Database, Key, Network, Palette, Info, RefreshCw, Route, Activity, type LucideIcon } from 'lucide-react';
import { PageWrapper } from '@/components/common/PageWrapper';
import { SettingGeneral } from './general';
import { SettingAccessKeys } from './access-keys';
import { SettingSiteSync } from './site-sync';
import { SettingModelGrouping } from './model-grouping';
import { SettingRoutingFault } from './routing-fault';
import { SettingHealthProbing } from './health-probing';
import { SettingLogsMaintenance } from './logs-maintenance';
import { cn } from '@/lib/utils';

type TabKey = 'basic' | 'access' | 'sync' | 'models' | 'routing' | 'health' | 'maintenance';

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
    const [activeTab, setActiveTab] = useState<TabKey>('basic');

    const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
        { key: 'basic', label: '基础设置', icon: Settings2 },
        { key: 'access', label: '访问与密钥', icon: Key },
        { key: 'sync', label: '站点与同步', icon: RefreshCw },
        { key: 'models', label: '模型与分组', icon: Network },
        { key: 'routing', label: '路由与容错', icon: Route },
        { key: 'health', label: '健康与探测', icon: Activity },
        { key: 'maintenance', label: '日志与维护', icon: Database },
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
                        {activeTab === 'basic' && (
                            <SettingGroup key="basic">
                                <SettingGeneral />
                            </SettingGroup>
                        )}
                        {activeTab === 'access' && (
                            <SettingGroup key="access">
                                <SettingAccessKeys />
                            </SettingGroup>
                        )}
                        {activeTab === 'sync' && (
                            <SettingGroup key="sync">
                                <SettingSiteSync />
                            </SettingGroup>
                        )}
                        {activeTab === 'models' && (
                            <SettingGroup key="models">
                                <SettingModelGrouping />
                            </SettingGroup>
                        )}
                        {activeTab === 'routing' && (
                            <SettingGroup key="routing">
                                <SettingRoutingFault />
                            </SettingGroup>
                        )}
                        {activeTab === 'health' && (
                            <SettingGroup key="health">
                                <SettingHealthProbing />
                            </SettingGroup>
                        )}
                        {activeTab === 'maintenance' && (
                            <SettingGroup key="maintenance">
                                <SettingLogsMaintenance />
                            </SettingGroup>
                        )}
                    </AnimatePresence>
                </div>

            </PageWrapper>
        </div>
    );
}
