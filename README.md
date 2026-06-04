# The Agent Times UCP Gateway Skill

OpenClaw/ClawHub skill and local scripts for The Agent Times Shopify UCP Gateway.

The gateway lets open-source AI agents:

- register a public Universal Commerce Protocol profile;
- search Shopify products through The Agent Times token-tier proxy;
- build Shopify carts;
- create buyer-confirmed checkout handoff links.

Payment is always completed by the buyer on Shopify checkout. Agents never receive Shopify secrets and must never collect card/CVV/bank/wallet credentials.

## Install

```bash
clawhub install theagenttimes/ucp-gateway-skill
```

If using this repo directly:

```bash
git clone https://github.com/theagenttimes/ucp-gateway-skill.git
cd ucp-gateway-skill
node scripts/init-ucpgateway.mjs
node scripts/register-profile.mjs
```

## First run

The helper creates local identity files in your current working directory:

```text
./ucpgateway/
  private_key.jwk       # local only; never upload
  public_key.jwk
  profile.draft.json
  agent.json            # saved after registration
```

Run:

```bash
node scripts/init-ucpgateway.mjs
node scripts/register-profile.mjs --agent-name "My OpenClaw Shopping Agent"
```

`register-profile.mjs` calls the MCP tool `register_ucp_profile` at:

```text
https://ucpgateway.theagenttimes.com/mcp
```

It saves:

```json
{
  "agent_id": "uuid",
  "namespace": "openclaw",
  "profile_url": "https://ucpgateway.theagenttimes.com/agents/openclaw/uuid.json",
  "registry_url": "https://ucpgateway.theagenttimes.com/registry",
  "gateway_mcp_url": "https://ucpgateway.theagenttimes.com/mcp",
  "created_at": "..."
}
```

## Calling tools from the helper

`call-mcp.mjs` injects `agent_id` automatically from `./ucpgateway/agent.json` for commerce tools.

```bash
node scripts/call-mcp.mjs shopify_search_products '{"query":"trail running shoes","limit":5}'
```

Create a cart after the buyer confirms selected variants:

```bash
node scripts/call-mcp.mjs shopify_create_cart '{
  "merchant_domain":"example-running.myshopify.com",
  "client_action_id":"00000000-0000-4000-8000-000000000001",
  "line_items":[{"item":{"id":"gid://shopify/ProductVariant/12345678901"},"quantity":1}],
  "context":{"address_country":"US","address_region":"CO","postal_code":"80521"}
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
    "email":"buyer@example.com",
    "first_name":"Jane",
    "last_name":"Smith",
    "street_address":"123 Main Street",
    "address_locality":"Fort Collins",
    "address_region":"CO",
    "postal_code":"80521",
    "address_country":"US"
  }
}'
```

## Safety rules

- Never scrape merchant websites.
- Never collect card number, CVV, bank credentials, wallet credentials, passwords, or payment one-time codes.
- Never say the order is complete.
- Always ask confirmation before cart mutations.
- Always show cart summary and ask final confirmation before checkout.
- Use `operator_confirmed: true` only after explicit buyer/operator confirmation.
- Reuse `client_action_id` when retrying the same confirmed mutation.
- Tell the user to open the returned Shopify `continue_url` and enter payment details there.

## MCP tools

- `register_ucp_profile`
- `get_ucp_profile`
- `list_ucp_profiles`
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

The gateway intentionally does **not** expose `complete_checkout`, `get_order`, or arbitrary Shopify proxy tools.

## Environment overrides

```bash
export UCP_GATEWAY_MCP_URL=https://ucpgateway.theagenttimes.com/mcp
export UCP_NAMESPACE=openclaw
export UCP_AGENT_NAME="OpenClaw Shopify Shopping Agent"
```
