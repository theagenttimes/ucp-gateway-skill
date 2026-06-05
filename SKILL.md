---
name: ucp-gateway-skill
description: "Search products, prepare carts, publish UCP profiles, and create buyer-confirmed merchant checkout handoff links through The Agent Times UCP Gateway MCP."
metadata: { "openclaw": { "emoji": "🛒", "always": true } }
---

# The Agent Times UCP Gateway Skill

## What this is

Use The Agent Times UCP Gateway when a user wants an agent-safe Shopping flow: publish/load a UCP profile, search products, prepare confirmed carts, and create merchant-hosted checkout handoff links without scraping or payment handling.

Endpoint: `https://ucpgateway.theagenttimes.com/mcp`
Registry: `https://ucpgateway.theagenttimes.com/registry`

## Use this when

- Product search, product comparison, variant lookup, cart preparation, or checkout handoff is requested.
- The agent needs to register or reuse a hosted UCP profile and `agent_id`.
- A generic MCP client needs discovery-first instructions from the gateway itself.

## Do not use this for

- Scraping merchant websites or bypassing provider APIs.
- Collecting card/CVV/bank/wallet/payment credentials, passwords, payment tokens, or one-time payment codes.
- Claiming an order is paid, placed, complete, or guaranteed.
- Inventing buyer PII such as names, email, phone, or shipping address.

## How to start

1. GET `/mcp` for the guide, or POST JSON-RPC `initialize`.
2. Call `tools/list` for current tool names, input schemas, output schemas, and annotations.
3. Call `resources/list`, then `resources/read` `ucp://gateway/agent-guide`.
4. Call `prompts/list`, then `prompts/get` `ucp-shopping-flow` or `ucp-operator-handoff` when you need operator-ready flow instructions.
5. Register/load `agent_id`, then use Shopping tools through `tools/call`.

## Protocol notes

- Primary: JSON-RPC 2.0 HTTP `POST` to `/mcp`.
- SSE: GET `/mcp` with `Accept: text/event-stream` returns a stateless endpoint/next_step bootstrap; continue over POST.
- Streamable HTTP compatibility: `/mcp` supports GET, POST, OPTIONS, DELETE and `mcp-session-id` in stateless hosted mode. Do not assume durable server-side sessions.
- Fallback POST routes may exist at `/messages` and `/mcp/messages`.

## Core tools

- `register_ucp_profile`, `get_ucp_profile`
- `shopping_product_search`, `shopping_product_get`
- `shopping_cart_create`, `shopping_cart_get`, `shopping_cart_update`, `shopping_cart_cancel`
- `shopping_checkout_create`, `shopping_checkout_get`, `shopping_checkout_update`, `shopping_checkout_cancel`

Use `tools/list` for schemas instead of relying on remembered arguments.

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

## Safety flow

- Product search/detail is read-only.
- Ask explicit confirmation before cart create/update/cancel.
- Show cart totals/messages/warnings and ask final confirmation before checkout.
- Set `operator_confirmed: true` only after that final confirmation.
- Hand off the returned `continue_url`; the buyer enters payment on the merchant site.

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

Every gateway response or error includes `next_step` guidance. For tool calls, read `result.structuredContent.next_step` and/or `result.next_step`. Treat argument hints as suggestions only — never as buyer authorization.