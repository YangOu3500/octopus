'use client';

import { SettingSystem } from './tab-general-system';
import { SettingAppearance } from './tab-general-appearance';
import { SettingAccount } from './tab-general-account';

export function SettingGeneral() {
    return (
        <div className="flex flex-col gap-6">
            <SettingSystem />
            <SettingAppearance />
            <SettingAccount />
        </div>
    );
}
