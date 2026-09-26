# A concrete starting point

The original Collision Chain proposal suggested prime work, rotating reflection pairs, and a running collision invariant. The first build isolates the smallest useful mechanism: **a request must bring two verifiable contributions with a prescribed arithmetic relationship**.

Each partner is publicly knowable. The task is to find two challenge-bound SHA-256 outputs that meet their respective criteria. The work product is a compact receipt, independently checkable without rerunning the search. Both partners must be present for completion.

The reflection law supplies the relationship. The fresh hash challenge supplies request binding. The issuer's state supplies expiry and one-time acceptance. Keeping those responsibilities explicit prevents us from attributing cryptographic properties to a finite balance identity.

## What the prototype can answer

- How much extra search do the residue and prime filters require?
- How much does verification cost compared with search?
- Can a user understand the two-part receipt and its exact balance?
- Does the basic implementation reject tampering, omission, expired work and replay?

The first measurements show a large search/verification gap and a substantial increase in search over hash-only work at equal hash bits. They do not show that the increase creates a useful advantage. That requires comparing systems at matched total cost, including hostile strategies and receiver overhead.

## Direction after the initial assessment

The current build remains an experiment. The assessment did not establish a compelling commercial advantage, and the proposed new patent filing for this version is not being pursued. The code is being released under MIT so that others can reproduce the measurements and explore applications.

The useful assets are the implementation, exact arithmetic, receipts, tests and measured limits. A future product direction should be supported by a specific customer problem and a demonstrated advantage over an established alternative. The following experiment is an option if such an application emerges, not a promised product roadmap.

## Possible next experiment

Build a requester that solves an issued challenge on a different process or machine and returns only the receipt. Compare it against a hash-only challenge adjusted to the same median solving time, across the reflection pairs in each base being evaluated (20 pairs in base ten). Record verifier cost, solve-time variance, abandonment/reissue strategies and throughput under invalid submissions.

A promising result would identify a concrete application that benefits from requiring two contributions. If it does not, the table remains an understandable completion rule, with its computational overhead measured honestly.

## Provenance and name

Alex chose **Bellpair** during the prototype build on 26 September 2026. The name refers to the idea of paired quantum states; the implementation is classical. No trademark or domain clearance has been performed.

All mathematical experiments are in C/GMP under `experiments/`, with OpenMP for parallel search. JavaScript provides local orchestration, protocol-format checks and the browser interface. The repository is independent of the nfield research checkout; the published papers are credited in the mathematical basis document.
