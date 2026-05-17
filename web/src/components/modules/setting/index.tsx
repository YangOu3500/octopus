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
                className="grid grid-cols-1 gap-4 pb-24 md:pb-4 2xl:grid-cols-2"
            >
                <SettingInfo key="setting-info" />
                <div key="setting-fusion-capabilities" className="2xl:col-span-2">
                    <SettingFusionCapabilities />
                </div>
                <SettingAppearance key="setting-appearance" />
                <SettingAccount key="setting-account" />
                <SettingSystem key="setting-system" />
                <SettingLog key="setting-log" />
                <SettingLLMPrice key="setting-llmprice" />
                <SettingAPIKey key="setting-apikey" />
                <SettingLLMSync key="setting-llmsync" />
                <SettingSiteAutomation key="setting-site-automation" />
                <SettingCircuitBreaker key="setting-circuit-breaker" />
                <div key="setting-health-probe" className="2xl:col-span-2">
                    <SettingHealthProbe />
                </div>
                <SettingBackup key="setting-backup" />
            </PageWrapper>
        </div>
    );
}
