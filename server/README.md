# Ten-minute SOL tournament

Implemented: practice UI integrated with solo gameplay; UTC-aligned ten-minute rounds; score = floor(active survival seconds) + 10 × eliminations; one best run segment per wallet per round; deterministic ties; durable SQLite standings/history; signed wallet login; trusted-verifier attestation endpoint; automatic settlement worker; one atomic Solana transaction per round paying 10,000,000 / 6,000,000 / 3,000,000 lamports. Unoccupied places are not paid. No entry fee.

## Current deployment status

The existing Sites deployment is static. It runs device-local **practice mode**, not a global funded tournament. The Node backend is implemented and tested locally but not hosted. No treasury has been created, imported, funded or connected; no on-chain payment has been made. No independent authoritative gameplay verifier exists yet. Enabling money without that verifier would allow browser cheats to win, so payouts default to disabled and ignore all provisional scores.

## Local server

Requires Node 24+. From the repository root:

```sh
npm ci --prefix server
node tools/build.js
node tools/prepare-dist.cjs
cd server
npm test
npm start
```

Open http://localhost:8787. The same server serves the game and API. The server's database is excluded from Git. Use one continuously running instance and persistent storage; back up SQLite using SQLite backup tooling. Do not copy a live WAL database without its journal.

## Hosting setup prepared for Render

`render.yaml` defines a single paid web service with a persistent disk. Import it from the repository only after reviewing the provider's charges. Set PUBLIC_ORIGIN to the service's exact HTTPS origin (no trailing slash). Keep payouts disabled. Render deploys game and API together on that origin. Moving the production domain to this service is a separate step; the existing private Sites URL is not automatically connected. Restrict access at the host/reverse proxy if keeping the deployment private; this standalone service does not inherit Sites access controls.

Reference: https://render.com/docs/disks and https://render.com/docs/blueprint-spec

## Treasury setup — never send keys in chat

Create a dedicated treasury wallet on your own device, using the official Solana CLI or a wallet you control. Keep the recovery material offline. Begin on devnet with test SOL; never use your personal savings wallet. Mount the JSON keypair as a server secret file, then set SOLANA_KEYPAIR_FILE to its absolute path. Do not commit the file, put it in dist, or paste it into chat. Set SOLANA_RPC_URL and SOLANA_CLUSTER explicitly. The server checks the network genesis hash before signing. Browser wallet connection only proves the recipient address; it cannot access the treasury key.

Reference: https://solana.com/docs/intro/installation/solana-cli-basics

## Required authoritative verification (not implemented)

The current browser engine is mutable and includes debug controls. Wallet signatures identify an address, not honest gameplay. Time bounds and monotonic counters are plausibility checks only. An independently hosted authoritative simulation or deterministic replay verifier must check the run's seed, inputs, legal upgrades, kills and active survival time. Do not substitute an endpoint that blindly signs the browser's claims.

Once a real verifier has checked an entry, it POSTs `{round,wallet,hash}` to `/api/tournament/verify`. The hash identifies the exact server-stored provisional entry. Headers: `X-Verifier-Time` (epoch milliseconds) and `X-Verifier-Signature` (hex HMAC-SHA256 over `timestamp + '.' + exactRawJSONBody`, keyed by SCORE_VERIFIER_SECRET). Requests expire after 30 seconds. The round must still be open; changed hashes and closed rounds are rejected. Repeated attestations are idempotent. New unverified scores do not erase an earlier verified best. The verifier secret stays server-side. SCORE_VERIFIER_READY must remain false until this independent service exists and has been tested.

## Payout operation

After real verifier integration, use devnet, set SCORE_VERIFIER_READY=true and PAYOUTS_ENABLED=true, and test with a funded devnet-only treasury. To use mainnet, also explicitly set MAINNET_PAYMENTS_ENABLED=true and SOLANA_CLUSTER=mainnet-beta with a matching RPC. Never turn these on merely to remove a UI notice.

Settlement runs every second, including with no browser open. It recovers missed round closures at restart. Signed transaction bytes and signature are committed before broadcast. Retries rebroadcast only those exact bytes; a round becomes paid only after finalized confirmation. Unknown expired signatures go to `review`, failures to `failed`, preparation failures/crashes remain `preparing`. These states require operator reconciliation before any replacement transaction. Do not blindly set them back to queued. A daily cap defaults to 2,736,000,000 lamports excluding fees. Reserved, failed and ambiguous payments consume the cap conservatively. Backlogged queued rounds are limited by the actual UTC processing day.

Reference: https://solana.com/docs/rpc/http/sendtransaction and https://solana.com/developers/cookbook/transactions/confirmation

## Gameplay and limitations

Co-op is excluded. Paused gameplay and upgrade choice add no survival time. A run spanning a boundary starts a fresh segment; the server discards the observation spanning the boundary to avoid crediting old kills to a new round (normally at most a two-second heartbeat). A ranked connection interrupted for more than 30 seconds must start a new run. Local practice history is limited to 20 completed rounds on that browser, and is editable by that browser; it never awards SOL. Shared rankings refresh every ten seconds. Ties use survival time, then time achieved, then wallet address. Multiple wallets per human cannot currently be prevented; further tournament eligibility/anti-abuse controls are needed for a public funded launch.

HTTP rate limiting is basic and per socket address (no trust in spoofable forwarded headers); configure proper per-client limits at the hosting edge for scale. The server uses one SQLite writer and is not designed for horizontally scaled replicas. API data is never service-worker cached.


## Developer control panel

The Node server serves `/dev`. Connect the wallet configured in `ADMIN_WALLET`
(default public address: N8LgWo2TRgtwj8qvc7WcTapLx1XrunQrEssH82t8Wg6), then sign the
explicit developer administration message. Regular game sessions cannot change
settings. Admin sessions expire after ten minutes and are kept in memory by the
browser. No private keys are entered in the panel.

The SQLite database initializes a **0.4 SOL cumulative prize budget**. This is not
a wallet balance, daily allowance, or automatic refill. Paid and reserved payouts
consume this budget permanently; uncertain/failed transfers remain reserved for
manual reconciliation. Network fees are additional. The budget can never be
lowered below committed funds. Raising it allows pending unsigned rounds to pay.
An additional DAILY_PAYOUT_CAP_LAMPORTS guard still applies.

Prizes are snapshotted when a round opens. Edited prizes apply to the next round;
existing rounds and queued payouts retain their original prizes. Changes are
versioned and audited in SQLite. Back up the database and use persistent storage:
deleting it loses budget accounting. Only one server replica is supported.

Configure TREASURY_WALLET to match the signing key's public address. Never send a
private key or recovery phrase in chat. The panel cannot enable payments or set
secrets. Deployment, a trusted gameplay verifier, secure signing configuration,
and a funded treasury remain prerequisites; this panel alone does not activate
real rewards. Static Sites hosting does not run this Node backend or `/dev`.


### Railway signing secret (not an activation step)

Use the authenticated Dev panel's **Check payment setup** to see missing configuration.
Configure `TREASURY_WALLET` as the exact public address selected for payouts.
`SOLANA_PRIVATE_KEY` supports a base58 secret key or a JSON array of 64 bytes,
provided directly by the owner in Railway Variables and sealed immediately.
Never use a recovery phrase. Do not configure both this variable and
`SOLANA_KEYPAIR_FILE`. No secret is requested by or returned to the browser.
Parser errors are generic and cannot echo the secret. Payout startup rejects a
key whose public address differs from the expected treasury.

Do not enable PAYOUTS_ENABLED, MAINNET_PAYMENTS_ENABLED or SCORE_VERIFIER_READY:
the current game still lacks an authoritative score verifier. The existing HMAC
endpoint authenticates an external verifier; it does NOT verify gameplay.
A funded devnet end-to-end transaction test has not been completed.
The 0.4 SOL application cap cannot protect unrelated wallet funds if its secret
is compromised. Signing authority covers the entire wallet.
