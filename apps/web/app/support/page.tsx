import type { Metadata } from "next";
import Link from "next/link";
import {
  KITCHYN_COMPANY,
  LegalPage,
  LegalSection,
  SupportEmailLink,
} from "../_components/legal-page";

const TITLE = "Support";
const DESCRIPTION =
  "Get help with Kitchyn — the Kitchyn Merchant app, the merchant dashboard, or an order you placed from a restaurant on Kitchyn.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/support" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/support", type: "website" },
};

export default function SupportPage() {
  return (
    <LegalPage
      eyebrow="Help"
      title="How can we help?"
      intro={
        <p>
          Email us at <SupportEmailLink subject="Kitchyn support request" /> and a member of the
          Kitchyn team will get back to you. To help us sort things out quickly, please write from
          the email address linked to your account (if you have one) and include the details listed
          below.
        </p>
      }
    >
      <LegalSection id="merchants" title="Restaurants and staff">
        <p>
          For help with the <strong>Kitchyn Merchant app</strong>, the web dashboard, your
          storefront, menu, orders, payouts or settlements, email{" "}
          <SupportEmailLink subject="Merchant support" />. Please include:
        </p>
        <ul>
          <li>your restaurant name and the email address you sign in with;</li>
          <li>the order number, if your question is about a specific order;</li>
          <li>
            what you were trying to do, what happened, and (if you can) a screenshot and your phone
            model or browser.
          </li>
        </ul>
        <h3>Can&apos;t sign in?</h3>
        <p>
          Reset your password at <Link href="/forgot-password">kitchyn.app/forgot-password</Link>.
          We&apos;ll email you a link that works on any device. The new password works in both the
          Kitchyn Merchant app and the web dashboard.
        </p>
      </LegalSection>

      <LegalSection id="customers" title="Customers">
        <p>
          When you order from a restaurant on Kitchyn, you are buying from that restaurant. For
          questions about your food, such as ingredients, allergens, missing or incorrect items, or
          preparation time, the quickest route is usually to contact the restaurant directly using
          the contact details on its storefront.
        </p>
        <p>
          If you can&apos;t resolve an issue with the restaurant, or your question is about a
          payment, a refund, or a delivery made by a rider we arranged, email{" "}
          <SupportEmailLink subject="Order support" /> with the restaurant name, your order number,
          and the phone number you used at checkout. Please never send us your full card number,
          PIN or one-time passcode.
        </p>
      </LegalSection>

      <LegalSection id="privacy-and-accounts" title="Privacy and account deletion">
        <ul>
          <li>
            To delete your account or ask us to delete your data, see{" "}
            <Link href="/delete-account">Delete your account</Link>.
          </li>
          <li>
            To learn how we handle personal data, read our <Link href="/privacy">Privacy Policy</Link>.
          </li>
          <li>
            The rules for using Kitchyn are in our <Link href="/terms">Terms of Service</Link>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="company" title="Company details">
        <p>
          Kitchyn is operated by {KITCHYN_COMPANY.legalName}, a private limited liability company
          incorporated in Nigeria, with its registered address at {KITCHYN_COMPANY.address}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
