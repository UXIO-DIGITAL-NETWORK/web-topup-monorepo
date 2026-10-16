import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Ban, Eye, MoreVertical, RotateCcw, Trash2, UserX, Wallet } from "lucide-react";

import { Can } from "@/components/common/Can";
import { DeleteConfirmDialog } from "@/components/common/DeleteConfirmDialog";
import { Link } from "@/components/common/Link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdjustBalance, useDeleteUsers, useSetUserStatus } from "../hooks/useAdministration";
import type { AdminUser, UserStatus } from "../types/administration.type";
import { AdjustBalanceDialog } from "./AdjustBalanceDialog";

/** A pending suspend/ban awaiting confirmation. */
type PendingStatus = Extract<UserStatus, "suspended" | "banned">;

export function UserRowActions({ user }: { user: AdminUser }) {
  const { t } = useTranslation("administration");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<PendingStatus | null>(null);

  const adjustBalance = useAdjustBalance();
  const setStatus = useSetUserStatus();
  const deleteUsers = useDeleteUsers();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="rounded-xl"
            size="icon-sm"
            aria-label={`Actions for ${user.name}`}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="rounded-2xl"
        >
          {/* The whole account. The row's name links here too, but the menu is
              where an operator's hand already is. */}
          <DropdownMenuItem asChild>
            <Link href={`/admin/users/${user.id}`}>
              <Eye />
              {t("detail")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <Can permission="users.adjust-balance">
            <DropdownMenuItem onSelect={() => setAdjustOpen(true)}>
              <Wallet />
              {t("adjustBalance")}
            </DropdownMenuItem>
          </Can>
          <Can permission="users.suspend">
            {user.status === "active" ? (
              <>
                <DropdownMenuItem onSelect={() => setPendingStatus("suspended")}>
                  <UserX />
                  {t("suspend")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setPendingStatus("banned")}
                >
                  <Ban />
                  {t("ban")}
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={() => setStatus.mutate({ id: user.id, status: "active" })}>
                <RotateCcw />
                {t("reactivate")}
              </DropdownMenuItem>
            )}
          </Can>
          <Can permission="users.delete">
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2 />
              {t("delete")}
            </DropdownMenuItem>
          </Can>
        </DropdownMenuContent>
      </DropdownMenu>

      <AdjustBalanceDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        userName={user.name}
        isPending={adjustBalance.isPending}
        onConfirm={(input) => adjustBalance.mutate({ id: user.id, input })}
      />

      <DeleteConfirmDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => !open && setPendingStatus(null)}
        title={pendingStatus === "banned" ? `Ban ${user.name}?` : `Suspend ${user.name}?`}
        description={
          pendingStatus === "banned"
            ? "This blocks the account from signing in or transacting. You can reactivate it later."
            : "This temporarily blocks the account from transacting. You can reactivate it anytime."
        }
        confirmLabel={pendingStatus === "banned" ? "Ban" : "Suspend"}
        icon={pendingStatus === "banned" ? <Ban className="size-5" /> : <UserX className="size-5" />}
        onConfirm={() => pendingStatus && setStatus.mutate({ id: user.id, status: pendingStatus })}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${user.name}?`}
        description={t("deleteUserDescription")}
        onConfirm={() => deleteUsers.mutate([user.id])}
      />
    </>
  );
}
