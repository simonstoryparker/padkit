#pragma once
#include "gamepad.h"
#include <IOKit/IOKitLib.h>
typedef struct USBReader USBReader;
typedef void (*USBStateCallback)(void *context, const PadState *state);
typedef void (*USBEndCallback)(void *context, int status);
// Run on the main CFRunLoop. Never seizes USB from another application.
USBReader *usb_start(io_service_t service, USBStateCallback state, USBEndCallback end, void *context);
void usb_stop(USBReader *reader);
