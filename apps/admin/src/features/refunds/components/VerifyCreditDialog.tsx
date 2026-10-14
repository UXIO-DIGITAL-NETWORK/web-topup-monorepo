import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/utils/currency";
import { completeRefundSchema, type CompleteRefundFormValues } from "../schemas/refund.schema";
import type { Refund } from "../types/refund.type";

interface VerifyCreditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refund: Refund;
  onConfirm: (input: { note?: string }) => void;
  isPending?: boolean;
}

/** One row of the identity comparison — the actual work this dialog exists for. */
function CompareRow({ label, order, account }: { label: string; order: string | null; account: string | null }) {
  // Compared case-insensitively and only when both sides exist: a missing
  // value is not a mismatch, it is simply nothing to check.
  const same = Boolean(order && account && order.trim().toLowerCase() === account.trim().toLowerCase());

  return (
    <Box className="grid grid-cols-[5rem_1fr_1fr] items-baseline gap-2">
      <Text
        variant="small"
        as="span"
        className="text-muted-foreground"
      >
        {label}
      </Text>
      <Text
        variant="small"
        as="span"
        className="break-all"
      >
        {order ?? "—"}
      </Text>
      <Text
        variant="small"
        as="span"
        className={same ? "text-success break-all" : "break-all"}
      >
        {account ?? "—"}
      </Text>
    </Box>
  );
}

/**
 * "This is really the person who paid — credit them."
 *
 * The refund itself was never in doubt; what an admin is deciding here is
 * whether the account that turned up is the buyer's. So the dialog leads with
 * the identity comparison rather than the amount, and shows the contact
 * **frozen at claim time** — the account can change its email afterwards, and
 * verifying against a mutable value would defeat the point.
 *
 * There is no proof upload: a balance credit leaves its evidence in
 * `balance_mutations`, not in a screenshot of a banking app.
 */
export function VerifyCreditDialog({ open, onOpenChange, refund, onConfirm, isPending = false }: VerifyCreditDialogProps) {
  const { t } = useTranslation("refunds");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompleteRefundFormValues>({
    resolver: zodResolver(completeRefundSchema),
    defaultValues: { note: "" },
  });

  useEffect(() => {
    if (open) reset({ note: "" });
  }, [open, reset]);

  const claimed = refund.claimed_account;

  const onSubmit = (values: CompleteRefundFormValues) => {
    onConfirm({ note: values.note });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Credit {formatCurrency(refund.amount, { fractionDigits: 0 })} to this account?</DialogTitle>
            <DialogDescription>{t("verifyHint")}</DialogDescription>
          </DialogHeader>

          <Box className="border-border flex flex-col gap-2 rounded-xl border p-3">
            <Box className="grid grid-cols-[5rem_1fr_1fr] gap-2">
              {/* Spacer under the label column, so the two headings line up
                  with the values they describe. */}
              <Box />
              <Text
                variant="small"
                as="span"
                className="text-muted-foreground font-medium"
              >{t("onTheOrder")}</Text>
              <Text
                variant="small"
                as="span"
                className="text-muted-foreground font-medium"
              >{t("claimingAccount")}</Text>
            </Box>

            <CompareRow
              label={t("email")}
              order={refund.customer.email}
              account={claimed?.email ?? null}
            />
            <CompareRow
              label={t("phone")}
              order={refund.customer.phone}
              account={claimed?.phone ?? null}
            />

            {claimed?.contact_match && (
              <Text
                variant="small"
                className="text-muted-foreground"
              >{t("matchedOn")}<strong>{claimed.contact_match}</strong> at claim time: {claimed.contact_value ?? "—"}
              </Text>
            )}
          </Box>

          {/* The fishing signal: one account collecting several refunds, or one
              contact appearing across several orders. */}
          {claimed && claimed.sibling_claims > 0 && (
            <Box className="border-warning text-warning flex items-start gap-2 rounded-xl border p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <Text
                variant="small"
                as="span"
              >
                This account has claimed {claimed.sibling_claims} other refund
                {claimed.sibling_claims === 1 ? "" : "s"}. Check them before crediting.
              </Text>
            </Box>
          )}

          {refund.claim_rejected_count > 0 && (
            <Box className="border-warning text-warning flex items-start gap-2 rounded-xl border p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <Text
                variant="small"
                as="span"
              >
                A previous claim on this refund was rejected {refund.claim_rejected_count} time
                {refund.claim_rejected_count === 1 ? "" : "s"}.
              </Text>
            </Box>
          )}

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="verify-note"
              optional
            >{t("noteOptional")}</FieldLabel>
            <Input
              id="verify-note"
              className="rounded-xl"
              placeholder={t("verifyPlaceholder")}
              {...register("note")}
            />
            {errors.note && (
              <Text
                variant="small"
                className="text-destructive"
              >
                {errors.note.message}
              </Text>
            )}
          </Box>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >{t("cancel")}</Button>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={isPending}
            >
              {isPending ? "Crediting..." : "Verify & credit balance"}
            </Button>
          </DialogFooter>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
