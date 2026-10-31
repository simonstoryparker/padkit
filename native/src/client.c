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

static pthread_mutex_t mutex=PTHREAD_MUTEX_INITIALIZER;
static PowerAFrame latest;
static pthread_once_t once=PTHREAD_ONCE_INIT;
const char *powera_socket_path(void) {
    static char path[PATH_MAX];
    const char *override=getenv("POWERA_SOCKET");
    if (override && *override) return override;
    if (!*path) snprintf(path,sizeof path,"%s/Library/Application Support/PowerA Adapters/input.sock",getenv("HOME"));
    return path;
}
static void store(PowerAFrame frame) {
    pthread_mutex_lock(&mutex); latest=frame; pthread_mutex_unlock(&mutex);
}
static void *receive_frames(void *unused) {
    (void)unused;
    for (;;) {
        int fd=socket(AF_UNIX,SOCK_STREAM,0);
        struct sockaddr_un address={.sun_family=AF_UNIX};
        const char *path=powera_socket_path();
        if (strlen(path)>=sizeof address.sun_path) { if(fd>=0)close(fd); return NULL; }
        strcpy(address.sun_path,path);
        if (fd>=0 && connect(fd,(struct sockaddr*)&address,sizeof address)==0) {
            PowerAFrame frame; size_t used=0;
            for (;;) {
                ssize_t n=read(fd,(uint8_t*)&frame+used,sizeof frame-used);
                if (n<0 && errno==EINTR) continue;
                if (n<=0) break;
                used+=(size_t)n;
                if (used!=sizeof frame) continue;
                if (frame.magic!=POWERA_MAGIC || frame.version!=1 || frame.connected>1 ||
                    frame.lt>1023 || frame.rt>1023) break;
                store(frame); used=0;
            }
        }
        if (fd>=0) close(fd);
        store((PowerAFrame){0});
        // Retry only while the consuming app exists; there is no global watcher.
        usleep(500000);
    }
}
static void start_once(void) {
    pthread_t thread;
    if (!pthread_create(&thread,NULL,receive_frames,NULL)) pthread_detach(thread);
}
void powera_client_start(void) { pthread_once(&once,start_once); }
PowerAFrame powera_client_snapshot(void) {
    pthread_mutex_lock(&mutex); PowerAFrame frame=latest; pthread_mutex_unlock(&mutex); return frame;
}
float powera_axis(int16_t value) { return value<0 ? value/32768.f : value/32767.f; }
uint32_t powera_unity_buttons(uint16_t b) {
    static const uint16_t bits[]={0x100,0x200,0x400,0x800,0x80,0x20,0x10,0x40,
                                  0x4000,0x8000,0x1000,0x2000,4,8};
    uint32_t result=0;
    for(unsigned i=0;i<14;i++) if(b&bits[i]) result|=1u<<i;
    return result;
}
void powera_frc_state(const PowerAFrame *f,float axes[6],uint32_t *buttons,int16_t *pov) {
    memset(axes,0,6*sizeof *axes); *buttons=0; *pov=-1;
    if(!f->connected)return;
    axes[0]=powera_axis(f->lx); axes[1]=-powera_axis(f->ly);
    axes[2]=f->lt/1023.f; axes[3]=f->rt/1023.f;
    axes[4]=powera_axis(f->rx); axes[5]=-powera_axis(f->ry);
    static const uint16_t bits[]={0x10,0x20,0x40,0x80,0x1000,0x2000,8,4,0x4000,0x8000};
    for(unsigned i=0;i<10;i++)if(f->buttons&bits[i])*buttons|=1u<<i;
    int x=!!(f->buttons&0x800)-!!(f->buttons&0x400);
    int y=!!(f->buttons&0x200)-!!(f->buttons&0x100);
    if(y<0)*pov=x<0?315:x>0?45:0;
    else if(y>0)*pov=x<0?225:x>0?135:180;
    else if(x)*pov=x<0?270:90;
}
