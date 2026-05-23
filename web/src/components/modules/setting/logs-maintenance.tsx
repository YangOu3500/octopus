'use client';

import { SettingLog } from './Log';
import { SettingBackup } from './Backup';
import { SettingInfo } from './Info';
import { SettingFusionCapabilities } from './FusionCapabilities';

export function SettingLogsMaintenance() {
    return (
        <div className="flex flex-col gap-6">
            <SettingLog />
            <SettingBackup />
            <SettingInfo />
            
            {/* Fusion capabilities default folded or at the bottom */}
            <div className="mt-8 border-t border-border/50 pt-8 opacity-80 hover:opacity-100 transition-opacity">
                <div className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">高级能力核对 (Advanced)</div>
                <SettingFusionCapabilities />
            </div>
        </div>
    );
}
