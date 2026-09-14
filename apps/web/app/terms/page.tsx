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

const TITLE = "Terms of Service";
const DESCRIPTION =
  "The terms that apply when you use Kitchyn: restaurant storefronts, the merchant dashboard and the Kitchyn Merchant app.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/terms", type: "website" },
};

/*
 * These Terms are the "Terms and Conditions published on the Platform"
 * referred to in clause 1.3 of the Kitchyn Merchant Agreement, and section 8 is
 * the "published refund policy" referred to in clause 5.3. The Agreement
 * prevails over these Terms for merchants — do not add anything here that
 * contradicts it.
 */

const TOC: TocItem[] = [
  { id: "about", label: "About these Terms" },
  { id: "kitchyn-role", label: "What Kitchyn does" },
  { id: "accounts", label: "Accounts and security" },
  { id: "merchants", label: "Merchants and their staff" },
  { id: "ordering", label: "Ordering from a storefront" },
  { id: "payment", label: "Prices and payment" },
  { id: "delivery", label: "Delivery and pickup" },
  { id: "cancellations-refunds", label: "Cancellations and refunds" },
  { id: "food-safety", label: "Food, allergens and product responsibility" },
  { id: "promotions", label: "Promotions and discounts" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "content-ip", label: "Content and intellectual property" },
  { id: "third-parties", label: "Third-party services" },
  { id: "availability", label: "Availability and changes to the Platform" },
  { id: "liability", label: "Our liability" },
  { id: "indemnity", label: "Your responsibility for misuse" },
  { id: "suspension", label: "Suspension and termination" },
  { id: "privacy", label: "Privacy" },
  { id: "disputes", label: "Governing law and disputes" },
  { id: "changes", label: "Changes to these Terms" },
  { id: "general", label: "General" },
  { id: "contact", label: "Contact us" },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title={TITLE}
      lastUpdated={LEGAL_EFFECTIVE_DATE}
      toc={TOC}
      intro={
        <>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the Kitchyn platform: the
            kitchyn.app website, restaurant storefronts hosted by Kitchyn, the merchant web dashboard,
            the <strong>Kitchyn Merchant</strong> mobile app, and related services (together, the
            &ldquo;Platform&rdquo;). The Platform is operated by {KITCHYN_COMPANY.legalName}{" "}
            (&ldquo;Kitchyn&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).
          </p>
          <p>
            By using the Platform, you agree to these Terms. If you do not agree, please do not use
            the Platform. Effective date: {LEGAL_EFFECTIVE_DATE}.
          </p>
        </>
      }
    >
      <LegalSection id="about" number={1} title="About these Terms">
        <p>These Terms apply to two groups of users:</p>
        <ul>
          <li>
            <strong>Merchants</strong>: restaurants, food vendors and other businesses that sell
            through the Platform, and the owners and staff who use merchant accounts on their behalf.
          </li>
          <li>
            <strong>Customers</strong>: anyone who browses a storefront or places an order with a
            merchant through the Platform, with or without an account.
          </li>
        </ul>
        <p>
          In these Terms, &ldquo;Order&rdquo; means a request placed through the Platform to buy food,
          drinks or other products (&ldquo;Products&rdquo;) from a merchant. Our{" "}
          <Link href="/privacy">Privacy Policy</Link> explains how we handle personal data and forms
          part of these Terms.
        </p>
      </LegalSection>

      <LegalSection id="kitchyn-role" number={2} title="What Kitchyn does">
        <p>
          Kitchyn provides technology that enables merchants to run online storefronts, receive and
          manage Orders, accept payments through Kitchyn&apos;s payment partners and, where selected,
          access delivery coordination.
        </p>
        <ul>
          <li>
            <strong>The merchant is the seller.</strong> When you place an Order, the contract for the
            sale of the Products is between you and the merchant. Kitchyn is not the seller of the
            Products and is not a party to that contract of sale.
          </li>
          <li>
            <strong>Kitchyn is a technology facilitator and the merchant&apos;s limited payment
            collection agent.</strong> When you pay for an Order through the Platform, Kitchyn collects
            the payment on the merchant&apos;s behalf, and a successful payment to Kitchyn fully
            discharges your obligation to pay the merchant for that Order.
          </li>
          <li>
            Merchants control their own Products, menus, prices, availability, opening hours and
            branding.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="accounts" number={3} title="Accounts and security">
        <ul>
          <li>You must give accurate, complete and up-to-date information and keep it current.</li>
          <li>
            You are responsible for keeping your login details confidential and for all activity under
            your account. Tell us immediately at <SupportEmailLink /> if you suspect unauthorised use.
          </li>
          <li>
            Merchant accounts are for adults (18 or over) who are authorised to act for the business.
          </li>
          <li>
            If you forget your password, you can reset it at{" "}
            our <Link href="/forgot-password">password reset page</Link>.
          </li>
          <li>
            You can ask us to close your account at any time. See{" "}
            <Link href="/delete-account">Delete your account</Link>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="merchants" number={4} title="Merchants and their staff">
        <p>
          <strong>
            A merchant&apos;s use of the Platform is governed by the Kitchyn Merchant Agreement signed
            with Kitchyn, together with its Fee Schedule, these Terms and our Privacy Policy. If
            anything in these Terms conflicts with the Merchant Agreement, the Merchant Agreement
            prevails.
          </strong>
        </p>
        <p>
          The Merchant Agreement covers, among other things, fees and subscription charges, collection
          and remittance of merchant proceeds, set-off and reserves, refunds and deductions, delivery
          and transfer of risk, promotions, data protection, suspension and termination. Nothing in
          these Terms reduces a merchant&apos;s obligations under it.
        </p>
        <p>In addition, merchants and their staff must:</p>
        <ul>
          <li>
            keep business, menu, pricing, allergen and availability information accurate and up to
            date;
          </li>
          <li>
            use customer information received through the Platform only to fulfil the relevant Order,
            not sell or disclose it to anyone else, and not use it to market to customers outside the
            Platform;
          </li>
          <li>
            ensure that staff accounts are given only to people authorised to act for the business,
            and remove access promptly when someone leaves. Merchants are responsible for the acts and
            omissions of their staff on the Platform; and
          </li>
          <li>comply with all applicable laws, including food safety, consumer protection, tax and data protection laws.</li>
        </ul>
      </LegalSection>

      <LegalSection id="ordering" number={5} title="Ordering from a storefront">
        <ul>
          <li>
            Placing an Order is an offer to buy Products from the merchant. The Order is accepted when
            it has been successfully paid for (or otherwise confirmed on the Platform) and the merchant
            has not declined it.
          </li>
          <li>
            Please check your Order, contact details, delivery address and any scheduled time before
            you pay. You are responsible for giving a correct address and a phone number on which you
            can be reached.
          </li>
          <li>
            Menu items, photos and descriptions are provided by the merchant. Products may become
            unavailable, and a merchant may decline or cancel an Order it cannot fulfil (for example if
            an item is out of stock, or a scheduled slot can no longer be met). If that happens after
            you have paid, you will be refunded for the part of the Order that is not fulfilled.
          </li>
          <li>
            A merchant may send you a link to review and pay for an Order it has prepared for you. The
            same Terms apply to Orders paid through such links.
          </li>
          <li>
            Estimated preparation, pickup and delivery times are estimates only and are not
            guaranteed.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="payment" number={6} title="Prices and payment">
        <ul>
          <li>
            Prices are set by the merchant and shown in Nigerian Naira (₦). Your checkout shows the
            total you will pay, including any delivery fee, service fee, VAT or discount that applies,
            before you pay.
          </li>
          <li>
            Payments are processed by Kitchyn&apos;s payment partners (such as Paystack and Monnify).
            Your card or bank details are entered with, and handled by, those partners. Kitchyn does not
            store your full card details. Their terms may also apply to your payment.
          </li>
          <li>
            Payments are subject to verification and fraud checks. We or our payment partners may
            decline or reverse a payment that appears fraudulent or unauthorised.
          </li>
          <li>
            If money leaves your account but your Order is not confirmed, contact{" "}
            <SupportEmailLink subject="Payment not confirmed" /> with your payment reference and we will
            investigate.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="delivery" number={7} title="Delivery and pickup">
        <ul>
          <li>
            Orders may be delivered by riders arranged by Kitchyn (including through third-party
            ride and logistics providers), delivered by the merchant or its own riders, or collected by
            you, depending on the options the merchant offers.
          </li>
          <li>
            Delivery fees are shown at checkout and depend on factors such as distance and delivery
            method.
          </li>
          <li>
            Please be available at the delivery address and reachable on your phone. If a delivery
            cannot be completed because the address was incorrect or you could not be reached, a refund
            may not be available.
          </li>
          <li>
            For pickup Orders, please collect your Order at the time shown. Food left uncollected for
            an unreasonable time may be disposed of, and a refund may not be available.
          </li>
          <li>
            If an Order delivered by a rider arranged by Kitchyn is lost, damaged or not delivered after
            the rider collected it, contact us and we will arrange an appropriate remedy, such as a
            refund or replacement.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="cancellations-refunds" number={8} title="Cancellations and refunds">
        <p>
          This section is Kitchyn&apos;s published refund policy. It applies to Orders placed through
          the Platform.
        </p>
        <ul>
          <li>
            <strong>Cancelling:</strong> because food is prepared to order, you may not be able to
            cancel once the merchant has accepted or started preparing your Order. If you need to
            cancel, contact the merchant as soon as possible. Scheduled Orders may be cancellable
            before preparation starts, at the merchant&apos;s discretion.
          </li>
          <li>
            <strong>Problems with an Order:</strong> if items are missing, incorrect, damaged, unsafe
            or significantly delayed, contact the merchant first. If it isn&apos;t resolved, email{" "}
            <SupportEmailLink subject="Order problem" /> within a reasonable time (ideally within 24
            hours) with your order number, a description and, where possible, photos.
          </li>
          <li>
            <strong>How we handle complaints:</strong> merchants authorise Kitchyn to investigate
            customer complaints and, acting reasonably, to issue refunds, credits or replacements on
            their behalf. We may ask for information to assess a complaint.
          </li>
          <li>
            <strong>Refund method:</strong> approved refunds are made to the original payment method.
            The time it takes for the money to reach you depends on your bank or payment provider.
          </li>
          <li>
            Refunds are not normally available where you change your mind after preparation has begun,
            where a delivery fails because of incorrect details you provided, or for matters of personal
            taste.
          </li>
        </ul>
        <p>
          Nothing in this section affects any rights you have under the Federal Competition and
          Consumer Protection Act, 2018 or other laws that cannot be excluded.
        </p>
      </LegalSection>

      <LegalSection id="food-safety" number={9} title="Food, allergens and product responsibility">
        <ul>
          <li>
            The merchant is responsible for the quality, safety, preparation, packaging, labelling,
            ingredient and allergen information, and legality of its Products.
          </li>
          <li>
            If you have a food allergy or dietary requirement, contact the merchant before ordering to
            confirm that a Product is suitable. Add relevant notes to your Order, but do not rely on
            notes alone. Kitchyn cannot guarantee that any Product is free from allergens.
          </li>
          <li>
            Where a merchant sells age-restricted Products, it is the merchant&apos;s responsibility to
            comply with the law, and you may be asked for proof of age.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="promotions" number={10} title="Promotions and discounts">
        <p>
          Discount codes, free-delivery offers, loyalty rewards and other promotions are subject to
          their stated conditions (such as minimum order value, delivery area, validity period or usage
          limits). They have no cash value, cannot be exchanged, and may be changed or withdrawn at any
          time, but not for Orders already placed. We may refuse or reverse a promotion that was used
          fraudulently or in breach of its conditions.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" number={11} title="Acceptable use">
        <p>You must not:</p>
        <ul>
          <li>use the Platform for any unlawful, fraudulent or deceptive purpose, including placing fake Orders or making unauthorised payments;</li>
          <li>harass, threaten or abuse merchants, their staff, riders, customers or Kitchyn staff;</li>
          <li>upload content that is unlawful, misleading, infringing, offensive or harmful;</li>
          <li>
            interfere with or disrupt the Platform, attempt to gain unauthorised access to any account,
            system or data, or bypass security or rate limits;
          </li>
          <li>
            scrape, copy, reverse-engineer or resell any part of the Platform, except as allowed by law
            or with our written permission; or
          </li>
          <li>use another person&apos;s account or personal data without permission.</li>
        </ul>
      </LegalSection>

      <LegalSection id="content-ip" number={12} title="Content and intellectual property">
        <ul>
          <li>
            The Platform, including the Kitchyn name, logo, software, design and databases, is owned by
            Kitchyn or its licensors. We grant you a limited, revocable, non-exclusive, non-transferable
            right to use the Platform in line with these Terms. No ownership rights are transferred to
            you.
          </li>
          <li>
            Merchants keep ownership of their names, logos, menus, images and other content they upload,
            and license it to Kitchyn as set out in the Merchant Agreement.
          </li>
          <li>
            If you submit a review, rating or other content, you give Kitchyn and the relevant merchant a
            non-exclusive, royalty-free licence to display it on the Platform in connection with that
            merchant. You must have the right to share it.
          </li>
          <li>
            We may remove content or listings that we reasonably consider unlawful, unsafe, misleading,
            infringing or harmful.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="third-parties" number={13} title="Third-party services">
        <p>
          The Platform relies on third-party services such as payment processors, maps, messaging and
          ride or delivery providers. Your use of those services may be subject to their own terms. We
          are not responsible for third-party websites or services that we do not control, although this
          does not limit our responsibilities under section 7 for deliveries we arrange.
        </p>
      </LegalSection>

      <LegalSection id="availability" number={14} title="Availability and changes to the Platform">
        <p>
          We work to keep the Platform available and secure, but it may sometimes be unavailable because
          of maintenance, technical failures, or events beyond our reasonable control (such as failures
          of internet, power or telecommunications networks). We may change, add or remove features from
          time to time. The mobile app may require updates to keep working.
        </p>
      </LegalSection>

      <LegalSection id="liability" number={15} title="Our liability">
        <ul>
          <li>
            Nothing in these Terms excludes or limits liability for death or personal injury caused by
            negligence, for fraud or fraudulent misrepresentation, or any other liability that cannot be
            excluded or limited under applicable law, including your statutory rights as a consumer.
          </li>
          <li>
            Subject to the point above and to the fullest extent permitted by law, Kitchyn is not liable
            for: (a) indirect, incidental, special or consequential losses, including loss of profit,
            revenue, goodwill or business opportunity; (b) service interruptions, technical failures or
            downtime; (c) the acts or omissions of merchants, including the quality, safety or
            preparation of Products, or disputes between a merchant and a customer, except as stated in
            section 7 for deliveries arranged by Kitchyn; or (d) losses caused by your failure to keep
            your account secure.
          </li>
          <li>
            <strong>Customers:</strong> subject to the first point in this section, our total liability
            to you for any claim relating to an Order is limited to the amount you paid for that Order.
          </li>
          <li>
            <strong>Merchants:</strong> Kitchyn&apos;s liability to merchants is set out in, and limited
            by, the Merchant Agreement.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="indemnity" number={16} title="Your responsibility for misuse">
        <p>
          To the extent permitted by law, you are responsible for, and agree to compensate Kitchyn for,
          reasonable losses, costs and claims that arise from your fraud, your unlawful use of the
          Platform, or your breach of these Terms. Merchants&apos; indemnity obligations are set out in
          the Merchant Agreement.
        </p>
      </LegalSection>

      <LegalSection id="suspension" number={17} title="Suspension and termination">
        <ul>
          <li>
            You may stop using the Platform at any time and ask us to close your account (see{" "}
            <Link href="/delete-account">Delete your account</Link>).
          </li>
          <li>
            We may suspend or restrict access to the Platform, cancel Orders, or close accounts where we
            reasonably suspect fraud, unlawful activity, a food safety risk or a serious breach of these
            Terms, or where required by law or a competent authority.
          </li>
          <li>
            For merchants, suspension and termination (including notice periods, payouts, reserves and
            outstanding fees) are governed by the Merchant Agreement.
          </li>
          <li>
            Provisions that by their nature should continue after termination (such as those on
            liability, intellectual property, disputes and payments owed) continue to apply.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="privacy" number={18} title="Privacy">
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains what personal data we collect, how we
          use and share it, and your rights under the Nigeria Data Protection Act, 2023. Kitchyn and each
          merchant act as independent data controllers for the personal data each processes for its own
          purposes.
        </p>
      </LegalSection>

      <LegalSection id="disputes" number={19} title="Governing law and disputes">
        <ul>
          <li>These Terms are governed by the laws of the Federal Republic of Nigeria.</li>
          <li>
            If you have a complaint, please contact us first at <SupportEmailLink />. We will try to
            resolve it amicably through good-faith discussion, and ask that you give us at least 14 days
            to do so.
          </li>
          <li>
            Any dispute that is not resolved amicably shall be referred to and finally resolved by
            arbitration under the Arbitration and Mediation Act, 2023, by a sole arbitrator. The seat of
            arbitration is Abuja, Nigeria, and the language is English.
          </li>
          <li>
            This does not prevent either party from seeking urgent injunctive or other interim relief
            from a court of competent jurisdiction. It also does not limit a customer&apos;s right to
            complain to the Federal Competition and Consumer Protection Commission, the Nigeria Data
            Protection Commission, or any other regulator, or any other right that cannot be excluded by
            law.
          </li>
          <li>
            For merchants, disputes are resolved as set out in the Merchant Agreement, which prevails.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="changes" number={20} title="Changes to these Terms">
        <p>
          We may update these Terms from time to time to reflect changes in our services, business or
          the law. We will update the &ldquo;Last updated&rdquo; date above. For material changes, we
          will give merchants at least 14 days&apos; notice by email and/or through the merchant
          dashboard, as the Merchant Agreement requires. Changes do not apply to Orders already placed.
          If you continue to use the Platform after a change takes effect, you accept the updated Terms.
          If you do not accept them, you should stop using the Platform.
        </p>
      </LegalSection>

      <LegalSection id="general" number={21} title="General">
        <ul>
          <li>
            If any provision of these Terms is found invalid or unenforceable, it will be modified to the
            minimum extent needed to make it enforceable (or removed), and the rest will remain in effect.
          </li>
          <li>If we do not enforce a right straight away, we have not waived it.</li>
          <li>
            You may not transfer your rights under these Terms without our consent. We may transfer ours
            to an affiliate or in connection with a merger, acquisition, reorganisation or sale of our
            business.
          </li>
          <li>
            Nothing in these Terms creates a partnership, joint venture or employment relationship between
            you and Kitchyn.
          </li>
          <li>
            For customers, these Terms and our Privacy Policy are the entire agreement between you and
            Kitchyn about the Platform. For merchants, the entire agreement consists of the Merchant
            Agreement, its Fee Schedule, these Terms and our Privacy Policy, with the Merchant Agreement
            prevailing in any conflict.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="contact" number={22} title="Contact us">
        <p>
          {KITCHYN_COMPANY.legalName}
          <br />
          {KITCHYN_COMPANY.address}
          <br />
          Email: <SupportEmailLink subject="Question about the Terms of Service" />
        </p>
        <p>
          For help with an account or Order, visit our <Link href="/support">Support page</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
