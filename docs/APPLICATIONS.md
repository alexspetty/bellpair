# Things to build and test with Bellpair

Bellpair provides a native solver, a separate verifier, challenge-bound receipts,
one-time local acceptance and a browser lab. Use that working implementation to
explore arithmetic work rules without rebuilding the surrounding protocol.

## Forms and public submissions

Prototype a work requirement for contact forms, sign-ups or public submissions.
Bind a challenge to the submission content, have the submitter return a receipt,
and consume it once. Measure ordinary-user delay alongside the cost of repeated
automated submissions. Compare against a conventional hash puzzle at matched
total solving cost.

## Agent tools and job queues

Explore per-action work requirements for automated clients. An agent can solve a
challenge and another program can check its receipt before accepting a tool call
or queued job. Investigate request binding, expiry, retries and repeated use.

For these integrations, move the solver to the requester and make acceptance
state durable. The shipped server runs both roles locally for inspection;
the protocol and native executables are the starting components.

## Protocol design and benchmarks

Vary the base, difficulty, role selection and worker count. Compare search time,
completion-time variation and verification cost. The lab supports bases 2–36;
the native solver supports serial and OpenMP search. The recorded benchmark and
C/GMP experiments provide a reproducible starting point.

## Security teaching and testing

Issue a challenge, inspect its exact hash bytes, solve both roles, and verify the
receipt independently. Alter a proof, remove a contribution, expire the challenge
or attempt a second redemption. Trace which checks reject each change in the
protocol, native code and issuer. The API tests already cover these scenarios.

## Comparisons to study

Work challenges have existing applications in web-traffic handling and request
prioritization. [Anubis's design](https://github.com/TecharoHQ/anubis/blob/main/docs/docs/design/how-anubis-works.mdx)
and [Tor's proof-of-work defense](https://blog.torproject.org/introducing-proof-of-work-defense-for-onion-services/)
offer concrete designs to compare. Bellpair supplies an arithmetic construction
for experimentation; these independent systems are useful evaluation references.

See [the protocol](PROTOCOL.md), [security scope](../SECURITY.md) and
[reproducible checks](../experiments/README.md) for implementation details.
