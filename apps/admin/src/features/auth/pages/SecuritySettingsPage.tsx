import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Heading } from "@/components/common/Heading";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readRememberChoice, useAuthStore } from "@/store/useAuthStore";
import { authService } from "../services/auth.service";
import { TwoFactorEnrolCard } from "../components/TwoFactorEnrolCard";
import type { AuthApiError } from "../types/auth.type";

const errorMessage = (error: unknown, fallback: string) =>
  (error as AuthApiError)?.response?.data?.message ?? fallback;

/**
 * Account security: the password, and which device holds the second factor.
 *
 * The password change lives here because this is the only page about the signed-in
 * admin's own account. It is deliberately not gated behind `users.*` permissions —
 * it acts on the caller, not on anyone else.
 *
 * Moving an authenticator — a new phone, a colleague handing the account over,
 * an app reinstalled — used to have no answer here at all. The only route was
 * to disable and enrol again, which signs the admin out mid-act and leaves the
 * account with **no** second factor in between. `rotate` closes that: the new
 * secret waits server-side while the old one stays in force, so abandoning this
 * screen halfway costs nothing.
 *
 * First enrolment deliberately does not live here. It is forced before the
 * panel opens (`TwoFactorEnrolmentPage`), so anyone who can read this page has
 * already enrolled.
 */
export function SecuritySettingsPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [liveCode, setLiveCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [isMoving, setIsMoving] = useState(false);

  const enabled = Boolean(user?.two_factor_enabled);

  const changePassword = useMutation({
    mutationFn: () =>
      authService.changePassword({
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: confirmPassword,
      }),
    onSuccess: () => {
      // Neither the old nor the new password belongs in memory a second longer.
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      toast.success(t("passwordChanged"));
    },
    onError: (error) => {
      // The API re-checks `current_password`; keep it so a single correction is
      // enough rather than retyping all three.
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(errorMessage(error, t("changePasswordFailed")));
    },
  });

  /** The API enforces all of this too; saying it here saves a round trip. */
  const submitPasswordChange = () => {
    if (newPassword.length < 6) {
      setPasswordError(t("passwordMinLength"));

      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("passwordMismatch"));

      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError(t("passwordUnchanged"));

      return;
    }

    setPasswordError(null);
    changePassword.mutate();
  };

  const rotate = useMutation({
    mutationFn: () => authService.rotateTwoFactor(password, liveCode),
    onSuccess: (response) => {
      setSecret(response.data.secret);
      setOtpauthUri(response.data.otpauth_uri);
      // Neither is needed again, and both are worth not leaving in memory.
      setPassword("");
      setLiveCode("");
    },
    onError: (error) => {
      setLiveCode("");
      toast.error(errorMessage(error, "Could not start the move"));
    },
  });

  const confirmRotation = useMutation({
    mutationFn: () => authService.confirmTwoFactorRotation(newCode),
    onSuccess: (response) => {
      // The move revoked every token including this one; the response carries
      // the replacement pair.
      setAuth(response.data, readRememberChoice());
      setSecret(null);
      setOtpauthUri(null);
      setNewCode("");
      setIsMoving(false);
      toast.success(t("moved"));
    },
    onError: (error) => {
      setNewCode("");
      toast.error(errorMessage(error, "That code did not match"));
    },
  });

  const disable = useMutation({
    mutationFn: () => authService.disableTwoFactor(disablePassword),
    onSuccess: () => {
      // Nothing is minted here — the account no longer satisfies the admin
      // gate, so there is no session to carry forward.
      toast.success(t("disabled"));
      clearAuth();
      navigate({ to: "/login" });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not disable")),
  });

  // An unfinished move from an earlier visit. The secret travels exactly once,
  // so there is no QR left to re-render and nothing to resume in the UI — the
  // honest answer is to say a move is waiting and that starting again replaces
  // it. Nothing is lost either way: the live authenticator never stopped
  // working, and an untouched pending secret expires on its own.
  const unfinishedMove = Boolean(user?.two_factor_pending) && !secret;

  return (
    <Box className="flex max-w-2xl flex-col gap-6">
      <Box className="border-border bg-card rounded-2xl border p-6">
        <Heading
          level={1}
          variant="section"
        >{t("securityTitle")}</Heading>
        <Text variant="muted">{t("securitySubtitle")}</Text>
      </Box>

      <Box
        as="form"
        onSubmit={(event) => {
          event.preventDefault();
          submitPasswordChange();
        }}
        className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-6"
      >
        <Box className="flex flex-col gap-1">
          <Text className="font-medium">{t("changePasswordTitle")}</Text>
          <Text variant="muted">{t("changePasswordSubtitle")}</Text>
        </Box>

        <Box className="flex flex-col gap-1.5">
          <FieldLabel
            htmlFor="current-password"
            required
          >{t("currentPassword")}</FieldLabel>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            className="rounded-xl"
            aria-required="true"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Box>

        <Box className="flex flex-col gap-1.5">
          <FieldLabel
            htmlFor="new-password"
            required
          >{t("newPassword")}</FieldLabel>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            className="rounded-xl"
            aria-required="true"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Box>

        <Box className="flex flex-col gap-1.5">
          <FieldLabel
            htmlFor="confirm-password"
            required
          >{t("confirmPassword")}</FieldLabel>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            className="rounded-xl"
            aria-required="true"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </Box>

        {passwordError && <Text className="text-destructive text-sm font-medium">{passwordError}</Text>}

        <Button
          type="submit"
          className="w-fit rounded-xl"
          disabled={
            changePassword.isPending ||
            currentPassword.length === 0 ||
            newPassword.length === 0 ||
            confirmPassword.length === 0
          }
        >
          <KeyRound className="mr-2 size-4" />
          {changePassword.isPending ? t("saving") : t("changePasswordAction")}
        </Button>
      </Box>

      <Box className="border-border bg-card rounded-2xl border p-6">
        <Heading
          level={2}
          variant="section"
        >{t("twoFactorTitle")}</Heading>
        <Text variant="muted">{t("twoFactorSubtitle")}</Text>
      </Box>

      {!enabled ? (
        <Box className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-6">
          <Text>{t("notSetUp")}</Text>
          <Button
            className="w-fit rounded-xl"
            onClick={() => navigate({ to: "/two-factor-setup" })}
          >
            <ShieldCheck className="mr-2 size-4" />{t("setItUp")}</Button>
        </Box>
      ) : (
        <>
          <Box className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-6">
            <Box className="flex flex-col gap-1">
              <Text>{t("isActive")}</Text>
              <Text variant="muted">{t("moveHint")}</Text>
            </Box>

            {unfinishedMove && (
              <Text
                variant="small"
                className="text-muted-foreground"
              >{t("unfinishedMove")}</Text>
            )}

            {!isMoving && !secret ? (
              <Button
                variant="outline"
                className="w-fit rounded-xl"
                onClick={() => setIsMoving(true)}
              >
                <Smartphone className="mr-2 size-4" />{t("moveToAnotherDevice")}</Button>
            ) : !secret ? (
              <Box className="flex flex-col gap-4">
                <Box className="flex flex-col gap-1.5">
                  <FieldLabel
                    htmlFor="rotate-password"
                    required
                  >{t("yourPassword")}</FieldLabel>
                  <PasswordInput
                    id="rotate-password"
                    autoComplete="current-password"
                    className="rounded-xl"
                    aria-required="true"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Box>
                <Box className="flex flex-col gap-1.5">
                  <FieldLabel
                    htmlFor="rotate-code"
                    required
                  >{t("currentAuthenticatorCode")}</FieldLabel>
                  <Input
                    id="rotate-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="rounded-xl font-mono"
                    aria-required="true"
                    value={liveCode}
                    onChange={(event) => setLiveCode(event.target.value.replace(/\D/g, ""))}
                  />
                  <Text
                    variant="small"
                    className="text-muted-foreground"
                  >{t("currentCodeHint")}</Text>
                </Box>
                <Box className="flex items-center gap-2">
                  <Button
                    className="w-fit rounded-xl"
                    disabled={rotate.isPending || password.length === 0 || liveCode.length < 6}
                    onClick={() => rotate.mutate()}
                  >
                    {rotate.isPending ? "Checking…" : "Continue"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-fit rounded-xl"
                    onClick={() => {
                      setIsMoving(false);
                      setPassword("");
                      setLiveCode("");
                    }}
                  >{t("cancel")}</Button>
                </Box>
              </Box>
            ) : null}
          </Box>

          {secret && (
            <TwoFactorEnrolCard
              secret={secret}
              otpauthUri={otpauthUri}
              code={newCode}
              onCodeChange={setNewCode}
              onConfirm={() => confirmRotation.mutate()}
              isConfirming={confirmRotation.isPending}
              codeLabel="2. Enter the code from the NEW device"
              confirmLabel={t("confirmTheMove")}
              footnote="Your old authenticator keeps working until you confirm. Confirming signs out every other device."
            />
          )}

          <Box className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-6">
            <Box className="flex flex-col gap-1">
              <Text>{t("turnOff")}</Text>
              <Text variant="muted">{t("turnOffHint")}</Text>
            </Box>
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="disable-password"
                required
              >{t("confirmYourPassword")}</FieldLabel>
              <PasswordInput
                id="disable-password"
                autoComplete="current-password"
                className="rounded-xl"
                aria-required="true"
                value={disablePassword}
                onChange={(event) => setDisablePassword(event.target.value)}
              />
            </Box>
            <Button
              variant="destructive"
              className="dark:bg-destructive w-fit rounded-xl"
              disabled={disable.isPending || disablePassword.length === 0}
              onClick={() => disable.mutate()}
            >
              <ShieldOff className="mr-2 size-4" />
              {disable.isPending ? "Disabling…" : "Disable two-factor"}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
