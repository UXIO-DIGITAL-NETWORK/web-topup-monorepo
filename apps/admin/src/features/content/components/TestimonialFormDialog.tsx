import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { ImageDropzone } from "@/components/common/ImageDropzone";
import { Text } from "@/components/common/Text";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateTestimonial, useTestimonial, useUpdateTestimonial } from "../hooks/useTestimonials";
import { testimonialFormSchema, type TestimonialFormValues } from "../schemas/contentForms.schema";

interface TestimonialFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  testimonialId?: string;
}

export function TestimonialFormDialog({ open, onOpenChange, testimonialId }: TestimonialFormDialogProps) {
  const { t } = useTranslation("content");
  const isEdit = Boolean(testimonialId);
  const [avatar, setAvatar] = useState<File | null>(null);

  const { data: existing } = useTestimonial(open ? testimonialId : undefined);
  const createTestimonial = useCreateTestimonial();
  const updateTestimonial = useUpdateTestimonial();
  const isPending = createTestimonial.isPending || updateTestimonial.isPending;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TestimonialFormValues>({
    resolver: zodResolver(testimonialFormSchema),
    defaultValues: {
      authorName: "",
      authorTitle: "",
      content: "",
      rating: 5,
      gameName: "",
      isFeatured: false,
      sortOrder: 0,
      isActive: true,
    },
    values: existing
      ? {
          authorName: existing.author_name,
          authorTitle: existing.author_title ?? "",
          content: existing.content,
          rating: existing.rating ?? 5,
          gameName: existing.game_name ?? "",
          isFeatured: existing.is_featured,
          sortOrder: existing.sort_order,
          isActive: existing.is_active,
        }
      : undefined,
  });

  const onSubmit = (values: TestimonialFormValues) => {
    const payload = {
      author_name: values.authorName,
      author_title: values.authorTitle || undefined,
      content: values.content,
      rating: values.rating,
      game_name: values.gameName || undefined,
      is_featured: values.isFeatured,
      sort_order: values.sortOrder,
      is_active: values.isActive,
      avatar,
    };
    const onSuccess = () => onOpenChange(false);

    if (testimonialId) {
      updateTestimonial.mutate({ id: testimonialId, input: payload }, { onSuccess });
      return;
    }
    createTestimonial.mutate(payload as never, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Testimonial" : "Add Testimonial"}</DialogTitle>
          <DialogDescription>{t("testimonialSubtitle")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <Box className="grid gap-4 sm:grid-cols-2">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="testimonial-author"
                required
              >{t("authorName")}</FieldLabel>
              <Input
                id="testimonial-author"
                className="rounded-xl"
                aria-required="true"
                {...register("authorName")}
              />
              {errors.authorName && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.authorName.message}
                </Text>
              )}
            </Box>
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="testimonial-title"
                optional
              >{t("authorTitle")}</FieldLabel>
              <Input
                id="testimonial-title"
                className="rounded-xl"
                placeholder={t("authorTitlePlaceholder")}
                {...register("authorTitle")}
              />
            </Box>
          </Box>

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="testimonial-content"
              required
            >{t("testimonial")}</FieldLabel>
            <Textarea
              id="testimonial-content"
              rows={4}
              className="rounded-xl"
              aria-required="true"
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

          <Box className="grid gap-4 sm:grid-cols-3">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="testimonial-game"
                optional
              >{t("game")}</FieldLabel>
              <Input
                id="testimonial-game"
                className="rounded-xl"
                {...register("gameName")}
              />
            </Box>
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="testimonial-rating"
                optional
              >{t("rating")}</FieldLabel>
              <Input
                id="testimonial-rating"
                type="number"
                min={1}
                max={5}
                className="rounded-xl tabular-nums"
                {...register("rating", { valueAsNumber: true })}
              />
              {errors.rating && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.rating.message}
                </Text>
              )}
            </Box>
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="testimonial-sort"
                required
              >{t("order")}</FieldLabel>
              <Input
                id="testimonial-sort"
                type="number"
                min={0}
                className="rounded-xl tabular-nums"
                aria-required="true"
                {...register("sortOrder", { valueAsNumber: true })}
              />
              {errors.sortOrder && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.sortOrder.message}
                </Text>
              )}
            </Box>
          </Box>

          <ImageDropzone
            id="testimonial-avatar"
            existingUrl={existing?.avatar_url}
            label={t("avatar")}
            caption={t("avatarCaption")}
            value={avatar ?? undefined}
            onChange={setAvatar}
            accept="image/jpeg,image/png,image/webp"
            formatsLabel="JPG, PNG or WEBP up to 2MB"
            uploading={isPending}
            optional
          />

          <Box className="flex flex-col gap-3 sm:flex-row sm:gap-8">
            <Controller
              control={control}
              name="isFeatured"
              render={({ field }) => (
                <Box className="flex items-center gap-3">
                  <Switch
                    id="testimonial-featured"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="testimonial-featured">{t("featured")}</Label>
                </Box>
              )}
            />
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Box className="flex items-center gap-3">
                  <Switch
                    id="testimonial-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="testimonial-active">{t("active")}</Label>
                </Box>
              )}
            />
          </Box>

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
