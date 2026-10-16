import type { ReactNode } from "react";

import { Image } from "@/components/common/Image";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  /** What is missing and what will fill it — the line that makes this more than "No data". */
  description?: string;
  /** Next step for the admin, when there is one. Omitted, nothing renders. */
  action?: ReactNode;
  /** Defaults to the generic one in `public/illustrations`. */
  illustration?: string;
  className?: string;
}

/**
 * The one empty state: picture, what is missing, why, and a way forward.
 *
 * The illustration is decorative (`alt=""`) because the title already says what
 * it means, and it is drawn in mid-grey with transparency so it holds up on
 * both themes.
 */
export function EmptyState({
  title,
  description,
  action,
  illustration = "/illustrations/empty.svg",
  className,
}: EmptyStateProps) {
  return (
    <Empty className={cn("border border-border", className)}>
      <EmptyHeader>
        <EmptyMedia>
          <Image
            src={illustration}
            alt=""
            width={160}
            height={120}
            objectFit="contain"
          />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
