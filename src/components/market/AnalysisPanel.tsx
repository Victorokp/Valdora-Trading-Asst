import type { ReactNode } from "react";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";

/**
 * Analysis panel shell: a titled surface for structured analysis output.
 * Content blocks are caller-supplied; the panel itself never derives data.
 */
export function AnalysisPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} actions={actions} />
      {children ? <CardBody>{children}</CardBody> : null}
    </Card>
  );
}
