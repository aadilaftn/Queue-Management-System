import ssl, time, json
import paho.mqtt.client as mqtt

def on_connect(client, userdata, flags, rc):
    print('connected rc=', rc)

client = mqtt.Client(client_id='Kiosk001')
client.tls_set(ca_certs=r'c:\Users\usama\Downloads\connect_device_package\root-CA.crt', certfile=r'c:\Users\usama\Downloads\connect_device_package\spider.cert.pem', keyfile=r'c:\Users\usama\Downloads\connect_device_package\spider.private.key')
client.on_connect = on_connect
client.connect('aqrvs9wjclzg2-ats.iot.us-east-1.amazonaws.com', 8883)
client.loop_start()
msg = { 'device_id':'Kiosk001', 'token_id':'T-TEST-001', 'timestamp':int(time.time()), 'status':'issued' }
ret = client.publish('queue/tokens', json.dumps(msg), qos=1)
print('published rc=', ret.rc)
time.sleep(2)
client.loop_stop()
client.disconnect()
