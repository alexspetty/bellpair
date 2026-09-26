#include "work.h"
#include <gmp.h>
#include <openssl/sha.h>
#include <omp.h>
#include <stdatomic.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <time.h>

int rw_hex(const char *s, size_t length) {
    if (s == NULL || strlen(s) != length) return 0;
    for (size_t i = 0; i < length; ++i)
        if (!((s[i] >= '0' && s[i] <= '9') || (s[i] >= 'a' && s[i] <= 'f'))) return 0;
    return 1;
}

int rw_u64(const char *s, uint64_t *out) {
    if (!s || !*s || (s[0] == '0' && s[1])) return 0;
    for (const char *p = s; *p; ++p) if (*p < '0' || *p > '9') return 0;
    errno = 0;
    char *end = NULL;
    unsigned long long value = strtoull(s, &end, 10);
    if (errno || !end || *end || value > UINT64_MAX) return 0;
    *out = (uint64_t)value;
    return 1;
}

int rw_nonce(const char *s, uint64_t *out) {
    if (!rw_hex(s, 16)) return 0;
    *out = 0;
    for (size_t i = 0; i < 16; ++i) {
        unsigned digit = (unsigned)(s[i] <= '9' ? s[i] - '0' : s[i] - 'a' + 10);
        *out = (*out << 4) | digit;
    }
    return 1;
}

unsigned rw_base(const rw_challenge *c) { return c->base ? c->base : 10; }
unsigned rw_modulus(const rw_challenge *c) { unsigned b=rw_base(c); return b*b; }
int rw_unit_base(unsigned base, unsigned a) {
    if (base < 2 || base > RW_MAX_BASE || a == 0 || a >= base*base) return 0;
    unsigned x=a, y=base;
    while (y) { unsigned r=x%y; x=y; y=r; }
    return x==1;
}
int rw_unit(unsigned a) { return rw_unit_base(10,a); }

int rw_challenge_args_base(rw_challenge *c, const char *id, const char *payload,
                           const char *pair, const char *bits, const char *expires, const char *base) {
    uint64_t a, bits_value, e, b=10;
    if (base && (!rw_u64(base,&b) || b<2 || b>RW_MAX_BASE)) return 0;
    if (!rw_hex(id, 32) || !rw_hex(payload, 64) || !rw_u64(pair, &a) ||
        !rw_u64(bits, &bits_value) || !rw_u64(expires, &e) || a >= b*b || a*2 >= b*b ||
        !rw_unit_base((unsigned)b,(unsigned)a) || bits_value > RW_MAX_BITS ||
        !e || e > UINT64_C(9999999999)) return 0;
    memcpy(c->id, id, 33);
    memcpy(c->payload_hash, payload, 65);
    c->base = base ? (unsigned)b : 0;
    c->pair_a = (unsigned)a;
    c->bits = (unsigned)bits_value;
    c->expires = e;
    return 1;
}
int rw_challenge_args(rw_challenge *c, const char *id, const char *payload,
                      const char *pair, const char *bits, const char *expires) {
    return rw_challenge_args_base(c,id,payload,pair,bits,expires,NULL);
}
int rw_collision_base(unsigned base, unsigned a) {
    if (!rw_unit_base(base,a)) return 0;
    int result = -1 - (int)(a / base);
    for (unsigned d = 0; d < base; ++d)
        result += (int)((((base+1)*d+1)*a)/(base*base)) - (int)(((base+1)*d*a)/(base*base));
    return result;
}
int rw_collision(unsigned a) { return rw_collision_base(10,a); }
int rw_weight_base(unsigned base, unsigned a) { return 2*rw_collision_base(base,a)+1; }
int rw_weight(unsigned a) { return rw_weight_base(10,a); }

void rw_digest(const rw_challenge *c, unsigned residue, uint64_t nonce,
               unsigned char out[32]) {
    unsigned char input[256];
    int length;
    if (c->base) {
        length = snprintf((char *)input, sizeof input,
            RW_PROTOCOL_V2 "\nid=%s\npayload=%s\nbase=%04u\npair=%04u,%04u\nbits=%02u\nexpires=%010" PRIu64
            "\nrole=%04u\nnonce=", c->id, c->payload_hash, c->base, c->pair_a,
            rw_modulus(c)-c->pair_a, c->bits, c->expires, residue);
    } else {
        length = snprintf((char *)input, sizeof input,
            RW_PROTOCOL "\nid=%s\npayload=%s\npair=%02u,%02u\nbits=%02u\nexpires=%010" PRIu64
            "\nrole=%02u\nnonce=", c->id, c->payload_hash, c->pair_a,
            100-c->pair_a, c->bits, c->expires, residue);
    }
    if (length < 0 || (size_t)length + 8 > sizeof input) abort();
    for (unsigned i = 0; i < 8; ++i) input[(size_t)length + i] = (unsigned char)(nonce >> (56 - 8 * i));
    if (!SHA256(input, (size_t)length + 8, out)) abort();
}

void rw_digest_hex(const unsigned char digest[32], char out[65]) {
    static const char digits[] = "0123456789abcdef";
    for (unsigned i = 0; i < 32; ++i) {
        out[2 * i] = digits[digest[i] >> 4];
        out[2 * i + 1] = digits[digest[i] & 15];
    }
    out[64] = '\0';
}

uint64_t rw_candidate(const unsigned char digest[32]) {
    uint64_t n = 0;
    for (unsigned i = 24; i < 32; ++i) n = (n << 8) | digest[i];
    return n | (UINT64_C(1) << 63) | UINT64_C(1);
}

int rw_difficulty(const unsigned char digest[32], unsigned bits) {
    if (bits > RW_MAX_BITS) return 0;
    for (unsigned i = 0; i < bits / 8; ++i) if (digest[i]) return 0;
    unsigned rest = bits % 8;
    return !rest || (digest[bits / 8] >> (8 - rest)) == 0;
}

/* The first 12 prime bases suffice below 2^64. See docs/PROTOCOL.md. */
int rw_is_prime(uint64_t value) {
    static const unsigned bases[] = {2,3,5,7,11,13,17,19,23,29,31,37};
    if (value < 2) return 0;
    for (unsigned i = 0; i < sizeof bases / sizeof bases[0]; ++i) {
        if (value == bases[i]) return 1;
        if (value % bases[i] == 0) return 0;
    }
    mpz_t n, d, a, x, n_minus_one;
    mpz_inits(n, d, a, x, n_minus_one, NULL);
    mpz_import(n, 1, 1, sizeof value, 0, 0, &value);
    mpz_sub_ui(n_minus_one, n, 1);
    mpz_set(d, n_minus_one);
    unsigned s = 0;
    while (mpz_even_p(d)) { mpz_fdiv_q_2exp(d, d, 1); ++s; }
    int prime = 1;
    for (unsigned i = 0; i < sizeof bases / sizeof bases[0] && prime; ++i) {
        mpz_set_ui(a, bases[i]);
        mpz_powm(x, a, d, n);
        if (mpz_cmp_ui(x, 1) == 0 || mpz_cmp(x, n_minus_one) == 0) continue;
        int passes = 0;
        for (unsigned r = 1; r < s; ++r) {
            mpz_mul(x, x, x); mpz_mod(x, x, n);
            if (mpz_cmp(x, n_minus_one) == 0) { passes = 1; break; }
        }
        if (!passes) prime = 0;
    }
    mpz_clears(n, d, a, x, n_minus_one, NULL);
    return prime;
}

int rw_check_share(const rw_challenge *c, unsigned residue, const rw_share *s) {
    unsigned char digest[32];
    if (residue != c->pair_a && residue != rw_modulus(c) - c->pair_a) return 0;
    if (s->residue != residue) return 0;
    rw_digest(c, residue, s->nonce, digest);
    return memcmp(digest, s->digest, 32) == 0 && rw_difficulty(digest, c->bits) &&
        rw_candidate(digest) == s->prime && s->prime % rw_modulus(c) == residue && rw_is_prime(s->prime);
}

double rw_now(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts)) abort();
    return (double)ts.tv_sec + (double)ts.tv_nsec / 1e9;
}

int rw_search(const rw_challenge *c, unsigned residue, uint64_t max_attempts,
              unsigned threads, int mode, rw_share *share, rw_stats *stats) {
    if (!max_attempts || max_attempts > RW_MAX_ATTEMPTS || !threads ||
        threads > RW_MAX_THREADS || mode < 0 || mode > 2) return 0;
    atomic_int found = 0;
    uint64_t attempts = 0, primality_tests = 0;
    double start = rw_now();
    #pragma omp parallel num_threads(threads) reduction(+:attempts,primality_tests)
    {
        unsigned tid = (unsigned)omp_get_thread_num();
        unsigned stride = (unsigned)omp_get_num_threads();
        for (uint64_t nonce = tid; nonce < max_attempts; nonce += stride) {
            if (atomic_load_explicit(&found, memory_order_relaxed)) break;
            unsigned char digest[32];
            rw_digest(c, residue, nonce, digest);
            ++attempts;
            if (!rw_difficulty(digest, c->bits)) continue;
            uint64_t prime = rw_candidate(digest);
            if (mode >= 1 && prime % rw_modulus(c) != residue) continue;
            if (mode == 2) { ++primality_tests; if (!rw_is_prime(prime)) continue; }
            int expected = 0;
            if (atomic_compare_exchange_strong(&found, &expected, 1)) {
                share->nonce = nonce; share->prime = prime; share->residue = residue;
                memcpy(share->digest, digest, 32);
            }
            break;
        }
    }
    stats->attempts = attempts;
    stats->primality_tests = primality_tests;
    stats->seconds = rw_now() - start;
    return atomic_load(&found);
}

void rw_print_share_base(const rw_share *share, unsigned base) {
    char digest[65]; rw_digest_hex(share->digest, digest);
    printf("{\"residue\":%u,\"nonce\":\"%016" PRIx64 "\",\"prime\":\"%" PRIu64
        "\",\"digest\":\"%s\",\"collision\":%d,\"weight\":%d}",
        share->residue, share->nonce, share->prime, digest,
        rw_collision_base(base,share->residue), rw_weight_base(base,share->residue));
}

void rw_print_share(const rw_share *share) { rw_print_share_base(share,10); }
