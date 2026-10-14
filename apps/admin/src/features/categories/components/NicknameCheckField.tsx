import { useTranslation } from "react-i18next";
import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const ENABLE_TOOLTIP =
  "Master switch for the storefront's “Cek Username” button on this game. " +
  "Off means the customer buys without a name check; on means the name is resolved via the lookup URL below. " +
  "Turning it off keeps the configuration, so it can be switched back on without re-entry.";

interface NicknameCheckFieldProps {
  /** Master on/off — whether this game requires a username check at all. */
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** The lookup URL stored in `categories.validasi_nickname` (the "how"). */
  value: string;
  onChange: (value: string) => void;
}

/**
 * The category form's "Cek Username" control. A master Switch decides whether
 * the game needs the check; when on, a lookup-URL template configures how the
 * name is resolved (stored verbatim in `categories.validasi_nickname`).
 * Supplier-side SKU/product lookups no longer exist — Uxiolabs has no
 * cek-username API, so a third-party URL is the only provider. Disabling never
 * clears the URL, so a game can be flipped back on without re-entering it.
 */
export function NicknameCheckField({ enabled, onEnabledChange, value, onChange }: NicknameCheckFieldProps) {
  const { t } = useTranslation("categories");
  return (
    <Box className="flex flex-col gap-2">
      <Box className="flex items-center justify-between gap-4">
        <FieldLabel
          htmlFor="cek-username-enabled"
          tooltip={ENABLE_TOOLTIP}
        >{t("checkUsername")}</FieldLabel>
        <Switch
          id="cek-username-enabled"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </Box>

      {enabled && (
        <>
          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="cek-username-url"
              tooltip="A third-party lookup endpoint. Use {user_id}, {server_id} or {customer_no} placeholders, e.g. https://api.example.com/check?id={user_id}."
              optional
            >{t("lookupUrl")}</FieldLabel>
            <Input
              id="cek-username-url"
              className="rounded-xl"
              placeholder="https://api.example.com/check?id={user_id}"
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          </Box>

          {!value && (
            <Text
              variant="small"
              className="text-muted-foreground"
            >{t("pickProviderFirst")}</Text>
          )}
        </>
      )}
    </Box>
  );
}
