import json
import math
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from mcp.server.fastmcp import FastMCP


mcp = FastMCP(
    "Arogya Healthcare Lookup"
)


# ============================================================
# CONFIGURATION
# ============================================================

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

NOMINATIM_URL = (
    "https://nominatim.openstreetmap.org/search"
)

FOURSQUARE_URL = (
    "https://places-api.foursquare.com"
)

FOURSQUARE_API_VERSION = "2025-06-17"

FOURSQUARE_API_KEY = (
    os.getenv("FOURSQUARE_API_KEY", "").strip()
)

USER_AGENT = (
    "ArogyaHealthAccess-Day5/2.0"
)


# ============================================================
# COMMON HTTP HELPERS
# ============================================================

def http_get_json(
    url: str,
    headers: dict | None = None,
    timeout: int = 10,
) -> dict:

    request = urllib.request.Request(
        url,
        headers=headers or {},
        method="GET",
    )

    with urllib.request.urlopen(
        request,
        timeout=timeout,
    ) as response:

        return json.loads(
            response.read().decode(
                "utf-8"
            )
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
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
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
            f"I could not find a map location for {place}."
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
                f"[Arogya MCP] Trying {overpass_url}"
            )

            request = urllib.request.Request(
                overpass_url,
                data=body,
                headers={
                    "User-Agent": USER_AGENT,
                    "Content-Type":
                        "application/x-www-form-urlencoded",
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
            float(element["lat"]),
            float(element["lon"]),
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
            float(center["lat"]),
            float(center["lon"]),
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
        or tags.get("official_name")
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
        "source": "OpenStreetMap",
    }


# ============================================================
# FOURSQUARE HELPERS
# ============================================================

def foursquare_headers() -> dict:

    if not FOURSQUARE_API_KEY:
        raise RuntimeError(
            "FOURSQUARE_API_KEY is not configured."
        )

    return {
        "Accept": "application/json",
        "Authorization": (
            f"Bearer {FOURSQUARE_API_KEY}"
        ),
        "X-Places-Api-Version":
            FOURSQUARE_API_VERSION,
        "User-Agent": USER_AGENT,
    }


def foursquare_search(
    latitude: float,
    longitude: float,
    query: str = "hospital",
    radius_m: int = 5000,
    limit: int = 10,
) -> dict:

    params = {
        "ll": f"{latitude},{longitude}",
        "radius": str(
            max(
                500,
                min(
                    int(radius_m),
                    100000,
                ),
            )
        ),
        "query": query,
        "limit": str(
            max(
                1,
                min(
                    int(limit),
                    50,
                ),
            )
        ),
        "sort": "DISTANCE",
        "fields": (
            "fsq_place_id,"
            "name,"
            "latitude,"
            "longitude,"
            "location,"
            "categories,"
            "chains,"
            "tel,"
            "website,"
            "rating,"
            "popularity,"
            "description,"
            "price,"
            "hours,"
            "features,"
            "date_closed,"
            "date_refreshed"
        ),
    }

    url = (
        f"{FOURSQUARE_URL}/places/search?"
        f"{urllib.parse.urlencode(params)}"
    )

    return http_get_json(
        url,
        headers=foursquare_headers(),
        timeout=10,
    )


def foursquare_place_details(
    fsq_place_id: str,
) -> dict:

    fields = (
        "fsq_place_id,"
        "name,"
        "latitude,"
        "longitude,"
        "location,"
        "categories,"
        "chains,"
        "tel,"
        "website,"
        "rating,"
        "popularity,"
        "description,"
        "price,"
        "hours,"
        "features,"
        "date_closed,"
        "date_refreshed"
    )

    params = urllib.parse.urlencode(
        {
            "fields": fields
        }
    )

    url = (
        f"{FOURSQUARE_URL}/places/"
        f"{urllib.parse.quote(fsq_place_id)}?"
        f"{params}"
    )

    return http_get_json(
        url,
        headers=foursquare_headers(),
        timeout=10,
    )


def foursquare_tips(
    fsq_place_id: str,
    limit: int = 10,
) -> dict:

    params = urllib.parse.urlencode(
        {
            "limit": max(
                1,
                min(
                    int(limit),
                    50,
                ),
            ),
            "fields": (
                "fsq_tip_id,"
                "created_at,"
                "text,"
                "lang,"
                "agree_count,"
                "disagree_count,"
                "url"
            ),
            "sort": "popular",
        }
    )

    url = (
        f"{FOURSQUARE_URL}/places/"
        f"{urllib.parse.quote(fsq_place_id)}"
        f"/tips?{params}"
    )

    return http_get_json(
        url,
        headers=foursquare_headers(),
        timeout=10,
    )


# ============================================================
# NORMALIZE FOURSQUARE RESULT
# ============================================================

def normalize_foursquare_place(
    place: dict,
    origin_lat: float,
    origin_lon: float,
) -> dict:

    latitude = place.get(
        "latitude"
    )

    longitude = place.get(
        "longitude"
    )

    distance_km = None

    if (
        latitude is not None
        and longitude is not None
    ):

        distance_km = round(
            haversine_km(
                origin_lat,
                origin_lon,
                float(latitude),
                float(longitude),
            ),
            2,
        )

    location = place.get(
        "location"
    ) or {}

    categories = []

    for category in (
        place.get("categories")
        or []
    ):

        if isinstance(
            category,
            dict,
        ):

            name = category.get(
                "name"
            )

            if name:
                categories.append(
                    name
                )

    return {
        "name": place.get(
            "name",
            "Unknown facility",
        ),

        "source": "Foursquare",

        "fsq_place_id": place.get(
            "fsq_place_id"
        ),

        "latitude": latitude,

        "longitude": longitude,

        "distance_km": distance_km,

        "address": (
            location.get("formatted_address")
            or location.get("address")
            or ""
        ),

        "locality": location.get(
            "locality",
            "",
        ),

        "region": location.get(
            "region",
            "",
        ),

        "postcode": location.get(
            "postcode",
            "",
        ),

        "country": location.get(
            "country",
            "",
        ),

        "categories": categories,

        "phone": place.get(
            "tel",
            "",
        ),

        "website": place.get(
            "website",
            "",
        ),

        "rating": place.get(
            "rating"
        ),

        "popularity": place.get(
            "popularity"
        ),

        "description": place.get(
            "description",
            "",
        ),

        "price": place.get(
            "price"
        ),

        "hours": place.get(
            "hours"
        ),

        "features": place.get(
            "features"
        ),

        "date_refreshed": place.get(
            "date_refreshed"
        ),

        "date_closed": place.get(
            "date_closed"
        ),

        "maps_url": (
            "https://www.google.com/maps/"
            "search/?api=1&query="
            f"{latitude},{longitude}"
            if latitude is not None
            and longitude is not None
            else ""
        ),
    }


# ============================================================
# MERGE DUPLICATE FACILITIES
# ============================================================

def facility_match_key(
    facility: dict,
) -> str:

    name = (
        facility.get("name")
        or ""
    ).strip().lower()

    latitude = facility.get(
        "latitude"
    )

    longitude = facility.get(
        "longitude"
    )

    if (
        latitude is not None
        and longitude is not None
    ):

        return (
            f"{name}|"
            f"{round(float(latitude), 4)}|"
            f"{round(float(longitude), 4)}"
        )

    return name


def merge_facilities(
    osm_facilities: list,
    fsq_facilities: list,
) -> list:

    merged = {}

    for facility in (
        osm_facilities
        + fsq_facilities
    ):

        key = facility_match_key(
            facility
        )

        if key not in merged:

            merged[key] = facility
            continue

        existing = merged[key]

        # Preserve OSM source information.
        if (
            existing.get("source")
            == "OpenStreetMap"
            and facility.get("source")
            == "Foursquare"
        ):

            existing["foursquare"] = {
                "fsq_place_id":
                    facility.get(
                        "fsq_place_id"
                    ),
                "rating":
                    facility.get(
                        "rating"
                    ),
                "popularity":
                    facility.get(
                        "popularity"
                    ),
                "phone":
                    facility.get(
                        "phone"
                    ),
                "website":
                    facility.get(
                        "website"
                    ),
                "description":
                    facility.get(
                        "description"
                    ),
                "categories":
                    facility.get(
                        "categories"
                    ),
                "hours":
                    facility.get(
                        "hours"
                    ),
                "features":
                    facility.get(
                        "features"
                    ),
            }

            if not existing.get(
                "address"
            ):

                existing["address"] = (
                    facility.get(
                        "address",
                        "",
                    )
                )

        elif (
            existing.get("source")
            == "Foursquare"
            and facility.get("source")
            == "OpenStreetMap"
        ):

            facility["foursquare"] = {
                "fsq_place_id":
                    existing.get(
                        "fsq_place_id"
                    ),
                "rating":
                    existing.get(
                        "rating"
                    ),
                "popularity":
                    existing.get(
                        "popularity"
                    ),
                "phone":
                    existing.get(
                        "phone"
                    ),
                "website":
                    existing.get(
                        "website"
                    ),
                "description":
                    existing.get(
                        "description"
                    ),
                "categories":
                    existing.get(
                        "categories"
                    ),
                "hours":
                    existing.get(
                        "hours"
                    ),
                "features":
                    existing.get(
                        "features"
                    ),
            }

            merged[key] = facility

    return list(
        merged.values()
    )


# ============================================================
# MCP TOOL 1
# OSM + FOURSQUARE NEARBY SEARCH
# ============================================================

@mcp.tool()
def find_nearby_health_facilities(
    latitude: float = 0.0,
    longitude: float = 0.0,
    district: str = "",
    place: str = "",
    radius_m: int = 5000,
) -> str:

    """
    Find nearby healthcare facilities using
    OpenStreetMap and Foursquare.

    Use this for hospitals, clinics, doctors,
    PHCs and healthcare facilities.

    Returns nearby facilities with source,
    distance, address and available metadata.

    Foursquare information may include rating,
    popularity, website, phone, hours and
    other available place attributes.
    """

    radius_m = max(
        500,
        min(
            int(radius_m),
            10000,
        ),
    )

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

    if not has_coordinates:

        if not resolved_place:

            raise RuntimeError(
                "No device location or place "
                "was provided."
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
    # OSM
    # --------------------------------------------------------

    osm_facilities = []

    try:

        payload = fetch_overpass(
            latitude,
            longitude,
            radius_m,
        )

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
                osm_facilities.append(
                    facility
                )

    except Exception as exc:

        print(
            "[Arogya MCP] OSM lookup failed: "
            f"{exc}"
        )

    # --------------------------------------------------------
    # FOURSQUARE
    # --------------------------------------------------------

    fsq_facilities = []

    if FOURSQUARE_API_KEY:

        try:

            fsq_payload = (
                foursquare_search(
                    latitude,
                    longitude,
                    query="hospital clinic healthcare",
                    radius_m=radius_m,
                    limit=10,
                )
            )

            for place_data in (
                fsq_payload.get(
                    "results",
                    []
                )
            ):

                try:

                    fsq_facilities.append(
                        normalize_foursquare_place(
                            place_data,
                            latitude,
                            longitude,
                        )
                    )

                except Exception as exc:

                    print(
                        "[Arogya MCP] "
                        "Could not normalize "
                        f"Foursquare result: {exc}"
                    )

        except Exception as exc:

            print(
                "[Arogya MCP] "
                f"Foursquare lookup failed: {exc}"
            )

    else:

        print(
            "[Arogya MCP] "
            "FOURSQUARE_API_KEY not configured"
        )

    # --------------------------------------------------------
    # MERGE
    # --------------------------------------------------------

    facilities = merge_facilities(
        osm_facilities,
        fsq_facilities,
    )

    facilities.sort(
        key=lambda item:
            (
                item.get(
                    "distance_km"
                )
                if item.get(
                    "distance_km"
                ) is not None
                else 999999
            )
    )

    facilities = facilities[:10]

    fetched_at = (
        datetime.now(
            timezone.utc
        ).isoformat(
            timespec="seconds"
        )
    )

    # --------------------------------------------------------
    # RESULT
    # --------------------------------------------------------

    return json.dumps(
        {
            "status": (
                "ok"
                if facilities
                else "no_results"
            ),

            "sources": [
                "OpenStreetMap Overpass API",
                (
                    "Foursquare Places API"
                    if FOURSQUARE_API_KEY
                    else "Foursquare unavailable"
                ),
            ],

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

            "facility_count":
                len(facilities),

            "facilities":
                facilities,
        },
        ensure_ascii=False,
    )


# ============================================================
# MCP TOOL 2
# FOURSQUARE PLACE DETAILS
# ============================================================

@mcp.tool()
def get_health_facility_details(
    fsq_place_id: str,
) -> str:

    """
    Get detailed information about a healthcare
    facility from Foursquare.

    Use the fsq_place_id returned by
    find_nearby_health_facilities.
    """

    if not fsq_place_id.strip():

        raise RuntimeError(
            "fsq_place_id is required."
        )

    try:

        data = foursquare_place_details(
            fsq_place_id.strip()
        )

        return json.dumps(
            {
                "status": "ok",
                "source": "Foursquare Places API",
                "facility": data,
            },
            ensure_ascii=False,
        )

    except Exception as exc:

        raise RuntimeError(
            "Foursquare facility details "
            "are unavailable right now."
        ) from exc


# ============================================================
# MCP TOOL 3
# FOURSQUARE USER TIPS / REVIEW-LIKE DATA
# ============================================================

@mcp.tool()
def get_health_facility_reviews(
    fsq_place_id: str,
    limit: int = 10,
) -> str:

    """
    Retrieve Foursquare user tips for a facility.

    These are user-generated tips/recommendations,
    not medical reviews and not a substitute for
    professional medical information.
    """

    if not fsq_place_id.strip():

        raise RuntimeError(
            "fsq_place_id is required."
        )

    try:

        data = foursquare_tips(
            fsq_place_id.strip(),
            limit,
        )

        tips = data.get(
            "tips",
            []
        )

        return json.dumps(
            {
                "status": "ok",

                "source":
                    "Foursquare Places API",

                "fsq_place_id":
                    fsq_place_id,

                "tip_count":
                    len(tips),

                "tips":
                    tips,
            },
            ensure_ascii=False,
        )

    except Exception as exc:

        raise RuntimeError(
            "Foursquare user feedback "
            "is unavailable right now."
        ) from exc


# ============================================================
# MCP TOOL 4
# SEARCH HEALTHCARE SPECIALTY
# ============================================================

@mcp.tool()
def search_healthcare_specialty(
    latitude: float = 0.0,
    longitude: float = 0.0,
    specialty: str = "",
    district: str = "",
    radius_m: int = 5000,
) -> str:

    """
    Search Foursquare for a specific healthcare
    category or specialty near the user.

    Examples:
    cardiologist
    dentist
    pediatrician
    physiotherapy
    diagnostic centre
    pharmacy
    eye hospital
    """
    
    if not specialty.strip():

        raise RuntimeError(
            "A healthcare specialty is required."
        )

    has_coordinates = (
        -90 <= latitude <= 90
        and -180 <= longitude <= 180
        and (
            latitude != 0
            or longitude != 0
        )
    )

    if not has_coordinates:

        if not district.strip():

            raise RuntimeError(
                "Provide coordinates or a district."
            )

        (
            latitude,
            longitude,
            location_name,
        ) = geocode_place(
            district
        )

    else:

        location_name = (
            district.strip()
            or "Current device location"
        )

    try:

        payload = foursquare_search(
            latitude,
            longitude,
            query=specialty.strip(),
            radius_m=radius_m,
            limit=10,
        )

        results = []

        for place_data in payload.get(
            "results",
            [],
        ):

            results.append(
                normalize_foursquare_place(
                    place_data,
                    latitude,
                    longitude,
                )
            )

        return json.dumps(
            {
                "status":
                    "ok"
                    if results
                    else "no_results",

                "source":
                    "Foursquare Places API",

                "specialty":
                    specialty,

                "search_location":
                    location_name,

                "results":
                    results,
            },
            ensure_ascii=False,
        )

    except Exception as exc:

        raise RuntimeError(
            "Healthcare specialty search "
            "is unavailable right now."
        ) from exc


# ============================================================
# MCP TOOL 5
# COMPARE FACILITIES
# ============================================================

@mcp.tool()
def compare_healthcare_facilities(
    fsq_place_ids: str,
) -> str:

    """
    Compare multiple healthcare facilities using
    Foursquare metadata.

    Pass comma-separated fsq_place_id values.
    """

    ids = [
        item.strip()
        for item in fsq_place_ids.split(",")
        if item.strip()
    ]

    if not ids:

        raise RuntimeError(
            "At least one fsq_place_id is required."
        )

    if len(ids) > 5:

        ids = ids[:5]

    results = []

    for place_id in ids:

        try:

            data = foursquare_place_details(
                place_id
            )

            results.append(
                {
                    "fsq_place_id":
                        place_id,

                    "name":
                        data.get(
                            "name"
                        ),

                    "rating":
                        data.get(
                            "rating"
                        ),

                    "popularity":
                        data.get(
                            "popularity"
                        ),

                    "description":
                        data.get(
                            "description"
                        ),

                    "phone":
                        data.get(
                            "tel"
                        ),

                    "website":
                        data.get(
                            "website"
                        ),

                    "address":
                        (
                            data.get(
                                "location"
                            )
                            or {}
                        ).get(
                            "formatted_address"
                        ),

                    "categories":
                        data.get(
                            "categories"
                        ),

                    "hours":
                        data.get(
                            "hours"
                        ),

                    "features":
                        data.get(
                            "features"
                        ),
                }
            )

        except Exception as exc:

            results.append(
                {
                    "fsq_place_id":
                        place_id,

                    "status":
                        "unavailable",

                    "error":
                        str(exc),
                }
            )

    return json.dumps(
        {
            "status": "ok",
            "source":
                "Foursquare Places API",
            "facilities":
                results,
        },
        ensure_ascii=False,
    )


# ============================================================
# MCP SERVER ENTRY POINT
# ============================================================

if __name__ == "__main__":
    mcp.run()