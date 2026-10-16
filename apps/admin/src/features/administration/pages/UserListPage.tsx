import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Box } from "@/components/common/Box";
import { DataTable } from "@/components/common/DataTable";
import { Heading } from "@/components/common/Heading";
import { Link } from "@/components/common/Link";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/utils/currency";
import { UserRowActions } from "../components/UserRowActions";
import { useUserList } from "../hooks/useAdministration";
import type { AdminUser } from "../types/administration.type";

const DEFAULT_PAGE_SIZE = 10;

/**
 * The client's own people. Staff and system accounts (payment-admin,
 * payment-internal, the Hub system user) also live in `users`, and this list is
 * not their home.
 */
const LISTED_ROLES = ["admin", "member"];

export function UserListPage() {
  const { t } = useTranslation("administration");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Admin + member only: their whole user base, searched and paged server-side.
  const params = useMemo(
    () => ({ search: search || undefined, page, per_page: pageSize, roles: LISTED_ROLES }),
    [search, page, pageSize],
  );
  const { data, isLoading, isError, refetch } = useUserList(params);

  const columns = useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("colUser"),
        cell: ({ row }) => (
          <Box className="flex flex-col">
            <Link
              href={`/admin/users/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.name}
            </Link>
            <Text
              variant="muted"
              as="span"
            >
              {row.original.email}
            </Text>
          </Box>
        ),
      },
      { accessorKey: "phone", header: t("colPhone"), cell: ({ row }) => <Text as="span">{row.original.phone}</Text> },
      {
        id: "role",
        header: t("colRole"),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className="capitalize"
          >
            {row.original.role ?? "—"}
          </Badge>
        ),
      },
      {
        id: "balance",
        header: t("colBalance"),
        cell: ({ row }) => (
          <Text
            as="span"
            className="tabular-nums"
          >
            {formatCurrency(row.original.balance, { fractionDigits: 0 })}
          </Text>
        ),
      },
      {
        id: "point",
        header: t("colPoints"),
        cell: ({ row }) => (
          <Text
            as="span"
            className="tabular-nums"
          >
            {row.original.point}
          </Text>
        ),
      },
      {
        id: "verified",
        header: t("colVerified"),
        cell: ({ row }) => (
          <Text
            as="span"
            variant={row.original.email_verified_at ? "default" : "muted"}
          >
            {row.original.email_verified_at ? "Yes" : "No"}
          </Text>
        ),
      },
      {
        id: "status",
        header: t("colStatus"),
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === "active" ? "outline" : "destructive"}
            className="capitalize"
          >
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("colAction"),
        cell: ({ row }) => <UserRowActions user={row.original} />,
      },
    ],
    [t],
  );

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading
          level={1}
          variant="section"
        >
          {t("usersTitle")}
        </Heading>
        <Text variant="muted">{t("usersSubtitle")}</Text>
      </Box>

      <Box className="rounded-2xl border border-border bg-card p-4">
        <Box className="flex flex-col gap-1.5">
          <Label htmlFor="user-search">{t("search")}</Label>
          <Input
            id="user-search"
            className="w-64 rounded-xl"
            placeholder={t("searchUsers")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </Box>
      </Box>

      <Box className="rounded-2xl border border-border bg-card p-4">
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          entityLabel={t("userEntity")}
          emptyMessage={t("noUsers")}
          showRowNumber
          enableSelection={false}
          page={page}
          pageSize={pageSize}
          total={data?.meta.total ?? 0}
          lastPage={data?.meta.last_page ?? 1}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Box>
    </Box>
  );
}

export default UserListPage;
