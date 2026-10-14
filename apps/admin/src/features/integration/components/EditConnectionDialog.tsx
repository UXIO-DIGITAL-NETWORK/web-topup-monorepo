import { useTranslation } from "react-i18next";
import { Controller, useForm } from "react-hook-form";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useChannelDetails, useUpdateChannel } from "../hooks/useIntegration";
import type { IntegrationChannelField, UpdateChannelPayload } from "../types/integration.type";

interface EditConnectionDialogProps {
  provider: string;
  channelName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FormValues = Record<string, string | boolean>;

const toDefaults = (fields: IntegrationChannelField[]): FormValues =>
  Object.fromEntries(
    fields.map((field) => [
      field.key,
      // Secrets start blank (write-only); others prefill from the current value.
      field.secret ? "" : field.type === "boolean" ? Boolean(field.value) : ((field.value as string) ?? ""),
    ]),
  );

export function EditConnectionDialog({ provider, channelName, open, onOpenChange }: EditConnectionDialogProps) {
  const { t } = useTranslation("integration");
  const { data: details } = useChannelDetails(open ? provider : undefined);
  const updateChannel = useUpdateChannel();

  const fields = details?.fields ?? [];

  const { control, register, handleSubmit, reset } = useForm<FormValues>({
    // `values` re-seeds the form when the async details resolve — no effect.
    values: details ? toDefaults(fields) : undefined,
  });

  const onSubmit = (values: FormValues) => {
    const payload: UpdateChannelPayload = {};
    for (const field of fields) {
      const value = values[field.key];
      if (field.type === "boolean") {
        payload[field.key] = Boolean(value);
      } else if (field.secret) {
        // Only send a secret when the admin actually typed a new one.
        if (typeof value === "string" && value.trim() !== "") payload[field.key] = value;
      } else {
        payload[field.key] = typeof value === "string" ? value : "";
      }
    }

    updateChannel.mutate(
      { provider, payload },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{`Edit ${channelName} connection`}</DialogTitle>
          <DialogDescription>{t("secretsWriteOnly")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-5"
        >
          {fields.map((field) =>
            field.type === "boolean" ? (
              <Box
                key={field.key}
                className="flex items-center justify-between gap-4"
              >
                <Label htmlFor={field.key}>{field.label}</Label>
                <Controller
                  control={control}
                  name={field.key}
                  render={({ field: ctrl }) => (
                    <Switch
                      id={field.key}
                      checked={Boolean(ctrl.value)}
                      onCheckedChange={ctrl.onChange}
                    />
                  )}
                />
              </Box>
            ) : (
              <Box
                key={field.key}
                className="flex flex-col gap-1.5"
              >
                <FieldLabel
                  htmlFor={field.key}
                  optional
                >{field.label}</FieldLabel>
                <Input
                  id={field.key}
                  type={field.secret ? "password" : "text"}
                  autoComplete="off"
                  placeholder={
                    field.secret
                      ? field.value
                        ? "•••• (leave blank to keep)"
                        : "Not set"
                      : undefined
                  }
                  {...register(field.key)}
                />
              </Box>
            ),
          )}

          <Box className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >{t("cancel")}</Button>
            <Button
              type="submit"
              disabled={updateChannel.isPending || !details}
            >
              {updateChannel.isPending ? "Saving..." : "Save"}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
