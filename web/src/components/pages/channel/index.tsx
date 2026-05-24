'use client';

export function Channel() {
    return (
        <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
                <p className="text-sm text-muted-foreground">Configure upstream channels and providers.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs">
                <p className="text-sm text-muted-foreground">Channel management will be implemented in Phase 3.</p>
            </div>
        </div>
    );
}
