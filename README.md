# The Agent Times UCP Gateway Skill

OpenClaw skill and optional helper scripts for The Agent Times UCP Gateway: a hosted UCP profile registry and secure MCP gateway that lets open-source agents search Shopify products, create buyer-confirmed carts, and generate Shopify checkout handoff links.

Payment is always completed by the buyer on Shopify checkout. Agents never receive Shopify secrets and must never collect card/CVV/bank/wallet/payment credentials.

## Install

```bash
clawhub install theagenttimes/ucp-gateway-skill
```

The skill is usable from `SKILL.md` alone. Helper scripts are optional conveniences, not required.

## Direct MCP endpoint

```text
https://ucpgateway.theagenttimes.com/mcp
```

Supported access patterns:

- `POST /mcp` with JSON-RPC 2.0 for `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/templates/list`, and `prompts/list`.
- `GET /mcp` for a markdown guide with direct JSON-RPC examples.
- `GET /mcp` with `Accept: text/event-stream` for an SSE endpoint bootstrap.
- `OPTIONS /mcp` for CORS/method metadata.
- `DELETE /mcp` for 204 stateless cleanup.
- `POST /messages` and `POST /mcp/messages` as optional direct JSON-RPC fallback routes for clients that probe message endpoints.

Example JSON-RPC probe:

```bash
curl -s https://ucpgateway.theagenttimes.com/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Every tool has an `inputSchema` and `outputSchema`. Every `tools/call` result includes `structuredContent.next_step` with recommended next actions and warnings.

## Direct commerce flow

1. Register a public UCP profile with `register_ucp_profile`, or load an existing active `agent_id`.
2. Search products with `shopify_search_products`.
3. Fetch detail/variant IDs with `shopify_get_product` when needed.
4. Show Shopify-returned prices, availability, merchant domains, product URLs, and variant IDs.
5. Ask confirmation before cart creation/update.
6. Create or update cart.
7. Show cart totals/messages.
8. Collect buyer-provided checkout data; never invent PII.
9. Ask final confirmation.
10. Create checkout with `operator_confirmed: true`.
11. Hand off `continue_url`; payment happens only on Shopify.

## Core tools

- `register_ucp_profile`
- `get_ucp_profile`
- `shopify_search_products`
- `shopify_get_product`
- `shopify_create_cart`
- `shopify_get_cart`
- `shopify_update_cart`
- `shopify_cancel_cart`
- `shopify_create_checkout`
- `shopify_get_checkout`
- `shopify_update_checkout`
- `shopify_cancel_checkout`

The gateway intentionally does **not** expose `complete_checkout`, `get_order`, arbitrary Shopify proxy tools, or an MCP profile-listing tool. Browse public profiles at `https://ucpgateway.theagenttimes.com/registry` or fetch a known profile with `get_ucp_profile`.

## Optional helper scripts

If using this repo directly:

```bash
git clone https://github.com/theagenttimes/ucp-gateway-skill.git
cd ucp-gateway-skill
node scripts/init-ucpgateway.mjs
node scripts/register-profile.mjs --agent-name "Synthetic Shopping Agent"
```

The helper creates local identity files in your current working directory:

```text
./ucpgateway/
  private_key.jwk       # local only; never upload
  public_key.jwk
  profile.draft.json
  agent.json            # saved after registration
```

`call-mcp.mjs` injects `agent_id` from `./ucpgateway/agent.json` for commerce tools when absent and prints the full JSON-RPC response, including `structuredContent.next_step`.

```bash
node scripts/call-mcp.mjs shopify_search_products '{"query":"trail running shoes","limit":5}'
```

Create a cart after the buyer confirms selected variants:

```bash
node scripts/call-mcp.mjs shopify_create_cart '{
  "merchant_domain":"example-running.myshopify.com",
  "client_action_id":"00000000-0000-4000-8000-000000000001",
  "line_items":[{"item":{"id":"gid://shopify/ProductVariant/12345678901"},"quantity":1}],
  "context":{"address_country":"US","address_region":"CA","postal_code":"00000"}
}'
```

Create checkout after final confirmation and buyer data collection:

```bash
node scripts/call-mcp.mjs shopify_create_checkout '{
  "merchant_domain":"example-running.myshopify.com",
  "cart_id":"gid://shopify/Cart/cart_abc123",
  "operator_confirmed":true,
  "client_action_id":"00000000-0000-4000-8000-000000000002",
  "buyer":{
    "email":"buyer.synthetic@example.test",
    "phone":"+15555550100",
    "first_name":"Jane",
    "last_name":"Synthetic",
    "street_address":"123 Test Street",
    "address_locality":"Testville",
    "address_region":"CA",
    "postal_code":"00000",
    "address_country":"US"
  }
}'
```

## Field formats

- `agent_id`: registered UCP Gateway UUID from `register_ucp_profile`.
- `merchant_domain`: merchant host such as `outboundpower.com`; no scheme.
- Countries: ISO-2 (`US`, not `USA`).
- Currency: ISO 4217 (`USD`).
- Phone: E.164 preferred (`+15555550100`); omit if unavailable.
- Variant: Shopify ProductVariant GID returned by search/detail tools.
- Quantity: integer 1–99.
- `operator_confirmed`: true only after explicit cart review/confirmation.

## Safety rules

- Never scrape merchant websites.
- Never collect card number, CVV, bank credentials, wallet credentials, passwords, payment tokens, payment methods, or one-time payment codes.
- Never say the order is complete or paid.
- Always ask confirmation before cart mutations.
- Always show cart summary and ask final confirmation before checkout.
- Reuse `client_action_id` only when retrying the same confirmed mutation.
- Treat `REQUIRES_ESCALATION_*` warnings as Shopify-hosted buyer handoff signals, not completion signals.

## Environment overrides for optional scripts

```bash
export UCP_GATEWAY_MCP_URL=https://ucpgateway.theagenttimes.com/mcp
export UCP_NAMESPACE=openclaw
export UCP_AGENT_NAME="OpenClaw Shopify Shopping Agent"
```
