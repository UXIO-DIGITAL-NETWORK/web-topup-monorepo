import { useTranslation } from "react-i18next";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePayoutBanks } from "../hooks/usePayoutBanks";
import { payoutDetailsSchema, type PayoutDetailsFormValues } from "../schemas/refund.schema";
import type { PayoutDetailsPayload, Refund } from "../types/refund.type";

interface PayoutDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refund: Refund;
  onConfirm: (payload: PayoutDetailsPayload) => void;
  isPending?: boolean;
}

/**
 * An admin entering the payout account on the customer's behalf — the fallback
 * for a guest who never opened the claim link, or has no email at all.
 *
 * The bank list comes from the API rather than a local constant so it cannot
 * drift from what the API will accept. An e-wallet is keyed on a phone number
 * and a bank on an account number, which is why the second field swaps rather
 * than both being shown.
 */
export function PayoutDetailsDialog({ open, onOpenChange, refund, onConfirm, isPending = false }: PayoutDetailsDialogProps) {
  const { t } = useTranslation("refunds");
  const { data: banks = [] } = usePayoutBanks();

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PayoutDetailsFormValues>({
    resolver: zodResolver(payoutDetailsSchema),
    defaultValues: { bank_code: "", account_number: "", account_name: "", account_phone: "", is_ewallet: false },
  });

  const bankCode = watch("bank_code");
  const isEwallet = useMemo(
    () => banks.find((bank) => bank.code === bankCode)?.is_ewallet ?? false,
    [banks, bankCode],
  );

  // Kept in the form state so the schema's refine() can branch on it without
  // the resolver needing to know about the bank catalogue.
  useEffect(() => setValue("is_ewallet", isEwallet), [isEwallet, setValue]);

  // Mounted once per table row and reused across opens, so prefill from the
  // row rather than leaving a previous row's account in the fields.
  useEffect(() => {
    if (!open) return;

    reset({
      bank_code: refund.payout?.bank_code ?? "",
      account_number: refund.payout?.account_number ?? "",
      account_name: refund.payout?.account_name ?? "",
      account_phone: refund.payout?.account_phone ?? "",
      is_ewallet: false,
    });
  }, [open, refund, reset]);

  const onSubmit = (values: PayoutDetailsFormValues) => {
    onConfirm({
      bank_code: values.bank_code,
      account_name: values.account_name,
      ...(values.account_number ? { account_number: values.account_number } : {}),
      ...(values.account_phone ? { account_phone: values.account_phone } : {}),
    });
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
            <DialogTitle>Payout details for {refund.refund_number}</DialogTitle>
            <DialogDescription>{t("payoutSubtitle")}</DialogDescription>
          </DialogHeader>

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="payout-bank"
              required
            >{t("bankOrEwalletField")}</FieldLabel>
            <Controller
              control={control}
              name="bank_code"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    id="payout-bank"
                    aria-required="true"
                    className="w-full rounded-xl"
                  >
                    <SelectValue placeholder={t("selectDestination")} />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((bank) => (
                      <SelectItem
                        key={bank.code}
                        value={bank.code}
                      >
                        {bank.code} — {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.bank_code && (
              <Text
                variant="small"
                className="text-destructive"
              >
                {errors.bank_code.message}
              </Text>
            )}
          </Box>

          {isEwallet ? (
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="payout-phone"
                required
              >{t("ewalletPhone")}</FieldLabel>
              <Input
                id="payout-phone"
                className="rounded-xl tabular-nums"
                aria-required="true"
                placeholder="08xxxxxxxxxx"
                {...register("account_phone")}
              />
            </Box>
          ) : (
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="payout-account"
                required
              >{t("accountNumber")}</FieldLabel>
              <Input
                id="payout-account"
                className="rounded-xl tabular-nums"
                aria-required="true"
                placeholder="1234567890"
                {...register("account_number")}
              />
            </Box>
          )}
          {errors.account_number && (
            <Text
              variant="small"
              className="text-destructive"
            >
              {errors.account_number.message}
            </Text>
          )}

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="payout-name"
              required
            >{t("accountHolderName")}</FieldLabel>
            <Input
              id="payout-name"
              className="rounded-xl"
              aria-required="true"
              placeholder={t("asPrintedOnAccount")}
              {...register("account_name")}
            />
            {errors.account_name && (
              <Text
                variant="small"
                className="text-destructive"
              >
                {errors.account_name.message}
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
              {isPending ? "Saving..." : "Save details"}
            </Button>
          </DialogFooter>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
