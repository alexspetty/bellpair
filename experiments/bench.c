#include "work.h"
#include <gmp.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    const unsigned difficulties[]={6,8,10};
    const char *names[]={"hash-only","hash-and-residue","paired-prime"};
    rw_challenge c; memset(&c,0,sizeof c);
    memset(c.payload_hash,'0',64); c.pair_a=9; c.expires=2000000000;
    unsigned rows=0; rw_share last[2];
    double totals[3]={0}; uint64_t attempts[3]={0};
    printf("{\"protocol\":\"" RW_PROTOCOL "\",\"gmp\":\"%s\",\"compiler\":\"%s\","
           "\"threads\":1,\"trialsPerDifficulty\":4,\"sharesPerTrial\":2,\"pair\":[9,91],"
           "\"note\":\"Same hash bits, message and nonce order. Extra filters increase work; this is not a matched-cost security comparison.\",\"runs\":[",
           gmp_version,__VERSION__);
    for (unsigned b=0;b<3;++b) for (unsigned trial=0;trial<4;++trial) {
        snprintf(c.id,sizeof c.id,"%032u",100+b*4+trial); c.bits=difficulties[b];
        for (int mode=0;mode<3;++mode) {
            rw_stats combined={0};
            for (unsigned i=0;i<2;++i) {
                rw_stats s; rw_share share;
                if (!rw_search(&c,i?91:9,RW_MAX_ATTEMPTS,1,mode,&share,&s)) {
                    fputs("Benchmark search exhausted\n",stderr); return 1;
                }
                if (mode==2) last[i]=share;
                combined.attempts+=s.attempts; combined.primality_tests+=s.primality_tests;
                combined.seconds+=s.seconds;
            }
            totals[mode]+=combined.seconds; attempts[mode]+=combined.attempts;
            if (rows++) printf(",");
            printf("{\"mode\":\"%s\",\"bits\":%u,\"trial\":%u,\"attempts\":%" PRIu64
                ",\"primalityTests\":%" PRIu64 ",\"seconds\":%.9f}",
                names[mode],c.bits,trial,combined.attempts,combined.primality_tests,combined.seconds);
        }
    }
    double start=rw_now();
    for (unsigned i=0;i<1000;++i)
        if (!rw_check_share(&c,9,&last[0]) || !rw_check_share(&c,91,&last[1])) return 1;
    double verification=(rw_now()-start);
    printf("],\"summary\":[");
    for (unsigned mode=0;mode<3;++mode) {
        if (mode) printf(",");
        printf("{\"mode\":\"%s\",\"meanMilliseconds\":%.6f,\"meanAttempts\":%.3f}",
            names[mode],1000*totals[mode]/12,(double)attempts[mode]/12);
    }
    printf("],\"meanVerificationMilliseconds\":%.6f,\"verificationRepetitions\":1000}\n",verification);
    return 0;
}
