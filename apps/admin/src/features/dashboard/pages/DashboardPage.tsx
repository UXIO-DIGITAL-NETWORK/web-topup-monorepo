import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Box } from "@/components/common/Box";
import { Heading } from "@/components/common/Heading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/common/Text";
import { formatCurrency } from "@/utils/currency";
import { formatBannerDate } from "@/utils/date";
import { ActivityFeedCard } from "../components/ActivityFeedCard";
import { DataTable } from "../components/DataTable";
import { PendingOrdersCard } from "../components/PendingOrdersCard";
import { PerformanceChartCard } from "../components/PerformanceChartCard";
import { StatCard } from "@/components/common/StatCard";
import { useAuthStore } from "@/store/useAuthStore";
import { usePerformanceRows, useStatCards } from "../hooks/useDashboard";
import type { PerformanceRow, PerformanceTabKey } from "../types/dashboard.type";

const PERFORMANCE_TABS: { key: PerformanceTabKey; labelKey: string; entityLabel: string }[] = [
  { key: "category", labelKey: "categoryPerformance", entityLabel: "Category" },
  { key: "product", labelKey: "productPerformance", entityLabel: "Product" },
  { key: "user", labelKey: "userPerformance", entityLabel: "User" },
];

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function buildColumns(entityLabel: string, t: TFunction<"dashboard">): ColumnDef<PerformanceRow>[] {
  return [
    {
      accessorKey: "name",
      header: entityLabel,
      cell: ({ row }) => (
        <Box className="flex items-center gap-2 text-left">
          <Avatar size="sm">
            <AvatarFallback>{getInitials(row.original.name)}</AvatarFallback>
          </Avatar>
          <Box className="flex flex-col">
            <Text
              as="span"
              className="text-sm font-medium text-foreground"
            >
              {row.original.name}
            </Text>
            <Text variant="small">{row.original.subLabel}</Text>
          </Box>
        </Box>
      ),
    },
    {
      accessorKey: "totalTransaction",
      header: t("colTotalTransaction"),
      cell: ({ getValue }) => (
        <Text
          as="span"
          className="tabular-nums"
        >
          {getValue<number>()}
        </Text>
      ),
    },
    {
      accessorKey: "revenue",
      header: t("revenue"),
      cell: ({ getValue }) => (
        <Text
          as="span"
          className="tabular-nums"
        >
          {formatCurrency(getValue<number>(), { fractionDigits: 0 })}
        </Text>
      ),
    },
  ];
}

export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const user = useAuthStore((state) => state.user);
  const { data: statCards, isLoading: statCardsLoading } = useStatCards();
  const [activeTab, setActiveTab] = useState<PerformanceTabKey>("category");
  const activeTabMeta = PERFORMANCE_TABS.find((tab) => tab.key === activeTab)!;
  const {
    data: performanceRows,
    isLoading: performanceLoading,
    isError: performanceError,
    refetch: refetchPerformance,
  } = usePerformanceRows(activeTab);

  const columns = useMemo(() => buildColumns(activeTabMeta.entityLabel, t), [activeTabMeta.entityLabel, t]);

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading
          level={1}
          variant="section"
        >
          {`Welcome, ${user?.name ?? "Admin"}!`}
        </Heading>
        <Text variant="muted">{formatBannerDate(new Date())}</Text>
      </Box>

      <Box className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {statCardsLoading || !statCards
          ? Array.from({ length: 3 }).map((_, index) => (
              <Box
                key={index}
                className="h-32 animate-pulse rounded-2xl border border-border bg-card"
              />
            ))
          : statCards.map((card) => (
              <StatCard
                key={card.id}
                data={card}
                fractionDigits={2}
              />
            ))}
      </Box>

      <Box className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Box className="flex flex-col gap-6 lg:col-span-2">
          <PerformanceChartCard />

          <Box className="rounded-2xl border border-border bg-card p-4">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as PerformanceTabKey)}
            >
              <Box className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList className="h-auto gap-2 rounded-full border border-border bg-transparent p-1">
                  {PERFORMANCE_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.key}
                      value={tab.key}
                      className="h-auto flex-none rounded-full border-transparent px-4 py-2 data-[state=active]:border-transparent data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-foreground dark:data-[state=active]:text-background"
                    >
                      {t(tab.labelKey)}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Disabled, not removed: GetDashboardPerformanceAction has no
                    date filtering at all, so this control has never done
                    anything. Now that Reports ships real period filters next
                    door, leaving it operable would read as a bug. */}
                <Select
                  defaultValue="this-week"
                  disabled
                >
                  <SelectTrigger
                    size="sm"
                    className="w-[130px]"
                    title={t("periodUnavailable")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this-week">{t("thisWeek")}</SelectItem>
                  </SelectContent>
                </Select>
              </Box>

              <TabsContent value={activeTab}>
                <DataTable
                  columns={columns}
                  data={performanceRows ?? []}
                  isLoading={performanceLoading}
                  isError={performanceError}
                  onRetry={() => refetchPerformance()}
                />
              </TabsContent>
            </Tabs>
          </Box>
        </Box>

        <Box className="flex flex-col gap-6">
          <PendingOrdersCard />
          <ActivityFeedCard />
        </Box>
      </Box>
    </Box>
  );
}
