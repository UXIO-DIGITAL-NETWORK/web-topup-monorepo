import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/utils/currency";
import { completeRefundSchema, type CompleteRefundFormValues } from "../schemas/refund.schema";
import type { Refund } from "../types/refund.type";

interface CompleteRefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refund: Refund;
  onConfirm: (input: { proof?: File | null; note?: string }) => void;
  isPending?: boolean;
}

/**
 * "I have made the transfer." Irreversible in the real world, so the dialog
 * restates the amount and the destination rather than just asking to confirm —
 * the numbers are what the admin should be checking against their banking app.
 *
 * The proof file is optional and is uploaded exactly as picked: proof is
 * evidence, so it does not go through the WebP re-encode every other image
 * upload in this app does.
 */
export function CompleteRefundDialog({ open, onOpenChange, refund, onConfirm, isPending = false }: CompleteRefundDialogProps) {
  const { t } = useTranslation("refunds");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [proof, setProof] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompleteRefundFormValues>({
    resolver: zodResolver(completeRefundSchema),
    defaultValues: { note: "" },
  });

  // Cleared on close rather than on open: the dialog is mounted once per table
  // row and reused, so a previous attempt's note and file must not survive —
  // and resetting here keeps it out of an effect, which would be a setState
  // during render for the file.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset({ note: "" });
      setProof(null);
    }
    onOpenChange(next);
  };

  const onSubmit = (values: CompleteRefundFormValues) => {
    onConfirm({ proof, note: values.note });
    handleOpenChange(false);
  };

  const destination = refund.payout
    ? `${refund.payout.bank_name ?? refund.payout.bank_code} · ${refund.payout.account_number ?? refund.payout.account_phone ?? "—"} · ${refund.payout.account_name ?? ""}`
    : "No payout account on file";

  // The dialog keeps its fields on screen while the proof and note are in
  // flight. Without this the file row looks untouched for the whole request —
  // its text only ever showed the picked filename — and the only moving part
  // is the submit button off to the side.
  const fileSummary = isPending ? t("uploading") : (proof?.name ?? "JPG, PNG or PDF up to 2mb");

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent>
        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Mark {refund.refund_number} as transferred?</DialogTitle>
            <DialogDescription>{t("completeHint")}</DialogDescription>
          </DialogHeader>

          <Box className="border-border flex flex-col gap-1 rounded-xl border p-3">
            <Text
              as="span"
              className="text-lg font-semibold tabular-nums"
            >
              {formatCurrency(refund.amount, { fractionDigits: 0 })}
            </Text>
            <Text
              variant="muted"
              as="span"
            >
              {destination}
            </Text>
          </Box>

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="refund-proof"
              optional
            >{t("transferReceiptOptional")}</FieldLabel>
            <input
              ref={fileInputRef}
              id="refund-proof"
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              className="hidden"
              disabled={isPending}
              onChange={(event) => setProof(event.target.files?.[0] ?? null)}
            />
            <Box className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={isPending}
                onClick={() => fileInputRef.current?.click()}
              >{t("browseFiles")}</Button>
              {isPending && (
                <Spinner
                  aria-hidden="true"
                  className="size-4"
                />
              )}
              <Text
                variant="muted"
                as="span"
                role="status"
              >
                {fileSummary}
              </Text>
            </Box>
          </Box>

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="refund-note"
              optional
            >{t("noteOptional")}</FieldLabel>
            <Input
              id="refund-note"
              className="rounded-xl"
              placeholder={t("completePlaceholder")}
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
              onClick={() => handleOpenChange(false)}
            >{t("cancel")}</Button>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={isPending}
            >
              {isPending ? "Completing..." : "Mark as transferred"}
            </Button>
          </DialogFooter>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
