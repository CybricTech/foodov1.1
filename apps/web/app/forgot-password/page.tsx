import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../_components/auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description:
    "Reset the password for your Kitchyn merchant account. We'll email you a secure link.",
  alternates: { canonical: "/forgot-password" },
  robots: { index: false, follow: true },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter the email address you use to sign in and we'll send you a link to choose a new password."
    >
      {/* useSearchParams (for ?error=link_expired) needs a Suspense boundary to
          keep the page statically renderable. */}
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
