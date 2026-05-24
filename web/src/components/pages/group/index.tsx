'use client';

export function Group() {
    return (
        <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Model Groups</h1>
                <p className="text-sm text-muted-foreground">Manage your failover and routing model groups.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs">
                <p className="text-sm text-muted-foreground">Group management will be implemented in Phase 4.</p>
            </div>
        </div>
    );
}
