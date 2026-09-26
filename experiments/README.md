# Reproducible checks

The mathematical core and benchmark use C with GMP, OpenSSL and OpenMP. Node tests check serialization, API behavior and the browser. No Python numerical runner is used.

```sh
make test
make sanitize
make bench
```

`test_core.c` checks the full published decimal table, all reflection pairs, primality against trial division through 100000, selected strong pseudoprimes and 64-bit endpoints, canonical parsing, fixed hash bytes, every pair's solved proofs, tampering, and both serial and parallel search.

`test_api.mjs` checks message binding, rotation through all 20 pairs, independent SHA-256 serialization, the separate C verifier, proof and metadata tampering, missing/swapped partners, concurrent redemption, expiry, cross-origin refusal, invalid limits, asynchronous solving and cancellation.

`make sanitize` runs the C tests with AddressSanitizer and UndefinedBehaviorSanitizer. Leak detection is disabled for this OpenMP/GMP run; it is not a memory-leak certification.

## Browser check

With the local server and a compatible ChromeDriver running:

```sh
chromedriver --port=9515 --allowed-ips=127.0.0.1
node experiments/browser_smoke.mjs
```

This creates its own headless browser session and closes it afterward. The check requires Chromium available to ChromeDriver. `BELLPAIR_URL` and `WEBDRIVER_URL` override the defaults. It exercises search, verify, redeem and replay, checks 1440/390-pixel layouts for horizontal overflow, and writes screenshots, the receipt and a check record to ignored `experiments/artifacts/`.

The intentional replay generates HTTP 409; that specific network log entry is expected. Other severe browser messages fail the check.

## Initial benchmark, 26 September 2026

Compiler: GCC 13.3.0. GMP: 6.3.0. One worker. Four deterministic challenges at each of 6, 8 and 10 hash bits, using pair 09/91; two contributions per trial. All three methods use identical challenge messages and nonce order.

| Method | Mean attempts per pair | Mean milliseconds per pair |
|---|---:|---:|
| Hash only | 651.417 | 1.154755 |
| Hash + residue | 59986.667 | 78.629612 |
| Hash + residue + prime | 956517.833 | 1269.027384 |

Repeated arithmetic verification of a completed pair averaged 0.031264 ms across 1000 repetitions. These measurements exclude process startup and HTTP overhead. A fresh verifier process in the browser can take longer because of initialization and scheduling.

All 36 search records are in `benchmark.json`. The small sample mixes three difficulty levels and one reflection pair, and is only a local cost diagnostic. In particular, equal hash bits do not mean equal total work. No security or performance superiority follows from this comparison.

Generated browser screenshots and receipts are local artifacts, not a durable archive. The source scripts and the recorded benchmark are retained as the reproducible starting point.
