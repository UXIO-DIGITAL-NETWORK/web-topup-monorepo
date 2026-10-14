import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { ImageDropzone } from "@/components/common/ImageDropzone";
import { SelectField } from "@/components/common/SelectField";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAnnouncement, useCreateAnnouncement, useUpdateAnnouncement } from "../hooks/useAnnouncements";
import { useContentCategoryOptions } from "../hooks/useContentCategoryOptions";
import { announcementFormSchema, type AnnouncementFormValues } from "../schemas/contentForms.schema";

const GLOBAL = "global";

interface AnnouncementFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  announcementId?: string;
}

export function AnnouncementFormDialog({ open, onOpenChange, announcementId }: AnnouncementFormDialogProps) {
  const { t } = useTranslation("content");
  const isEdit = Boolean(announcementId);
  const [image, setImage] = useState<File | null>(null);

  const { data: existing } = useAnnouncement(open ? announcementId : undefined);
  const { options: categoryOptions } = useContentCategoryOptions();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const isPending = createAnnouncement.isPending || updateAnnouncement.isPending;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementFormSchema),
    defaultValues: { content: "", categoryId: GLOBAL, isActive: true },
    values: existing
      ? { content: existing.content, categoryId: existing.category_id ?? GLOBAL, isActive: existing.is_active }
      : undefined,
  });

  const onSubmit = (values: AnnouncementFormValues) => {
    const payload = {
      content: values.content,
      category_id: values.categoryId === GLOBAL ? undefined : values.categoryId,
      is_active: values.isActive,
      image,
    };
    const onSuccess = () => onOpenChange(false);

    if (announcementId) {
      updateAnnouncement.mutate({ id: announcementId, input: payload }, { onSuccess });
      return;
    }
    createAnnouncement.mutate(payload as never, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Announcement" : "Add Announcement"}</DialogTitle>
          <DialogDescription>{t("announcementSubtitle")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="announcement-content"
              required
            >{t("content")}</FieldLabel>
            <Textarea
              id="announcement-content"
              rows={4}
              className="rounded-xl"
              aria-required="true"
              placeholder={t("announcementPlaceholder")}
              {...register("content")}
            />
            {errors.content && (
              <Text
                variant="small"
                className="text-destructive"
              >
                {errors.content.message}
              </Text>
            )}
          </Box>

          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <SelectField
                id="announcement-category"
                label={t("scope")}
                options={[{ value: GLOBAL, label: t("globalAllGames") }, ...categoryOptions]}
                value={field.value ?? GLOBAL}
                onChange={field.onChange}
                optional
              />
            )}
          />

          <ImageDropzone
            id="announcement-image"
            existingUrl={existing?.image_url}
            label={t("colImage")}
            caption={t("optional")}
            value={image ?? undefined}
            onChange={setImage}
            accept="image/jpeg,image/png,image/webp"
            formatsLabel="JPG, PNG or WEBP up to 2MB"
            uploading={isPending}
            optional
          />

          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Box className="flex items-center gap-3">
                <Switch
                  id="announcement-active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="announcement-active">{t("active")}</Label>
              </Box>
            )}
          />

          <Box className="flex justify-end gap-3">
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
              {isPending ? "Saving..." : "Save"}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
