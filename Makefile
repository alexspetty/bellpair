CC ?= cc
CPPFLAGS += -D_POSIX_C_SOURCE=200809L -Isrc
CFLAGS ?= -O3 -std=c17 -Wall -Wextra -Wpedantic -Werror
OPENMP ?= -fopenmp
LDLIBS += -lgmp -lcrypto -lm

.PHONY: all test bench clean sanitize
all: build/work-solve build/work-verify build/work-bench build/work-test

build:
	mkdir -p build

build/work-solve: src/work.c src/work.h src/solve.c | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $(OPENMP) src/work.c src/solve.c $(LDLIBS) -o $@

build/work-verify: src/work.c src/work.h src/verify.c | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $(OPENMP) src/work.c src/verify.c $(LDLIBS) -o $@

build/work-test: src/work.c src/work.h experiments/test_core.c | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $(OPENMP) src/work.c experiments/test_core.c $(LDLIBS) -o $@

build/work-bench: src/work.c src/work.h experiments/bench.c | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $(OPENMP) src/work.c experiments/bench.c $(LDLIBS) -o $@

test: all
	./build/work-test
	node --test experiments/test_api.mjs experiments/test_bases.mjs

bench: build/work-bench
	./build/work-bench > experiments/benchmark.json

sanitize: | build
	$(CC) $(CPPFLAGS) -O1 -g -std=c17 -Wall -Wextra $(OPENMP) -fsanitize=address,undefined -fno-omit-frame-pointer src/work.c experiments/test_core.c $(LDLIBS) -o build/work-test-sanitize
	ASAN_OPTIONS=detect_leaks=0 ./build/work-test-sanitize

clean:
	rm -f build/work-solve build/work-verify build/work-bench build/work-test build/work-test-sanitize
