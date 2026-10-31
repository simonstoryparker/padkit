import json,os,socket,struct,subprocess,tempfile,threading,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
origin='chrome-extension://ocbijffibhfpjbgpdahfklpgflkinhio/'
with tempfile.TemporaryDirectory(prefix='powera-web-',dir='/tmp') as folder:
    path=folder+'/input.sock';server=socket.socket(socket.AF_UNIX);server.bind(path);server.listen(1)
    environment=dict(os.environ,POWERA_SOCKET=path)
    host=subprocess.Popen([str(root/'build/PowerABrowserHost'),origin],env=environment,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    client,_=server.accept()
    def read_message():
        def exact(count):
            result=b''
            while len(result)<count:
                chunk=host.stdout.read(count-len(result))
                assert chunk,'Native host stopped unexpectedly'
                result+=chunk
            return result
        return json.loads(exact(struct.unpack('<I',exact(4))[0]))
    assert not read_message()['connected']
    frame=struct.pack('<IIIIhhhhHHHH',0x31415750,1,9,1,-32768,32767,32767,-32768,0x1110,1023,0,1)
    # A Unix stream can split a frame at any byte boundary.
    client.sendall(frame[:7]);time.sleep(.02);client.sendall(frame[7:])
    state=read_message()
    assert state['connected'] and state['axes']==[-1,-1,1,1]
    assert state['buttons'][0]==1 and state['buttons'][4]==1 and state['buttons'][6]==1 and state['buttons'][12]==1 and state['buttons'][16]==1
    client.close();state=read_message();assert not state['connected'] and not any(state['buttons'])
    host.stdin.close();assert host.wait(timeout=2)==0
    server.close()
wrong=subprocess.run([str(root/'build/PowerABrowserHost'),'chrome-extension://unapproved/'],capture_output=True)
assert wrong.returncode==2 and not wrong.stdout
print('PASS: native framing, partial packets, analog endpoints, buttons, origin rejection, and host exit on browser disconnect.')
