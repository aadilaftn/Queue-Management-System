#!/usr/bin/env python3
"""
Simple AWS IoT Core kiosk simulator that publishes token messages to a topic.

Usage:
  python scripts/simulate_kiosk.py --endpoint <your-iot-endpoint> --cert device.pem.crt --key private.pem.key --root-ca AmazonRootCA1.pem --client-id Kiosk001 --topic queue/tokens

This script prefers AWS IoT Device SDK v2 (awsiotsdk). If not installed, it falls back to paho-mqtt using certificate-based TLS.
"""
import time
import json
import argparse
import sys

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--endpoint", required=True)
    p.add_argument("--cert", required=True)
    p.add_argument("--key", required=True)
    p.add_argument("--root-ca", required=True)
    p.add_argument("--client-id", default="Kiosk001")
    p.add_argument("--topic", default="queue/tokens")
    p.add_argument("--interval", type=float, default=5.0)
    return p.parse_args()

def try_awsiot(args):
    try:
        from awscrt import mqtt, io, auth, http
        from awsiot import mqtt_connection_builder
    except Exception:
        return None

    # Create an MQTT connection using mutual TLS
    event_loop_group = io.EventLoopGroup(1)
    host_resolver = io.DefaultHostResolver(event_loop_group)
    client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)

    mqtt_connection = mqtt_connection_builder.mtls_from_path(
        endpoint=args.endpoint,
        cert_filepath=args.cert,
        pri_key_filepath=args.key,
        client_id=args.client_id,
        ca_filepath=args.root_ca,
        keep_alive_secs=30,
        http_proxy_options=None,
        client_bootstrap=client_bootstrap,
    )

    return mqtt_connection

def try_paho(args):
    try:
        import ssl
        import paho.mqtt.client as mqtt
    except Exception:
        return None

    def on_connect(client, userdata, flags, rc):
        print("paho connected, rc=", rc)

    client = mqtt.Client(client_id=args.client_id)
    client.tls_set(ca_certs=args.root_ca, certfile=args.cert, keyfile=args.key, tls_version=ssl.PROTOCOL_TLS)
    client.on_connect = on_connect
    client.connect(args.endpoint, port=8883)
    client.loop_start()
    return client

def main():
    args = parse_args()
    mqtt_conn = try_awsiot(args)
    use_awsiot = mqtt_conn is not None
    if use_awsiot:
        print("Using AWS IoT Device SDK v2")
        connect_future = mqtt_conn.connect()
        connect_future.result()
    else:
        mqtt_conn = try_paho(args)
        if mqtt_conn is None:
            print("No MQTT SDK available. Install 'aws-crt'/'awsiot' or 'paho-mqtt'.")
            sys.exit(1)
        print("Using paho-mqtt fallback")

    token_number = 1
    try:
        while True:
            token = {
                "device_id": args.client_id,
                "token_id": f"TOKEN_{token_number:03d}",
                "timestamp": int(time.time()),
                "status": "issued",
            }
            payload = json.dumps(token)
            if use_awsiot:
                mqtt_conn.publish(topic=args.topic, payload=payload, qos=mqtt.QoS.AT_LEAST_ONCE)
            else:
                mqtt_conn.publish(args.topic, payload=payload, qos=1)
            print(f"Published: {payload}")
            token_number += 1
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("Exiting...")
        if use_awsiot:
            mqtt_conn.disconnect().result()
        else:
            mqtt_conn.loop_stop()

if __name__ == '__main__':
    main()
