# Reflection work, version 1

The protocol identifier is `reflection-work/v1`, independent of product branding. Prime candidates and nonces are unsigned 64-bit integers. Integers larger than JavaScript's exact numeric range are always represented as strings in JSON.

## Challenge

The issuer chooses:

| Field | Representation |
|---|---|
| `id` | 16 random bytes, 32 lowercase hexadecimal characters |
| `payloadHash` | SHA-256 of the exact UTF-8 message, 64 lowercase hexadecimal characters |
| `pairA` | Odd integer below 50, not divisible by 5 |
| `difficultyBits` | Integer 0–20 in the core; the local API accepts 0–12 |
| `expiresAt` | Unix seconds, integer 1–9999999999 |

The two roles are `pairA` and `100-pairA`, in that order. The expiry is included in the hash. Actual expiry enforcement belongs to the issuer; an offline arithmetic verifier cannot certify issuance or redemption.

## Hash input

Concatenate the following ASCII prefix with **eight raw big-endian nonce bytes**, with no final newline. Each line separator shown is a single LF byte. The digits in `pair`, `bits`, and `role` are zero-padded to two places; expiry is zero-padded to ten places.

```text
reflection-work/v1
id=<32 lowercase hexadecimal characters>
payload=<64 lowercase hexadecimal characters>
pair=<AA>,<BB>
bits=<DD>
expires=<EEEEEEEEEE>
role=<RR>
nonce=<eight binary bytes, not hexadecimal text>
```

Let `H` be SHA-256 of those bytes. Its first `difficultyBits` bits must be zero. Interpret the last eight bytes of `H` as a big-endian integer, set bit 63 and bit 0, and call the result `p`. This ensures an odd candidate in `[2^63, 2^64)` without affecting the difficulty bits. Require `p mod 100 = role` and `p` prime.

The displayed nonce is a 16-character lowercase hexadecimal string. The displayed candidate is a decimal string. A proof includes the full digest, and verification recomputes it.

Serialization fixture: all-zero ID and payload digest, pair 09/91, difficulty 00, expiry 2000000000, role 09, and nonce 42 produce:

```text
1b403cf45052af233029f70d20fee4b73ceb6b22f1491ab4f5d96aa9f3646c70
```

Both C and Node's independent SHA-256 serialization check this encoding.

## Deterministic prime check

The C implementation performs exact GMP modular arithmetic with the first twelve prime Miller–Rabin bases: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37. It first handles small numbers and divisibility by these primes.

Sorenson and Webster's Theorem 1.1 gives the smallest composite passing these twelve bases as `318665857834031151167461`, greater than `2^64`. Therefore this fixed test is deterministic on the entire candidate domain. Extending the candidate width would require revisiting this argument. The implementation does not label a randomly sampled probable prime as a certified prime.

Source: https://arxiv.org/abs/1509.00864. GMP exponentiation: https://gmplib.org/manual/Integer-Exponentiation.

## Receipt

```json
{
  "version": 1,
  "protocol": "reflection-work/v1",
  "challenge": {
    "id": "...", "payloadHash": "...", "pairA": 9,
    "difficultyBits": 8, "expiresAt": 2000000000
  },
  "shares": [
    {"residue": 9, "nonce": "...", "prime": "...", "digest": "...", "collision": 8, "weight": 17},
    {"residue": 91, "nonce": "...", "prime": "...", "digest": "...", "collision": -9, "weight": -17}
  ],
  "balance": 0,
  "search": {"attempts": 0, "primalityTests": 0, "seconds": 0, "threads": 1}
}
```

This example is schematic, not a valid proof. `search` is optional producer metadata: the receiver does not trust its timings or attempt count. All challenge fields, proof fields, residues, collision entries, weights and the zero balance are checked. The server compares the supplied challenge with its originally issued record rather than accepting an arbitrary caller-selected difficulty.

The verifier rejects malformed numbers, noncanonical hexadecimal, reversed roles, missing contributions and changed metadata that affects validity. Hash correctness, difficulty, candidate derivation, residue and primality must all pass. Balance alone is insufficient.

## Executables

```text
build/work-solve ID PAYLOAD_SHA256 PAIR_A BITS EXPIRES MAX_ATTEMPTS THREADS
build/work-verify ID PAYLOAD_SHA256 PAIR_A BITS EXPIRES NONCE_A PRIME_A DIGEST_A NONCE_B PRIME_B DIGEST_B
node verify-receipt.mjs receipt.json
```

The solver searches each role, using disjoint nonce strides among OpenMP workers. It stops after both are found, an attempt cap is reached, or the API cancels it. Search is nondeterministic across worker schedules; any returned receipt has the same acceptance criteria. The per-role nonce search covers `[0,MAX_ATTEMPTS)`. The core caps attempts at 100 million and workers at eight.

The verifier is a separate executable and never repeats the search. It shares the reviewed arithmetic library with the solver; this is not a second independent implementation of primality.

## Local API

All mutations require `Content-Type: application/json`. The service binds only to `127.0.0.1`; Host and Origin checks reject other sites. No CORS access is enabled.

| Method | Endpoint | Operation |
|---|---|---|
| GET | `/api/meta` | Brand, table and limits |
| GET | `/api/benchmark` | Recorded benchmark |
| POST | `/api/challenges` | `{payload, difficultyBits}` → issued challenge |
| POST | `/api/solve` | `{id}` → bounded asynchronous local search |
| GET | `/api/jobs/:id` | Phase, found contributions, final receipt or failure |
| POST | `/api/cancel` | `{id}` → cancel that search |
| POST | `/api/verify` | `{receipt}` → check without consuming |
| POST | `/api/redeem` | `{receipt}` → verify and consume once |

Challenges expire after ten minutes. The demo retains at most 64 challenge records, one active search, and four active verifier processes. Each role gets at most 25 million attempts, and an entire search gets 30 seconds. An exhausted challenge can be retried, but the search restarts the same nonce range; use a new challenge to obtain a new range of candidates.

Redemption rechecks expiry and used state after asynchronous verification, then marks the record synchronously. Two simultaneous requests cannot both consume it. Verification may still report arithmetic validity for an already used receipt; acceptance of that receipt is a separate decision.
