#ifndef REFLECTION_WORK_H
#define REFLECTION_WORK_H
#include <stdint.h>
#include <stddef.h>

#define RW_MAX_BITS 20U
#define RW_MAX_ATTEMPTS UINT64_C(100000000)
#define RW_MAX_THREADS 8U
#define RW_PROTOCOL "reflection-work/v1"
#define RW_PROTOCOL_V2 "reflection-work/v2"
#define RW_MAX_BASE 36U

typedef struct {
    char id[33];
    char payload_hash[65];
    unsigned base; /* Zero selects the legacy decimal v1 encoding. */
    unsigned pair_a;
    unsigned bits;
    uint64_t expires;
} rw_challenge;

typedef struct {
    uint64_t nonce;
    uint64_t prime;
    unsigned residue;
    unsigned char digest[32];
} rw_share;

typedef struct {
    uint64_t attempts;
    uint64_t primality_tests;
    double seconds;
} rw_stats;

int rw_hex(const char *s, size_t length);
int rw_u64(const char *s, uint64_t *out);
int rw_nonce(const char *s, uint64_t *out);
int rw_challenge_args(rw_challenge *c, const char *id, const char *payload,
                      const char *pair, const char *bits, const char *expires);
int rw_unit(unsigned a);
int rw_challenge_args_base(rw_challenge *c, const char *id, const char *payload,
                          const char *pair, const char *bits, const char *expires, const char *base);
unsigned rw_base(const rw_challenge *c);
unsigned rw_modulus(const rw_challenge *c);
int rw_unit_base(unsigned base, unsigned a);
int rw_collision_base(unsigned base, unsigned a);
int rw_weight_base(unsigned base, unsigned a);
int rw_collision(unsigned a);
int rw_weight(unsigned a);
void rw_digest(const rw_challenge *c, unsigned residue, uint64_t nonce,
               unsigned char out[32]);
void rw_digest_hex(const unsigned char digest[32], char out[65]);
uint64_t rw_candidate(const unsigned char digest[32]);
int rw_difficulty(const unsigned char digest[32], unsigned bits);
int rw_is_prime(uint64_t n);
int rw_check_share(const rw_challenge *c, unsigned residue, const rw_share *s);
/* mode: 0=hash only, 1=hash+residue, 2=hash+residue+prime. */
int rw_search(const rw_challenge *c, unsigned residue, uint64_t max_attempts,
              unsigned threads, int mode, rw_share *share, rw_stats *stats);
void rw_print_share(const rw_share *share);
void rw_print_share_base(const rw_share *share, unsigned base);
double rw_now(void);
#endif
