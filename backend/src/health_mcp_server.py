import json
import math
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from mcp.server.fastmcp import FastMCP


mcp = FastMCP(
    "Arogya Healthcare Lookup"
)


# ============================================================
# DATA SOURCES
# ============================================================

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

NOMINATIM_URL = (
    "https://nominatim.openstreetmap.org/search"
)

USER_AGENT = (
    "ArogyaHealthAccess-Day5/1.0"
)


# ============================================================
# DISTANCE CALCULATION
# ============================================================

def haversine_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:

    radius = 6371.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)

    d_phi = math.radians(
        lat2 - lat1
    )

    d_lambda = math.radians(
        lon2 - lon1
    )

    a = (
        math.sin(d_phi / 2) ** 2
        +
        math.cos(phi1)
        * math.cos(phi2)
        * math.sin(d_lambda / 2) ** 2
    )

    return (
        2
        * radius
        * math.asin(
            math.sqrt(a)
        )
    )


# ============================================================
# PLACE → COORDINATES
# ============================================================

def geocode_place(
    place: str,
) -> tuple[float, float, str]:

    params = urllib.parse.urlencode(
        {
            "q": place,
            "format": "jsonv2",
            "limit": "1",
            "addressdetails": "1",
        }
    )

    request = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}",
        headers={
            "User-Agent":
                USER_AGENT,
            "Accept":
                "application/json",
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=5,
    ) as response:

        results = json.loads(
            response.read().decode(
                "utf-8"
            )
        )

    if not results:

        raise RuntimeError(
            f"I could not find a map location "
            f"for {place}."
        )

    result = results[0]

    return (
        float(result["lat"]),
        float(result["lon"]),
        result.get(
            "display_name",
            place,
        ),
    )


# ============================================================
# OVERPASS HEALTHCARE LOOKUP
# ============================================================

def fetch_overpass(
    latitude: float,
    longitude: float,
    radius_m: int,
) -> dict:

    query = f"""
    [out:json][timeout:30];
    (
      nwr(
        around:{radius_m},
        {latitude},
        {longitude}
      )["amenity"~"hospital|clinic|doctors"];

      nwr(
        around:{radius_m},
        {latitude},
        {longitude}
      )["healthcare"];
    );
    out center tags;
    """

    body = urllib.parse.urlencode(
        {
            "data": query
        }
    ).encode(
        "utf-8"
    )

    last_error = None

    for overpass_url in OVERPASS_URLS:

        try:

            print(
                f"[Arogya MCP] Trying "
                f"{overpass_url}"
            )

            request = urllib.request.Request(
                overpass_url,
                data=body,
                headers={
                    "User-Agent":
                        USER_AGENT,

                    "Content-Type":
                        "application/"
                        "x-www-form-urlencoded",

                    "Accept":
                        "application/json",
                },
                method="POST",
            )

            with urllib.request.urlopen(
                request,
                timeout=40,
            ) as response:

                result = json.loads(
                    response.read().decode(
                        "utf-8"
                    )
                )

            print(
                "[Arogya MCP] "
                "Overpass lookup succeeded"
            )

            return result

        except Exception as exc:

            last_error = exc

            print(
                "[Arogya MCP] "
                "Overpass endpoint failed: "
                f"{overpass_url} — {exc}"
            )

    raise RuntimeError(
        "All OpenStreetMap Overpass data "
        "sources are currently unavailable."
    ) from last_error


# ============================================================
# ELEMENT COORDINATES
# ============================================================

def element_coordinates(
    element: dict,
) -> tuple[float, float] | None:

    if (
        "lat" in element
        and "lon" in element
    ):

        return (
            float(
                element["lat"]
            ),
            float(
                element["lon"]
            ),
        )

    center = element.get(
        "center"
    )

    if (
        center
        and "lat" in center
        and "lon" in center
    ):

        return (
            float(
                center["lat"]
            ),
            float(
                center["lon"]
            ),
        )

    return None


# ============================================================
# CONVERT OSM ELEMENT → FACILITY
# ============================================================

def facility_from_element(
    element: dict,
    origin_lat: float,
    origin_lon: float,
) -> dict | None:

    coords = element_coordinates(
        element
    )

    if coords is None:
        return None

    tags = element.get(
        "tags",
        {},
    )

    latitude, longitude = coords

    distance = haversine_km(
        origin_lat,
        origin_lon,
        latitude,
        longitude,
    )

    name = (
        tags.get("name")
        or tags.get(
            "official_name"
        )
        or "Unnamed healthcare facility"
    )

    facility_type = (
        tags.get("amenity")
        or tags.get("healthcare")
        or "healthcare facility"
    )

    operator = tags.get(
        "operator",
        "",
    )

    operator_type = tags.get(
        "operator:type",
        "",
    )

    ownership = tags.get(
        "ownership",
        "",
    )

    public_markers = {
        operator_type.lower(),
        operator.lower(),
        ownership.lower(),
    }

    is_public = any(
        marker in {
            "public",
            "government",
            "state",
            "municipal",
        }
        for marker in public_markers
    )

    address_parts = [
        tags.get(
            "addr:housenumber",
            "",
        ),
        tags.get(
            "addr:street",
            "",
        ),
        tags.get(
            "addr:suburb",
            "",
        ),
        tags.get(
            "addr:city",
            "",
        ),
        tags.get(
            "addr:district",
            "",
        ),
    ]

    address = ", ".join(
        part
        for part in address_parts
        if part
    )

    return {
        "name": name,

        "type": facility_type,

        "operator": operator,

        "is_public": is_public,

        "address": address,

        "latitude": round(
            latitude,
            6,
        ),

        "longitude": round(
            longitude,
            6,
        ),

        "distance_km": round(
            distance,
            2,
        ),

        "osm_type": element.get(
            "type",
            "",
        ),

        "osm_id": element.get(
            "id"
        ),

        "maps_url": (
            "https://www.google.com/maps/"
            "search/?api=1&query="
            f"{latitude},{longitude}"
        ),
    }


# ============================================================
# MCP TOOL
# ============================================================

@mcp.tool()
def find_nearby_health_facilities(
    latitude: float = 0.0,
    longitude: float = 0.0,
    district: str = "",
    place: str = "",
    radius_m: int = 5000,
) -> str:
    """Find nearby healthcare facilities using live OpenStreetMap data.

    Use latitude and longitude when browser device
    location is available.

    If coordinates are unavailable, use the user's
    district or requested place.

    Returns the five nearest mapped healthcare
    facilities with distance, address when available,
    public/government tagging when available, and
    the UTC fetch timestamp.

    Use this only for healthcare facility lookup.
    Do not use this tool for diagnosis or treatment.
    """

    # --------------------------------------------------------
    # LIMIT SEARCH RADIUS
    # --------------------------------------------------------

    radius_m = max(
        500,
        min(
            int(radius_m),
            10000,
        ),
    )


    # --------------------------------------------------------
    # DETERMINE LOCATION
    # --------------------------------------------------------

    resolved_place = (
        place.strip()
        or district.strip()
    )

    has_coordinates = (
        -90 <= latitude <= 90
        and -180 <= longitude <= 180
        and (
            latitude != 0
            or longitude != 0
        )
    )


    # --------------------------------------------------------
    # GEOCODE FALLBACK
    # --------------------------------------------------------

    if not has_coordinates:

        if not resolved_place:

            raise RuntimeError(
                "No device location or place was "
                "provided for the healthcare lookup."
            )

        (
            latitude,
            longitude,
            resolved_display_name,
        ) = geocode_place(
            resolved_place
        )

    else:

        resolved_display_name = (
            district.strip()
            or "Current device location"
        )


    # --------------------------------------------------------
    # LIVE OPENSTREETMAP LOOKUP
    # --------------------------------------------------------

    try:

        payload = fetch_overpass(
            latitude,
            longitude,
            radius_m,
        )

    except Exception as exc:

        raise RuntimeError(
            "The OpenStreetMap healthcare data "
            "source is unavailable right now."
        ) from exc


    # --------------------------------------------------------
    # PROCESS RESULTS
    # --------------------------------------------------------

    facilities = []

    seen = set()

    for element in payload.get(
        "elements",
        [],
    ):

        key = (
            element.get("type"),
            element.get("id"),
        )

        if key in seen:
            continue

        seen.add(key)

        facility = facility_from_element(
            element,
            latitude,
            longitude,
        )

        if facility:

            facilities.append(
                facility
            )


    # --------------------------------------------------------
    # SORT BY DISTANCE
    # --------------------------------------------------------

    facilities.sort(
        key=lambda item:
            item["distance_km"]
    )


    # Only return the five nearest.
    facilities = facilities[:5]


    # --------------------------------------------------------
    # TIMESTAMP
    # --------------------------------------------------------

    fetched_at = (
        datetime.now(
            timezone.utc
        ).isoformat(
            timespec="seconds"
        )
    )


    # --------------------------------------------------------
    # NO RESULTS
    # --------------------------------------------------------

    if not facilities:

        return json.dumps(
            {
                "status":
                    "no_results",

                "source":
                    "OpenStreetMap Overpass API",

                "fetched_at_utc":
                    fetched_at,

                "search_location":
                    resolved_display_name,

                "latitude":
                    round(
                        latitude,
                        6,
                    ),

                "longitude":
                    round(
                        longitude,
                        6,
                    ),

                "radius_m":
                    radius_m,

                "facilities":
                    [],

                "message":
                    "No mapped healthcare facilities "
                    "were found in the search radius.",
            },

            ensure_ascii=False,
        )


    # --------------------------------------------------------
    # SUCCESS
    # --------------------------------------------------------

    return json.dumps(
        {
            "status":
                "ok",

            "source":
                "OpenStreetMap Overpass API",

            "fetched_at_utc":
                fetched_at,

            "search_location":
                resolved_display_name,

            "latitude":
                round(
                    latitude,
                    6,
                ),

            "longitude":
                round(
                    longitude,
                    6,
                ),

            "radius_m":
                radius_m,

            "facilities":
                facilities,
        },

        ensure_ascii=False,
    )


# ============================================================
# MCP SERVER ENTRY POINT
# ============================================================

if __name__ == "__main__":
    mcp.run()