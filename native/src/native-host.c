// Chrome/Arc native messaging: local controller input only, no network listener.
#include "input.h"
#include "browser-origin.h"
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>

static double now(void) {struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
static bool write_all(const void *data,size_t length) {
    const char *p=data;
    while(length){ssize_t n=write(STDOUT_FILENO,p,length);if(n<0 && errno==EINTR)continue;if(n<=0)return false;p+=n;length-=(size_t)n;}
    return true;
}
static bool message(const PowerAFrame *f) {
    double buttons[17]={0};
    const unsigned masks[17]={0x10,0x20,0x40,0x80,0x1000,0x2000,0,0,8,4,0x4000,0x8000,0x100,0x200,0x400,0x800,0};
    if(f->connected) {
        for(int i=0;i<17;i++)buttons[i]=!!(f->buttons&masks[i]);
        buttons[6]=f->lt/1023.;buttons[7]=f->rt/1023.;buttons[16]=f->guide?1:0;
    }
    char json[1024];
    int n=snprintf(json,sizeof json,"{\"type\":\"state\",\"connected\":%s,\"sequence\":%u,\"axes\":[%.7f,%.7f,%.7f,%.7f],\"buttons\":[",
        f->connected?"true":"false",f->sequence,
        f->connected?powera_axis(f->lx):0,f->connected?-powera_axis(f->ly):0,
        f->connected?powera_axis(f->rx):0,f->connected?-powera_axis(f->ry):0);
    for(int i=0;i<17 && n>0 && n<(int)sizeof json;i++)n+=snprintf(json+n,sizeof json-(size_t)n,"%s%.7f",i?",":"",buttons[i]);
    if(n<=0 || n+3>(int)sizeof json)return false;
    memcpy(json+n,"]}",3);n+=2;
    uint32_t length=(uint32_t)n;
    return write_all(&length,sizeof length) && write_all(json,length);
}
static int connect_reader(void) {
    const char *path=powera_socket_path();struct sockaddr_un a={.sun_family=AF_UNIX};
    if(strlen(path)>=sizeof a.sun_path)return -1;
    strcpy(a.sun_path,path);int fd=socket(AF_UNIX,SOCK_STREAM,0);
    if(fd>=0 && connect(fd,(struct sockaddr*)&a,sizeof a)==0){fcntl(fd,F_SETFL,O_NONBLOCK);return fd;}
    if(fd>=0)close(fd);return -1;
}
int main(int argc,char **argv) {
    if(argc<2 || strcmp(argv[1],POWERA_BROWSER_ORIGIN)){fprintf(stderr,"Unrecognized browser extension origin.\n");return 2;}
    signal(SIGPIPE,SIG_IGN);
    PowerAFrame latest={0},incoming={0};size_t used=0;
    int fd=-1;double retry=0,next_send=0;bool dirty=true;
    for(;;) {
        double time=now();
        if(fd<0 && time>=retry){fd=connect_reader();retry=time+.5;used=0;}
        if(dirty && time>=next_send){if(!message(&latest))break;dirty=false;next_send=time+.016;}
        double deadline=dirty?next_send:time+3600;
        if(fd<0 && retry<deadline)deadline=retry;
        int timeout=(int)((deadline-time)*1000+1);if(timeout<0)timeout=0;if(timeout>1000)timeout=1000;
        struct pollfd events[2]={{.fd=STDIN_FILENO,.events=POLLIN},{.fd=fd,.events=POLLIN}};
        int result=poll(events,2,timeout);
        if(result<0){if(errno==EINTR)continue;break;}
        // No browser-to-device commands exist. EOF (tab closed) ends the host.
        if(events[0].revents&(POLLIN|POLLHUP|POLLERR|POLLNVAL))break;
        if(fd>=0 && events[1].revents&(POLLIN|POLLHUP|POLLERR|POLLNVAL)) {
            bool ended=false;
            for(;;) {
                ssize_t n=read(fd,(char*)&incoming+used,sizeof incoming-used);
                if(n<0 && errno==EINTR)continue;
                if(n<0 && (errno==EAGAIN || errno==EWOULDBLOCK))break;
                if(n<=0){ended=true;break;}
                used+=(size_t)n;
                if(used==sizeof incoming) {
                    if(incoming.magic!=POWERA_MAGIC || incoming.version!=1 || incoming.connected>1 || incoming.lt>1023 || incoming.rt>1023){ended=true;break;}
                    latest=incoming;dirty=true;used=0;
                }
            }
            if(ended){close(fd);fd=-1;latest=(PowerAFrame){0};dirty=true;retry=now()+.5;}
        }
    }
    if(fd>=0)close(fd);return 0;
}
