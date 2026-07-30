/**
 * The instruction a rider receives with a delivery.
 *
 * Shared so the note is byte-identical whether it's booked through the Bolt
 * API (sent as note_to_driver) or pasted by a human out of the Telegram alert.
 * Returns plain text — the Telegram path HTML-escapes it at its own boundary,
 * because escaping here would push "&amp;" into the Bolt API payload.
 */
export function buildDriverNote(params: {
  orderNumber: string | number;
  restaurantName: string | null | undefined;
  deliveryAddress: string | null | undefined;
  customerName: string | null | undefined;
  customerPhone: string | null | undefined;
}): string {
  const v = (x: string | number | null | undefined) => String(x ?? "—");
  return (
    `Please pick up order #${v(params.orderNumber)} from ${v(params.restaurantName)} ` +
    `and deliver to ${v(params.deliveryAddress)}. ` +
    `Call the receiver, ${v(params.customerName)}, on ${v(params.customerPhone)} when you arrive.`
  );
}
