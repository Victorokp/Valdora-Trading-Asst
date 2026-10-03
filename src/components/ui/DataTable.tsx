import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  /** Render the cell content for a row (already formatted by the caller). */
  render: (row: Row) => ReactNode;
  /** Visual alignment hint for data columns. */
  align?: "left" | "right";
  className?: string;
}

/**
 * Generic presentational table. Callers pass fully formatted values;
 * the table never computes or fabricates data. Empty/error states are
 * handled by wrapping components, but a simple empty message is supported.
 */
export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  emptyMessage = "No records yet.",
  caption,
  className,
}: {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  emptyMessage?: string;
  caption?: string;
  className?: string;
}) {
  return (
    <div className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <table className="w-full min-w-[480px] border-collapse text-sm">
        {caption ? (
          <caption className="sr-only">{caption}</caption>
        ) : null}
        <thead>
          <tr className="border-b border-line">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted",
                  col.align === "right" ? "text-right" : "text-left",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-sm text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)} className="border-b border-line/60 last:border-0">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "py-2.5 pr-4 last:pr-0",
                      col.align === "right" ? "numeric text-right" : "text-left",
                      col.className,
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
