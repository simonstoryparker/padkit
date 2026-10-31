#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
    uint16_t buttons, lt, rt;
    int16_t lx, ly, rx, ry;
    bool guide;
} PadState;

bool gip_parse(const uint8_t *packet, size_t size, PadState *state);
// DS4 USB compatibility report: preserves physical button positions (A -> Cross).
void pad_report(const PadState *state, uint8_t counter, uint8_t report[64]);
extern const uint8_t pad_descriptor[];
extern const size_t pad_descriptor_size;
