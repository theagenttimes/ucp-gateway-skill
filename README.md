# The Agent Times UCP Gateway Skill

Open agents can recommend products, but safe commerce needs more than a model and a browser. The Agent Times UCP Gateway gives agents a hosted UCP identity registry and a Shopping MCP gateway for product search, buyer-confirmed carts, and merchant-hosted checkout handoff — without scraping, exposing provider secrets, or touching payment credentials.

## The problem

Agentic commerce breaks down at the point where intent becomes action:

- Agents need a stable public identity that merchants and operators can inspect.
- Product and cart actions need structured provider tools, not brittle scraping.
- Checkout needs human confirmation and merchant-hosted payment, not hidden automation.
- Operators need clear safety boundaries for buyer PII, payment data, and final handoff.

UCP Gateway exists to make that path practical for open agents and UCP-capable commerce providers.

## The solution

The gateway combines two pieces of infrastructure:

1. **Hosted UCP profile registry** — agents publish a public UCP profile and receive a stable `agent_id` plus `profile_url`.
2. **Shopping MCP gateway** — agents call discovery-first MCP methods, then use provider-neutral Shopping tools to search, cart, and create checkout handoff links.

Payment remains on the merchant site. The gateway does not complete payment, collect cards, or claim an order is finished.

## What agents can do today

- Publish a hosted UCP profile with `register_ucp_profile`.
- Fetch a known hosted profile with `get_ucp_profile`.
- Search products with `shopping_product_search`.
- Get product/variant detail with `shopping_product_get`.
- Create, refresh, update, or cancel buyer-confirmed carts.
- Create, refresh, update, or cancel checkout handoff sessions.
- Read `next_step` guidance after every response to know what to ask, show, or call next.

Core tool names:

```text
register_ucp_profile
get_ucp_profile
shopping_product_search
shopping_product_get
shopping_cart_create
shopping_cart_get
shopping_cart_update
shopping_cart_cancel
shopping_checkout_create
shopping_checkout_get
shopping_checkout_update
shopping_checkout_cancel
```

`tools/list` is the authoritative source for input schemas, output schemas, annotations, and descriptions.

## Why it matters

For agents and operators, UCP Gateway turns shopping from a fragile browser task into a structured, inspectable MCP flow. For merchants and commerce platforms, it keeps identity, confirmation, and payment boundaries explicit while allowing agents to participate in discovery and checkout handoff. For investors and ecosystem builders, it is a concrete bridge between open-source agents and real commerce infrastructure.

The first hosted implementation is intentionally narrow: profile publishing, product discovery, cart actions, and checkout handoff. The architecture is provider-neutral so additional UCP-capable Shopping providers can be added without changing the agent-facing flow.

## Install

```bash
clawhub install theagenttimes/ucp-gateway-skill
```

The skill is usable from `SKILL.md` alone. Helper scripts are included for local identity setup and manual MCP calls, but they are optional.

## MCP endpoint

```text
https://ucpgateway.theagenttimes.com/mcp
```

Supported access patterns:

- `POST /mcp` — primary JSON-RPC 2.0 transport.
- `GET /mcp` — self-serve markdown guide.
- `GET /mcp` with `Accept: text/event-stream` — stateless SSE bootstrap that points clients back to POST.
- `OPTIONS /mcp` — CORS, method, transport, and session metadata.
- `DELETE /mcp` — JSON cleanup/no-op for stateless Streamable HTTP compatibility.
- `POST /messages` and `POST /mcp/messages` — JSON-RPC fallback paths for probing clients.

The hosted gateway is stateless. It accepts/echoes `mcp-session-id` for compatibility, but agents should not assume durable server-side MCP sessions.

## Discovery-first quick start

Start by asking the MCP endpoint what it supports:

```bash
curl -s https://ucpgateway.theagenttimes.com/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

Then discover schemas and instructions:

```bash
curl -s https://ucpgateway.theagenttimes.com/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Recommended sequence for generic agents:

1. `initialize`
2. `tools/list`
3. `resources/list`
4. `resources/read` for `ucp://gateway/agent-guide`
5. `prompts/list`
6. `prompts/get` for `ucp-shopping-flow` or `ucp-operator-handoff`
7. `tools/call` with the selected tool and schema-valid arguments

Do not paste large tool examples into your system prompt. Fetch schemas from `tools/list` and instructions from `resources/read` / `prompts/get`.

## Profile publishing and `agent_id`

Every Shopping tool requires an active `agent_id`. If an agent does not have one, register a public UCP profile:

- Keep private signing keys local.
- Public profile JSON may include public signing keys and UCP capabilities.
- Public profile JSON must never include private JWK fields such as `d`, `p`, `q`, `dp`, `dq`, or `qi`.
- Save the returned `agent_id`, `profile_url`, `namespace`, and gateway URL locally.

The hosted profile is visible in the registry and can be used immediately for Shopping MCP calls.

## Safe Shopping flow

1. Load or register `agent_id`.
2. Search products with `shopping_product_search`.
3. Fetch detail with `shopping_product_get` when variant, merchant, or availability details are needed.
4. Show provider-returned options: title, merchant domain, price, availability, product URL, variant IDs/options, messages, and warnings.
5. Ask the buyer/operator to choose exact variant(s) and quantity.
6. Create or update cart only after explicit confirmation.
7. Show cart items, totals, messages, warnings, and any `continue_url`.
8. Collect checkout buyer data only from the buyer. Use ISO-2 countries and E.164 phone when supplied.
9. Ask final confirmation before checkout.
10. Call `shopping_checkout_create` with `operator_confirmed: true`.
11. Hand off the merchant `continue_url`; the buyer enters payment on the merchant site.

## Safety boundaries

- No scraping.
- No hidden purchases.
- No card number, CVV, bank credential, wallet credential, payment token, payment method, password, or one-time payment code in tool calls.
- No invented buyer PII.
- No claim that an order is paid, placed, complete, or guaranteed.
- `operator_confirmed: true` is checkout-handoff authorization, not payment authorization.
- `REQUIRES_ESCALATION_*` or `requires_escalation` means the buyer must continue on the merchant-hosted page.

Suggested checkout handoff copy:

> Open this merchant checkout link and enter your payment method there. I cannot see or process payment details. Review merchant totals, shipping, taxes, and terms before paying.

## Optional helper scripts

If using this repository directly:

```bash
git clone https://github.com/theagenttimes/ucp-gateway-skill.git
cd ucp-gateway-skill
node scripts/init-ucpgateway.mjs
node scripts/register-profile.mjs --agent-name "OpenClaw UCP Shopping Agent"
node scripts/call-mcp.mjs shopping_product_search '{"query":"trail running shoes","limit":5}'
```

Local helper state is written under `./ucpgateway/`:

```text
private_key.jwk       local only; never upload
public_key.jwk        public key material
profile.draft.json    editable public UCP profile draft
agent.json            saved agent_id/profile_url after registration
```

Environment overrides:

```bash
export UCP_GATEWAY_MCP_URL=https://ucpgateway.theagenttimes.com/mcp
export UCP_NAMESPACE=openclaw
export UCP_AGENT_NAME="OpenClaw UCP Shopping Agent"
```

The scripts print raw JSON-RPC responses so you can inspect `result.next_step` and `result.structuredContent.next_step`.

## Version

Current package version: `0.1.3`.
