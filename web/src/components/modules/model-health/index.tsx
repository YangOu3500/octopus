'use client';

import { ChannelModelHealthPanel } from '@/components/modules/channel/ModelHealthPanel';

export function ModelHealth() {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <ChannelModelHealthPanel />
        </div>
    );
}
