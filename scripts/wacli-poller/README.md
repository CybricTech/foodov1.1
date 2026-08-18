# wacli poller

Runs on the Pi. Polls the `wacli-relay` Supabase edge function for merchant
new-order WhatsApp alerts and sends them through a locally-paired `wacli`
(`github.com/openclaw/wacli`) install. Temporary bridge until the platform
is on the official Meta WhatsApp Business API (Infobip) — see
`docs/infobip-whatsapp-migration.md`.

wacli talks to WhatsApp over the unofficial Web protocol. That's against
WhatsApp's Terms of Service and the linked number can get banned for
automated business messaging. Fine for a stopgap; don't leave it running
indefinitely as "the" solution.

## One-time setup

```
wacli auth        # scan the QR code from WhatsApp's Linked Devices screen
```

## Secret

`WACLI_RELAY_KEY` is a bearer secret shared between this poller and the
`wacli-relay` edge function — not a Supabase API key, just a random string
you generate once:

```
openssl rand -hex 32
```

Set it in both places:

```
supabase secrets set WACLI_RELAY_KEY=<generated value>
supabase secrets set WACLI_OUTBOX_ENABLED=true   # flips the send-sms ladder on
```

And export it on the Pi (see systemd unit below) alongside `WACLI_RELAY_URL`,
which is `https://<project-ref>.functions.supabase.co/wacli-relay`.

## Running continuously (systemd)

Two units — `wacli` needs its own long-lived connection kept alive
separately from the poller, which is a short-lived request per send.

`/etc/systemd/system/wacli-sync.service`:

```ini
[Unit]
Description=wacli WhatsApp sync (linked device connection)
After=network-online.target

[Service]
ExecStart=/usr/local/bin/wacli sync --follow
Restart=always
RestartSec=5
User=pi

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/wacli-poller.service`:

```ini
[Unit]
Description=wacli order-alert poller
After=network-online.target wacli-sync.service
Requires=wacli-sync.service

[Service]
ExecStart=/usr/bin/node /home/pi/foodov1.1/scripts/wacli-poller/poller.mjs
Restart=always
RestartSec=5
User=pi
Environment=WACLI_RELAY_URL=https://<project-ref>.functions.supabase.co/wacli-relay
Environment=WACLI_RELAY_KEY=<same value set via supabase secrets set>

[Install]
WantedBy=multi-user.target
```

```
sudo systemctl daemon-reload
sudo systemctl enable --now wacli-sync wacli-poller
journalctl -u wacli-poller -f     # watch it work
```

## Config (env vars)

| Var | Required | Default | Notes |
|---|---|---|---|
| `WACLI_RELAY_URL` | yes | — | The `wacli-relay` edge function URL. |
| `WACLI_RELAY_KEY` | yes | — | Bearer secret, matches the edge function's. |
| `WACLI_BIN` | no | `wacli` | Path to the binary if not on `PATH`. |
| `WACLI_POLL_INTERVAL_MS` | no | `10000` | How often to check for new alerts. |
| `WACLI_CLAIM_LIMIT` | no | `5` | Max rows claimed per poll. |

## Turning it off

Set `WACLI_OUTBOX_ENABLED=false` (or unset it) via `supabase secrets set` and
redeploy `send-sms` — the ladder falls straight back to Termii SMS, exactly
as it behaves today. No need to touch the Pi.
