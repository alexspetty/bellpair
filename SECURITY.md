# Security scope

Bellpair 0.2 is a local protocol prototype. It measures the cost and behavior of a specific paired challenge. It has not undergone an independent security audit.

## Implemented properties

- Both contributions are bound to the same fresh challenge, selected base and message digest, with separate role strings.
- The verifier recomputes the SHA-256 hash, hash difficulty, prime candidate, ending in the selected base, deterministic primality and collision weight for both roles.
- The issuer enforces its own challenge parameters and expiry.
- Redemption is exactly once per challenge during this server instance, including simultaneous submissions.
- Local resource limits bound solver runtime, attempt count, worker count, outstanding records, request bodies and simultaneous verifications.
- The server listens only on IPv4 loopback, requires a local Host, rejects cross-origin browser requests and uses an explicit static-file allowlist.

## Limits

The public collision table adds a selection rule. Its balance is automatic for valid reflection partners, so it adds no independent entropy. Search hardness relies on SHA-256 behavior and the imposed filters. We have not proved a lower bound on attacker work or resistance to specialized hardware, precomputation strategies or selective challenge abandonment.

Prime values are not secrets. Their 64-bit size is chosen for deterministic, fast checking, not for factoring-based cryptographic security. This is not quantum cryptography or a post-quantum security claim.

The API is a demonstration service, not a public abuse-prevention service. It runs the solver for its caller; a real work-metering deployment must make the requester perform that work. It has no accounts, durable database, distributed replay ledger, multi-issuer coordination, TLS or public rate-limiting policy. Loopback access is not protection from other processes running on the same machine.

Records are memory-only. Restarting the process loses its issuance and redemption state; old receipts become unknown to that issuer. Offline arithmetic verification does not verify who issued a receipt, whether the message hash is the one an application expects, or whether the receipt has already been consumed.

Pair rotation applies to issued challenges. It does not guarantee uniform completed work or fair participation. No convergence theorem is used as an attack detector. Exact balance is not evidence that a submitted prime was difficult to find.

The fixed Miller–Rabin basis set is justified only for the stated 64-bit domain. Any larger candidate format needs a new protocol version and a new primality guarantee.

## Next review before remote use

Specify the application threat model, move solving to the requester, authenticate issuer state, add durable atomic redemption, and compare acceptance cost and abuse resistance against ordinary hash work at matched measured cost. Network consensus and a currency would require additional design; they are outside this prototype.
