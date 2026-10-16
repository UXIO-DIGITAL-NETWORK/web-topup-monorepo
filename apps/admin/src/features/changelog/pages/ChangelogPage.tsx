import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Box } from "@/components/common/Box";
import { Heading } from "@/components/common/Heading";
import { Text } from "@/components/common/Text";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ENV } from "@/config/env";
import { useChangelogSeen } from "@/hooks/useChangelogSeen";
import { CHANGELOG } from "../data/changelog.data";
import { ReleaseCard } from "../components/ReleaseCard";

/**
 * What changed, release by release — two views of the same list.
 *
 * "Fitur" is what an admin or operator needs: what they can now see or do, in
 * their language. "Teknis" is for whoever maintains the site: modules touched
 * and why. Both come from one file (`data/changelog.data.ts`) so the two can
 * never tell a different story about the same release.
 *
 * Only stable releases appear. The running build is marked when it is in the
 * list; on a release candidate it will not be, and the page says so rather than
 * leaving the reader to wonder.
 */
export default function ChangelogPage() {
  const { t } = useTranslation("changelog");
  const { markSeen } = useChangelogSeen();

  // Opening the page is what "read" means. Nothing else marks it, so the dot in
  // the menu cannot outlive the visit that explains it.
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  const runningIsListed = CHANGELOG.some((release) => release.version === ENV.APP_VERSION);

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading level={1} variant="section">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("subtitle")}</Text>
      </Box>

      {ENV.APP_VERSION !== "" && !runningIsListed && (
        // Not an error: staging runs release candidates on purpose, and those
        // are deliberately absent. Saying it beats an unexplained gap.
        <Text variant="muted" className="px-1">
          {t("runningUnlisted", { version: ENV.APP_VERSION })}
        </Text>
      )}

      <Tabs defaultValue="features">
        <TabsList variant="line">
          <TabsTrigger value="features">{t("tabFeatures")}</TabsTrigger>
          <TabsTrigger value="technical">{t("tabTechnical")}</TabsTrigger>
        </TabsList>

        <TabsContent value="features" className="mt-4 flex flex-col gap-4">
          {CHANGELOG.map((release) => (
            <ReleaseCard key={release.version} release={release} view="features" />
          ))}
        </TabsContent>

        <TabsContent value="technical" className="mt-4 flex flex-col gap-4">
          {CHANGELOG.map((release) => (
            <ReleaseCard key={release.version} release={release} view="technical" />
          ))}
        </TabsContent>
      </Tabs>
    </Box>
  );
}
