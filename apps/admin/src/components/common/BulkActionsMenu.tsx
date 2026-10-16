import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface BulkAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

interface BulkActionsMenuProps {
  /** Number of selected rows; the chip hides itself when zero. */
  count: number;
  actions: BulkAction[];
}

/**
 * The "N items selected" chip that opens the bulk-action dropdown (the
 * reference's selection menu). Shared so the Main Products and Product Provider
 * tabs present the same affordance; each passes its own action set.
 */
export function BulkActionsMenu({ count, actions }: BulkActionsMenuProps) {
  if (count === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
        >
          <MoreVertical className="size-4" />
          {count} items selected
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="rounded-2xl"
      >
        <DropdownMenuLabel>{count} Items Selected</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            variant={action.destructive ? "destructive" : "default"}
            onSelect={action.onSelect}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
