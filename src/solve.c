#include "work.h"
#include <inttypes.h>
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
    rw_challenge c;
    uint64_t attempts, threads;
    if ((argc != 8 && argc != 9) || !rw_challenge_args_base(&c,argv[1],argv[2],argv[3],argv[4],argv[5],argc==9?argv[8]:NULL) ||
        !rw_u64(argv[6],&attempts) || !attempts || attempts > RW_MAX_ATTEMPTS ||
        !rw_u64(argv[7],&threads) || !threads || threads > RW_MAX_THREADS) {
        fprintf(stderr,"usage: work-solve ID_HEX PAYLOAD_SHA256 PAIR_A BITS EXPIRES MAX_ATTEMPTS THREADS [BASE]\n");
        return 2;
    }
    rw_share shares[2]; rw_stats stats[2];
    for (unsigned i=0;i<2;++i) {
        unsigned residue=i ? rw_modulus(&c)-c.pair_a : c.pair_a;
        fprintf(stderr,"{\"event\":\"phase\",\"residue\":%u}\n",residue); fflush(stderr);
        if (!rw_search(&c,residue,attempts,(unsigned)threads,2,&shares[i],&stats[i])) {
            fprintf(stderr,"{\"event\":\"exhausted\",\"residue\":%u,\"attempts\":%" PRIu64 "}\n",residue,stats[i].attempts);
            return 3;
        }
        fprintf(stderr,"{\"event\":\"found\",\"residue\":%u,\"prime\":\"%" PRIu64
            "\",\"attempts\":%" PRIu64 ",\"seconds\":%.6f}\n",
            residue,shares[i].prime,stats[i].attempts,stats[i].seconds); fflush(stderr);
    }
    printf("{\"version\":%u,\"protocol\":\"%s\",\"challenge\":{\"id\":\"%s\","
        "\"payloadHash\":\"%s\",\"pairA\":%u,\"difficultyBits\":%u,\"expiresAt\":%" PRIu64,
        c.base?2U:1U,c.base?RW_PROTOCOL_V2:RW_PROTOCOL,c.id,c.payload_hash,c.pair_a,c.bits,c.expires);
    if(c.base) printf(",\"base\":%u",c.base);
    printf("},\"shares\":[");
    rw_print_share_base(&shares[0],rw_base(&c)); printf(","); rw_print_share_base(&shares[1],rw_base(&c));
    printf("],\"balance\":0,\"search\":{\"attempts\":%" PRIu64 ",\"primalityTests\":%" PRIu64
        ",\"seconds\":%.6f,\"threads\":%" PRIu64 "}}\n",
        stats[0].attempts+stats[1].attempts,stats[0].primality_tests+stats[1].primality_tests,
        stats[0].seconds+stats[1].seconds,threads);
    return 0;
}
