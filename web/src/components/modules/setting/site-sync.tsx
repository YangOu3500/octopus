'use client';

import { SettingSiteAutomation } from './SiteAutomation';
import { SettingLLMSync } from './LLMSync';
import { SettingLLMPrice } from './LLMPrice';

export function SettingSiteSync() {
    return (
        <div className="flex flex-col gap-6">
            <SettingSiteAutomation />
            <SettingLLMSync />
            <SettingLLMPrice />
        </div>
    );
}
