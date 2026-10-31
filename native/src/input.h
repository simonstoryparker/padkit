#pragma once
#include "gamepad.h"
#include <stdbool.h>
#include <stdint.h>

// Local-only wire protocol. Fixed-width fields; static assertions protect ABI.
typedef struct {
    uint32_t magic, version, sequence, connected;
    int16_t lx,ly,rx,ry;
    uint16_t buttons,lt,rt,guide;
} PowerAFrame;
#ifdef __cplusplus
static_assert(sizeof(PowerAFrame)==32,"wire frame must be 32 bytes");
extern "C" {
#else
_Static_assert(sizeof(PowerAFrame)==32,"wire frame must be 32 bytes");
#endif
#define POWERA_MAGIC 0x31415750u

// One connection/thread per consuming process. Socket activation starts the server.
void powera_client_start(void);
PowerAFrame powera_client_snapshot(void);
const char *powera_socket_path(void);
float powera_axis(int16_t value);
uint32_t powera_unity_buttons(uint16_t buttons);
void powera_frc_state(const PowerAFrame *input,float axes[6],uint32_t *buttons,int16_t *pov);
#ifdef __cplusplus
}
#endif
