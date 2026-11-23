# PitchIQ watch core: host tests.   make test | make vectors | make clean
CC      ?= gcc
NODE    ?= node
CFLAGS  := -std=c99 -Wall -Wextra -Werror -O2
SRCS    := pq_sec.c pq_core.c tests/test_core.c
HDRS    := pq_sec.h pq_core.h
BUILD   := build

.PHONY: test vectors clean

test: $(BUILD)/test_core $(BUILD)/test_core_san tests/vectors.json
	$(BUILD)/test_core tests/vectors.json
	@echo "--- again with -fsanitize=address,undefined"
	$(BUILD)/test_core_san tests/vectors.json
	@echo "sanitizer run: clean (no ASan/UBSan reports, exit 0)"

$(BUILD)/test_core: $(SRCS) $(HDRS) | $(BUILD)
	$(CC) $(CFLAGS) $(SRCS) -o $@

$(BUILD)/test_core_san: $(SRCS) $(HDRS) | $(BUILD)
	$(CC) $(CFLAGS) -g -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer $(SRCS) -o $@

$(BUILD):
	mkdir -p $(BUILD)

# Regenerate tests/vectors.json from the original JS (override the path with PQ_JS=...)
vectors:
	$(NODE) tests/gen_vectors.js tests/vectors.json

tests/vectors.json:
	$(NODE) tests/gen_vectors.js tests/vectors.json

clean:
	rm -rf $(BUILD)
