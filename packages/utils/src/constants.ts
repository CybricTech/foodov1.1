// ─── Order Status ───────────────────────────────────────────────────────────
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "assigned_to_rider",
  "in_transit",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// ─── Payment Status ──────────────────────────────────────────────────────────
export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ─── User Roles ──────────────────────────────────────────────────────────────
export const USER_ROLES = [
  "customer",
  "merchant_owner",
  "merchant_staff",
  "platform_rider",
  "super_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

// ─── Fulfillment Types ───────────────────────────────────────────────────────
export const FULFILLMENT_TYPES = ["delivery", "pickup"] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

// ─── Dispatch Types ──────────────────────────────────────────────────────────
export const DISPATCH_TYPES = [
  "platform_rider",
  "own_rider",
  "third_party",
] as const;

export type DispatchType = (typeof DISPATCH_TYPES)[number];

// ─── Delivery Assignment Status ───────────────────────────────────────────────
export const DELIVERY_STATUSES = [
  "assigned",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
  "delivered",
  "failed",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

// ─── Logistics Default ───────────────────────────────────────────────────────
export const LOGISTICS_DEFAULTS = [
  "platform_rider",
  "own_rider",
  "third_party",
] as const;

export type LogisticsDefault = (typeof LOGISTICS_DEFAULTS)[number];

// ─── Vehicle Types ───────────────────────────────────────────────────────────
export const VEHICLE_TYPES = ["bicycle", "motorcycle", "car"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

// ─── SMS Event Types ─────────────────────────────────────────────────────────
export const SMS_EVENT_TYPES = [
  "order_confirmation",
  "order_status_update",
  "marketing",
] as const;

export type SmsEventType = (typeof SMS_EVENT_TYPES)[number];

// ─── SMS Providers ───────────────────────────────────────────────────────────
// "twilio" and "interakt" are retained for historical sms_logs rows only —
// neither has a live send path. Twilio was dropped when merchant WhatsApp first
// moved to a BSP (106); Interakt was replaced by Infobip (107).
// "infobip" is the current WhatsApp BSP and is WhatsApp-only — no SMS.
export const SMS_PROVIDERS = [
  "termii",
  "twilio",
  "sendchamp",
  "interakt",
  "infobip",
] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

// ─── SMS Log Status ──────────────────────────────────────────────────────────
export const SMS_LOG_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "failed",
] as const;

export type SmsLogStatus = (typeof SMS_LOG_STATUSES)[number];

// ─── Human-readable order status labels ──────────────────────────────────────
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready for Pickup",
  assigned_to_rider: "Rider Assigned",
  in_transit: "On the Way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// ─── Storefront order progress steps (for stepper UI) ────────────────────────
export const ORDER_PROGRESS_STEPS_DELIVERY: OrderStatus[] = [
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "in_transit",
  "delivered",
];

export const ORDER_PROGRESS_STEPS_PICKUP: OrderStatus[] = [
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "delivered",
];

/** @deprecated use ORDER_PROGRESS_STEPS_DELIVERY or ORDER_PROGRESS_STEPS_PICKUP */
export const ORDER_PROGRESS_STEPS = ORDER_PROGRESS_STEPS_DELIVERY;

// ─── Share link token expiry (6 hours in ms) ─────────────────────────────────
export const SHARE_LINK_EXPIRY_MS = 6 * 60 * 60 * 1000;

// ─── Platform rider max concurrent deliveries ─────────────────────────────────
export const MAX_ACTIVE_DELIVERIES = 3;

// ─── Rider assignment accept timeout (60 seconds) ────────────────────────────
export const RIDER_ACCEPT_TIMEOUT_SECONDS = 60;

// ─── Menu image max size (5MB) ────────────────────────────────────────────────
export const MENU_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

// ─── GPS broadcast interval (10 seconds) ─────────────────────────────────────
export const GPS_BROADCAST_INTERVAL_MS = 10_000;

// ─── Wallet Transaction Types ─────────────────────────────────────────────────
export const WALLET_TRANSACTION_TYPES = [
  "order_credit",
  "service_charge",
  "logistics_fee",
  "settlement_debit",
  "manual_adjustment",
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

// ─── Settlement Statuses ──────────────────────────────────────────────────────
export const SETTLEMENT_STATUSES = ["pending", "processing", "paid", "failed"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

// ─── Discounts ───────────────────────────────────────────────────────────────
export const DISCOUNT_TRIGGERS = ["code", "automatic"] as const;
export type DiscountTrigger = (typeof DISCOUNT_TRIGGERS)[number];

export const DISCOUNT_TYPES = ["percentage", "fixed", "free_delivery"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percentage: "Percentage off",
  fixed: "Fixed amount off",
  free_delivery: "Free delivery",
};

// ─── Delivery Pricing (fallback defaults — source of truth is platform_settings) ──
export const DELIVERY_BASE_FEE_KOBO = 230000;      // ₦2,300
export const DELIVERY_PER_KM_RATE_KOBO = 15000;    // ₦150 per km
export const DELIVERY_MAX_RADIUS_KM = 25;
export const DELIVERY_MAX_FEE_KOBO = 1500000;       // ₦15,000
export const DELIVERY_MIN_FEE_KOBO = 230000;        // ₦2,300
