'use client';

import { ChannelModelHealthPanel } from '@/components/modules/channel/ModelHealthPanel';
import { PageWrapper } from '@/components/common/PageWrapper';

export function ModelHealth() {
    return (
        <PageWrapper className="h-full min-h-0 overflow-y-auto overscroll-contain pb-24 md:pb-4" childLayout={false}>
            <ChannelModelHealthPanel />
        </PageWrapper>
    );
}
