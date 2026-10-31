#include "usb.h"
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOCFPlugIn.h>
#include <IOKit/usb/IOUSBLib.h>
#include <mach/mach_error.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct USBReader {
    IOUSBDeviceInterface500 **device;
    IOUSBInterfaceInterface500 **interface;
    CFRunLoopSourceRef source;
    CFRunLoopRef loop;
    bool device_open, interface_open, read_pending, write_pending, stopping, ended;
    UInt8 in, out; UInt16 max_packet;
    uint8_t input[1024], output[64];
    uint8_t ack[13]; bool ack_pending;
    unsigned startup;
    PadState state;
    USBStateCallback on_state; USBEndCallback on_end; void *context;
};
static void failed(USBReader *u, const char *operation, IOReturn result) {
    if (u->stopping || u->ended) return;
    fprintf(stderr,"%s: %s (0x%08x)\n",operation,mach_error_string(result),(unsigned)result);
    u->ended=true; u->on_end(u->context,1);
}
static IOReturn query(io_service_t s, CFUUIDRef type, CFUUIDRef iid, void **out) {
    IOCFPlugInInterface **p=NULL; SInt32 score;
    IOReturn r=IOCreatePlugInInterfaceForService(s,type,kIOCFPlugInInterfaceID,&p,&score);
    if (r) return r;
    HRESULT h=(*p)->QueryInterface(p,CFUUIDGetUUIDBytes(iid),out);
    IODestroyPlugInInterface(p);
    return h==S_OK && *out ? kIOReturnSuccess : kIOReturnUnsupported;
}
static void queue_read(USBReader *u);
static void next_write(USBReader *u);
static void wrote(void *context, IOReturn result, void *length) {
    (void)length; USBReader *u=context; u->write_pending=false;
    if(getenv("POWERA_USB_DEBUG"))fprintf(stderr,"USB write completed: %x startup %u\n",result,u->startup);
    if (u->stopping) return;
    if (result) { failed(u,"USB write",result); return; }
    next_write(u);
}
static void write_bytes(USBReader *u, const uint8_t *p, size_t n) {
    memcpy(u->output,p,n); u->write_pending=true;
    IOReturn r=(*u->interface)->WritePipeAsync(u->interface,u->out,u->output,(UInt32)n,wrote,u);
    if (r) { u->write_pending=false; failed(u,"Queue USB write",r); }
}
static void next_write(USBReader *u) {
    if (u->stopping || u->ended || u->write_pending) return;
    static const uint8_t wake[]={5,0x20,1,1,0};
    static const uint8_t led[]={0x0a,0x20,2,3,0,1,0x14};
    static const uint8_t auth[]={6,0x20,3,2,1,0};
    switch (u->startup++) {
        case 0: write_bytes(u,wake,sizeof wake); return;
        case 1: write_bytes(u,led,sizeof led); return;
        case 2: write_bytes(u,auth,sizeof auth); return;
        default: u->startup=3; break;
    }
    if (u->ack_pending) {
        u->ack_pending=false; write_bytes(u,u->ack,sizeof u->ack);
    }
    if (!u->read_pending) queue_read(u);
}
static void received(void *context, IOReturn result, void *length) {
    USBReader *u=context; u->read_pending=false;
    if (u->stopping || u->ended) return;
    if (result) { failed(u,"USB read",result); return; }
    size_t n=(size_t)(uintptr_t)length;
    if(getenv("POWERA_USB_DEBUG"))fprintf(stderr,"USB packet: %zu bytes, command %02x\n",n,n?u->input[0]:0);
    if (n>sizeof u->input) { failed(u,"USB report too large",kIOReturnOverrun); return; }
    const uint8_t *p=u->input;
    if (n>=4 && (p[1]&0x10) && !(p[1]&0xc0) && !(p[3]&0x80)) {
        const uint8_t ack[]={1,0x20,p[2],9,0,p[0],(uint8_t)(p[1]&~0x10),p[3],0,0,0,0,0};
        memcpy(u->ack,ack,sizeof ack); u->ack_pending=true;
        // Serialize acknowledgments before the next read; no dropped pending ACKs.
        next_write(u);
    }
    if (gip_parse(p,n,&u->state)) u->on_state(u->context,&u->state);
    if (!u->read_pending && !u->write_pending) queue_read(u);
}
static void queue_read(USBReader *u) {
    if (u->stopping || u->ended) return;
    u->read_pending=true;
    IOReturn r=(*u->interface)->ReadPipeAsync(u->interface,u->in,u->input,u->max_packet,received,u);
    if (r) { u->read_pending=false; failed(u,"Queue USB read",r); }
}
USBReader *usb_start(io_service_t service, USBStateCallback state, USBEndCallback end, void *context) {
    USBReader *u=calloc(1,sizeof *u);
    if (!u) return NULL;
    u->loop=CFRunLoopGetCurrent();
    u->on_state=state; u->on_end=end; u->context=context;
    io_iterator_t iterator=0; io_service_t s;
    IOReturn r=query(service,kIOUSBDeviceUserClientTypeID,kIOUSBDeviceInterfaceID500,(void**)&u->device);
    if (r) goto fail;
    r=(*u->device)->USBDeviceOpen(u->device);
    if (r==kIOReturnExclusiveAccess) {
        CFTypeRef owner=IORegistryEntryCreateCFProperty(service,CFSTR("UsbExclusiveOwner"),NULL,0);
        char name[256]="";
        if(owner && CFGetTypeID(owner)==CFStringGetTypeID())
            CFStringGetCString(owner,name,sizeof name,kCFStringEncodingUTF8);
        if(owner)CFRelease(owner);
        if(strstr(name,"steam_osx")) {
            fprintf(stderr,"Requesting Steam release this controller's USB connection.\n");
            r=(*u->device)->USBDeviceOpenSeize(u->device);
        }
    }
    if (r) {
        CFTypeRef owner=IORegistryEntryCreateCFProperty(service,CFSTR("UsbExclusiveOwner"),NULL,0);
        if (owner) { CFShow(owner); CFRelease(owner); }
        fprintf(stderr,"USB is unavailable. Another app may own the controller.\n");
        goto fail;
    }
    u->device_open=true;
    UInt8 config=0;
    r=(*u->device)->GetConfiguration(u->device,&config); if (r) goto fail;
    if (!config) {
        IOUSBConfigurationDescriptorPtr desc=NULL;
        r=(*u->device)->GetConfigurationDescriptorPtr(u->device,0,&desc); if (r) goto fail;
        if (!desc) { r=kIOReturnNotFound; goto fail; }
        r=(*u->device)->SetConfiguration(u->device,desc->bConfigurationValue); if (r) goto fail;
    }
    IOUSBFindInterfaceRequest request={0xff,0x47,0xd0,kIOUSBFindInterfaceDontCare};
    r=(*u->device)->CreateInterfaceIterator(u->device,&request,&iterator); if (r) goto fail;
    while ((s=IOIteratorNext(iterator))) {
        r=query(s,kIOUSBInterfaceUserClientTypeID,kIOUSBInterfaceInterfaceID500,(void**)&u->interface);
        IOObjectRelease(s);
        if (r) { u->interface=NULL; continue; }
        UInt8 number=255;
        r=(*u->interface)->GetInterfaceNumber(u->interface,&number);
        if (!r && number==0) break;
        (*u->interface)->Release(u->interface); u->interface=NULL;
    }
    IOObjectRelease(iterator); iterator=0;
    if (!u->interface) { r=kIOReturnNotFound; goto fail; }
    r=(*u->interface)->USBInterfaceOpen(u->interface); if (r) goto fail;
    u->interface_open=true;
    UInt8 count=0;
    r=(*u->interface)->GetNumEndpoints(u->interface,&count); if (r) goto fail;
    for (unsigned pipe=1;pipe<=count;pipe++) {
        UInt8 direction, number, type, interval; UInt16 size;
        r=(*u->interface)->GetPipeProperties(u->interface,(UInt8)pipe,&direction,&number,&type,&size,&interval);
        if (r || type!=kUSBInterrupt) continue;
        if (direction==kUSBIn && !u->in) { u->in=(UInt8)pipe; u->max_packet=size; }
        if (direction==kUSBOut && !u->out) u->out=(UInt8)pipe;
    }
    if (!u->in || !u->out || !u->max_packet || u->max_packet>sizeof u->input) { r=kIOReturnUnsupported; goto fail; }
    r=(*u->interface)->CreateInterfaceAsyncEventSource(u->interface,&u->source); if (r) goto fail;
    CFRunLoopAddSource(u->loop,u->source,kCFRunLoopDefaultMode);
    next_write(u);
    return u;
fail:
    fprintf(stderr,"Open PowerA USB: %s (0x%08x)\n",mach_error_string(r),(unsigned)r);
    if (iterator) IOObjectRelease(iterator);
    usb_stop(u); return NULL;
}
void usb_stop(USBReader *u) {
    if (!u) return;
    u->stopping=true;
    if (u->interface_open) {
        if (u->read_pending) (*u->interface)->AbortPipe(u->interface,u->in);
        if (u->write_pending) (*u->interface)->AbortPipe(u->interface,u->out);
        // Drain cancellation callbacks before freeing their storage. Bounded failure
        // exits the process rather than freeing a live callback context.
        double deadline=CFAbsoluteTimeGetCurrent()+2;
        while ((u->read_pending || u->write_pending) && CFAbsoluteTimeGetCurrent()<deadline)
            CFRunLoopRunInMode(kCFRunLoopDefaultMode,0.01,true);
        if (u->read_pending || u->write_pending) {
            fprintf(stderr,"USB cancellation did not complete; exiting to release OS handles.\n");
            _Exit(1);
        }
        (*u->interface)->USBInterfaceClose(u->interface);
    }
    if (u->source) {
        CFRunLoopRemoveSource(u->loop,u->source,kCFRunLoopDefaultMode); CFRelease(u->source);
    }
    if (u->interface) (*u->interface)->Release(u->interface);
    if (u->device_open) (*u->device)->USBDeviceClose(u->device);
    if (u->device) (*u->device)->Release(u->device);
    free(u);
}
