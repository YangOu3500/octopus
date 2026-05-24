'use client';

export function Analytics() {
    return (
        <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
                <p className="text-sm text-muted-foreground">General gateway stats and charts.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs">
                <p className="text-sm text-muted-foreground">Analytics dashboard will be implemented in Phase 7.</p>
            </div>
        </div>
    );
}
