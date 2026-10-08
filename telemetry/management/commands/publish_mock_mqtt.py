import json
import os
import time
from datetime import datetime, timezone
import paho.mqtt.client as mqtt
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Publish test telemetry packets directly to EMQX Cloud MQTT broker"

    def add_arguments(self, parser):
        parser.add_argument(
            "--node",
            type=int,
            default=3,
            help="Node ID to simulate (default: 3)"
        )
        parser.add_argument(
            "--count",
            type=int,
            default=3,
            help="Number of packets to publish (default: 3)"
        )
        parser.add_argument(
            "--interval",
            type=float,
            default=1.0,
            help="Interval in seconds between packets (default: 1.0)"
        )

    def handle(self, *args, **options):
        node_id = options["node"]
        count = options["count"]
        interval = options["interval"]

        host = os.getenv("MQTT_HOST", "y3123070.ala.asia-southeast1.emqxsl.com")
        port = int(os.getenv("MQTT_PORT", "8883"))
        username = os.getenv("MQTT_USERNAME", "django-backend")
        password = os.getenv("MQTT_PASSWORD", "1")
        ca_certs = os.getenv("MQTT_CA", "/etc/ssl/certs/ca-certificates.crt")
        topic = f"warehouse/site1/lwb/nodes/{node_id}/telemetry"

        self.stdout.write(f"Connecting to MQTT Broker {host}:{port} via TLS...")

        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="django-test-publisher",
            protocol=mqtt.MQTTv311,
        )

        if username:
            client.username_pw_set(username, password)

        if os.path.exists(ca_certs):
            client.tls_set(ca_certs=ca_certs)
        else:
            self.stdout.write(self.style.WARNING(f"Warning: CA cert not found at {ca_certs}, attempting default TLS"))
            client.tls_set()

        client.connect(host, port, keepalive=60)
        client.loop_start()

        self.stdout.write(self.style.SUCCESS(f"Connected! Publishing {count} telemetry packet(s) to topic: {topic}"))

        base_event_id = int(time.time() * 1000) % 10000000

        for i in range(count):
            now_utc = datetime.now(timezone.utc).isoformat()
            event_id = base_event_id + i

            payload = {
                "record_type": "SENSOR_DATA",
                "gateway_id": "GW-SITE1-01",
                "event_id": event_id,
                "source": node_id,
                "seq": 100 + i,
                "recv_ts_utc": now_utc,
                "data": {
                    "time": int(time.time()),
                    "hdc_temp_x10": 272 + i,      # 27.2 °C
                    "hdc_hum_x10": 615 - i,       # 61.5 %
                    "light_raw": 1950 + i * 10,   # Raw light
                    "bmp_temp_x10": 275 + i,      # 27.5 °C
                    "pressure_pa": 101315 + i * 2 # 1013.15 hPa
                }
            }

            msg_info = client.publish(
                topic=topic,
                payload=json.dumps(payload),
                qos=1
            )
            msg_info.wait_for_publish()

            self.stdout.write(
                self.style.SUCCESS(
                    f"[{i + 1}/{count}] Published event_id={event_id} (temp=27.{2+i}°C, hum=61.{5-i}%)"
                )
            )

            if i < count - 1:
                time.sleep(interval)

        time.sleep(0.5)
        client.loop_stop()
        client.disconnect()

        self.stdout.write(self.style.SUCCESS("All test packets published successfully!"))
