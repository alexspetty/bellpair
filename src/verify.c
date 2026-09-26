#include "work.h"
#include <stdio.h>
#include <string.h>

static int read_share(rw_share *s, unsigned residue, const char *nonce,
                      const char *prime, const char *digest) {
    if (!rw_nonce(nonce,&s->nonce) || !rw_u64(prime,&s->prime) || !rw_hex(digest,64)) return 0;
    s->residue=residue;
    for (unsigned i=0;i<32;++i) {
        unsigned value=0;
        if (sscanf(digest+2*i,"%2x",&value)!=1) return 0;
        s->digest[i]=(unsigned char)value;
    }
    return 1;
}

int main(int argc, char **argv) {
    rw_challenge c; rw_share shares[2];
    if ((argc != 12 && argc != 13) || !rw_challenge_args_base(&c,argv[1],argv[2],argv[3],argv[4],argv[5],argc==13?argv[12]:NULL) ||
        !read_share(&shares[0],c.pair_a,argv[6],argv[7],argv[8]) ||
        !read_share(&shares[1],rw_modulus(&c)-c.pair_a,argv[9],argv[10],argv[11])) {
        puts("{\"valid\":false,\"reason\":\"malformed input\"}"); return 2;
    }
    double start=rw_now();
    int first=rw_check_share(&c,c.pair_a,&shares[0]);
    int second=rw_check_share(&c,rw_modulus(&c)-c.pair_a,&shares[1]);
    int balance=rw_weight_base(rw_base(&c),c.pair_a)+rw_weight_base(rw_base(&c),rw_modulus(&c)-c.pair_a);
    int valid=first && second && balance==0;
    printf("{\"valid\":%s,\"sharesValid\":[%s,%s],\"balance\":%d,"
        "\"verificationMs\":%.6f,\"primality\":\"deterministic-u64\"}\n",
        valid?"true":"false",first?"true":"false",second?"true":"false",balance,
        (rw_now()-start)*1000);
    return valid?0:1;
}
