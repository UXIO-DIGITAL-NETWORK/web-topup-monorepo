import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, ArrowRight } from "lucide-react";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Heading } from "@/components/common/Heading";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

import { loginSchema, type LoginFormValues } from "../schemas/auth.schema";
import { useLogin } from "../hooks/useLogin";
import type { AuthApiError } from "../types/auth.type";
import { TwoFactorStep } from "../components/TwoFactorStep";

export default function LoginPage() {
  const { t } = useTranslation("auth");
  // Held here, not in the auth store: a challenge is not a session, and
  // `requireGuest` would bounce anyone the store considers signed in.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);

  const { mutate: login, isPending, error } = useLogin(setChallengeToken);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormValues) => {
    setRemember(Boolean(data.remember));
    login(data);
  };

  // Catch API Error Message (Example: Invalid credentials)
  const apiErrorMessage = (error as unknown as AuthApiError)?.response?.data?.message;

  if (challengeToken) {
    return (
      <TwoFactorStep
        challengeToken={challengeToken}
        remember={remember}
        onCancel={() => setChallengeToken(null)}
      />
    );
  }

  return (
    <Box className="w-full max-w-[420px]">
      {/* Header */}
      <Box className="mb-10">
        <Heading
          level={2}
          className="text-[32px] font-extrabold text-slate-900 mb-4 tracking-tight"
        >{t("signIn")}</Heading>
        <Text className="text-slate-500 text-[15px] font-medium">{t("signInSubtitle")}</Text>
      </Box>

      {/* Global Error Alert */}
      {apiErrorMessage && (
        <Box className="bg-red-50 p-4 rounded-xl mb-6 shadow-sm border border-red-100">
          <Text className="font-medium text-red-600 text-sm">{apiErrorMessage}</Text>
        </Box>
      )}

      {/* Form */}
      <Box
        as="form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6"
      >
        {/* Email Input */}
        <Box className="space-y-2">
          <FieldLabel
            htmlFor="email"
            labelClassName="block text-sm font-bold text-slate-800"
            required
          >{t("email")}</FieldLabel>
          <Box className="relative">
            <Box className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Mail className="w-5 h-5 text-slate-400" />
            </Box>
            <Input
              id="email"
              type="email"
              aria-required="true"
              {...register("email")}
              placeholder="you@company.com"
              className="w-full h-auto pl-10 pr-4 py-2.5 bg-white border-slate-200 rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:border-black"
            />
          </Box>
          {errors.email && <Text className="text-red-500 text-xs font-medium">{errors.email.message}</Text>}
        </Box>

        {/* Password Input — with the show/hide toggle, so a mistyped character is
            visible before the sign-in attempt rather than after. */}
        <Box className="space-y-2">
          <FieldLabel
            htmlFor="password"
            labelClassName="block text-sm font-bold text-slate-800"
            required
          >{t("password")}</FieldLabel>
          <Box className="relative">
            <Box className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10">
              <Lock className="w-5 h-5 text-slate-400" />
            </Box>
            <PasswordInput
              id="password"
              aria-required="true"
              {...register("password")}
              placeholder="••••••••"
              className="w-full h-auto pl-10 py-2.5 bg-white border-slate-200 rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:border-black"
            />
          </Box>
          {errors.password && <Text className="text-red-500 text-xs font-medium">{errors.password.message}</Text>}
        </Box>

        {/* Options */}
        <Box className="flex items-center justify-between pt-1">
          <Box className="flex items-center space-x-2.5 group">
            <Checkbox
              id="remember"
              onCheckedChange={(checked) => setValue("remember", checked as boolean)}
              className="w-5 h-5 bg-white border-slate-300 rounded-md data-[state=checked]:bg-black data-[state=checked]:text-white data-[state=checked]:border-black focus-visible:ring-black/20"
            />
            <Label
              htmlFor="remember"
              className="text-sm font-semibold text-slate-700 cursor-pointer"
            >{t("rememberMe")}</Label>
          </Box>
        </Box>

        {/* Submit Button */}
        <Box className="pt-4">
          <Button
            type="submit"
            disabled={isPending}
            className="w-full h-auto flex items-center justify-center py-3 px-4 bg-black hover:bg-neutral-800 text-white text-[15px] font-bold rounded-xl shadow-[0_8px_20px_rgba(0,0,0,0.25)] border-0 disabled:opacity-70"
          >
            {isPending ? "Signing in…" : "Sign in"}
            {!isPending && <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
