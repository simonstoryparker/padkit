#import <Foundation/Foundation.h>
#include <IOKit/IOMessage.h>
#include <IOKit/usb/IOUSBLib.h>
#include <fcntl.h>
#include <errno.h>
#include <launch.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>
#include "input.h"
#include "usb.h"

typedef struct Client Client;
struct Client {int fd; bool closed; dispatch_source_t source; Client *next;};
static Client *clients;
static USBReader *reader;
static IONotificationPortRef notifications;
static io_iterator_t matching_iterator;
static io_object_t removal_notification;
static PowerAFrame frame={.magic=POWERA_MAGIC,.version=1};
static bool had_clients,exiting;
static int listener=-1;
static const char *manual_path;

static void quit(void) {exiting=true;CFRunLoopStop(CFRunLoopGetMain());}
static void close_client(Client *c) {
    if(c->closed)return;
    c->closed=true;close(c->fd);dispatch_source_cancel(c->source);
    Client **link=&clients;while(*link && *link!=c)link=&(*link)->next;
    if(*link)*link=c->next;
    if(had_clients && !clients)quit();
}
static void send_frame(Client *c) {
    ssize_t n=send(c->fd,&frame,sizeof frame,0);
    // Never leave a slow consumer with an old held button. Disconnect instead.
    if(n!=(ssize_t)sizeof frame)close_client(c);
}
static void publish(void) {
    frame.sequence++;
    for(Client *c=clients,*next;c;c=next){next=c->next;send_frame(c);}
}
static void input(void *unused,const PadState *s) {
    (void)unused;
    frame.connected=1;frame.lx=s->lx;frame.ly=s->ly;frame.rx=s->rx;frame.ry=s->ry;
    frame.buttons=s->buttons;frame.lt=s->lt;frame.rt=s->rt;frame.guide=s->guide;
    publish();
}
static void reset_input(void) {
    uint32_t sequence=frame.sequence;
    frame=(PowerAFrame){.magic=POWERA_MAGIC,.version=1,.sequence=sequence};publish();
}
static void ended(void *unused,int status) {
    (void)unused;(void)status;reset_input();
    // Defer destruction until the USB callback has returned.
    dispatch_async(dispatch_get_main_queue(),^{USBReader *old=reader;reader=NULL;usb_stop(old);});
}
static void removed(void *unused,io_service_t service,natural_t message,void *arg) {
    (void)unused;(void)service;(void)arg;
    if(message!=kIOMessageServiceIsTerminated)return;
    USBReader *old=reader;reader=NULL;usb_stop(old);reset_input();
    if(removal_notification){IOObjectRelease(removal_notification);removal_notification=0;}
}
static void attached(void *unused,io_iterator_t iterator) {
    (void)unused;io_service_t service;
    while((service=IOIteratorNext(iterator))) {
        if(!reader && clients && !exiting) {
            reader=usb_start(service,input,ended,NULL);
            if(reader) {
                if(removal_notification)IOObjectRelease(removal_notification);
                IOReturn r=IOServiceAddInterestNotification(notifications,service,kIOGeneralInterest,
                    removed,NULL,&removal_notification);
                if(r){usb_stop(reader);reader=NULL;}
                else {
                    // Presence is known once USB opens. Start neutral until the
                    // first report; idle controllers need not emit a new report.
                    frame=(PowerAFrame){.magic=POWERA_MAGIC,.version=1,
                        .sequence=frame.sequence,.connected=1};
                    publish();
                    fprintf(stderr,"PowerA USB connected.\n");
                }
            }
        }
        IOObjectRelease(service);
    }
}
static void scan(void) {
    CFMutableDictionaryRef match=IOServiceMatching(kIOUSBDeviceClassName);
    int vid=0x20d6,pid=0x4001;
    CFNumberRef v=CFNumberCreate(NULL,kCFNumberIntType,&vid),p=CFNumberCreate(NULL,kCFNumberIntType,&pid);
    CFDictionarySetValue(match,CFSTR(kUSBVendorID),v);CFDictionarySetValue(match,CFSTR(kUSBProductID),p);
    CFRelease(v);CFRelease(p);
    IOReturn r=IOServiceAddMatchingNotification(notifications,kIOFirstMatchNotification,match,
                                               attached,NULL,&matching_iterator);
    if(r){fprintf(stderr,"Cannot watch USB: 0x%08x\n",(unsigned)r);quit();return;}
    attached(NULL,matching_iterator);
}
int main(int argc,char **argv) {@autoreleasepool{
    signal(SIGPIPE,SIG_IGN);
    if(argc==3 && !strcmp(argv[1],"--socket")) {
        manual_path=argv[2];struct sockaddr_un address={.sun_family=AF_UNIX};
        if(strlen(manual_path)>=sizeof address.sun_path)return 2;
        strcpy(address.sun_path,manual_path);
        listener=socket(AF_UNIX,SOCK_STREAM,0);
        if(listener<0 || bind(listener,(struct sockaddr*)&address,sizeof address) || listen(listener,8)) {
            perror("Broker socket");return 1;
        }
        chmod(manual_path,0600);
    } else if(argc==2 && !strcmp(argv[1],"--launchd")) {
        int *fds=NULL;size_t count=0;
        int r=launch_activate_socket("Input",&fds,&count);
        if(r || count!=1){fprintf(stderr,"Socket activation failed: %d\n",r);free(fds);return 1;}
        listener=fds[0];free(fds);
    } else {fprintf(stderr,"Usage: PowerAInput --launchd | --socket PATH\n");return 2;}
    fcntl(listener,F_SETFL,O_NONBLOCK);
    notifications=IONotificationPortCreate(kIOMainPortDefault);
    if(!notifications)return 1;
    CFRunLoopAddSource(CFRunLoopGetMain(),IONotificationPortGetRunLoopSource(notifications),kCFRunLoopDefaultMode);
    dispatch_source_t accepts=dispatch_source_create(DISPATCH_SOURCE_TYPE_READ,(uintptr_t)listener,0,dispatch_get_main_queue());
    dispatch_source_set_event_handler(accepts,^{
        int fd;
        while((fd=accept(listener,NULL,NULL))>=0) {
            fcntl(fd,F_SETFL,O_NONBLOCK);int one=1;setsockopt(fd,SOL_SOCKET,SO_NOSIGPIPE,&one,sizeof one);
            Client *c=calloc(1,sizeof *c);c->fd=fd;c->next=clients;clients=c;had_clients=true;
            c->source=dispatch_source_create(DISPATCH_SOURCE_TYPE_READ,(uintptr_t)fd,0,dispatch_get_main_queue());
            dispatch_source_set_event_handler(c->source,^{char byte;ssize_t n=recv(c->fd,&byte,1,0);if(n==0 || n>0 || (n<0 && errno!=EAGAIN && errno!=EINTR))close_client(c);});
            dispatch_source_set_cancel_handler(c->source,^{c->source=nil;free(c);});
            dispatch_resume(c->source);send_frame(c);
            if(!matching_iterator)scan();
        }
    });dispatch_resume(accepts);
    dispatch_source_t signal_source=dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL,SIGTERM,0,dispatch_get_main_queue());
    signal(SIGTERM,SIG_IGN);dispatch_source_set_event_handler(signal_source,^{quit();});dispatch_resume(signal_source);
    CFRunLoopRun();
    exiting=true;usb_stop(reader);reader=NULL;
    if(removal_notification)IOObjectRelease(removal_notification);
    if(matching_iterator)IOObjectRelease(matching_iterator);
    IONotificationPortDestroy(notifications);
    dispatch_source_cancel(accepts);dispatch_source_cancel(signal_source);close(listener);
    if(manual_path)unlink(manual_path);
    fprintf(stderr,"PowerA input service stopped (no app clients).\n");return 0;
}}
