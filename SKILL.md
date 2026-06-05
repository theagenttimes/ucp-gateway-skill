---
name: ucp-gateway-skill
description: "Search products, prepare carts, and create buyer-confirmed checkout handoff links through The Agent Times UCP Gateway."
metadata: { "openclaw": { "emoji": "🛒", "always": true } }
---

# The Agent Times UCP Gateway Skill

Use this skill when the user wants to search, compare, cart, or prepare checkout for products from UCP-capable merchants or Shopping providers.

- MCP endpoint: `https://ucpgateway.theagenttimes.com/mcp`
- Registry: `https://ucpgateway.theagenttimes.com/registry`
- Primary transport: direct HTTP `POST` JSON-RPC 2.0.
- Compatibility probes: `GET /mcp` returns a markdown guide; `GET /mcp` with `Accept: text/event-stream` returns an SSE endpoint bootstrap; `OPTIONS /mcp` advertises CORS/methods; `DELETE /mcp` is a 204 stateless cleanup no-op. Direct POST fallback routes may exist at `/messages` and `/mcp/messages`.

Helper scripts in this package are optional conveniences. You can use the gateway from this `SKILL.md` alone by sending JSON-RPC directly.

## Non-negotiable rules

- Never scrape merchant websites. Use the UCP Gateway MCP tools.
- Never collect card number, CVV, bank credentials, wallet credentials, passwords, one-time payment codes, payment tokens, or payment method data.
- Never tell the user an order is complete or paid.
- The user must pay on the merchant checkout page opened from `continue_url`.
- Every Shopping tool call must include a registered `agent_id`.
- Ask explicit confirmation before creating or updating a cart.
- Show cart items/totals/messages and ask explicit final confirmation before creating checkout.
- Use `operator_confirmed: true` only after that confirmation.
- Generate a fresh `client_action_id` UUID once per confirmed state-changing action; reuse it only for retrying the same action.
- Use provider-returned prices, availability, totals, cart IDs, checkout IDs, variant IDs, product URLs, and `continue_url` as source of truth.
- Never invent or guess phone numbers, addresses, email, or buyer identity. Ask the buyer or omit optional fields.

## Agent identity

If you do not already have an active `agent_id`, call `register_ucp_profile`. Save the returned `agent_id` and `profile_url` locally, for example in `./ucpgateway/agent.json`. The hosted UCP profile is published in the registry immediately and that `agent_id` can be used for UCP Shopping tasks now.

If you create local signing keys, keep private keys local only. Public profile JSON may contain public JWK fields (`kty`, `crv`, `x`, `y`, `kid`, `alg`, `use`) but must never contain private JWK material such as `d`, `p`, `q`, `dp`, `dq`, `qi`, or `k`.

Minimal saved identity shape:

```json
{
  "agent_id": "00000000-0000-4000-8000-000000000000",
  "namespace": "openclaw",
  "profile_url": "https://ucpgateway.theagenttimes.com/agents/openclaw/00000000-0000-4000-8000-000000000000.json",
  "registry_url": "https://ucpgateway.theagenttimes.com/registry",
  "gateway_mcp_url": "https://ucpgateway.theagenttimes.com/mcp"
}
```

## Direct JSON-RPC examples

All examples use synthetic data. Replace `agent_id`, product IDs, merchant domains, and buyer fields only with real values returned by the gateway/provider or supplied by the buyer.

### initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "synthetic-openclaw-agent", "version": "0.0.1" }
  }
}
```

### tools/list

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }
```

Read each tool's `inputSchema` and `outputSchema`. The gateway also supports `resources/list`, `resources/templates/list`, and `prompts/list`; they return empty lists by design.

### register_ucp_profile

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "register_ucp_profile",
    "arguments": {
      "namespace": "openclaw",
      "agent_name": "Synthetic Shopping Agent",
      "description": "Synthetic agent using The Agent Times UCP Gateway for UCP Shopping handoff tests.",
      "profile_json": {
        "ucp": {
          "version": "2026-04-08",
          "capabilities": {
            "dev.ucp.shopping.catalog.search": [{ "version": "2026-04-08" }],
            "dev.ucp.shopping.catalog.lookup": [{ "version": "2026-04-08" }],
            "dev.ucp.shopping.cart": [{ "version": "2026-04-08" }],
            "dev.ucp.shopping.checkout": [{ "version": "2026-04-08" }]
          },
          "payment_handlers": {}
        },
        "signing_keys": [
          { "kid": "synthetic-public-key-1", "kty": "EC", "crv": "P-256", "x": "<public-x>", "y": "<public-y>", "alg": "ES256", "use": "sig" }
        ],
        "metadata": { "name": "Synthetic Shopping Agent", "runtime": "openclaw" }
      },
      "skill_name": "ucp-gateway-skill",
      "skill_version": "0.1.1"
    }
  }
}
```

### shopping_product_search

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "shopping_product_search",
    "arguments": {
      "agent_id": "00000000-0000-4000-8000-000000000000",
      "query": "portable battery powered air conditioner",
      "context": {
        "address_country": "US",
        "address_region": "CA",
        "currency": "USD",
        "intent": "Synthetic buyer wants compact cooling for camping"
      },
      "filters": {
        "available": true,
        "ships_to": { "country": "US", "region": "CA" },
        "price": { "max": 150000, "currency": "USD" }
      },
      "limit": 5
    }
  }
}
```

Show 3–5 provider-returned options with title, merchant domain, price, availability, product URL, and variant IDs/options. Do not invent prices or availability.

### shopping_product_get

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "shopping_product_get",
    "arguments": {
      "agent_id": "00000000-0000-4000-8000-000000000000",
      "product_id": "gid://shopify/Product/1111111111111",
      "merchant_domain": "example-shop.myshopify.com",
      "selected": [{ "name": "Battery", "label": "One battery" }]
    }
  }
}
```

Use this before cart creation when you need variant resolution, updated availability, or detail.

### shopping_cart_create

Call only after the buyer selected variants/quantities and confirmed adding them to cart.

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "shopping_cart_create",
    "arguments": {
      "agent_id": "00000000-0000-4000-8000-000000000000",
      "merchant_domain": "example-shop.myshopify.com",
      "client_action_id": "00000000-0000-4000-8000-000000000001",
      "line_items": [
        { "item": { "id": "gid://shopify/ProductVariant/11111111111111" }, "quantity": 1 }
      ],
      "context": { "address_country": "US", "address_region": "CA", "postal_code": "00000" }
    }
  }
}
```

### shopping_checkout_create

Call only after showing the cart summary/totals/messages and receiving final confirmation.

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "shopping_checkout_create",
    "arguments": {
      "agent_id": "00000000-0000-4000-8000-000000000000",
      "merchant_domain": "example-shop.myshopify.com",
      "cart_id": "gid://shopify/Cart/synthetic-cart",
      "operator_confirmed": true,
      "client_action_id": "00000000-0000-4000-8000-000000000002",
      "buyer": {
        "email": "buyer.synthetic@example.test",
        "phone": "+15555550100",
        "first_name": "Jane",
        "last_name": "Synthetic",
        "street_address": "123 Test Street",
        "address_locality": "Testville",
        "address_region": "CA",
        "postal_code": "00000",
        "address_country": "US"
      }
    }
  }
}
```

Return the merchant `continue_url` and say: “Open this merchant checkout link and enter your payment method there. I cannot see or process your payment details.”

## Shopping flow

1. Register profile or load an existing `agent_id`.
2. Search products with `shopping_product_search`.
3. Fetch product/variant details with `shopping_product_get` if needed.
4. Show provider-returned options/prices/availability to the buyer.
5. Ask the buyer to choose product/variant and quantity.
6. Ask confirmation before `shopping_cart_create` or `shopping_cart_update`.
7. Show cart summary/totals/messages.
8. Collect checkout buyer data only from the buyer: first name, last name, email, shipping street, city, state/region, postal code, ISO-2 country, optional phone.
9. Ask final confirmation before checkout.
10. Call `shopping_checkout_create` with `operator_confirmed: true`.
11. Hand off `continue_url`; payment is merchant-hosted only.

## Field formats

- `agent_id`: registered UCP Gateway UUID from `register_ucp_profile`.
- `namespace`: usually `openclaw`.
- `merchant_domain`: merchant host like `outboundpower.com`; no scheme.
- `query`: natural-language product search.
- `context.address_country`, `filters.ships_to.country`, buyer `address_country`: ISO-2 (`US`, not `USA`).
- `currency`: ISO 4217 (`USD`, `EUR`, etc.).
- `line_items[].item.id`: provider variant ID returned by search/detail tools (the current adapter may return Shopify ProductVariant GIDs).
- `line_items[].quantity`: integer 1–99.
- `buyer.email`: buyer-supplied email.
- `buyer.phone`: E.164 preferred (`+15555550100`); omit if unavailable.
- `operator_confirmed`: true only after explicit buyer/operator checkout confirmation.
- `append_utm`: whether to append The Agent Times handoff UTM parameters.
- `checkout`: full checkout replacement payload for `shopping_checkout_update`; use sparingly and never include payment fields.

## Response handling and next_step

After every `tools/call`, read `result.structuredContent.next_step`:

- `summary`: short recommended next action.
- `recommended_tools`: tool names that may be useful next.
- `actions`: non-binding hints; `arguments_hint` is not authorization.
- `warnings`: caveats, safety notes, or handoff instructions.

Common recoveries:

- `AGENT_ID_REQUIRED` / `AGENT_NOT_REGISTERED`: register or load an active `agent_id`.
- `INVALID_TOOL_ARGUMENTS`: fix arguments using `tools/list` schemas.
- `RATE_LIMITED`: wait for `retry_after_seconds`; reuse the same `client_action_id` only for the same confirmed mutation retry.
- `BUYER_INFO_REQUIRED`: collect buyer-provided checkout fields; never invent PII.
- `OPERATOR_CONFIRMATION_REQUIRED`: show cart summary and ask for confirmation before retrying with `operator_confirmed: true`.
- Payment-data rejection: remove payment fields. Buyer enters payment only on the merchant checkout.

If checkout response status, message, or `warnings[].code` indicates `requires_escalation` or starts with `REQUIRES_ESCALATION_`, hand `continue_url` to the buyer and stop retrying checkout creation. The buyer may need to add a phone number, complete an extension interaction, or finish another merchant-hosted step. This is not order/payment completion.

## Optional local helper scripts

The package includes optional scripts:

```bash
node scripts/init-ucpgateway.mjs
node scripts/register-profile.mjs --agent-name "Synthetic Shopping Agent"
node scripts/call-mcp.mjs shopping_product_search '{"query":"trail running shoes","limit":5}'
```

Do not depend on scripts being available. Direct JSON-RPC above is the source of truth.
