Description: <br>
UCP Gateway Skill is an OpenClaw MCP Tools skill for The Agent Times UCP Gateway MCP server. It helps agents register or reuse a hosted UCP identity, discover products through provider-neutral Shopping MCP tools, prepare buyer-confirmed carts, and create merchant-hosted checkout handoff links. It does not scrape storefronts and does not process payment credentials. <br>

This skill is ready for commercial/non-commercial use. <br>

Publisher: <br>
The Agent Times <br>

License/Terms of Use: <br>
MIT <br>

Use Case: <br>
Agents and operators use this skill when they need safe agentic Shopping over MCP: register a UCP profile, call live MCP tool descriptors with tools/list, search product catalogs, inspect product/variant details, create or update carts only after buyer/operator confirmation, and hand the buyer to a merchant-hosted checkout URL for final payment. <br>

Deployment Geography for Use: <br>
Global <br>

Known Risks and Mitigations: <br>
Risk: The helper scripts create local EC P-256 key material for UCP profile registration. <br>
Mitigation: Keep ./.ucpgateway/private_key.jwk local-only, send only public_key_jwk to the gateway, and never paste private JWK fields into chat, logs, or MCP calls. <br>
Risk: Cart and checkout tools can mutate a buyer shopping session. <br>
Mitigation: Treat product search/detail as read-only, ask explicit buyer/operator confirmation before cart changes, and require final confirmation before checkout handoff creation. <br>
Risk: Checkout handoff can look like purchase completion even though payment is not authorized by the agent. <br>
Mitigation: Always hand off the merchant continue_url to the buyer; the buyer reviews merchant totals, shipping, taxes, terms, and enters payment details only on the merchant site. <br>
Risk: Buyer contact and shipping data is sensitive. <br>
Mitigation: Collect only buyer-provided fields required by the live MCP schema, never invent PII, and never send card, CVV, bank, wallet, payment token, password, or one-time payment code fields. <br>

Reference(s): <br>
ClawHub Skill Page <br>
GitHub Repository: https://github.com/theagenttimes/ucp-gateway-skill <br>
Homepage: https://ucpgateway.theagenttimes.com/ <br>
MCP endpoint: https://ucpgateway.theagenttimes.com/mcp <br>
README.md <br>
SKILL.md <br>

Skill Output: <br>
**Output Type(s):** [MCP tool calls, JSON-RPC responses, JSON, Text, Guidance, Configuration] <br>
**Output Format:** [Markdown instructions, JSON-RPC 2.0 request/response objects, provider-returned product/cart/checkout summaries, merchant checkout handoff URLs] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Requires python3 for optional local helper scripts; uses UCP_GATEWAY_MCP_URL, UCP_NAMESPACE, UCP_AGENT_NAME, and UCP_AGENT_DESCRIPTION as optional environment overrides; stores local helper state in ./.ucpgateway/.] <br>

Skill Version(s): <br>
0.2.3 (source: package.json and SKILL.md frontmatter) <br>

Ethical Considerations: <br>
Users should review all product, cart, and checkout details before relying on them. Agents must preserve buyer agency, avoid hidden purchasing, avoid payment handling, and follow applicable commerce, privacy, and platform policies before deployment. <br>
