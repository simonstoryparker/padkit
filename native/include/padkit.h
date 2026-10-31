#pragma once
#include <stdbool.h>
#include <stdint.h>

#define PADKIT_MAGIC 0x31415750u
#define POWERA_MAGIC PADKIT_MAGIC

// Wire frame protocol (32 bytes).
typedef struct {
    uint32_t magic, version, sequence, connected;
    int16_t lx, ly, rx, ry;
    uint16_t buttons, lt, rt, guide;
} PadkitFrame;

typedef PadkitFrame PowerAFrame;

#ifdef __cplusplus
static_assert(sizeof(PadkitFrame) == 32, "wire frame must be 32 bytes");
extern "C" {
#else
_Static_assert(sizeof(PadkitFrame) == 32, "wire frame must be 32 bytes");
#endif

// Standard 17 W3C button indices
enum {
    PADKIT_BUTTON_A = 0,
    PADKIT_BUTTON_B = 1,
    PADKIT_BUTTON_X = 2,
    PADKIT_BUTTON_Y = 3,
    PADKIT_BUTTON_LB = 4,
    PADKIT_BUTTON_RB = 5,
    PADKIT_BUTTON_LT = 6,
    PADKIT_BUTTON_RT = 7,
    PADKIT_BUTTON_BACK = 8,
    PADKIT_BUTTON_START = 9,
    PADKIT_BUTTON_L3 = 10,
    PADKIT_BUTTON_R3 = 11,
    PADKIT_BUTTON_DPAD_UP = 12,
    PADKIT_BUTTON_DPAD_DOWN = 13,
    PADKIT_BUTTON_DPAD_LEFT = 14,
    PADKIT_BUTTON_DPAD_RIGHT = 15,
    PADKIT_BUTTON_GUIDE = 16,
    PADKIT_BUTTON_COUNT = 17
};

// Standard 6 axes
enum {
    PADKIT_AXIS_LX = 0,
    PADKIT_AXIS_LY = 1,
    PADKIT_AXIS_RX = 2,
    PADKIT_AXIS_RY = 3,
    PADKIT_AXIS_LT = 4,
    PADKIT_AXIS_RT = 5,
    PADKIT_AXIS_COUNT = 6
};

// Normalized state representation for any application
typedef struct {
    bool connected;
    uint32_t sequence;
    // Axes normalized: lx, ly, rx, ry [-1.0 .. 1.0], lt, rt [0.0 .. 1.0]
    float axes[PADKIT_AXIS_COUNT];
    // Buttons normalized: 0.0 or 1.0 (triggers 0.0 .. 1.0)
    float buttons[PADKIT_BUTTON_COUNT];
} PadkitState;

// Client management
void padkit_client_start(void);
void padkit_client_stop(void);
bool padkit_client_snapshot(PadkitState *out);
bool padkit_client_raw(PadkitFrame *out);

// Normalization and utilities
void padkit_normalize(const PadkitFrame *frame, PadkitState *out);
float padkit_axis(int16_t value);
const char *padkit_socket_path(void);

// Backwards-compatible aliases
void powera_client_start(void);
PowerAFrame powera_client_snapshot(void);
const char *powera_socket_path(void);
float powera_axis(int16_t value);
uint32_t powera_unity_buttons(uint16_t buttons);
void powera_frc_state(const PowerAFrame *input, float axes[6], uint32_t *buttons, int16_t *pov);

#ifdef __cplusplus
}
#endif
