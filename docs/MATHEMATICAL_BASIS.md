# Mathematical basis

For every integer base b ≥ 2, take q = b² and an eligible ending a with 0 < a < q and gcd(a,b) = 1. The collision fingerprint is T_b(a). There are φ(b²) eligible endings, paired by reflection. The prototype implements bases 2–36.

The prototype computes the paper's finite formula using exact integer arithmetic:

```text
T_b(a) = -1 - floor(a/b)
         + sum over d=0,...,b-1 of
           [floor(((b+1)d+1)a/b²) - floor((b+1)da/b²)].
```

Reflection gives T_b(a) + T_b(q−a) = −1. Define w_b(a) = 2T_b(a) + 1. Then w_b(a) + w_b(q−a) = 0 exactly.

In base ten, for example, `T(9)=8` and `T(91)=-9`, so the centered weights are `+17` and `-17`. A complete receipt must contain one valid proof ending in 09 and one ending in 91. Choosing either one would not force balance.

The C test compares the computed values with an independent transcription of all 40 published decimal entries and checks reflection over every supported base. The all-base reflection identity is also proved in the paper.

## What the arithmetic contributes

The pair is an explicit completion condition. The server chooses the pair before work starts, and each side has its own hash domain. A verifier can check the final receipt without repeating the search. SHA-256 binds the search to the message, challenge, base, difficulty, expiry and side.

Pair balance does not establish added resistance to forgery, faster verification, efficient mining, or even difficulty across hardware. Those are protocol properties requiring separate analysis. The fingerprint depends only on a public residue; it is not a secret and is not the source of the search cost.

## Why the original chain claim was changed

The published centered convergence theorem concerns a reciprocal-weighted prime sum in its specified order. It does not say that an unweighted sum over miner-selected primes converges, or that deviations in a mined sequence identify an attack. Finite reflection and neutrality do not establish that extension.

Bellpair instead makes each completed pair balance by construction. The running sum of completed pairs is exactly zero. This follows from requiring both partners; no asymptotic convergence theorem is invoked.

The nine silent decimal multipliers are a property of the collision model, not a cryptographic security parameter here. Rotating the issued target visits every pair after φ(b²)/2 issued challenges within that base, but users can abandon challenges. This does not prove fair participation or coverage among completed receipts.

## Sources

- Alex Petty, *The Collision Periodic Table*, fixed Version 4: https://doi.org/10.5281/zenodo.22644987. Formula, reflection law, and decimal table. Source inspected: `blog-site/papers/collision_periodic_table.tex` in the nfield research repository, 26 September 2026.
- Alex Petty, *The Centered Collision Sum*, fixed Version 3: https://doi.org/10.5281/zenodo.22644339. The scope of the ordered reciprocal-weighted convergence statement. Source inspected: `blog-site/papers/centered_collision_sum.tex`, 26 September 2026.
- Jonathan Sorenson and Jonathan Webster, *Strong Pseudoprimes to Twelve Prime Bases*, Theorem 1.1: https://arxiv.org/abs/1509.00864. Supplies the deterministic bound used for the 64-bit Miller–Rabin test.
- Sunny King, *Primecoin: Cryptocurrency with Prime Number Proof-of-Work*: https://primecoin.io/primecoin-paper.pdf. Prime-based work has precedent; this prototype makes no novelty claim about prime mining itself.

The original mathematical work remains separate from this protocol experiment. No RH/GRH statement or unresolved lower-bound estimate is assumed by the software.
