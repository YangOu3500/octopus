'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings2, Key, RefreshCw, Network, Route, Activity, Database } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// Import our modular settings tabs
import { SettingGeneral } from './tab-general';
import { SettingAPIKey } from './tab-access';
import { SettingSiteSyncAll } from './tab-sync';
import { SettingModels } from './tab-models';
import { SettingRouting } from './tab-routing';
import { SettingHealth } from './tab-health';
import { SettingLogsMaintenance } from './tab-maintenance';

type TabKey = 'basic' | 'access' | 'sync' | 'models' | 'routing' | 'health' | 'maintenance';

export function Setting() {
    const t = useTranslations('navbar');
    const s = useTranslations('stubs');
    const settingT = useTranslations('setting');
    const [activeTab, setActiveTab] = useState<TabKey>('basic');

    const tabs = [
        { key: 'basic' as const, label: settingT('system'), icon: Settings2 },
        { key: 'access' as const, label: settingT('apiKey.title'), icon: Key },
        { key: 'sync' as const, label: '站点与同步', icon: RefreshCw },
        { key: 'models' as const, label: '模型与分组', icon: Network },
        { key: 'routing' as const, label: '路由与容错', icon: Route },
        { key: 'health' as const, label: '健康与探测', icon: Activity },
        { key: 'maintenance' as const, label: '日志与维护', icon: Database },
    ];

    return (
        <div className="flex flex-col gap-4 p-6 max-w-5xl mx-auto h-full min-h-0 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-1 px-1">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('setting')}</h1>
                <p className="text-xs text-muted-foreground">{s('description.setting')}</p>
            </div>

            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as TabKey)} className="w-full space-y-6">
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md -mx-6 px-6 py-2 border-b border-border/50">
                    <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 justify-start">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <TabsTrigger
                                    key={tab.key}
                                    value={tab.key}
                                    className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none border border-transparent data-[state=active]:border-border/30"
                                >
                                    <Icon className="size-3.5" />
                                    {tab.label}
                                </TabsTrigger>
                            );
                        })}
                    </TabsList>
                </div>

                <div className="mt-4 outline-hidden focus-visible:outline-hidden">
                    <TabsContent value="basic" className="outline-hidden mt-0">
                        <SettingGeneral />
                    </TabsContent>
                    <TabsContent value="access" className="outline-hidden mt-0">
                        <SettingAPIKey />
                    </TabsContent>
                    <TabsContent value="sync" className="outline-hidden mt-0">
                        <SettingSiteSyncAll />
                    </TabsContent>
                    <TabsContent value="models" className="outline-hidden mt-0">
                        <SettingModels />
                    </TabsContent>
                    <TabsContent value="routing" className="outline-hidden mt-0">
                        <SettingRouting />
                    </TabsContent>
                    <TabsContent value="health" className="outline-hidden mt-0">
                        <SettingHealth />
                    </TabsContent>
                    <TabsContent value="maintenance" className="outline-hidden mt-0">
                        <SettingLogsMaintenance />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
export default Setting;
