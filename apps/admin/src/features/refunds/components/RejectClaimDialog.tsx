import { useTranslation } from "react-i18next";
import { useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { rejectRefundSchema, type RejectRefundFormValues } from "../schemas/refund.schema";

interface RejectClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refundNumber: string;
  onConfirm: (reason: string) => void;
  isPending?: boolean;
}

/**
 * Turning away the account, not the refund.
 *
 * The distinction is easy to blur in a hurry and expensive to get wrong, so the
 * dialog states the outcome plainly: the money is still owed, the account is
 * detached, and a fresh claim link goes to the contact on the order — never to
 * the account being refused. Use "Reject refund" only when nothing is owed.
 */
export function RejectClaimDialog({ open, onOpenChange, refundNumber, onConfirm, isPending = false }: RejectClaimDialogProps) {
  const { t } = useTranslation("refunds");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RejectRefundFormValues>({
    resolver: zodResolver(rejectRefundSchema),
    defaultValues: { reason: "" },
  });

  useEffect(() => {
    if (open) reset({ reason: "" });
  }, [open, reset]);

  const onSubmit = (values: RejectRefundFormValues) => {
    onConfirm(values.reason.trim());
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
            <DialogTitle>Reject the account claiming {refundNumber}?</DialogTitle>
            <DialogDescription>{t("rejectClaimHint")}</DialogDescription>
          </DialogHeader>

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="reject-claim-reason"
              required
            >{t("reason")}</FieldLabel>
            <Textarea
              id="reject-claim-reason"
              className="rounded-xl"
              aria-required="true"
              placeholder={t("rejectClaimPlaceholder")}
              {...register("reason")}
            />
            {errors.reason && (
              <Text
                variant="small"
                className="text-destructive"
              >
                {errors.reason.message}
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
              variant="destructive"
              className="dark:bg-destructive rounded-xl"
              disabled={isPending}
            >
              {isPending ? "Rejecting..." : "Reject claim"}
            </Button>
          </DialogFooter>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
