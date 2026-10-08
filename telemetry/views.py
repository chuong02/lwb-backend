from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .models import Node, SensorReading
from .serializers import NodeSerializer, SensorReadingSerializer


@api_view(["GET"])
def node_list(request):
    nodes = Node.objects.select_related("gateway").order_by(
        "-last_seen",
        "gateway__gateway_id",
        "node_id"
    )

    serializer = NodeSerializer(
        nodes,
        many=True
    )

    return Response(serializer.data)


@api_view(["GET"])
def latest_reading(request, node_id):
    gateway_id = request.query_params.get("gateway")
    qs = SensorReading.objects.filter(node__node_id=node_id)
    if gateway_id:
        qs = qs.filter(gateway__gateway_id=gateway_id)

    reading = (
        qs.select_related("node", "gateway")
        .order_by("-recv_ts_utc")
        .first()
    )

    if reading is None:
        return Response(
            {"detail": "No data"},
            status=status.HTTP_404_NOT_FOUND
        )

    return Response(
        SensorReadingSerializer(reading).data
    )


@api_view(["GET"])
def history(request, node_id):
    try:
        limit = int(
            request.query_params.get(
                "limit",
                100
            )
        )
    except ValueError:
        return Response(
            {
                "detail":
                "limit must be an integer"
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    if limit < 1:
        return Response(
            {
                "detail":
                "limit must be greater than 0"
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    # Tránh request lấy quá nhiều dữ liệu
    limit = min(limit, 1000)

    gateway_id = request.query_params.get("gateway")
    qs = SensorReading.objects.filter(node__node_id=node_id)
    if gateway_id:
        qs = qs.filter(gateway__gateway_id=gateway_id)

    readings = (
        qs.select_related("node", "gateway")
        .order_by("-recv_ts_utc")[:limit]
    )

    serializer = SensorReadingSerializer(
        readings,
        many=True
    )

    return Response(serializer.data)
