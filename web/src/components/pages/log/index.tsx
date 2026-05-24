'use client';

export function Log() {
    return (
        <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
                <p className="text-sm text-muted-foreground">Historical request logs and auditing records.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs">
                <p className="text-sm text-muted-foreground">Logs dashboard will be implemented in Phase 6.</p>
            </div>
        </div>
    );
}
