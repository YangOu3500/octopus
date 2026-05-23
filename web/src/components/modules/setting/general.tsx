'use client';

import { SettingSystem } from './System';
import { SettingAppearance } from './Appearance';
import { SettingAccount } from './Account';

export function SettingGeneral() {
    return (
        <div className="flex flex-col gap-6">
            <SettingSystem />
            <SettingAppearance />
            <SettingAccount />
        </div>
    );
}
