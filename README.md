# Well & Good Linen Purchasing

React + Supabase (wg-property-database hub) + Netlify. Reads properties, beds, amenities and zones from the hub; owns the linen_* and purchasing_* tables.

## Deploy (Netlify)
1. Push this folder to a Git repo and create a Netlify site from it (build `npm run build`, publish `dist`; netlify.toml already sets this), or drag the `dist` folder into Netlify Drop.
2. For Git builds, set env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (values in `.env.example`).
3. Supabase → Authentication → URL Configuration: add the Netlify URL to Redirect URLs so “Email me a sign-in link” works.

## Access
- Access is set only in Settings → Team access (purchasing_members), independent of hub roles. Regional directors can view and request for every market.
- Regional directors need a Supabase Auth login (invite from the Supabase dashboard), then an admin adds them in Settings → Team access.

## Data model (hub)
- linen_items: catalog, prices, par rounding. linen_par_rules: par formula per item.
- linen_requests (+ linen_request_properties, linen_request_items): requests/orders, with per-property multipliers.
- linen_purchase_orders (+ linen_po_items): what was actually ordered; receipts.
- purchasing_notifications: in-app notifications, written by the RPCs, delivered live via Realtime.
- purchasing_members / purchasing_member_zones / purchasing_settings / linen_onboard_dismissals.
- All writes go through RPCs: linen_save_request (create/append/replace), linen_decide_request (approve with expected order date / deny / close),
  linen_log_po, linen_mark_received, linen_cancel_request, linen_set_onboard_dismissed, purchasing_set_member, purchasing_mark_read.
- New onboard queue: linen_onboard_queue(zone) = active properties added since purchasing_settings.onboard_since with no live linen order.
