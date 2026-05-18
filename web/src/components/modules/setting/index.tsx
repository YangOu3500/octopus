'use client';

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
    return (
        <div className="h-full min-h-0 overflow-y-auto overscroll-contain rounded-t-3xl">
            <PageWrapper
                childLayout={false}
                className="grid grid-cols-1 gap-4 pb-24 md:pb-4 xl:grid-cols-2"
            >
                <SettingInfo key="setting-info" />
                <SettingAppearance key="setting-appearance" />
                <SettingAccount key="setting-account" />
                <div key="setting-system" className="xl:col-span-2">
                    <SettingSystem />
                </div>
                <SettingLog key="setting-log" />
                <SettingLLMPrice key="setting-llmprice" />
                <SettingAPIKey key="setting-apikey" />
                <SettingLLMSync key="setting-llmsync" />
                <div key="setting-site-automation" className="xl:col-span-2">
                    <SettingSiteAutomation />
                </div>
                <SettingCircuitBreaker key="setting-circuit-breaker" />
                <div key="setting-health-probe" className="xl:col-span-2">
                    <SettingHealthProbe />
                </div>
                <div key="setting-fusion-capabilities" className="xl:col-span-2">
                    <SettingFusionCapabilities />
                </div>
                <div key="setting-backup" className="xl:col-span-2">
                    <SettingBackup />
                </div>
            </PageWrapper>
        </div>
    );
}
