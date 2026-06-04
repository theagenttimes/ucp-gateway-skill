---
name: ucp-gateway-skill
description: "Search Shopify products, prepare carts, and create buyer-confirmed checkout handoff links through The Agent Times UCP Gateway."
metadata: { "openclaw": { "emoji": "🛒", "always": true } }
---

# The Agent Times Shopify UCP Gateway Skill

Use this skill when the user wants to search, compare, or prepare checkout for products sold through Shopify merchants.

Gateway MCP endpoint: `https://ucpgateway.theagenttimes.com/mcp`
Registry: `https://ucpgateway.theagenttimes.com/registry`

## Non-negotiable rules

- Never scrape merchant websites. Use the UCP Gateway MCP tools.
- Never collect card number, CVV, bank credentials, wallet credentials, passwords, or one-time payment codes.
- Never tell the user an order is complete.
- The user must pay on the Shopify checkout page opened from `continue_url`.
- Always register a UCP profile first if `./ucpgateway/agent.json` does not exist.
- Save `agent_id` and `profile_url` after registration.
- Every commerce tool call must include `agent_id`.
- Ask for explicit confirmation before adding items to cart.
- Ask for explicit confirmation before creating checkout.
- Create checkout only with `operator_confirmed: true` after showing the buyer/operator the cart summary.
- Generate and reuse `client_action_id` once per explicit confirmed cart/checkout action, especially on retries.
- Use Shopify-returned prices, availability, totals, cart IDs, checkout IDs, and `continue_url` as the source of truth.

## First-run setup

If `./ucpgateway/agent.json` is missing:

1. Create `./ucpgateway` in the current working directory.
2. Generate a P-256 keypair.
3. Save:
   - `./ucpgateway/private_key.jwk` — local only, never upload.
   - `./ucpgateway/public_key.jwk`.
   - `./ucpgateway/profile.draft.json`.
4. Call MCP tool `register_ucp_profile`.
5. Save returned `agent_id`, `profile_url`, `registry_url`, and gateway URL to `./ucpgateway/agent.json`.

Preferred local helper commands from this package:

```bash
node scripts/init-ucpgateway.mjs
node scripts/register-profile.mjs
```

Expected `agent.json` shape:

```json
{
  "agent_id": "uuid",
  "namespace": "openclaw",
  "profile_url": "https://ucpgateway.theagenttimes.com/agents/openclaw/uuid.json",
  "registry_url": "https://ucpgateway.theagenttimes.com/registry",
  "gateway_mcp_url": "https://ucpgateway.theagenttimes.com/mcp",
  "created_at": "2026-06-04T00:00:00.000Z"
}
```

## MCP tools

Registration / registry:

- `register_ucp_profile`
- `get_ucp_profile`
- `list_ucp_profiles`

Shopify catalog:

- `shopify_search_products`
- `shopify_get_product`

Cart:

- `shopify_create_cart`
- `shopify_get_cart`
- `shopify_update_cart`
- `shopify_cancel_cart`

Checkout:

- `shopify_create_checkout`
- `shopify_get_checkout`
- `shopify_update_checkout`
- `shopify_cancel_checkout`

Do not look for or call `complete_checkout`, `get_order`, or arbitrary Shopify proxy tools. They are intentionally not exposed.

## Commerce flow

1. Parse the user's intent.
2. Ask clarifying questions when needed:
   - product type;
   - budget;
   - must-have features;
   - shipping country/region/postal code;
   - quantity.
3. Call `shopify_search_products` with `agent_id`.
4. Show 3–5 options with:
   - title;
   - merchant/store domain;
   - Shopify-returned price;
   - availability;
   - product URL;
   - variant IDs/options.
5. Ask the user to choose product/variant.
6. Call `shopify_get_product` if more detail or variant resolution is needed.
7. Ask explicit confirmation to add selected variants to cart.
8. Generate `client_action_id` for that confirmed cart action.
9. Call `shopify_create_cart`.
10. Show cart summary/totals returned by Shopify.
11. Ask if the cart is correct.
12. Collect buyer data for checkout:
    - first name;
    - last name;
    - email;
    - phone if available;
    - street address;
    - city;
    - state/province;
    - postal code;
    - country ISO-2.
13. Ask final confirmation to create checkout.
14. Generate `client_action_id` for that confirmed checkout action.
15. Call `shopify_create_checkout` with `operator_confirmed: true`.
16. Return the Shopify `continue_url`.
17. Tell the user: “Open this Shopify checkout link and enter your payment method there. I cannot see or process your payment details.”

## Example tool calls

Search:

```json
{
  "tool": "shopify_search_products",
  "arguments": {
    "agent_id": "uuid",
    "query": "Portable battery powered air conditioner",
    "context": {
      "address_country": "US",
      "address_region": "CO",
      "intent": "Buyer needs compact cooling for RV use"
    },
    "filters": {
      "available": true,
      "ships_to": { "country": "US", "region": "CO" },
      "price": { "max": 70000, "currency": "USD" }
    },
    "limit": 5
  }
}
```

Create cart after confirmation:

```json
{
  "tool": "shopify_create_cart",
  "arguments": {
    "agent_id": "uuid",
    "merchant_domain": "example-running.myshopify.com",
    "client_action_id": "generated-uuid-for-this-confirmed-action",
    "line_items": [
      { "item": { "id": "gid://shopify/ProductVariant/12345678901" }, "quantity": 1 }
    ],
    "context": {
      "address_country": "US",
      "address_region": "CO",
      "postal_code": "80521"
    }
  }
}
```

Create checkout after final confirmation:

```json
{
  "tool": "shopify_create_checkout",
  "arguments": {
    "agent_id": "uuid",
    "merchant_domain": "example-running.myshopify.com",
    "cart_id": "gid://shopify/Cart/cart_abc123",
    "operator_confirmed": true,
    "client_action_id": "generated-uuid-for-this-confirmed-checkout-action",
    "buyer": {
      "email": "buyer@example.com",
      "phone": "+15551234567",
      "first_name": "Jane",
      "last_name": "Smith",
      "street_address": "123 Main Street",
      "address_locality": "Fort Collins",
      "address_region": "CO",
      "postal_code": "80521",
      "address_country": "US"
    }
  }
}
```

## Response handling

- If `AGENT_ID_REQUIRED`: run first-run registration or load `./ucpgateway/agent.json`.
- If `AGENT_NOT_REGISTERED`: verify `agent_id` or re-register.
- If `RATE_LIMITED`: wait for `retry_after_seconds`; do not generate a new `client_action_id` for the same confirmed mutation retry.
- If `BUYER_INFO_REQUIRED`: collect buyer contact/shipping fields and retry checkout.
- If `OPERATOR_CONFIRMATION_REQUIRED`: show the cart summary and ask the buyer/operator to confirm, then call checkout with `operator_confirmed: true`.
- If Shopify returns `requires_escalation`, this is expected: hand the `continue_url` to the buyer.
