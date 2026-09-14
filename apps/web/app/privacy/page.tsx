import type { Metadata } from "next";
import Link from "next/link";
import {
  KITCHYN_COMPANY,
  LEGAL_EFFECTIVE_DATE,
  LegalPage,
  LegalSection,
  SupportEmailLink,
  type TocItem,
} from "../_components/legal-page";

const TITLE = "Privacy Policy";
const DESCRIPTION =
  "How Kitchyn Technologies Limited collects, uses, shares and protects personal data across Kitchyn storefronts, the merchant dashboard and the Kitchyn Merchant app.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/privacy", type: "website" },
};

/*
 * Service providers below were verified against the codebase on 2026-09-14
 * (package.json deps, env vars, API routes and supabase/functions). Keep this
 * list in step with the code: add a provider here BEFORE shipping an
 * integration that sends it personal data.
 */

const TOC: TocItem[] = [
  { id: "who-we-are", label: "Who we are" },
  { id: "roles", label: "Our role and restaurants’ role" },
  { id: "information-we-collect", label: "Information we collect" },
  { id: "mobile-app", label: "The Kitchyn Merchant app" },
  { id: "how-we-use", label: "How we use information" },
  { id: "sharing", label: "Who we share information with" },
  { id: "service-providers", label: "Our service providers" },
  { id: "transfers", label: "International transfers" },
  { id: "retention", label: "How long we keep information" },
  { id: "security", label: "Security" },
  { id: "rights", label: "Your rights" },
  { id: "cookies", label: "Cookies and similar technologies" },
  { id: "children", label: "Children" },
  { id: "account-deletion", label: "Deleting your account" },
  { id: "changes", label: "Changes to this policy" },
  { id: "contact", label: "Contact us" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title={TITLE}
      lastUpdated={LEGAL_EFFECTIVE_DATE}
      toc={TOC}
      intro={
        <>
          <p>
            This Privacy Policy explains how {KITCHYN_COMPANY.legalName} (&ldquo;Kitchyn&rdquo;,
            &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, shares and protects personal data
            when you use the Kitchyn platform: restaurant storefronts (for example{" "}
            <em>restaurant-name</em>.kitchyn.app), the kitchyn.app website, the merchant web
            dashboard, and the <strong>Kitchyn Merchant</strong> mobile app for iOS and Android
            (together, the &ldquo;Platform&rdquo;).
          </p>
          <p>Effective date: {LEGAL_EFFECTIVE_DATE}.</p>
        </>
      }
    >
      <LegalSection id="who-we-are" number={1} title="Who we are">
        <p>
          Kitchyn is operated by {KITCHYN_COMPANY.legalName}, a private limited liability company
          incorporated under the Companies and Allied Matters Act, 2020, with its registered address
          at {KITCHYN_COMPANY.address}.
        </p>
        <p>
          We process personal data in line with the Nigeria Data Protection Act, 2023 and the
          regulations and guidance issued under it (the &ldquo;NDPA&rdquo;). Where the EU or UK
          General Data Protection Regulation (&ldquo;GDPR&rdquo;) applies, for example to a customer
          located in the EU or UK, we also process personal data in line with the GDPR.
        </p>
        <p>
          You can contact us about this policy or your personal data at <SupportEmailLink />.
        </p>
      </LegalSection>

      <LegalSection id="roles" number={2} title="Our role and restaurants’ role">
        <p>
          Kitchyn provides technology that lets restaurants and food businesses
          (&ldquo;merchants&rdquo;) run online storefronts, take orders and accept payments. When you
          order from a storefront, <strong>you are buying from the merchant</strong>. Kitchyn is the
          technology provider and collects payment on the merchant&apos;s behalf.
        </p>
        <ul>
          <li>
            <strong>Kitchyn</strong> is a data controller for the personal data it processes to run
            the Platform, including account data, order and payment records, and analytics.
          </li>
          <li>
            <strong>Each merchant</strong> is a separate, independent data controller for the
            customer information it receives to fulfil orders (such as your name, phone number and
            delivery address). Under our agreement with merchants, they may use that information
            only to fulfil your order, must not sell or disclose it to third parties, and must delete
            it when it is no longer needed for fulfilment or legal compliance.
          </li>
        </ul>
        <p>
          For how a merchant handles your information outside the Platform, please contact that
          merchant directly.
        </p>
      </LegalSection>

      <LegalSection id="information-we-collect" number={3} title="Information we collect">
        <h3>3.1 Merchants and their staff</h3>
        <ul>
          <li>
            <strong>Account details:</strong> name, email address, phone number, role (owner or
            staff) and password. Passwords are stored in hashed form by our authentication provider,
            and we cannot see them.
          </li>
          <li>
            <strong>Business details:</strong> restaurant or trading name, legal status and
            registration details, business address and map location, contact and WhatsApp numbers,
            opening hours, delivery settings, logo and storefront branding.
          </li>
          <li>
            <strong>Bank and payout details:</strong> bank name, account name and account number,
            used to pay merchant proceeds, together with settlement, payout, fee and refund records.
          </li>
          <li>
            <strong>Agreement records:</strong> the name, email address and signature details of the
            person who signs the Kitchyn Merchant Agreement electronically.
          </li>
          <li>
            <strong>Menu and storefront content:</strong> menu items, descriptions, prices and images
            you upload.
          </li>
          <li>
            <strong>Orders and operations:</strong> orders received, status updates, dispatch and
            delivery records, promotions, and support requests you send us.
          </li>
          <li>
            <strong>Security and activity records:</strong> sign-in events and a log of changes made
            in the merchant account (for example, who changed bank details or menu prices, and when),
            kept to protect accounts and investigate problems.
          </li>
        </ul>

        <h3>3.2 Customers ordering from a storefront</h3>
        <ul>
          <li>
            <strong>Contact details:</strong> name, phone number and, if you provide it, email
            address.
          </li>
          <li>
            <strong>Delivery details:</strong> delivery address, address details and map coordinates
            used to calculate delivery fees and direct riders, plus any saved addresses.
          </li>
          <li>
            <strong>Order details:</strong> items ordered, notes and special requests, scheduled
            times, order history, and any ratings, reviews or loyalty stamps.
          </li>
          <li>
            <strong>Payment information:</strong> payment status, amount, method type and transaction
            reference. <strong>Card and bank credentials are entered with and handled by our payment
            processors. Kitchyn does not receive or store your full card number, CVV or PIN.</strong>
          </li>
        </ul>
        <p>
          Special instructions may include allergy or dietary information. Please include only what
          the restaurant needs to prepare your order safely. We use it only to pass it to the
          restaurant for that order.
        </p>

        <h3>3.3 People who contact us or request a demo</h3>
        <p>
          Name, business name, contact details and the content of your message when you request a
          demo, email us or otherwise contact us.
        </p>

        <h3>3.4 Device, usage and diagnostic information</h3>
        <p>
          When you use the Platform we automatically collect technical information such as IP
          address, browser or device type, operating system, app version, pages or screens viewed,
          features used, and error and crash reports. For signed-in merchant users this can be linked
          to your account email address. At checkout it can be linked to the phone number you
          provide.
        </p>
      </LegalSection>

      <LegalSection id="mobile-app" number={4} title="The Kitchyn Merchant app">
        <p>
          The Kitchyn Merchant app is for restaurant owners and staff. In addition to the information
          described above:
        </p>
        <ul>
          <li>
            <strong>Photo library (optional):</strong> the app accesses your photos only when you
            choose to upload an image for a menu item or your store profile, and only the images you
            select are uploaded.
          </li>
          <li>
            <strong>Push notifications (optional):</strong> if you allow notifications, we store a
            device push token and your device platform (iOS or Android) so we can alert you to new and
            scheduled orders. You can turn notifications off at any time in your device settings.
          </li>
          <li>
            <strong>Diagnostics and analytics:</strong> we collect crash reports and app usage
            analytics, linked to your account email address, to fix problems and improve the app.
          </li>
          <li>
            <strong>Sign-in:</strong> your session is stored securely on your device (in the iOS
            Keychain or Android Keystore-backed secure storage).
          </li>
        </ul>
        <p>
          The app does <strong>not</strong> access your camera, microphone, location, or contacts. It
          does not show advertising, does not track you across other companies&apos; apps or
          websites, and we do not sell your personal data.
        </p>
      </LegalSection>

      <LegalSection id="how-we-use" number={5} title="How we use information and our lawful bases">
        <p>Under the NDPA (and the GDPR where it applies) we rely on the following lawful bases:</p>
        <ul>
          <li>
            <strong>Performance of a contract:</strong> creating and running merchant accounts;
            providing storefronts; taking, routing and tracking orders; collecting payments on a
            merchant&apos;s behalf; arranging delivery; paying merchant proceeds; sending order and
            account messages (by SMS, WhatsApp, email and push notification); and providing support.
          </li>
          <li>
            <strong>Legal obligation:</strong> keeping financial, tax and transaction records;
            responding to lawful requests from regulators, courts and law enforcement; and meeting
            data protection obligations.
          </li>
          <li>
            <strong>Legitimate interests</strong> (balanced against your rights): keeping the Platform
            secure; preventing and investigating fraud, chargebacks and misuse; maintaining audit
            logs; diagnosing errors; measuring and improving how the Platform is used; resolving
            complaints and disputes; and enforcing our terms.
          </li>
          <li>
            <strong>Consent:</strong> push notifications and photo-library access on your device, and
            any other processing where we ask for your consent. You can withdraw consent at any time,
            which will not affect processing that took place before you withdrew it.
          </li>
          <li>
            <strong>Vital interests:</strong> in rare cases, where needed to protect someone&apos;s
            life or physical safety.
          </li>
        </ul>
        <p>
          We do not sell personal data, we do not use it for third-party advertising, and we do not
          make decisions that produce legal or similarly significant effects about you based solely on
          automated processing.
        </p>
      </LegalSection>

      <LegalSection id="sharing" number={6} title="Who we share information with">
        <ul>
          <li>
            <strong>Merchants:</strong> the restaurant you order from receives the information
            reasonably needed to fulfil your order, such as your name, phone number, delivery address,
            items and special instructions.
          </li>
          <li>
            <strong>Delivery riders:</strong> for deliveries we arrange, the rider (including riders
            booked through a ride-hailing provider) receives the pickup location, delivery address,
            recipient name, contact phone number and order number so they can collect and deliver the
            order.
          </li>
          <li>
            <strong>Service providers</strong> who process data on our instructions to run the
            Platform. See section 7.
          </li>
          <li>
            <strong>Authorities and professional advisers</strong> where required by law or needed to
            establish, exercise or defend legal claims, or to protect the rights, property or safety of
            Kitchyn, merchants, customers or others.
          </li>
          <li>
            <strong>A successor business</strong> if Kitchyn is involved in a merger, acquisition,
            reorganisation or sale of assets, subject to this policy.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="service-providers" number={7} title="Our service providers">
        <p>We use the following providers to operate the Platform:</p>
        <ul>
          <li>
            <strong>Supabase:</strong> database, user authentication, file storage (such as menu
            images) and server functions.
          </li>
          <li>
            <strong>Vercel:</strong> website and API hosting, and privacy-friendly, cookieless page-view
            analytics.
          </li>
          <li>
            <strong>Paystack</strong> and <strong>Monnify</strong>: payment processing for customer
            orders, and bank transfers of merchant payouts (which requires sharing merchant bank
            account details).
          </li>
          <li>
            <strong>DocuSeal:</strong> electronic signing of the Kitchyn Merchant Agreement.
          </li>
          <li>
            <strong>Sentry:</strong> error and crash diagnostics for the website and the Kitchyn
            Merchant app. Reports can include IP address, device and browser details, and the
            signed-in user.
          </li>
          <li>
            <strong>PostHog</strong> (EU hosting): product analytics on the website, dashboard and
            Kitchyn Merchant app.
          </li>
          <li>
            <strong>Expo</strong>, <strong>Firebase Cloud Messaging</strong> (Google) and{" "}
            <strong>Apple Push Notification service</strong>: delivery of push notifications to the
            Kitchyn Merchant app, using your device push token.
          </li>
          <li>
            <strong>SendChamp:</strong> SMS messages, such as order updates to customers and order
            alerts to merchants.
          </li>
          <li>
            <strong>WhatsApp</strong> (Meta): new-order alerts to merchants&apos; WhatsApp numbers.
          </li>
          <li>
            <strong>Resend:</strong> transactional email, such as order and settlement emails to
            merchants and account emails.
          </li>
          <li>
            <strong>Google Maps Platform:</strong> address search, geocoding and distance calculation
            for delivery addresses and delivery fees. Pages also load fonts from Google Fonts, which
            receives your IP address.
          </li>
          <li>
            <strong>Bolt:</strong> booking delivery rides. Bolt receives the pickup and drop-off
            locations, recipient name, contact phone number and order reference.
          </li>
          <li>
            <strong>Telegram:</strong> internal operations alerts to the Kitchyn team, which can
            include order and delivery details (such as customer name, phone number and delivery
            address) needed to coordinate dispatch.
          </li>
        </ul>
        <p>
          Providers are permitted to use personal data only to provide their services to us or as
          required by law. Payment processors and ride providers may also process data as independent
          controllers under their own privacy policies.
        </p>
      </LegalSection>

      <LegalSection id="transfers" number={8} title="International transfers">
        <p>
          Some of our service providers store or process data outside Nigeria, including in the
          European Union and the United States. Where personal data is transferred outside Nigeria, we
          do so in line with the NDPA, for example where the destination offers an adequate level of
          protection, or on the basis of appropriate safeguards such as contractual commitments,
          or another basis permitted by law.
        </p>
      </LegalSection>

      <LegalSection id="retention" number={9} title="How long we keep information">
        <ul>
          <li>
            <strong>Account data</strong> is kept while the account is active, and deleted within 30
            days after a valid deletion request, subject to the exceptions below.
          </li>
          <li>
            <strong>Order, payment, payout and settlement records</strong> are kept for as long as
            applicable law requires (including tax and accounting law), and at least for the period
            after a merchant&apos;s agreement ends during which chargebacks, refunds and other
            liabilities can still arise under the Kitchyn Merchant Agreement.
          </li>
          <li>
            <strong>Signed agreements and dispute records</strong> are kept for as long as needed to
            establish, exercise or defend legal claims.
          </li>
          <li>
            <strong>Device push tokens</strong> are kept while you use the app with notifications
            enabled, and deleted with your account.
          </li>
          <li>
            <strong>Diagnostic and analytics data</strong> is kept for limited periods set in our
            providers&apos; tools, and may be retained longer only in anonymised or aggregated form.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="security" number={10} title="Security">
        <p>
          We use appropriate technical and organisational measures to protect personal data,
          including encryption in transit (HTTPS), hashed passwords, database access controls that
          limit each user to their own restaurant&apos;s data, restricted access for our staff, secure
          session storage on mobile devices, and audit logging of sensitive changes such as bank
          details. No system is completely secure. If a personal data breach occurs that is likely to
          put your rights at risk, we will notify the Nigeria Data Protection Commission and, where
          required, affected people, as the NDPA requires.
        </p>
        <p>
          Merchants are responsible for keeping their login details confidential and for the activity
          of their staff accounts.
        </p>
      </LegalSection>

      <LegalSection id="rights" number={11} title="Your rights">
        <p>Subject to the conditions and exceptions in the NDPA (and the GDPR where it applies), you have the right to:</p>
        <ul>
          <li>be informed about how your personal data is used, which this policy does;</li>
          <li>access the personal data we hold about you and receive a copy;</li>
          <li>have inaccurate or incomplete personal data corrected;</li>
          <li>have your personal data erased;</li>
          <li>restrict or object to our processing, including processing based on legitimate interests;</li>
          <li>
            receive personal data you provided to us in a commonly used, machine-readable format and
            have it sent to another controller (data portability);
          </li>
          <li>withdraw consent at any time where we rely on consent; and</li>
          <li>not be subject to decisions based solely on automated processing that significantly affect you.</li>
        </ul>
        <p>
          To exercise these rights, email <SupportEmailLink subject="Data protection request" /> from
          the email address or with the phone number linked to your account or orders. We may need to
          verify your identity before acting on a request. For customer information held by a
          restaurant, you can also contact the restaurant directly.
        </p>
        <p>
          If you are not satisfied with how we have handled your personal data, you have the right to
          lodge a complaint with the <strong>Nigeria Data Protection Commission</strong> (NDPC). If you
          are in the EU or UK, you can also complain to your local data protection authority.
        </p>
      </LegalSection>

      <LegalSection id="cookies" number={12} title="Cookies and similar technologies">
        <p>
          We use cookies and similar browser storage that are needed to keep you signed in to the
          merchant dashboard and to remember things like your basket on a storefront. We also use
          PostHog analytics, which can store an identifier in your browser, to understand how the
          Platform is used. Vercel page-view analytics does not use cookies. You can clear or block
          cookies in your browser settings, but parts of the Platform (such as signing in) may not work
          without them.
        </p>
      </LegalSection>

      <LegalSection id="children" number={13} title="Children">
        <p>
          The Platform is not directed at children under 18, and merchant accounts are only for adults
          acting for a business. We do not knowingly collect personal data from children. If you
          believe a child has given us personal data, contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection id="account-deletion" number={14} title="Deleting your account">
        <p>
          You can request deletion of your account in the Kitchyn Merchant app or by email. Customers
          can also ask us to delete their order data. See{" "}
          <Link href="/delete-account">Delete your account</Link> for step-by-step instructions, what
          we delete, and what we must keep.
        </p>
      </LegalSection>

      <LegalSection id="changes" number={15} title="Changes to this policy">
        <p>
          We may update this policy from time to time. We will change the &ldquo;Last updated&rdquo;
          date at the top and, for material changes, give merchants notice by email and/or through the
          merchant dashboard as set out in the Kitchyn Merchant Agreement. Where the law requires your
          consent to a change, we will ask for it.
        </p>
      </LegalSection>

      <LegalSection id="contact" number={16} title="Contact us">
        <p>
          {KITCHYN_COMPANY.legalName}
          <br />
          {KITCHYN_COMPANY.address}
          <br />
          Email: <SupportEmailLink subject="Privacy question" />
        </p>
      </LegalSection>
    </LegalPage>
  );
}
