# Bellpair

Bellpair is an open-source experiment in paired proof of work: two hash-derived primes, one prescribed reflection pair, and a receipt that can be checked and redeemed once.

The name draws on quantum entanglement. The implementation uses classical arithmetic and SHA-256. Its mathematical ingredient is Alex Petty's collision reflection law, valid in every integer base b ≥ 2. This prototype supports bases 2–36.

## Project direction

This version is being released as research software under the [MIT license](LICENSE). Its value is a working, inspectable experiment: exact arithmetic, a native solver, a separate verifier, a local browser lab, and reproducible checks.

We have not demonstrated a compelling commercial application or a security or efficiency advantage over ordinary work puzzles. Further development should follow a concrete use case and measurements against an appropriate baseline. The experiment remains available for others to run, adapt and investigate; there is no token or investment offering.

## Run it

Requires a C17 compiler with OpenMP, GMP development headers, OpenSSL development headers, Make, and Node.js 22 or later. On Debian/Ubuntu the native development packages are `build-essential libgmp-dev libssl-dev`. No npm dependencies or dependency download is needed.

```sh
git clone https://github.com/alexspetty/bellpair.git
cd bellpair
make
make test
node server.mjs
```

Open **http://127.0.0.1:8787**. To change the port, set `BELLPAIR_PORT`.

1. Choose a base, enter a message, and choose a difficulty.
2. Find the two prime contributions. The server chooses the next reflection pair.
3. Verify the receipt with the separate C/GMP verifier.
4. Redeem it, then try replaying it. The second redemption is rejected.
5. Download the receipt for inspection or offline arithmetic verification.

```sh
node verify-receipt.mjs path/to/receipt.json
```

The offline verifier checks arithmetic only. Acceptance also requires an unexpired challenge issued by the running server. Restarting the server invalidates its outstanding challenges and redemption history.

## What is built

- Version 2 binds the chosen base into every proof; original v1 decimal receipts remain checkable.
- C/GMP solver, with up to four OpenMP workers in the demo.
- Separate C verifier: two hash checks, two deterministic 64-bit prime checks, and the prescribed reflection pair.
- Local challenge API: fresh identifiers, message binding, expiry, bounded search, cancellation, and atomic single redemption.
- Browser demo: actual search results, the selected base’s collision table, verification and replay controls, and recorded benchmarks.
- C/GMP mathematical checks and benchmarks under `experiments/`, plus API and browser integration checks.

Both contributions are required. An accepted receipt has an exactly zero sum of centered collision weights. This is an arithmetic completion rule; it supplies no extra secret or cryptographic hardness by itself.

The prototype runs the producer and verifier on the same computer so the whole flow is inspectable. It does not yet offload production work to a remote requester, implement network consensus, or issue currency.

## Measurements

```sh
make bench
```

The saved `experiments/benchmark.json` compares hash-only, hash-plus-residue, and hash-plus-residue-plus-prime searches at identical hash difficulties. It includes all 36 runs, compiler and GMP versions, and a verification timing. A bench run regenerates the file; timings depend on hardware and load.

The first run averaged about **1.27 seconds per paired-prime receipt** across difficulties 6, 8 and 10, versus **1.15 milliseconds for two hash-only contributions** at the same bit settings. Mean repeated arithmetic verification was **0.031 milliseconds**, excluding process startup. This small sample shows added work; it establishes neither a security nor an efficiency advantage. See [the experiment record](experiments/README.md).

## Read next

- [Protocol](docs/PROTOCOL.md): exact message bytes, receipt format, verification and API.
- [Mathematical basis](docs/MATHEMATICAL_BASIS.md): the finite reflection identity and the limits of the original chain proposal.
- [Security scope](SECURITY.md): current guarantees, assumptions, resource limits and deployment gaps.
- [Design note](docs/DESIGN.md): what this prototype tests and what evidence would justify further development.

This is a standalone repository. It reads no nfield files at runtime and has no npm dependencies.

## License

Copyright 2026 Alexander S. Petty. Released under the [MIT license](LICENSE). External libraries and cited research retain their own licenses.
