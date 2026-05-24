'use client';

import { SettingCircuitBreaker } from './CircuitBreaker';

export function SettingRoutingFault() {
    return (
        <div className="flex flex-col gap-6">
            <SettingCircuitBreaker />
            {/* Future failover and stream gate config */}
        </div>
    );
}
