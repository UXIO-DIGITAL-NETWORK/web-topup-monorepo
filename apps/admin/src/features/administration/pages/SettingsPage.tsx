import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";

import { Box } from "@/components/common/Box";
import { FieldLabel, InfoTooltip } from "@/components/common/FieldLabel";
import { Heading } from "@/components/common/Heading";
import { Image } from "@/components/common/Image";
import { ImageDropzone } from "@/components/common/ImageDropzone";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { JsonNumberListField } from "../components/JsonNumberListField";
import { JsonNumberMapField } from "../components/JsonNumberMapField";
import { LicencePanel } from "../components/LicencePanel";
import { useSettings, useUpdateSettings, useUploadSetting } from "../hooks/useAdministration";
import { humanize } from "../lib/settingLabels";
import type { Setting } from "../types/administration.type";

/**
 * Groups that belong to something else — a licence the Hub rewrites every five
 * minutes, and a markup the Pricing Rules screen owns per plan.
 *
 * The API already leaves these out of the list. Repeating them here is
 * deliberate: the panel and the API deploy separately, and an admin running
 * against an API that still returned `licence` would render two tabs with the
 * same value, which Radix treats as an error rather than a cosmetic clash.
 */
const MANAGED_ELSEWHERE_GROUPS = ["licence", "pricing"];

/** The read-only licence tab. Not a settings group: it has no editable rows. */
const LICENCE_TAB = "licence";

type JsonShape = "list" | "map" | "raw";

/**
 * Which editor a JSON setting deserves, decided by the shape of its value
 * rather than by its key: a setting added later gets the right control for
 * free, and anything unrecognised keeps the plain textarea rather than being
 * mangled into rows it does not fit.
 */
function jsonShape(value: string): JsonShape {
  try {
    const parsed = JSON.parse(value || "null");

    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "number")) {
      return "list";
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length > 0 &&
      Object.values(parsed).every((entry) => typeof entry === "number")
    ) {
      return "map";
    }
  } catch {
    // Not JSON at all. The textarea is the honest editor for whatever it is.
  }

  return "raw";
}

/**
 * Settings are one grouped form with a single bulk save, not a table — every
 * value is edited together and written in one request.
 *
 * The groups are tabs rather than a stack of cards: a dozen sections in one
 * column is a page nobody can see the end of, and each group is edited on its
 * own anyway.
 */
export function SettingsPage() {
  const { t } = useTranslation("administration");
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const uploadSetting = useUploadSetting();

  // Only the keys the admin has actually touched. Everything else reads
  // through to the saved value, so the form needs no effect to seed itself and
  // a background refetch cannot clobber an in-progress edit.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const draft = useMemo<Record<string, string>>(
    () => ({
      ...Object.fromEntries((settings ?? []).map((setting) => [setting.key, setting.value ?? ""])),
      ...edits,
    }),
    [settings, edits],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, Setting[]>();
    for (const setting of settings ?? []) {
      groups.set(setting.group, [...(groups.get(setting.group) ?? []), setting]);
    }
    return [...groups.entries()];
  }, [settings]);

  const editableGroups = useMemo(
    () => grouped.filter(([group]) => !MANAGED_ELSEWHERE_GROUPS.includes(group)),
    [grouped],
  );

  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // A tab can vanish out from under the selection — a refetch after a save, or
  // an API that stopped serving a group. Falling back to the first tab beats a
  // Tabs whose value matches no trigger, which renders every panel blank.
  const tabValues = [...editableGroups.map(([group]) => group), LICENCE_TAB];
  const currentGroup = activeGroup && tabValues.includes(activeGroup) ? activeGroup : tabValues[0];

  // Labels and help are derived from the group and the setting key rather than
  // listed here, so a setting added to the API turns up with its own copy as
  // soon as the locale files carry a matching key. An unknown group degrades to
  // a readable name, and a missing help key resolves to "" — which is falsy, so
  // the field simply carries no info icon instead of an empty tooltip.
  const groupLabel = (group: string) => t(`group_${group}`, { defaultValue: humanize(group) });
  const groupHelp = (group: string) => t(`group_${group}_help`, { defaultValue: "" });
  const fieldHelp = (key: string) => t(`help_${key}`, { defaultValue: "" });

  const setValue = (key: string, value: string) => setEdits((previous) => ({ ...previous, [key]: value }));

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading
          level={1}
          variant="section"
        >{t("settingsTitle")}</Heading>
        <Text variant="muted">{t("settingsSubtitle")}</Text>
      </Box>

      {isLoading && (
        <Box className="rounded-2xl border border-border bg-card p-6">
          <Text variant="muted">{t("loadingSettings")}</Text>
        </Box>
      )}

      {!isLoading && (
        <Box className="rounded-2xl border border-border bg-card p-6">
          <Tabs
            value={currentGroup}
            onValueChange={setActiveGroup}
            className="gap-6"
          >
            <TabsList variant="line">
              {editableGroups.map(([group]) => (
                <TabsTrigger
                  key={group}
                  value={group}
                >
                  {groupLabel(group)}
                </TabsTrigger>
              ))}
              <TabsTrigger value={LICENCE_TAB}>{t("group_licence")}</TabsTrigger>
            </TabsList>

            {editableGroups.map(([group, rows]) => {
              // The section's own explanation. It lives here rather than beside
              // the tab label because a TabsTrigger is a <button>, and the info
              // icon is another one — nesting them is invalid, and the click
              // that opens the tooltip would switch tabs on the way.
              const help = groupHelp(group);

              return (
                <TabsContent
                  key={group}
                  value={group}
                  className="flex flex-col gap-4"
                >
                  <Box className="flex items-center gap-1.5">
                    <Heading
                      level={2}
                      variant="subtitle"
                    >
                      {groupLabel(group)}
                    </Heading>
                    {help ? <InfoTooltip content={help} /> : null}
                  </Box>

                  {rows.map((setting) => {
                    const value = draft[setting.key] ?? "";
                    const shape = setting.type === "json" ? jsonShape(value) : "raw";

                    return (
                      <Box
                        key={setting.key}
                        className="flex flex-col gap-1.5"
                      >
                        <Box className="flex items-center gap-2">
                          {/* An image setting is labelled by its own ImageDropzone —
                              labelling it here too would point two labels at one input. */}
                          {setting.type !== "image" && (
                            <FieldLabel
                              htmlFor={`setting-${setting.key}`}
                              tooltip={fieldHelp(setting.key)}
                              optional
                            >
                              {setting.label ?? setting.key}
                            </FieldLabel>
                          )}
                          {setting.is_public && (
                            <Badge
                              variant="outline"
                              className="text-success"
                            >{t("public")}</Badge>
                          )}
                        </Box>

                        {setting.type === "boolean" ? (
                          <Switch
                            id={`setting-${setting.key}`}
                            checked={value === "1" || value === "true"}
                            onCheckedChange={(checked) => setValue(setting.key, checked ? "1" : "0")}
                          />
                        ) : setting.type === "text" ? (
                          <Textarea
                            id={`setting-${setting.key}`}
                            rows={3}
                            className="rounded-xl"
                            value={value}
                            onChange={(event) => setValue(setting.key, event.target.value)}
                          />
                        ) : setting.type === "json" && shape === "list" ? (
                          <JsonNumberListField
                            id={`setting-${setting.key}`}
                            value={value}
                            onChange={(next) => setValue(setting.key, next)}
                          />
                        ) : setting.type === "json" && shape === "map" ? (
                          <JsonNumberMapField
                            id={`setting-${setting.key}`}
                            value={value}
                            onChange={(next) => setValue(setting.key, next)}
                          />
                        ) : setting.type === "json" ? (
                          // A JSON value in a shape neither editor understands.
                          // Showing it raw is worse than a purpose-built control
                          // and better than rewriting it into one it does not fit.
                          <Textarea
                            id={`setting-${setting.key}`}
                            rows={2}
                            className="rounded-xl"
                            value={value}
                            onChange={(event) => setValue(setting.key, event.target.value)}
                          />
                        ) : setting.type === "image" ? (
                          // Images have their own write path — the file is uploaded on
                          // pick, not folded into the bulk save below, which carries
                          // only `{key: value}` strings.
                          <Box
                            className="flex flex-col gap-3"
                            data-testid={`setting-upload-${setting.key}`}
                          >
                            {setting.value_url ? (
                              <Image
                                src={setting.value_url}
                                alt={setting.label ?? setting.key}
                                width={160}
                                height={80}
                                objectFit="contain"
                                className="rounded-xl border border-border bg-muted p-2"
                              />
                            ) : null}
                            <ImageDropzone
                              id={`setting-${setting.key}`}
                              label={setting.label ?? setting.key}
                              caption={setting.value ? "Replace the current file." : "No file uploaded yet."}
                              tooltip={fieldHelp(setting.key)}
                              // The endpoint also accepts SVG and ICO — a favicon and a
                              // vector logo must keep their format, and compressImage
                              // passes both through untouched.
                              //
                              // GIF is offered for the logo only, matching the API: an
                              // animated GIF reaches disk uncompressed (neither
                              // compressImage nor ImageOptimizer will re-encode one), so
                              // it gets the larger ceiling. No link-preview scraper
                              // animates an OG image and a GIF favicon is unpredictable,
                              // so the other keys stay as they were.
                              accept={
                                setting.key === "logo"
                                  ? "image/jpeg,image/jpg,image/png,image/webp,image/svg+xml,image/x-icon,image/gif"
                                  : "image/jpeg,image/jpg,image/png,image/webp,image/svg+xml,image/x-icon"
                              }
                              formatsLabel={
                                setting.key === "logo"
                                  ? "JPG, PNG, WEBP, SVG, ICO — max 2 MB · GIF (animated) — max 5 MB"
                                  : "JPG, PNG, WEBP, SVG, ICO — max 2 MB"
                              }
                              onChange={(file) => uploadSetting.mutate({ key: setting.key, file })}
                              // One mutation serves every image setting on this page, so
                              // the flag has to name the key it is uploading. Passing
                              // `isPending` alone would put all three dropzones — logo,
                              // favicon and OG image — into the uploading state together.
                              uploading={uploadSetting.isPending && uploadSetting.variables?.key === setting.key}
                              optional
                            />
                          </Box>
                        ) : (
                          <Input
                            id={`setting-${setting.key}`}
                            type={setting.type === "number" ? "number" : "text"}
                            className="rounded-xl"
                            value={value}
                            onChange={(event) => setValue(setting.key, event.target.value)}
                          />
                        )}
                      </Box>
                    );
                  })}
                </TabsContent>
              );
            })}

            <TabsContent
              value={LICENCE_TAB}
              className="flex flex-col gap-4"
            >
              <Box className="flex items-center gap-1.5">
                <Heading
                  level={2}
                  variant="subtitle"
                >
                  {t("group_licence")}
                </Heading>
                <InfoTooltip content={t("group_licence_help")} />
              </Box>
              <LicencePanel />
            </TabsContent>
          </Tabs>
        </Box>
      )}

      {editableGroups.length > 0 && (
        <Box className="flex justify-end">
          <Button
            type="button"
            className="rounded-xl"
            disabled={updateSettings.isPending}
            onClick={() => {
              // Built from the tabs that are actually on screen, so a group this
              // form does not own cannot travel back — image values are excluded
              // too, rather than written back as the path string they arrived as.
              const editable = Object.fromEntries(
                editableGroups
                  .flatMap(([, rows]) => rows)
                  .filter((setting) => setting.type !== "image")
                  .map((setting) => [setting.key, draft[setting.key] ?? ""]),
              );
              updateSettings.mutate(editable);
            }}
          >
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default SettingsPage;
