'use client';

export function Traces() {
    return (
        <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Traces</h1>
                <p className="text-sm text-muted-foreground">Trace details of relay calls.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs">
                <p className="text-sm text-muted-foreground">Relay trace logging will be implemented in Phase 6.</p>
            </div>
        </div>
    );
}
