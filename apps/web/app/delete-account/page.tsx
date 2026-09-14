import type { Metadata } from "next";
import Link from "next/link";
import {
  LEGAL_EFFECTIVE_DATE,
  LegalPage,
  LegalSection,
  SupportEmailLink,
} from "../_components/legal-page";

const TITLE = "Delete your Kitchyn account";
const DESCRIPTION =
  "How to request deletion of your Kitchyn Merchant account or your personal data, what we delete, and what we must keep.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/delete-account" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/delete-account", type: "website" },
};

export default function DeleteAccountPage() {
  return (
    <LegalPage
      eyebrow="Your data"
      title={TITLE}
      lastUpdated={LEGAL_EFFECTIVE_DATE}
      intro={
        <p>
          You can ask us to delete your Kitchyn account, including an account you use in the{" "}
          <strong>Kitchyn Merchant</strong> app, at any time. This page explains how to make a
          request, what happens next, and the limited information we are required to keep.
        </p>
      }
    >
      <LegalSection id="in-the-app" number={1} title="Request deletion in the Kitchyn Merchant app">
        <ol>
          <li>Open the Kitchyn Merchant app and sign in.</li>
          <li>
            <strong>Restaurant owners:</strong> go to{" "}
            <strong>More → Account &amp; help → Delete account</strong>.
          </li>
          <li>
            <strong>Staff members:</strong> go to the <strong>Menu</strong> tab, tap{" "}
            <strong>Account</strong>, then <strong>Delete account</strong>.
          </li>
          <li>Confirm your request. You&apos;ll be signed out once it&apos;s sent.</li>
        </ol>
        <p>
          Can&apos;t sign in? <Link href="/forgot-password">Reset your password</Link> first, or use
          the email option below.
        </p>
      </LegalSection>

      <LegalSection id="by-email" number={2} title="Request deletion by email">
        <p>
          Email <SupportEmailLink subject="Account deletion request" />{" "}
          <strong>from the email address linked to your account</strong>, with the subject
          &ldquo;Account deletion request&rdquo;. Tell us your name and, for merchant accounts, your
          restaurant name. We may ask you to confirm the request so we don&apos;t delete an account
          for someone who isn&apos;t its owner.
        </p>
      </LegalSection>

      <LegalSection id="what-happens" number={3} title="What happens after you ask">
        <ul>
          <li>We acknowledge your request.</li>
          <li>
            Within <strong>30 days</strong>, we remove your access to your account and delete the
            personal data associated with it, except for the records described in section 4.
          </li>
          <li>
            <strong>Restaurant owner accounts:</strong> when an owner&apos;s account is closed, the
            staff accounts under that restaurant are removed too.
          </li>
          <li>
            <strong>Staff accounts:</strong> deleting a staff account removes only that person&apos;s
            login. The restaurant&apos;s account and its data are not affected.
          </li>
          <li>
            <strong>Money owed to a restaurant:</strong> any outstanding merchant proceeds are paid
            out under the Kitchyn Merchant Agreement, after permitted deductions and any reserve
            the Agreement allows us to hold for chargebacks and refunds.
          </li>
          <li>
            Closing an account ends your use of Kitchyn but does not cancel obligations that
            already exist, such as fees owed under the Merchant Agreement.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="what-we-keep" number={4} title="What we keep, and why">
        <p>Some information has to be kept after an account is deleted:</p>
        <ul>
          <li>
            <strong>Order, payment and settlement records</strong> (for example order numbers,
            amounts, payment references, payouts, refunds and invoices). We keep these for as long as
            applicable law requires, including tax and accounting law, and for the period after
            closure during which chargebacks, refunds and disputes can still arise under the Merchant
            Agreement.
          </li>
          <li>
            <strong>Signed agreements and records we need to establish, exercise or defend legal
            claims</strong>, for as long as those claims could be brought.
          </li>
          <li>
            <strong>Security and fraud-prevention records</strong> where we are required or entitled
            to keep them.
          </li>
          <li>
            <strong>Anonymised or aggregated analytics</strong> that no longer identify you.
          </li>
        </ul>
        <p>
          We keep retained records secure, restrict who can access them, and delete them when they are
          no longer needed. See our <Link href="/privacy#retention">Privacy Policy</Link> for more.
        </p>
      </LegalSection>

      <LegalSection id="customers" number={5} title="Customers who ordered from a restaurant">
        <p>
          If you ordered from a restaurant on Kitchyn, including as a guest without an account, you
          can ask us to delete your personal data (such as your name, phone number, email address and
          saved delivery addresses). Email <SupportEmailLink subject="Customer data deletion request" />{" "}
          with the phone number or email address you used at checkout and, if you can, an order
          number, so we can find your records. The same 30-day window and the retention exceptions in
          section 4 apply.
        </p>
        <p>
          Restaurants receive the details needed to fulfil your order and are separately responsible
          for the copies they hold. You can also contact the restaurant directly.
        </p>
      </LegalSection>

      <LegalSection id="questions" number={6} title="Questions">
        <p>
          Contact <SupportEmailLink /> or visit our <Link href="/support">Support page</Link>. You
          also have the right to complain to the Nigeria Data Protection Commission. See our{" "}
          <Link href="/privacy#rights">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
