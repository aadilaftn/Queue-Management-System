#!/usr/bin/env python3
"""
Example Kiosk/Device - Publishes token display events to AWS IoT Core
This device would run on a kiosk screen and notify the server when it displays a token.
"""

import json
import time
import argparse
from awsiot import mqtt_connection_builder

# Device configuration
MQTT_TOPIC_INCOMING = "queue/clinic/default/incoming/kiosk-1"
MQTT_TOPIC_SUBSCRIBE = "queue/clinic/default/updates"

def on_message_received(topic, payload, **kwargs):
    """Callback when device receives queue update from server"""
    print(f"\n[KIOSK] Received queue update from {topic}")
    try:
        data = json.loads(payload)
        print(f"  Current waiting entries: {len(data.get('entries', []))}")
        print(f"  Last token: {data.get('lastToken', 0)}")
        
        # Example: Display next token to be served on screen
        waiting = [e for e in data.get('entries', []) if e.get('status') == 'waiting']
        if waiting:
            next_token = waiting[0].get('token')
            print(f"  >>> DISPLAY ON SCREEN: Please proceed to window (Token #{next_token})")
    except json.JSONDecodeError:
        print(f"  Failed to parse payload: {payload}")

def on_connection_resumed(connection, **kwargs):
    """Callback when MQTT connection is resumed"""
    print("\n[KIOSK] Connection resumed")
    # Resubscribe to queue updates
    print(f"[KIOSK] Resubscribing to {MQTT_TOPIC_SUBSCRIBE}")
    connection.subscribe(
        topic=MQTT_TOPIC_SUBSCRIBE,
        qos=1,
        callback=on_message_received
    )

def on_connection_interrupted(connection, error, **kwargs):
    """Callback when MQTT connection is lost"""
    print(f"\n[KIOSK] Connection interrupted: {error}")

def run_kiosk(endpoint, ca_file, cert_file, key_file, client_id):
    """
    Run the example kiosk device.
    
    It will:
    1. Connect to AWS IoT Core
    2. Subscribe to queue updates
    3. Simulate displaying tokens every 5 seconds
    4. Publish "token displayed" events back to server
    """
    
    print(f"[KIOSK] Starting kiosk device: {client_id}")
    print(f"[KIOSK] Endpoint: {endpoint}")
    print(f"[KIOSK] Subscribing to: {MQTT_TOPIC_SUBSCRIBE}")
    print(f"[KIOSK] Publishing to: {MQTT_TOPIC_INCOMING}")
    
    # Build MQTT connection using certificates
    mqtt_connection = mqtt_connection_builder.mtls_from_path(
        endpoint=endpoint,
        cert_filepath=cert_file,
        key_filepath=key_file,
        ca_filepath=ca_file,
        client_id=client_id,
        clean_session=False,
        on_connection_interrupted=on_connection_interrupted,
        on_connection_resumed=on_connection_resumed,
    )
    
    print("[KIOSK] Connecting to AWS IoT Core...")
    connect_future = mqtt_connection.connect()
    connect_future.result()  # Block until connection succeeds
    print("[KIOSK] Connected!")
    
    # Subscribe to queue updates
    mqtt_connection.subscribe(
        topic=MQTT_TOPIC_SUBSCRIBE,
        qos=1,
        callback=on_message_received
    )
    
    # Simulate kiosk displaying tokens and reporting back
    try:
        print("\n[KIOSK] Device is running. Simulating token displays...")
        token_counter = 0
        
        while True:
            time.sleep(5)  # Simulate 5 seconds between displays
            token_counter += 1
            
            # Simulate displaying a token and sending confirmation back to server
            event = {
                "deviceId": client_id,
                "action": "token_displayed",
                "token": token_counter,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "screen_location": "Window A",
                "brightness": 100,  # Example: brightness level
            }
            
            print(f"\n[KIOSK] Publishing token display event: Token #{token_counter}")
            mqtt_connection.publish(
                topic=MQTT_TOPIC_INCOMING,
                payload=json.dumps(event),
                qos=1,
            )
            
    except KeyboardInterrupt:
        print("\n[KIOSK] Shutting down...")
    finally:
        print("[KIOSK] Disconnecting...")
        disconnect_future = mqtt_connection.disconnect()
        disconnect_future.result()
        print("[KIOSK] Disconnected")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Queue Management Kiosk Device")
    parser.add_argument("--endpoint", required=True, help="AWS IoT endpoint")
    parser.add_argument("--ca_file", required=True, help="Root CA certificate file")
    parser.add_argument("--cert_file", required=True, help="Device certificate file")
    parser.add_argument("--key_file", required=True, help="Device private key file")
    parser.add_argument("--client_id", default="kiosk-1", help="MQTT client ID")
    
    args = parser.parse_args()
    
    run_kiosk(
        endpoint=args.endpoint,
        ca_file=args.ca_file,
        cert_file=args.cert_file,
        key_file=args.key_file,
        client_id=args.client_id,
    )
