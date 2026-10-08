from datetime import timedelta
import random
from django.core.management.base import BaseCommand
from django.utils import timezone
from telemetry.models import Gateway, Node, SensorReading


class Command(BaseCommand):
    help = "Generate realistic sample telemetry data for Gateway, Nodes, and SensorReadings"

    def add_arguments(self, parser):
        parser.add_argument(
            "--readings",
            type=int,
            default=30,
            help="Number of readings per node to generate (default: 30)"
        )

    def handle(self, *args, **options):
        count = options["readings"]
        now = timezone.now()

        # 1. Ensure Gateway exists
        gateway, created = Gateway.objects.get_or_create(
            gateway_id="GW-SITE1-01",
            defaults={"last_seen": now}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created Gateway: {gateway.gateway_id}"))
        else:
            self.stdout.write(f"Using existing Gateway: {gateway.gateway_id}")

        # 2. Ensure Nodes exist
        node_ids = [1, 2, 5]
        nodes = []
        for nid in node_ids:
            node, _ = Node.objects.get_or_create(
                gateway=gateway,
                node_id=nid,
                defaults={"last_seen": now}
            )
            nodes.append(node)

        self.stdout.write(f"Configured {len(nodes)} nodes: {[n.node_id for n in nodes]}")

        # 3. Generate time-series SensorReadings
        total_created = 0
        base_event_id = int(now.timestamp()) % 1000000

        for node in nodes:
            base_temp = 25.0 + (node.node_id * 1.2)
            base_hum = 60.0 - (node.node_id * 2.0)

            for i in range(count):
                event_id = base_event_id + (node.node_id * 1000) + i
                recv_time = now - timedelta(seconds=(count - i) * 10)

                temp_val = base_temp + random.uniform(-0.8, 0.8)
                hum_val = base_hum + random.uniform(-2.0, 2.0)
                press_val = 101325 + random.randint(-40, 40)
                light_val = 1800 + (node.node_id * 100) + random.randint(-150, 150)

                hdc_temp_x10 = int(temp_val * 10)
                hdc_hum_x10 = int(hum_val * 10)
                bmp_temp_x10 = int((temp_val + 0.3) * 10)

                raw_payload = {
                    "record_type": "SENSOR_DATA",
                    "gateway_id": gateway.gateway_id,
                    "event_id": event_id,
                    "source": node.node_id,
                    "seq": i + 1,
                    "recv_ts_utc": recv_time.isoformat(),
                    "data": {
                        "time": int(recv_time.timestamp()),
                        "hdc_temp_x10": hdc_temp_x10,
                        "hdc_hum_x10": hdc_hum_x10,
                        "light_raw": light_val,
                        "bmp_temp_x10": bmp_temp_x10,
                        "pressure_pa": press_val,
                    }
                }

                _, was_created = SensorReading.objects.get_or_create(
                    gateway=gateway,
                    event_id=event_id,
                    defaults={
                        "node": node,
                        "seq": i + 1,
                        "recv_ts_utc": recv_time,
                        "host_time": int(recv_time.timestamp()),
                        "hdc_temp_x10": hdc_temp_x10,
                        "hdc_hum_x10": hdc_hum_x10,
                        "light_raw": light_val,
                        "bmp_temp_x10": bmp_temp_x10,
                        "pressure_pa": press_val,
                        "raw_payload": raw_payload,
                    }
                )

                if was_created:
                    total_created += 1

            # Update last_seen
            node.last_seen = now
            node.save(update_fields=["last_seen"])

        gateway.last_seen = now
        gateway.save(update_fields=["last_seen"])

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded {total_created} sensor readings across {len(nodes)} nodes!"
            )
        )
