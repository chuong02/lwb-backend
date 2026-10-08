import json
import os

import paho.mqtt.client as mqtt

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.dateparse import parse_datetime

from telemetry.models import Gateway, Node, SensorReading


MQTT_HOST = os.getenv("MQTT_HOST", "")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")

MQTT_CA = os.getenv(
    "MQTT_CA",
    "/etc/ssl/certs/ca-certificates.crt"
)

MQTT_TOPIC = os.getenv(
    "MQTT_TOPIC",
    "warehouse/site1/lwb/nodes/+/telemetry"
)


class Command(BaseCommand):
    help = "Subscribe EMQX telemetry and store data into PostgreSQL"

    def handle(self, *args, **options):
        if not MQTT_HOST:
            raise RuntimeError("MQTT_HOST is not configured")

        client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"django-lwb-wsl-{os.getpid()}",
            protocol=mqtt.MQTTv311,
        )

        if MQTT_USERNAME:
            client.username_pw_set(
                MQTT_USERNAME,
                MQTT_PASSWORD
            )

        client.tls_set(
            ca_certs=MQTT_CA
        )

        client.reconnect_delay_set(
            min_delay=1,
            max_delay=60
        )

        client.on_connect = self.on_connect
        client.on_message = self.on_message
        client.on_disconnect = self.on_disconnect
        self.stdout.write(
            f"Connecting to MQTT broker "
            f"{MQTT_HOST}:{MQTT_PORT}"
        )

        client.connect(
            MQTT_HOST,
            MQTT_PORT,
            keepalive=60
        )

        client.loop_forever()

    def on_connect(
        self,
        client,
        userdata,
        flags,
        reason_code,
        properties
    ):
        if reason_code == 0:
            self.stdout.write(
                self.style.SUCCESS("MQTT connected")
            )

            client.subscribe(
                MQTT_TOPIC,
                qos=1
            )

            self.stdout.write(
                f"Subscribed: {MQTT_TOPIC}"
            )
        else:
            self.stderr.write(
                f"MQTT connection failed: {reason_code}"
            )

    def on_disconnect(
        self,
        client,
        userdata,
        disconnect_flags,
        reason_code,
        properties
    ):
        self.stdout.write(
            f"MQTT disconnected: {reason_code}"
        )

    def on_message(
        self,
        client,
        userdata,
        message
    ):
        try:
            payload = json.loads(
                message.payload.decode("utf-8")
            )

            self.process_payload(
                message.topic,
                payload
            )

        except Exception as exc:
            self.stderr.write(
                f"Message error: {exc}"
            )

    @transaction.atomic
    def process_payload(
        self,
        topic,
        payload
    ):
        if payload.get("record_type") not in ("SENSOR_DATA", "LOCAL"):
            return

        gateway_id = payload.get("gateway_id")
        event_id = payload.get("event_id")
        source = payload.get("source")
        seq = payload.get("seq")

        recv_ts = parse_datetime(
            payload.get("recv_ts_utc", "")
        )

        data = payload.get("data", {})
        if gateway_id is None:
            raise ValueError("gateway_id missing")

        if event_id is None:
            raise ValueError("event_id missing")

        if source is None:
            raise ValueError("source missing")

        if recv_ts is None:
            raise ValueError("recv_ts_utc invalid")

        gateway, _ = Gateway.objects.get_or_create(
            gateway_id=gateway_id
        )

        node, _ = Node.objects.get_or_create(
            gateway=gateway,
            node_id=int(source)
        )

        reading, created = SensorReading.objects.get_or_create(
            gateway=gateway,
            event_id=int(event_id),

            defaults={
                "node": node,
                "seq": seq,
                "recv_ts_utc": recv_ts,

                "host_time":
                    data.get("time"),

"hdc_temp_x10": (
    None if data.get("hdc_temp_x10") == -32768
    else data.get("hdc_temp_x10")
),

"hdc_hum_x10": (
    None if data.get("hdc_hum_x10") == 65535
    else data.get("hdc_hum_x10")
),

"light_raw": (
    None if data.get("light_raw") == 65535
    else data.get("light_raw")
),

"bmp_temp_x10": (
    None if data.get("bmp_temp_x10") == -32768
    else data.get("bmp_temp_x10")
),

"pressure_pa": (
    None if data.get("pressure_pa") == -2147483648
    else data.get("pressure_pa")
),
                "raw_payload":
                    payload,
            }
        )

        gateway.last_seen = recv_ts
        gateway.save(
            update_fields=["last_seen"]
        )

        node.last_seen = recv_ts
        node.save(
            update_fields=["last_seen"]
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Stored event={event_id} "
                    f"node={source} "
                    f"seq={seq}"
                )
            )
        else:
            self.stdout.write(
                f"Duplicate ignored "
                f"event={event_id}"
            )#creat here
