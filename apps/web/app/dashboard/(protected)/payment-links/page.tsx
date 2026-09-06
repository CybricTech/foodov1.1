import { PaymentLinksClient } from "@/components/dashboard/payment-links-client";

// ?new=1 comes from the Orders header's "Create order", which should land on
// the builder itself rather than making staff click through the list first.
export default function PaymentLinksPage({ searchParams }: { searchParams: { new?: string } }) {
  return <PaymentLinksClient startCreating={searchParams.new === "1"} />;
}
