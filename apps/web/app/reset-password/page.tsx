import type { Metadata } from "next";
import { AuthCard } from "../_components/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Kitchyn merchant account.",
  alternates: { canonical: "/reset-password" },
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Use at least 8 characters. You'll use this password in the Kitchyn Merchant app and on the web dashboard."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
