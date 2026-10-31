#include "gamepad.h"
#include <string.h>

static uint16_t le16(const uint8_t *p) { return p[0] | ((uint16_t)p[1] << 8); }
bool gip_parse(const uint8_t *p, size_t n, PadState *s) {
    if (n < 4 || (p[1] & 0xc0) || (p[3] & 0x80) || (size_t)p[3] + 4 > n) return false;
    if (p[0] == 7 && p[3] >= 1) { s->guide = (p[4] & 1) != 0; return true; }
    if (p[0] != 0x20 || p[3] < 14) return false;
    if (le16(p+6) > 1023 || le16(p+8) > 1023) return false;
    *s = (PadState){.buttons=le16(p+4), .lt=le16(p+6), .rt=le16(p+8),
        .lx=(int16_t)le16(p+10), .ly=(int16_t)le16(p+12),
        .rx=(int16_t)le16(p+14), .ry=(int16_t)le16(p+16), .guide=s->guide};
    return true;
}

// Compact USB DS4-style HID layout. All report sizes include the report ID.
// Four 8-bit sticks, hat, 14 buttons, sequence bits, two 8-bit triggers,
// and neutral sensor/touch fields. No physical firmware is modified.
const uint8_t pad_descriptor[] = {
    0x05,0x01, 0x09,0x05, 0xa1,0x01,
    0x85,0x01, 0x09,0x30, 0x09,0x31, 0x09,0x32, 0x09,0x35,
    0x15,0x00, 0x26,0xff,0x00, 0x75,0x08, 0x95,0x04, 0x81,0x02,
    0x09,0x39, 0x15,0x00, 0x25,0x07, 0x35,0x00, 0x46,0x3b,0x01,
    0x65,0x14, 0x75,0x04, 0x95,0x01, 0x81,0x42,
    0x65,0x00, 0x05,0x09, 0x19,0x01, 0x29,0x0e,
    0x15,0x00, 0x25,0x01, 0x35,0x00, 0x45,0x01,
    0x75,0x01, 0x95,0x0e, 0x81,0x02,
    0x06,0x00,0xff, 0x09,0x20, 0x75,0x06, 0x95,0x01, 0x25,0x3f, 0x81,0x02,
    0x05,0x01, 0x09,0x33, 0x09,0x34, 0x15,0x00, 0x26,0xff,0x00,
    0x75,0x08, 0x95,0x02, 0x81,0x02,
    0x06,0x00,0xff, 0x09,0x21, 0x95,0x36, 0x81,0x02,
    0x85,0x05, 0x09,0x22, 0x95,0x1f, 0x91,0x02,
    0x85,0x02, 0x09,0x23, 0x95,0x24, 0xb1,0x02,
    0x85,0x12, 0x09,0x24, 0x95,0x0f, 0xb1,0x02,
    0x85,0xa3, 0x09,0x25, 0x95,0x30, 0xb1,0x02,
    0xc0
};
const size_t pad_descriptor_size = sizeof pad_descriptor;

static uint8_t stick(int16_t v, bool invert) {
    // Explicit endpoints, exact center 128; GIP Y positive is up, HID Y is down.
    int32_t value = invert ? -(int32_t)v : v;
    if (value < -32768) value = -32768;
    if (value > 32767) value = 32767;
    return (uint8_t)((value + 32768) >> 8);
}
static uint8_t hat(uint16_t b) {
    int x = !!(b & 0x0800) - !!(b & 0x0400);
    int y = !!(b & 0x0200) - !!(b & 0x0100);
    if (!x && !y) return 8;
    if (y < 0) return x < 0 ? 7 : x > 0 ? 1 : 0;
    if (y > 0) return x < 0 ? 5 : x > 0 ? 3 : 4;
    return x < 0 ? 6 : 2;
}
void pad_report(const PadState *s, uint8_t counter, uint8_t p[64]) {
    memset(p,0,64); p[0]=1;
    p[1]=stick(s->lx,false); p[2]=stick(s->ly,true);
    p[3]=stick(s->rx,false); p[4]=stick(s->ry,true);
    p[5]=hat(s->buttons);
    if (s->buttons & 0x0040) p[5] |= 0x10; // X -> Square
    if (s->buttons & 0x0010) p[5] |= 0x20; // A -> Cross
    if (s->buttons & 0x0020) p[5] |= 0x40; // B -> Circle
    if (s->buttons & 0x0080) p[5] |= 0x80; // Y -> Triangle
    if (s->buttons & 0x1000) p[6] |= 0x01;
    if (s->buttons & 0x2000) p[6] |= 0x02;
    if (s->lt > 0) p[6] |= 0x04;
    if (s->rt > 0) p[6] |= 0x08;
    if (s->buttons & 0x0008) p[6] |= 0x10; // View -> Share
    if (s->buttons & 0x0004) p[6] |= 0x20; // Menu -> Options
    if (s->buttons & 0x4000) p[6] |= 0x40;
    if (s->buttons & 0x8000) p[6] |= 0x80;
    p[7]=(uint8_t)((counter & 63) << 2) | (s->guide ? 1 : 0);
    p[8]=(uint8_t)((s->lt*255u + 511)/1023);
    p[9]=(uint8_t)((s->rt*255u + 511)/1023);
    p[30]=0x1a; // USB powered, full battery.
    p[35]=0x80; p[39]=0x80; // Both touch contacts inactive.
}
