#include "input.h"
#include <errno.h>
#include <limits.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
static PadkitFrame latest;
static pthread_once_t once = PTHREAD_ONCE_INIT;
static volatile bool client_running = false;
static pthread_t client_thread;

const char *padkit_socket_path(void) {
    static char path[PATH_MAX];
    const char *override = getenv("PADKIT_SOCKET");
    if (!override || !*override) override = getenv("POWERA_SOCKET");
    if (override && *override) return override;
    if (!*path) snprintf(path, sizeof path, "%s/Library/Application Support/PowerA Adapters/input.sock", getenv("HOME"));
    return path;
}

const char *powera_socket_path(void) {
    return padkit_socket_path();
}

static void store(PadkitFrame frame) {
    pthread_mutex_lock(&mutex);
    latest = frame;
    pthread_mutex_unlock(&mutex);
}

static void *receive_frames(void *unused) {
    (void)unused;
    while (client_running) {
        int fd = socket(AF_UNIX, SOCK_STREAM, 0);
        struct sockaddr_un address = {.sun_family = AF_UNIX};
        const char *path = padkit_socket_path();
        if (strlen(path) >= sizeof address.sun_path) {
            if (fd >= 0) close(fd);
            return NULL;
        }
        strcpy(address.sun_path, path);
        if (fd >= 0 && connect(fd, (struct sockaddr *)&address, sizeof address) == 0) {
            PadkitFrame frame;
            size_t used = 0;
            while (client_running) {
                ssize_t n = read(fd, (uint8_t *)&frame + used, sizeof frame - used);
                if (n < 0 && errno == EINTR) continue;
                if (n <= 0) break;
                used += (size_t)n;
                if (used != sizeof frame) continue;
                if (frame.magic != PADKIT_MAGIC || frame.version != 1 || frame.connected > 1 ||
                    frame.lt > 1023 || frame.rt > 1023) break;
                store(frame);
                used = 0;
            }
        }
        if (fd >= 0) close(fd);
        store((PadkitFrame){0});
        if (!client_running) break;
        usleep(500000);
    }
    return NULL;
}

static void start_once(void) {
    client_running = true;
    if (pthread_create(&client_thread, NULL, receive_frames, NULL)) {
        client_running = false;
    }
}

void padkit_client_start(void) {
    client_running = true;
    pthread_once(&once, start_once);
}

void padkit_client_stop(void) {
    client_running = false;
    pthread_mutex_lock(&mutex);
    latest = (PadkitFrame){0};
    pthread_mutex_unlock(&mutex);
}

bool padkit_client_raw(PadkitFrame *out) {
    if (!out) return false;
    pthread_mutex_lock(&mutex);
    *out = latest;
    pthread_mutex_unlock(&mutex);
    return out->connected != 0;
}

float padkit_axis(int16_t value) {
    return value < 0 ? value / 32768.f : value / 32767.f;
}

void padkit_normalize(const PadkitFrame *f, PadkitState *out) {
    memset(out, 0, sizeof *out);
    if (!f || !f->connected) return;
    out->connected = true;
    out->sequence = f->sequence;
    out->axes[PADKIT_AXIS_LX] = padkit_axis(f->lx);
    out->axes[PADKIT_AXIS_LY] = padkit_axis(f->ly);
    out->axes[PADKIT_AXIS_RX] = padkit_axis(f->rx);
    out->axes[PADKIT_AXIS_RY] = padkit_axis(f->ry);
    out->axes[PADKIT_AXIS_LT] = (float)f->lt / 1023.0f;
    out->axes[PADKIT_AXIS_RT] = (float)f->rt / 1023.0f;

    static const uint16_t masks[PADKIT_BUTTON_COUNT] = {
        0x10, 0x20, 0x40, 0x80, 0x1000, 0x2000, 0, 0,
        0x08, 0x04, 0x4000, 0x8000, 0x100, 0x200, 0x400, 0x800, 0
    };
    for (int i = 0; i < PADKIT_BUTTON_COUNT; i++) {
        out->buttons[i] = (f->buttons & masks[i]) ? 1.0f : 0.0f;
    }
    out->buttons[PADKIT_BUTTON_LT] = (float)f->lt / 1023.0f;
    out->buttons[PADKIT_BUTTON_RT] = (float)f->rt / 1023.0f;
    out->buttons[PADKIT_BUTTON_GUIDE] = f->guide ? 1.0f : 0.0f;
}

bool padkit_client_snapshot(PadkitState *out) {
    if (!out) return false;
    PadkitFrame f;
    pthread_mutex_lock(&mutex);
    f = latest;
    pthread_mutex_unlock(&mutex);
    padkit_normalize(&f, out);
    return out->connected;
}

// Backwards-compatible aliases
void powera_client_start(void) {
    padkit_client_start();
}

PowerAFrame powera_client_snapshot(void) {
    pthread_mutex_lock(&mutex);
    PowerAFrame frame = latest;
    pthread_mutex_unlock(&mutex);
    return frame;
}

float powera_axis(int16_t value) {
    return padkit_axis(value);
}

uint32_t powera_unity_buttons(uint16_t b) {
    static const uint16_t bits[] = {
        0x100, 0x200, 0x400, 0x800, 0x80, 0x20, 0x10, 0x40,
        0x4000, 0x8000, 0x1000, 0x2000, 4, 8
    };
    uint32_t result = 0;
    for (unsigned i = 0; i < 14; i++) {
        if (b & bits[i]) result |= 1u << i;
    }
    return result;
}

void powera_frc_state(const PowerAFrame *f, float axes[6], uint32_t *buttons, int16_t *pov) {
    memset(axes, 0, 6 * sizeof *axes);
    *buttons = 0;
    *pov = -1;
    if (!f || !f->connected) return;
    axes[0] = powera_axis(f->lx);
    axes[1] = -powera_axis(f->ly);
    axes[2] = f->lt / 1023.f;
    axes[3] = f->rt / 1023.f;
    axes[4] = powera_axis(f->rx);
    axes[5] = -powera_axis(f->ry);
    static const uint16_t bits[] = {
        0x10, 0x20, 0x40, 0x80, 0x1000, 0x2000, 8, 4, 0x4000, 0x8000
    };
    for (unsigned i = 0; i < 10; i++) {
        if (f->buttons & bits[i]) *buttons |= 1u << i;
    }
    int x = !!(f->buttons & 0x800) - !!(f->buttons & 0x400);
    int y = !!(f->buttons & 0x200) - !!(f->buttons & 0x100);
    if (y < 0) *pov = x < 0 ? 315 : x > 0 ? 45 : 0;
    else if (y > 0) *pov = x < 0 ? 225 : x > 0 ? 135 : 180;
    else if (x) *pov = x < 0 ? 270 : 90;
}
