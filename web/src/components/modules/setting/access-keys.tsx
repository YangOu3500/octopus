'use client';

import { SettingAPIKey } from './APIKey';

export function SettingAccessKeys() {
    return (
        <div className="flex flex-col gap-6">
            <SettingAPIKey />
            {/* Future access policy components can be added here */}
        </div>
    );
}
