#include "../include/padkit.h"
#include <assert.h>
#include <errno.h>
#include <math.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

static bool float_eq(float a, float b) {
    return fabsf(a - b) < 0.001f;
}

static void test_normalization(void) {
    PadkitFrame frame = {
        .magic = PADKIT_MAGIC,
        .version = 1,
        .sequence = 42,
        .connected = 1,
        .lx = -32768,
        .ly = 32767,
        .rx = 16383,
        .ry = -16384,
        .buttons = 0x0010 | 0x1000 | 0x0100 | 0x4000, // A, LB, DPadUp, L3
        .lt = 1023,
        .rt = 511,
        .guide = 1
    };

    PadkitState state;
    padkit_normalize(&frame, &state);

    assert(state.connected);
    assert(state.sequence == 42);
    assert(float_eq(state.axes[PADKIT_AXIS_LX], -1.0f));
    assert(float_eq(state.axes[PADKIT_AXIS_LY], 1.0f));
    assert(float_eq(state.axes[PADKIT_AXIS_RX], 0.5f));
    assert(float_eq(state.axes[PADKIT_AXIS_RY], -0.5f));
    assert(float_eq(state.axes[PADKIT_AXIS_LT], 1.0f));
    assert(float_eq(state.axes[PADKIT_AXIS_RT], 511.0f / 1023.0f));

    // Verify buttons
    assert(float_eq(state.buttons[PADKIT_BUTTON_A], 1.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_B], 0.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_LB], 1.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_RB], 0.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_LT], 1.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_RT], 511.0f / 1023.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_L3], 1.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_R3], 0.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_DPAD_UP], 1.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_DPAD_DOWN], 0.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_GUIDE], 1.0f));

    // Test disconnected normalization
    frame.connected = 0;
    padkit_normalize(&frame, &state);
    assert(!state.connected);
}

static void test_client_socket(void) {
    char sock_path[128];
    snprintf(sock_path, sizeof sock_path, "/tmp/padkit-test-%d.sock", getpid());
    unlink(sock_path);

    int sfd = socket(AF_UNIX, SOCK_STREAM, 0);
    assert(sfd >= 0);

    struct sockaddr_un addr = {.sun_family = AF_UNIX};
    strncpy(addr.sun_path, sock_path, sizeof(addr.sun_path) - 1);
    assert(bind(sfd, (struct sockaddr *)&addr, sizeof addr) == 0);
    assert(listen(sfd, 1) == 0);

    setenv("PADKIT_SOCKET", sock_path, 1);

    padkit_client_start();

    int client_fd = accept(sfd, NULL, NULL);
    assert(client_fd >= 0);

    // Send a frame
    PadkitFrame frame = {
        .magic = PADKIT_MAGIC,
        .version = 1,
        .sequence = 100,
        .connected = 1,
        .lx = 32767,
        .ly = -32768,
        .rx = 0,
        .ry = 0,
        .buttons = 0x0020, // B button
        .lt = 0,
        .rt = 1023,
        .guide = 0
    };

    ssize_t written = write(client_fd, &frame, sizeof frame);
    assert(written == (ssize_t)sizeof frame);

    // Wait briefly for client to receive
    PadkitState state;
    bool connected = false;
    for (int i = 0; i < 50; i++) {
        usleep(20000); // 20ms
        if (padkit_client_snapshot(&state) && state.sequence == 100) {
            connected = true;
            break;
        }
    }
    assert(connected);
    assert(float_eq(state.axes[PADKIT_AXIS_LX], 1.0f));
    assert(float_eq(state.axes[PADKIT_AXIS_LY], -1.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_B], 1.0f));
    assert(float_eq(state.buttons[PADKIT_BUTTON_A], 0.0f));
    assert(float_eq(state.axes[PADKIT_AXIS_RT], 1.0f));

    // Close client connection and verify client handles disconnect
    close(client_fd);
    bool disconnected = false;
    for (int i = 0; i < 50; i++) {
        usleep(20000);
        if (!padkit_client_snapshot(&state)) {
            disconnected = true;
            break;
        }
    }
    assert(disconnected);

    padkit_client_stop();
    close(sfd);
    unlink(sock_path);
}

int main(void) {
    test_normalization();
    test_client_socket();
    printf("PASS: Padkit macOS SDK C client normalization, socket IPC, and disconnect handling.\n");
    return 0;
}
