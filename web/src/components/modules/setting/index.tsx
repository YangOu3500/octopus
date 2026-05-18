'use client';

import { useTranslations } from 'next-intl';
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

export function Setting() {
    const t = useTranslations('setting');
    const quickLinks = [
        { id: 'setting-system', label: t('system') },
        { id: 'setting-health-probe', label: t('healthProbe.title') },
        { id: 'setting-api-key', label: t('apiKey.title') },
        { id: 'setting-site-automation', label: t('siteAutomation.title') },
        { id: 'setting-fusion-capabilities', label: t('fusionCapabilities.title') },
        { id: 'setting-backup', label: t('backup.title') },
        { id: 'setting-info', label: t('info.title') },
    ];

    return (
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain rounded-t-3xl">
            <div className="sticky top-0 z-10 mb-3 border-b border-border/70 bg-background/90 pb-3 pt-1 backdrop-blur">
                <div className="flex flex-wrap gap-2">
                    {quickLinks.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className="h-8 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
                            onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>
            <PageWrapper
                childLayout={false}
                className="grid grid-cols-1 gap-3 pb-24 md:pb-4 xl:grid-cols-2"
            >
                <div id="setting-system" key="setting-system" className="xl:col-span-2 scroll-mt-24">
                    <SettingSystem />
                </div>
                <div id="setting-health-probe" key="setting-health-probe" className="xl:col-span-2 scroll-mt-24">
                    <SettingHealthProbe />
                </div>
                <SettingCircuitBreaker key="setting-circuit-breaker" />
                <SettingLog key="setting-log" />
                <div id="setting-site-automation" key="setting-site-automation" className="xl:col-span-2 scroll-mt-24">
                    <SettingSiteAutomation />
                </div>
                <div id="setting-api-key" key="setting-apikey" className="scroll-mt-24">
                    <SettingAPIKey />
                </div>
                <SettingLLMPrice key="setting-llmprice" />
                <SettingLLMSync key="setting-llmsync" />
                <div id="setting-fusion-capabilities" key="setting-fusion-capabilities" className="xl:col-span-2 scroll-mt-24">
                    <SettingFusionCapabilities />
                </div>
                <div id="setting-backup" key="setting-backup" className="xl:col-span-2 scroll-mt-24">
                    <SettingBackup />
                </div>
                <SettingAppearance key="setting-appearance" />
                <SettingAccount key="setting-account" />
                <div id="setting-info" key="setting-info" className="xl:col-span-2 scroll-mt-24">
                    <SettingInfo />
                </div>
            </PageWrapper>
        </div>
    );
}
