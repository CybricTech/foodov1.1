import * as React from "react";

interface MerchantOnboardingEmailProps {
  merchantName: string;
  restaurantName: string;
  storefrontUrl: string;
  dashboardUrl: string;
  email: string;
  temporaryPassword: string;
}

export function MerchantOnboardingEmail({
  merchantName,
  restaurantName,
  storefrontUrl,
  dashboardUrl,
  email,
  temporaryPassword,
}: MerchantOnboardingEmailProps) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Welcome to Foodo — Your restaurant is live!</title>
      </head>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#f9f9f9",
          margin: 0,
          padding: "40px 20px",
        }}
      >
        <div
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            padding: "40px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: "32px" }}>
            <h1
              style={{
                color: "#2D6A4F",
                fontSize: "24px",
                fontWeight: 700,
                margin: "0 0 8px",
              }}
            >
              Welcome to Foodo, {merchantName}!
            </h1>
            <p style={{ color: "#757575", margin: 0, fontSize: "16px" }}>
              Your restaurant <strong>{restaurantName}</strong> is now live.
            </p>
          </div>

          {/* Credentials */}
          <div
            style={{
              backgroundColor: "#E8F5EE",
              borderRadius: "8px",
              padding: "24px",
              marginBottom: "24px",
            }}
          >
            <h2
              style={{
                color: "#2D6A4F",
                fontSize: "16px",
                fontWeight: 600,
                margin: "0 0 16px",
              }}
            >
              Your Dashboard Credentials
            </h2>
            <p style={{ margin: "0 0 8px", fontSize: "14px", color: "#212121" }}>
              <strong>Email:</strong> {email}
            </p>
            <p style={{ margin: 0, fontSize: "14px", color: "#212121" }}>
              <strong>Temporary Password:</strong>{" "}
              <code
                style={{
                  backgroundColor: "#ffffff",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontFamily: "monospace",
                }}
              >
                {temporaryPassword}
              </code>
            </p>
            <p
              style={{
                marginTop: "12px",
                fontSize: "13px",
                color: "#757575",
              }}
            >
              Please change your password after first login.
            </p>
          </div>

          {/* Links */}
          <div style={{ marginBottom: "32px" }}>
            <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#212121" }}>
              <strong>Your storefront (share this with customers):</strong>
              <br />
              <a
                href={storefrontUrl}
                style={{ color: "#2D6A4F", wordBreak: "break-all" }}
              >
                {storefrontUrl}
              </a>
            </p>
            <p style={{ margin: 0, fontSize: "14px", color: "#212121" }}>
              <strong>Your dashboard:</strong>
              <br />
              <a
                href={dashboardUrl}
                style={{ color: "#2D6A4F", wordBreak: "break-all" }}
              >
                {dashboardUrl}
              </a>
            </p>
          </div>

          {/* CTA */}
          <a
            href={dashboardUrl}
            style={{
              display: "inline-block",
              backgroundColor: "#2D6A4F",
              color: "#ffffff",
              padding: "12px 24px",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "15px",
            }}
          >
            Log in to your Dashboard →
          </a>

          {/* Footer */}
          <p
            style={{
              marginTop: "32px",
              fontSize: "12px",
              color: "#9E9E9E",
              borderTop: "1px solid #f2f2f2",
              paddingTop: "16px",
            }}
          >
            This email was sent to {email}. If you did not request this account,
            please ignore this email.
          </p>
        </div>
      </body>
    </html>
  );
}
