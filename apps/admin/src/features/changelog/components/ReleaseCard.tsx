import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { ENV } from "@/config/env";
import type { ChangelogKind, ChangelogRelease } from "../data/changelog.data";

/** How loudly each kind of change announces itself. */
const KIND_VARIANT: Record<ChangelogKind, "default" | "secondary" | "outline" | "destructive"> = {
  new: "default",
  improved: "secondary",
  fixed: "outline",
  removed: "destructive",
};

function formatDate(value: string, locale: string): string {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

interface Props {
  release: ChangelogRelease;
  /** "features" for the admin's view, "technical" for the developer's. */
  view: "features" | "technical";
}

export function ReleaseCard({ release, view }: Props) {
  const { t, i18n } = useTranslation("changelog");
  const isRunning = ENV.APP_VERSION !== "" && ENV.APP_VERSION === release.version;

  return (
    <Box className="rounded-2xl border border-border bg-card p-6">
      <Box className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="font-plex text-sm">
          {release.version}
        </Badge>

        <Text as="span" variant="small" className="text-muted-foreground">
          {formatDate(release.releasedAt, i18n.language)}
        </Text>

        {isRunning && (
          // The one piece of context the reader always needs: am I reading
          // history, or am I reading about the build in front of me?
          <Badge variant="secondary">{t("running")}</Badge>
        )}
      </Box>

      {view === "features" ? (
        release.changes.length > 0 ? (
          <Box className="mt-4 flex flex-col gap-3">
            {release.changes.map((change, index) => (
              <Box key={index} className="flex items-start gap-3">
                <Badge variant={KIND_VARIANT[change.kind]} className="mt-0.5 shrink-0">
                  {t(`kind.${change.kind}`)}
                </Badge>
                <Text as="span" className="text-sm leading-relaxed">
                  {change.text}
                </Text>
              </Box>
            ))}
          </Box>
        ) : (
          // Said plainly rather than padded with invented features: some
          // releases genuinely change nothing an admin can see.
          <Text as="span" variant="muted" className="mt-4 block text-sm">
            {t("noUserChanges")}
          </Text>
        )
      ) : release.technical.length > 0 ? (
        // A ruled list rather than bullets: the technical view is read
        // line-by-line, and a rule keeps each entry visually attached to its own
        // text when one of them wraps.
        <Box className="mt-4 flex flex-col gap-2 border-l border-border pl-4">
          {release.technical.map((line, index) => (
            <Text as="span" key={index} variant="muted">
              {line}
            </Text>
          ))}
        </Box>
      ) : (
        <Text as="span" variant="muted" className="mt-4 block text-sm">
          {t("noTechnicalChanges")}
        </Text>
      )}
    </Box>
  );
}
