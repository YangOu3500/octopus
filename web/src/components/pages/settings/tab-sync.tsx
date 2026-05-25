'use client';

import { SettingSiteSync } from './tab-sync-site';
import { SettingLLMSync } from './tab-sync-channel';

export function SettingSiteSyncAll() {
    return (
        <div className="flex flex-col gap-6">
            <SettingSiteSync />
            <SettingLLMSync />
        </div>
    );
}
