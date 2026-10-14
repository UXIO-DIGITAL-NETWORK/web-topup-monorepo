import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useQrDataUrl } from "../hooks/useQrDataUrl";

interface TwoFactorEnrolCardProps {
  /** The base32 secret the API just issued. */
  secret: string;
  /** The `otpauth://` URI, or null while it is still unknown. */
  otpauthUri: string | null;
  code: string;
  onCodeChange: (code: string) => void;
  onConfirm: () => void;
  isConfirming: boolean;
  /** Overrides the step-2 label — a rotation must say "the new device". */
  codeLabel?: string;
  confirmLabel?: string;
  /** Rendered under the code field. Both flows end every session. */
  footnote?: string;
}

/**
 * Scan-then-confirm, the half both 2FA flows share.
 *
 * First enrolment and moving the authenticator to another phone are different
 * decisions with different prices — one is forced before the panel opens, the
 * other costs a password and a live code — but from the QR code onwards they
 * are the same two steps, so they are the same component. Everything about
 * *which* secret this is belongs to the caller.
 *
 * The secret is offered as selectable text as well as a QR code: that is the
 * fallback when a camera fails or someone is enrolling a desktop authenticator,
 * and it costs nothing to show.
 */
export function TwoFactorEnrolCard({
  secret,
  otpauthUri,
  code,
  onCodeChange,
  onConfirm,
  isConfirming,
  codeLabel = "2. Enter the six-digit code it shows",
  confirmLabel = "Confirm and enable",
  footnote,
}: TwoFactorEnrolCardProps) {
  const { t } = useTranslation("auth");
  // Rendered in the browser — the secret is already in this payload and has no
  // business making another round trip to be turned into an image.
  const qrDataUrl = useQrDataUrl(otpauthUri);

  return (
    <Box className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-6">
      <Box className="flex flex-col gap-3">
        <Label>1. Scan this with Google Authenticator</Label>
        {qrDataUrl ? (
          <Box className="border-border w-fit rounded-xl border bg-white p-3">
            <img
              src={qrDataUrl}
              alt="QR code for your authenticator app"
              width={200}
              height={200}
            />
          </Box>
        ) : (
          <Text variant="muted">{t("preparingQr")}</Text>
        )}
        <Text
          variant="small"
          className="text-muted-foreground"
        >{t("inGoogleAuthenticator")}<strong>+</strong> → <strong>{t("scanAQrCode")}</strong>. No camera? Use{" "}
          <strong>{t("enterASetupKey")}</strong> with the key below.
        </Text>
      </Box>

      <Box className="flex flex-col gap-1.5">
        <Label>{t("addKeyByHand")}</Label>
        <Box className="flex items-center gap-2">
          <Input
            readOnly
            value={secret}
            className="rounded-xl font-mono"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            aria-label={t("copySetupKey")}
            onClick={() => {
              void navigator.clipboard.writeText(secret);
              toast.success(t("keyCopied"));
            }}
          >
            <Copy className="size-4" />
          </Button>
        </Box>
        {otpauthUri && (
          <Text
            variant="small"
            className="text-muted-foreground"
          >
            On this device you can also{" "}
            <a
              href={otpauthUri}
              className="underline"
            >
              open it in your authenticator
            </a>
            .
          </Text>
        )}
      </Box>

      <Box className="flex flex-col gap-1.5">
        <FieldLabel required>{codeLabel}</FieldLabel>
        <InputOTP
          maxLength={6}
          value={code}
          onChange={onCodeChange}
          onComplete={onConfirm}
          disabled={isConfirming}
          aria-required="true"
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <InputOTPSlot
                key={index}
                index={index}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </Box>

      {footnote && (
        <Text
          variant="small"
          className="text-muted-foreground"
        >
          {footnote}
        </Text>
      )}

      <Button
        className="w-fit rounded-xl"
        disabled={isConfirming || code.length < 6}
        onClick={onConfirm}
      >
        {isConfirming ? "Confirming…" : confirmLabel}
      </Button>
    </Box>
  );
}
