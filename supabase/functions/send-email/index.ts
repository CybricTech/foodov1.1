import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") ?? "admin@cybric.tech";

interface OrderItem {
  name: string;
  quantity: number;
  price: number; // kobo
  options?: Array<{
    optionName: string;
    choices: Array<{ choiceName: string; priceModifier: number; quantity?: number }>;
  }>;
}

interface OrderEmailProps {
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  fulfillmentType: "delivery" | "pickup";
  deliveryAddress?: string | null;
  specialInstructions?: string | null;
  items: OrderItem[];
  subtotalKobo: number;
  deliveryFeeKobo: number;
  vatKobo: number;
  serviceFeeKobo: number;
  totalKobo: number;
  createdAt: string;
}

interface EmailPayload {
  template:
    | "merchant-onboarding"
    | "password-reset"
    | "super-admin-alert"
    | "new_order_merchant"
    | "new_order_admin";
  to: string;
  props: Record<string, unknown>;
}

function formatKobo(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function buildOrderItemsHtml(items: OrderItem[]): string {
  return items
    .map((item) => {
      const optionsHtml = item.options
        ?.flatMap((opt) =>
          opt.choices.map((c) => {
            const qty = c.quantity ?? 1;
            const label = qty > 1 ? `${qty}× ${c.choiceName}` : c.choiceName;
            const mod = c.priceModifier > 0 ? ` (+${formatKobo(c.priceModifier * qty)})` : "";
            return `<tr><td style="padding:2px 8px 2px 24px;color:#777;font-size:13px">↳ ${label}${mod}</td><td></td><td></td></tr>`;
          })
        )
        .join("") ?? "";

      return `
        <tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:10px 8px;font-size:14px;color:#1a1a2e">${item.name}</td>
          <td style="padding:10px 8px;text-align:center;font-size:14px;color:#1a1a2e">${item.quantity}</td>
          <td style="padding:10px 8px;text-align:right;font-size:14px;color:#1a1a2e">${formatKobo(item.price)}</td>
        </tr>
        ${optionsHtml}`;
    })
    .join("");
}

function buildPriceBreakdownHtml(props: OrderEmailProps): string {
  const rows: string[] = [];

  rows.push(`<tr><td style="padding:6px 0;color:#555;font-size:14px">Items subtotal</td><td style="padding:6px 0;text-align:right;font-size:14px;color:#1a1a2e">${formatKobo(props.subtotalKobo)}</td></tr>`);

  if (props.fulfillmentType === "delivery") {
    rows.push(`<tr><td style="padding:6px 0;color:#555;font-size:14px">Delivery fee</td><td style="padding:6px 0;text-align:right;font-size:14px;color:#1a1a2e">${props.deliveryFeeKobo > 0 ? formatKobo(props.deliveryFeeKobo) : "Free"}</td></tr>`);
  }

  if (props.vatKobo > 0) {
    rows.push(`<tr><td style="padding:6px 0;color:#555;font-size:14px">VAT</td><td style="padding:6px 0;text-align:right;font-size:14px;color:#1a1a2e">${formatKobo(props.vatKobo)}</td></tr>`);
  }

  if (props.serviceFeeKobo > 0) {
    rows.push(`<tr><td style="padding:6px 0;color:#555;font-size:14px">Service fee</td><td style="padding:6px 0;text-align:right;font-size:14px;color:#1a1a2e">${formatKobo(props.serviceFeeKobo)}</td></tr>`);
  }

  rows.push(`<tr><td colspan="2" style="border-top:2px solid #1a1a2e;padding-top:8px"></td></tr>`);
  rows.push(`<tr><td style="padding:6px 0;font-weight:700;font-size:15px;color:#1a1a2e">Total Paid</td><td style="padding:6px 0;text-align:right;font-weight:700;font-size:15px;color:#1a1a2e">${formatKobo(props.totalKobo)}</td></tr>`);

  return `<table style="width:100%;border-collapse:collapse">${rows.join("")}</table>`;
}

function buildOrderEmailHtml(props: OrderEmailProps, isAdmin: boolean): { subject: string; html: string } {
  const formattedDate = new Date(props.createdAt).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const subject = isAdmin
    ? `🏪 ${props.restaurantName} — New Order #${props.orderNumber}`
    : `🍽️ New Order #${props.orderNumber} — ${props.restaurantName}`;

  const restaurantBadge = isAdmin
    ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:14px;color:#856404">
        <strong>Restaurant:</strong> ${props.restaurantName}
      </div>`
    : "";

  const fulfillmentLabel = props.fulfillmentType === "delivery" ? "🛵 Delivery" : "🏪 Pickup";

  const deliveryRow = props.fulfillmentType === "delivery" && props.deliveryAddress
    ? `<tr><td style="padding:6px 0;color:#555;font-size:14px;width:130px">Delivery address</td><td style="padding:6px 0;font-size:14px;color:#1a1a2e">${props.deliveryAddress}</td></tr>`
    : "";

  const specialRow = props.specialInstructions
    ? `<div style="background:#fffbea;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:0 8px 8px 0;margin-top:12px;font-size:13px;color:#92400e">
        <strong>Special instructions:</strong> ${props.specialInstructions}
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

      <!-- Header -->
      <tr><td style="background:#1a1a2e;padding:28px 32px;text-align:center">
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px">Kitchyn</h1>
        <p style="margin:6px 0 0;color:#a0a0c0;font-size:13px">Order Management Platform</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:28px 32px">

        ${restaurantBadge}

        <h2 style="margin:0 0 4px;color:#1a1a2e;font-size:20px;font-weight:700">New Order Received!</h2>
        <p style="margin:0 0 20px;color:#777;font-size:14px">${formattedDate}</p>

        <!-- Order meta -->
        <div style="background:#f8f9fa;border-radius:10px;padding:16px 20px;margin-bottom:20px">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:4px 0;color:#555;font-size:14px;width:130px">Order number</td>
              <td style="padding:4px 0;font-size:14px;font-weight:600;color:#1a1a2e">#${props.orderNumber}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#555;font-size:14px">Customer</td>
              <td style="padding:4px 0;font-size:14px;color:#1a1a2e">${props.customerName}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#555;font-size:14px">Phone</td>
              <td style="padding:4px 0;font-size:14px;color:#1a1a2e">${props.customerPhone}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#555;font-size:14px">Fulfillment</td>
              <td style="padding:4px 0;font-size:14px;color:#1a1a2e">${fulfillmentLabel}</td>
            </tr>
            ${deliveryRow}
          </table>
        </div>

        ${specialRow}

        <!-- Items -->
        <h3 style="margin:20px 0 8px;color:#1a1a2e;font-size:15px;font-weight:600">Order Items</h3>
        <table style="width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:10px;overflow:hidden">
          <thead>
            <tr style="background:#e9ecef">
              <th style="padding:10px 8px;text-align:left;font-size:12px;color:#555;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Item</th>
              <th style="padding:10px 8px;text-align:center;font-size:12px;color:#555;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Qty</th>
              <th style="padding:10px 8px;text-align:right;font-size:12px;color:#555;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Price</th>
            </tr>
          </thead>
          <tbody>
            ${buildOrderItemsHtml(props.items)}
          </tbody>
        </table>

        <!-- Price breakdown -->
        <div style="margin-top:20px;padding:16px 20px;background:#f8f9fa;border-radius:10px">
          ${buildPriceBreakdownHtml(props)}
        </div>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8f9fa;padding:18px 32px;text-align:center;border-top:1px solid #e9ecef">
        <p style="margin:0;color:#aaa;font-size:12px">Powered by <strong style="color:#1a1a2e">Kitchyn</strong></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}

function buildHtml(payload: EmailPayload): { subject: string; html: string } {
  switch (payload.template) {
    case "merchant-onboarding": {
      const p = payload.props as Record<string, string>;
      return {
        subject: `Welcome to Kitchyn — Your restaurant is live, ${p.restaurantName}`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f4f4f4;padding:20px">
<div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;overflow:hidden">
  <div style="background:#1a1a2e;padding:32px 24px;text-align:center">
    <h1 style="color:white;margin:0;font-size:22px">Welcome to Kitchyn! 🎉</h1>
  </div>
  <div style="padding:24px">
    <p style="color:#333">Hi ${p.restaurantName},</p>
    <p style="color:#555">Your restaurant has been set up on Kitchyn. Here are your login details:</p>
    <div style="background:#f8f8f8;border-radius:12px;padding:16px;margin:16px 0">
      <p style="margin:4px 0;font-size:14px"><strong>Email:</strong> ${p.email}</p>
      <p style="margin:4px 0;font-size:14px"><strong>Temporary password:</strong> ${p.temporaryPassword}</p>
    </div>
    <p style="color:#555;font-size:14px">Please change your password after your first login.</p>
    <div style="margin:24px 0">
      <a href="${p.dashboardUrl}" style="display:inline-block;background:#1a1a2e;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
        Go to Dashboard →
      </a>
    </div>
    <p style="color:#555;font-size:13px">Your storefront is live at:</p>
    <a href="${p.storefrontUrl}" style="color:#1a1a2e;font-size:13px">${p.storefrontUrl}</a>
  </div>
</div>
</body>
</html>`,
      };
    }

    case "password-reset": {
      const p = payload.props as Record<string, string>;
      return {
        subject: "Reset your Kitchyn password",
        html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f4f4f4;padding:20px">
<div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;padding:32px">
  <h2 style="color:#1a1a2e">Reset your password</h2>
  <p style="color:#555">Click the link below to reset your password. This link expires in 1 hour.</p>
  <a href="${p.resetUrl}" style="display:inline-block;background:#1a1a2e;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-top:16px">
    Reset password →
  </a>
</div>
</body>
</html>`,
      };
    }

    case "super-admin-alert": {
      const p = payload.props as Record<string, string>;
      return {
        subject: `⚠️ Kitchyn Admin Alert: ${p.title}`,
        html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#f4f4f4;padding:20px">
<div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;padding:32px;border-left:4px solid #E63946">
  <h2 style="color:#E63946">${p.title}</h2>
  <p style="color:#555">${p.message}</p>
  <p style="color:#aaa;font-size:12px">${new Date().toISOString()}</p>
</div>
</body>
</html>`,
      };
    }

    case "new_order_merchant":
      return buildOrderEmailHtml(payload.props as unknown as OrderEmailProps, false);

    case "new_order_admin":
      return buildOrderEmailHtml(payload.props as unknown as OrderEmailProps, true);

    default:
      throw new Error(`Unknown template: ${(payload as EmailPayload).template}`);
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: EmailPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { subject, html } = buildHtml(payload);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [payload.to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("Resend error:", err);
    return new Response(
      JSON.stringify({ error: "Email failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
