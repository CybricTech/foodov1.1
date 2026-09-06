"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, X, Copy, Send, Link2, RefreshCw } from "lucide-react";
import { formatKobo, pricePaymentLinkItems, type MerchantPaymentLinksData, type PaymentLinkLine, type PaymentLinkMenuItem } from "@foodo/utils";

const inputClass = "w-full rounded-xl border border-black-200 bg-white px-3 py-2.5 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10";
const statusLabel = { awaiting_payment: "Awaiting payment", payment_started: "Payment started", payment_failed: "Payment failed", paid: "Paid", cancelled: "Cancelled", expired: "Expired" };
/** Still usable: the customer can pay (or pay again) and staff can still cancel. */
const isOpen = (status: keyof typeof statusLabel) => status === "awaiting_payment" || status === "payment_failed";

export function PaymentLinksClient({ frontline = false, startCreating = false }: { frontline?: boolean; startCreating?: boolean }) {
  const [data, setData] = useState<MerchantPaymentLinksData | null>(null);
  const [creating, setCreating] = useState(startCreating);
  const [lines, setLines] = useState<PaymentLinkLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PaymentLinkMenuItem | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const requestKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const base = frontline ? "/dashboard/frontline" : "/dashboard";
  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard/payment-links", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load payment links.");
    setData(payload);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => { if (!document.hidden) void refresh().catch(() => {}); }, 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function create() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/dashboard/payment-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestKey: requestKey.current, customerName, items: lines }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create the link.");
      setCreating(false); setLines([]); setCustomerName(""); requestKey.current = null;
      setNotice("Your payment link is ready. Copy it or share it on WhatsApp below.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create the link."); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function cancel(id: string) {
    setError(""); setBusy(true);
    try {
      const response = await fetch(`/api/dashboard/payment-links/${id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to cancel the link."); }
    finally { setBusy(false); }
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setNotice("Payment link copied."); }
    catch { setError("Copy the link from the text field below."); }
  }
  const subtotal = lines.reduce((sum, line) => sum + line.priceKobo * line.quantity, 0);
  return <div className="min-h-screen bg-black-50">
    <header className="border-b border-black-100 bg-white px-5 py-5 md:px-8">
      <Link href={`${base}/orders`} className="mb-4 inline-flex items-center gap-1 text-sm text-black-500"><ArrowLeft size={16} /> Orders</Link>
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight">Payment links</h1><p className="mt-1 text-sm text-black-500">Prepare an order. Share a link. We’ll handle checkout.</p></div>
        {!creating && <button onClick={() => { setCreating(true); setNotice(""); setError(""); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-white"><Plus size={18} /> Create order</button>}
      </div>
    </header>
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
      {error && <p role="alert" className="rounded-xl bg-cinnabar-100 p-4 text-sm text-cinnabar-500">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-viridian-100 p-4 text-sm text-viridian-500">{notice}</p>}
      {!data && <button onClick={() => refresh().catch((e) => setError(e.message))} className="rounded-xl border p-4">{error ? "Try again" : "Loading menu and payment links…"}</button>}
      {creating && data && <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-black-100 bg-white p-5"><h2 className="mb-4 text-lg font-bold">Choose the meals</h2>
          <label className="sr-only" htmlFor="meal-search">Search menu</label><input id="meal-search" className={inputClass} placeholder="Search your menu" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="mt-4 max-h-[540px] space-y-2 overflow-y-auto">{data.menu.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).map((item) => <button key={item.id} disabled={busy} onClick={() => setSelected(item)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-black-100 px-4 py-3 text-left hover:border-primary/40 hover:bg-primary/5"><span><span className="block font-medium">{item.name}</span><span className="text-sm text-black-500">{formatKobo(item.price_kobo)}</span></span><Plus size={18} className="shrink-0 text-primary" /></button>)}
            {!data.menu.length && <p className="py-6 text-sm text-black-500">Make a menu item available to create your first order.</p>}
          </div>
        </div>
        <div className="self-start rounded-2xl border border-black-100 bg-white p-5 lg:sticky lg:top-5"><h2 className="text-lg font-bold">Prepared order</h2>
          <label htmlFor="customer-name" className="mb-2 mt-4 block text-sm font-medium">Customer name <span className="font-normal text-black-400">(optional)</span></label><input id="customer-name" disabled={busy} value={customerName} onChange={(e) => { setCustomerName(e.target.value); requestKey.current = null; }} maxLength={100} className={inputClass} placeholder="Who is this for?" />
          <div className="my-5 space-y-4">{!lines.length && <p className="py-6 text-center text-sm text-black-400">Add meals from your menu.</p>}{lines.map((line, index) => <div key={index} className="flex items-start justify-between gap-3 border-b border-black-100 pb-3"><div><p className="text-sm font-semibold">{line.quantity} × {line.name}</p>{line.selectedOptions.flatMap((option) => option.choices).map((choice) => <p key={choice.choiceId} className="text-xs text-black-500">{choice.quantity} × {choice.choiceName}</p>)}{line.specialRequest && <p className="mt-1 text-xs text-black-500">Note: {line.specialRequest}</p>}<p className="mt-1 text-sm">{formatKobo(line.priceKobo * line.quantity)}</p></div><button disabled={busy} aria-label={`Remove ${line.name}`} onClick={() => { setLines((prev) => prev.filter((_, i) => i !== index)); requestKey.current = null; }} className="p-2 text-black-400"><X size={16} /></button></div>)}</div>
          <div className="flex justify-between font-bold"><span>Food subtotal</span><span>{formatKobo(subtotal)}</span></div><p className="mb-5 mt-2 text-xs leading-relaxed text-black-500">The customer chooses delivery or pickup. Delivery, fees, and eligible discounts are calculated at checkout. Links expire after 24 hours; stock is checked when they pay.</p>
          <button disabled={busy || !lines.length} onClick={create} className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-white disabled:opacity-40">{busy ? "Creating link…" : "Create payment link"}</button><button disabled={busy} onClick={() => setCreating(false)} className="mt-2 w-full py-2 text-sm text-black-500">Back to links</button>
        </div>
      </section>}
      {data && !creating && <section><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Recent links</h2><button aria-label="Refresh payment links" onClick={() => refresh().catch((e) => setError(e.message))} className="p-2 text-black-500"><RefreshCw size={18} /></button></div>
        {!data.links.length && <div className="rounded-2xl border border-dashed border-black-200 bg-white px-6 py-16 text-center"><Link2 className="mx-auto mb-4 text-primary" size={32} /><h2 className="text-lg font-bold">Turn a conversation into an order</h2><p className="mx-auto mt-2 max-w-md text-sm text-black-500">Choose what the customer asked for and send their checkout link. Only paid orders appear in your kitchen queue.</p></div>}
        <div className="space-y-3">{data.links.map((link) => <article key={link.id} className="rounded-2xl border border-black-100 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{link.customerName || "Prepared order"}</h3><p className="mt-1 text-sm text-black-500">{link.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}</p><p className="mt-2 text-sm font-semibold">{formatKobo(link.subtotalKobo)} <span className="font-normal text-black-400">food subtotal</span></p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${link.status === "paid" ? "bg-viridian-100 text-viridian-500" : "bg-black-50 text-black-500"}`}>{statusLabel[link.status]}</span></div>
          <p className="mt-3 text-xs text-black-400">Created {new Date(link.createdAt).toLocaleString()} · Expires {new Date(link.expiresAt).toLocaleString()}</p>
          {link.status === "payment_failed" && <p className="mt-3 text-xs text-black-500">The customer’s last payment was declined. The same link still works — they can try again.</p>}
          {isOpen(link.status) && <><input aria-label="Payment link" value={link.url} readOnly onFocus={(e) => e.target.select()} className="mt-4 w-full rounded-lg bg-black-50 px-3 py-2 text-xs text-black-500" /><div className="mt-3 flex flex-wrap items-center gap-3"><button onClick={() => copy(link.url)} className="inline-flex items-center gap-2 rounded-lg border border-black-200 px-3 py-2 text-sm font-semibold"><Copy size={15} /> Copy link</button><a target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Your order from ${data.restaurant.name} is ready to review. Confirm your details and pay here: ${link.url}`)}`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"><Send size={15} /> Share on WhatsApp</a><button disabled={busy} onClick={() => cancel(link.id)} className="ml-auto px-2 py-2 text-sm text-cinnabar-500">Cancel link</button></div></>}
          {link.status === "payment_started" && <p className="mt-3 text-xs text-black-500">The customer has started checkout. This link will resume the same payment.</p>}
          {link.status === "paid" && <Link href={`${base}/orders`} className="mt-3 inline-block text-sm font-semibold text-primary">View paid orders →</Link>}
        </article>)}</div>
      </section>}
    </main>
    {selected && <ItemEditor item={selected} onClose={() => setSelected(null)} onAdd={(line) => { setLines((prev) => [...prev, line]); requestKey.current = null; setSelected(null); }} />}
  </div>;
}

function ItemEditor({ item, onClose, onAdd }: { item: PaymentLinkMenuItem; onClose: () => void; onAdd: (line: PaymentLinkLine) => void }) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  function add() {
    try {
      const [line] = pricePaymentLinkItems([{ menuItemId: item.id, quantity, specialRequest: note, selectedOptions: (item.options ?? []).map((option) => ({ optionId: option.id, choices: option.choices.filter((choice) => choices[choice.id] > 0).map((choice) => ({ choiceId: choice.id, quantity: choices[choice.id] })) })) }], [item]);
      onAdd(line);
    } catch (e) { setError(e instanceof Error ? e.message : "Please check your selections."); }
  }
  return <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="item-editor-title" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between"><h2 id="item-editor-title" className="text-lg font-bold">{item.name}</h2><button aria-label="Close meal options" onClick={onClose} className="p-2"><X size={20} /></button></div><p className="mb-4 text-sm text-black-500">{formatKobo(item.price_kobo)}</p>
    {(item.options ?? []).map((option) => <fieldset key={option.id} className="mb-5"><legend className="text-sm font-bold">{option.name} <span className="font-normal text-black-400">{option.min_selections ? `(choose at least ${option.min_selections})` : "(optional)"}{option.max_selections ? ` · up to ${option.max_selections}` : ""}</span></legend>{option.choices.map((choice) => <label key={choice.id} className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-black-50 p-3"><span className="text-sm">{choice.name} <span className="text-black-400">{choice.price_modifier_kobo ? `+${formatKobo(choice.price_modifier_kobo)}` : ""}</span></span>{option.max_selections === 1 ? <input type="radio" name={option.id} checked={choices[choice.id] === 1} onChange={() => setChoices((prev) => ({ ...prev, ...Object.fromEntries(option.choices.map((c) => [c.id, c.id === choice.id ? 1 : 0])) }))} /> : <input aria-label={`${choice.name} quantity`} type="number" min={0} max={20} value={choices[choice.id] ?? 0} onChange={(e) => setChoices((prev) => ({ ...prev, [choice.id]: Number(e.target.value) }))} className="w-16 rounded border border-black-200 p-1 text-center" />}</label>)}{option.max_selections === 1 && option.min_selections === 0 && <button onClick={() => setChoices((prev) => ({ ...prev, ...Object.fromEntries(option.choices.map((choice) => [choice.id, 0])) }))} className="mt-2 text-xs underline">Clear selection</button>}</fieldset>)}
    <label className="mb-4 block text-sm font-medium">Quantity<input type="number" min={1} max={99} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={`${inputClass} mt-2`} /></label><label className="block text-sm font-medium">Special request<textarea maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} mt-2`} placeholder="e.g. no onions" /></label>{error && <p role="alert" className="mt-3 text-sm text-cinnabar-500">{error}</p>}<button onClick={add} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 font-bold text-white">Add to order</button>
  </section></div>;
}
