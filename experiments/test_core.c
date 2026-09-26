#include "work.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

/* Independent fixture transcribed from The Collision Periodic Table, base ten. */
static const int table[10][4] = {
    {0,2,0,8}, {-1,-1,1,-1}, {0,-2,6,0}, {-1,-1,-3,-1}, {-4,0,-2,0},
    {-1,1,-1,3}, {0,2,0,0}, {-1,-7,1,-1}, {0,-2,0,0}, {-9,-1,-3,-1}
};
static int trial_prime(unsigned n) {
    if (n<2) return 0;
    for (unsigned d=2; d<=n/d; ++d) if (n%d==0) return 0;
    return 1;
}
int main(void) {
    const unsigned ends[]={1,3,7,9};
    unsigned checks=0;
    for (unsigned row=0; row<10; ++row) for (unsigned col=0; col<4; ++col) {
        unsigned a=10*row+ends[col];
        assert(rw_collision(a)==table[row][col]);
        assert(rw_collision(a)+rw_collision(100-a)==-1);
        assert(rw_weight(a)+rw_weight(100-a)==0); checks+=3;
    }
    for(unsigned base=2;base<=36;++base) for(unsigned a=1;a<base*base;++a) if(rw_unit_base(base,a)) {
        assert(rw_collision_base(base,a)+rw_collision_base(base,base*base-a)==-1);
        assert(rw_weight_base(base,a)+rw_weight_base(base,base*base-a)==0); checks+=2;
    }
    for (unsigned n=0;n<=100000;++n) { assert(rw_is_prime(n)==trial_prime(n)); ++checks; }
    const uint64_t composites[]={561,1105,1729,3215031751ULL,341550071728321ULL,
        3825123056546413051ULL,UINT64_MAX,18446744030759878681ULL};
    for (unsigned i=0;i<sizeof composites/sizeof composites[0];++i) {
        assert(!rw_is_prime(composites[i])); ++checks;
    }
    assert(rw_is_prime(UINT64_C(18446744073709551557))); ++checks;
    uint64_t value;
    assert(rw_u64("18446744073709551615",&value) && value==UINT64_MAX);
    const char *bad[]={"", "01", "-1", "+1", " 1", "1x", "18446744073709551616"};
    for (unsigned i=0;i<sizeof bad/sizeof bad[0];++i) { assert(!rw_u64(bad[i],&value)); ++checks; }
    assert(!rw_nonce("fffffffffffffffg",&value));
    assert(rw_nonce("ffffffffffffffff",&value) && value==UINT64_MAX);
    rw_challenge c;
    const char *id="00000000000000000000000000000000";
    const char *payload="0000000000000000000000000000000000000000000000000000000000000000";
    assert(rw_challenge_args(&c,id,payload,"9","0","2000000000"));
    assert(!rw_challenge_args(&c,id,payload,"5","0","2000000000"));
    assert(!rw_challenge_args(&c,id,payload,"91","0","2000000000"));
    assert(!rw_challenge_args(&c,id,payload,"9","21","2000000000"));
    assert(!rw_challenge_args(&c,id,payload,"9","0","10000000000"));
    unsigned char digest[32]; char hex[65];
    rw_digest(&c,9,42,digest); rw_digest_hex(digest,hex);
    assert(strcmp(hex,"1b403cf45052af233029f70d20fee4b73ceb6b22f1491ab4f5d96aa9f3646c70")==0);
    memset(digest,0,sizeof digest); digest[1]=0x0f;
    assert(rw_difficulty(digest,12)); assert(!rw_difficulty(digest,13));
    assert(rw_difficulty(digest,0)); assert(!rw_difficulty(digest,21));
    unsigned pairs=0;
    for (unsigned a=1;a<50;++a) if (rw_unit(a)) {
        c.pair_a=a;
        for (unsigned i=0;i<2;++i) {
            unsigned residue=i?100-a:a; rw_share s; rw_stats stats;
            assert(rw_search(&c,residue,100000,1,2,&s,&stats));
            assert(stats.attempts>0 && stats.primality_tests>0);
            assert(rw_check_share(&c,residue,&s));
            rw_share changed=s; changed.prime^=2;
            assert(!rw_check_share(&c,residue,&changed));
            changed=s; changed.nonce^=1; assert(!rw_check_share(&c,residue,&changed));
            changed=s; changed.digest[0]^=1; assert(!rw_check_share(&c,residue,&changed));
            assert(!rw_check_share(&c,100-residue,&s));
            rw_challenge altered=c; altered.payload_hash[0]='1';
            assert(!rw_check_share(&altered,residue,&s));
            altered=c; altered.id[0]='1'; assert(!rw_check_share(&altered,residue,&s));
            altered=c; ++altered.expires; assert(!rw_check_share(&altered,residue,&s));
            altered=c; ++altered.bits; assert(!rw_check_share(&altered,residue,&s)); checks+=10;
        }
        ++pairs;
    }
    rw_share parallel; rw_stats stats;
    assert(rw_search(&c,c.pair_a,100000,4,2,&parallel,&stats));
    assert(rw_check_share(&c,c.pair_a,&parallel));
    printf("C/GMP checks passed: %u checks; %u reflection pairs; serial and OpenMP search.\n",checks,pairs);
    return 0;
}
