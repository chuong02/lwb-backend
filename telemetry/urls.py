from django.urls import path

from . import views


urlpatterns = [
    path(
        "nodes/",
        views.node_list,
        name="node-list"
    ),

    path(
        "nodes/<int:node_id>/latest/",
        views.latest_reading,
        name="latest-reading"
    ),

    path(
        "nodes/<int:node_id>/history/",
        views.history,
        name="history"
    ),
]
