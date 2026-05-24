import { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ColumnDef<T> {
    header: string;
    accessorKey: keyof T;
    cell?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
    columns: ColumnDef<T>[];
    data: T[];
}

export function DataTable<T>({ columns, data }: DataTableProps<T>) {
    return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map((col, idx) => (
                            <TableHead key={idx} className="text-xs font-bold py-2 bg-muted/40">
                                {col.header}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="text-center py-8 text-xs text-muted-foreground">
                                No data available
                            </TableCell>
                        </TableRow>
                    ) : (
                        data.map((row, rowIdx) => (
                            <TableRow key={rowIdx}>
                                {columns.map((col, colIdx) => (
                                    <TableCell key={colIdx} className="text-xs py-2.5">
                                        {col.cell ? col.cell(row) : String(row[col.accessorKey] ?? '')}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
