import asyncio
import json
import logging
import os
import sqlite3
import sys
import urllib.parse
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from livekit import rtc

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ChatContext,
    JobContext,
    JobProcess,
    RunContext,
    TurnHandlingOptions,
    cli,
    function_tool,
    inference,
    mcp,
    room_io,
    tokenize,
)

from livekit.plugins import (
    deepgram,
    google,
    murf,
    noise_cancellation,
    silero,
)


# ============================================================
# LOGGING
# ============================================================

logger = logging.getLogger("agent")

logging.basicConfig(
    level=logging.DEBUG
)

load_dotenv(".env.local")


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

DB_NAME = str(
    BASE_DIR.parent / "memory.db"
)

MCP_SERVER_FILE = str(
    BASE_DIR / "health_mcp_server.py"
)


# ============================================================
# DATABASE
# ============================================================

def init_database():

    conn = sqlite3.connect(
        DB_NAME
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            language_preference TEXT,
            age_band TEXT,
            ongoing_conditions TEXT,
            last_triage_outcome TEXT,
            last_interaction TEXT,
            district TEXT
        )
        """
    )

    columns = {
        row[1]
        for row in conn.execute(
            "PRAGMA table_info(users)"
        ).fetchall()
    }

    if "district" not in columns:

        conn.execute(
            """
            ALTER TABLE users
            ADD COLUMN district TEXT
            """
        )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS calls (
            call_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            saved INTEGER NOT NULL DEFAULT 1,
            history_json TEXT NOT NULL
        )
        """
    )

    conn.commit()
    conn.close()


init_database()


# ============================================================
# DATABASE HELPERS
# ============================================================

def get_saved_user(
    user_id: str,
):

    conn = sqlite3.connect(
        DB_NAME
    )

    conn.row_factory = (
        sqlite3.Row
    )

    user = conn.execute(
        """
        SELECT *
        FROM users
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()

    conn.close()

    return (
        dict(user)
        if user
        else None
    )


def get_latest_history(
    user_id: str,
):

    conn = sqlite3.connect(
        DB_NAME
    )

    row = conn.execute(
        """
        SELECT history_json
        FROM calls
        WHERE user_id = ?
          AND saved = 1
        ORDER BY end_time DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()

    conn.close()

    if not row:
        return None

    try:

        return json.loads(
            row[0]
        )

    except Exception:

        logger.exception(
            "Unable to decode saved conversation history"
        )

        return None


# ============================================================
# REVERSE GEOCODING
# ============================================================

def reverse_geocode(
    latitude: float,
    longitude: float,
) -> dict:

    params = urllib.parse.urlencode(
        {
            "format": "jsonv2",
            "lat":
                f"{latitude:.6f}",
            "lon":
                f"{longitude:.6f}",
            "zoom": "10",
            "addressdetails": "1",
        }
    )

    url = (
        "https://nominatim.openstreetmap.org/reverse?"
        + params
    )

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent":
                "ArogyaHealthAccess-Day5/1.0",
            "Accept":
                "application/json",
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=40,
    ) as response:

        payload = json.loads(
            response.read().decode(
                "utf-8"
            )
        )

    address = payload.get(
        "address",
        {},
    )

    district = (
        address.get("state_district")
        or address.get("county")
        or address.get("district")
        or address.get("city_district")
        or address.get("city")
        or address.get("town")
        or address.get("village")
        or ""
    )

    place = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or district
        or ""
    )

    return {
        "district":
            district.strip(),

        "place":
            place.strip(),

        "display_name":
            payload.get(
                "display_name",
                "",
            ),
    }


# ============================================================
# SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """
You are Arogya, the user's AI health assistant.

Your role is to provide general health information,
healthy lifestyle guidance, first-aid information,
vaccination awareness, and guidance on when users
should seek medical care.

You are not a doctor and do not replace professional
medical advice.

You can help with:

General health information.
Common symptoms.
Medicine reminders.
Healthy lifestyle advice.
First-aid guidance.
Vaccination information.
Guidance on when to visit a doctor or hospital.

Never:

Diagnose diseases.
Prescribe medicines or medicine dosages.
Recommend prescription drugs.
Claim to be a doctor.
Guarantee any treatment or recovery.
Answer unrelated questions.

If the user reports chest pain, difficulty breathing,
severe bleeding, stroke symptoms, seizures, loss of
consciousness, or rapidly worsening symptoms,
immediately advise them to contact emergency services
or visit the nearest hospital.

If you are unsure, clearly say so and recommend
consulting a qualified healthcare professional.

LANGUAGE:

Detect the user's language automatically.

Mirror the user's language exactly.

If the user speaks English, reply in English.

If the user speaks Hindi, reply in Hindi.

If the user mixes Hindi and English, reply in the
same mixed style.

Do not convert mixed-language conversations into
only English or only Hindi.

Always use the native script for non-English languages.

Hindi must use Devanagari.

Keep replies short because they are spoken aloud.

STYLE:

Friendly, calm, and empathetic.

Keep responses brief.

Avoid unnecessary repetition.

Do not use markdown, emojis, bullet points,
or special symbols.

MEMORY:

At the beginning of every call, use lookup_user.

If a returning caller is found, naturally greet them
by name.

A saved previous conversation may also be present
in your conversation context.

Use it naturally when relevant.

If no saved caller is found, treat this as a
new conversation.

During the call, when the user gives useful
information for future conversations, temporarily
remember it using remember_fact.

LOCATION:

The browser may provide the caller's current
latitude and longitude.

When lookup_user is called, use available device
location to resolve the caller's district.

If a district is resolved, remember it for this
conversation.

If the user later asks for a nearby healthcare
facility, do not ask for the district again.

Use the available device coordinates and remembered
district with the MCP healthcare tool.

If device location is unavailable, ask the user
for a place or district.

HEALTHCARE FACILITY TOOL:

The MCP tool is named
find_nearby_health_facilities.

Use it when the user asks to find a nearby:

hospital,
clinic,
doctor,
PHC,
primary health centre,
health centre,
healthcare facility,
or similar medical location.

Do not use the tool for general health questions.

When using the tool:

Use the current device coordinates if available.

Otherwise use the remembered district.

If the user explicitly gives a place, use that place.

Do not ask for the district again if a valid location
is already available.

Do not invent facility names, distances, addresses,
opening hours, availability, or services.

The tool returns live OpenStreetMap data and its
fetch timestamp.

Speak useful results naturally instead of reading
JSON.

If the tool fails, clearly tell the user that the
facility information is unavailable right now.

Never invent a result after a tool failure.

MEMORY PERSISTENCE:

remember_fact is temporary session memory only.

It does NOT save anything to the database.

Never claim that information has been permanently
saved during the call.

The database is written only after the caller
explicitly chooses Yes on the post-call consent screen.

If the caller chooses No, nothing from the current
session should be persisted.

Never ask the caller for consent through an
AI-generated question at the end of the call.
The application handles the consent screen separately.
"""


# ============================================================
# ASSISTANT
# ============================================================

class Assistant(Agent):

    def __init__(
        self,
        user_id: str,
        call_id: str,
        call_start: str,
        chat_ctx: ChatContext,
        tools=None,
    ) -> None:

        super().__init__(
            instructions=SYSTEM_PROMPT,
            chat_ctx=chat_ctx,
            tools=tools,
        )

        self.user_id = user_id
        self.call_id = call_id
        self.call_start = call_start

        self.pending_memory = {
            "name": "",
            "language_preference": "",
            "age_band": "",
            "ongoing_conditions": "",
            "last_triage_outcome": "",
            "district": "",
        }

        self.saved_user = None

        self.device_location = None

        self.location_status = "unknown"

        self.location_ready = (
            asyncio.Event()
        )

        self.current_room = None

        self.location_task = None


    # ========================================================
    # DEVICE LOCATION
    # ========================================================

    async def set_device_location(
        self,
        payload: dict,
    ):

        status = payload.get(
            "status"
        )

        if status != "granted":

            self.location_status = (
                "unavailable"
            )

            self.location_ready.set()

            logger.info(
                "Device location unavailable: %s",
                status,
            )

            return

        try:

            latitude = float(
                payload["latitude"]
            )

            longitude = float(
                payload["longitude"]
            )

        except (
            KeyError,
            TypeError,
            ValueError,
        ):

            self.location_status = (
                "unavailable"
            )

            self.location_ready.set()

            return

        if not (
            -90 <= latitude <= 90
            and -180 <= longitude <= 180
        ):

            self.location_status = (
                "unavailable"
            )

            self.location_ready.set()

            return

        self.device_location = {
            "latitude":
                latitude,

            "longitude":
                longitude,

            "accuracy":
                payload.get(
                    "accuracy"
                ),
        }

        self.location_status = (
            "granted"
        )

        self.location_ready.set()

        logger.info(
            "Received device location %.6f, %.6f",
            latitude,
            longitude,
        )


        # Resolve the district in the background.
        # This does not block the voice session.
        if self.location_task is None:

            self.location_task = (
                asyncio.create_task(
                    self.resolve_device_location()
                )
            )


    async def resolve_device_location(
        self,
    ):

        if not self.device_location:
            return

        try:

            geo = await asyncio.to_thread(
                reverse_geocode,
                self.device_location[
                    "latitude"
                ],
                self.device_location[
                    "longitude"
                ],
            )

            district = (
                geo.get(
                    "district",
                    "",
                )
                .strip()
            )

            place = (
                geo.get(
                    "place",
                    "",
                )
                .strip()
            )

            if district:

                self.pending_memory[
                    "district"
                ] = district

            logger.info(
                "Resolved device location: district=%s place=%s",
                district,
                place,
            )

        except Exception:

            logger.exception(
                "Reverse geocoding failed"
            )


    # ========================================================
    # LOOKUP USER
    # ========================================================

    @function_tool
    async def lookup_user(
        self,
        context: RunContext,
    ) -> str:
        """Look up the current caller and available location.

        Always use this at the beginning of a call.
        If device coordinates are available, resolve
        them to a district for later healthcare lookup.
        """

        logger.info(
            "Looking up caller %s",
            self.user_id,
        )

        user = get_saved_user(
            self.user_id
        )

        if user is not None:

            self.saved_user = user

            self.pending_memory[
                "name"
            ] = (
                user.get("name")
                or ""
            )

            self.pending_memory[
                "language_preference"
            ] = (
                user.get(
                    "language_preference"
                )
                or ""
            )

            self.pending_memory[
                "age_band"
            ] = (
                user.get(
                    "age_band"
                )
                or ""
            )

            self.pending_memory[
                "ongoing_conditions"
            ] = (
                user.get(
                    "ongoing_conditions"
                )
                or ""
            )

            self.pending_memory[
                "last_triage_outcome"
            ] = (
                user.get(
                    "last_triage_outcome"
                )
                or ""
            )

            self.pending_memory[
                "district"
            ] = (
                user.get(
                    "district"
                )
                or ""
            )


        # If browser location has already arrived,
        # use it immediately.
        if self.device_location:

            try:

                geo = await asyncio.to_thread(
                    reverse_geocode,
                    self.device_location[
                        "latitude"
                    ],
                    self.device_location[
                        "longitude"
                    ],
                )

                district = (
                    geo.get(
                        "district",
                        "",
                    )
                    .strip()
                )

                place = (
                    geo.get(
                        "place",
                        "",
                    )
                    .strip()
                )

                if district:

                    self.pending_memory[
                        "district"
                    ] = district

                location_text = (
                    "Current device location is available. "
                    f"District: "
                    f"{district or 'not resolved'}. "
                    f"Place: "
                    f"{place or 'not resolved'}. "
                    f"Latitude: "
                    f"{self.device_location['latitude']:.6f}. "
                    f"Longitude: "
                    f"{self.device_location['longitude']:.6f}."
                )

            except Exception:

                logger.exception(
                    "Reverse geocoding failed during lookup"
                )

                location_text = (
                    "Current device coordinates are available. "
                    f"Latitude: "
                    f"{self.device_location['latitude']:.6f}. "
                    f"Longitude: "
                    f"{self.device_location['longitude']:.6f}. "
                    "The coordinates can be used directly "
                    "for nearby healthcare lookup."
                )

        else:

            location_text = (
                "Device location is not currently available."
            )


        if user is None:

            return (
                "No saved caller was found. "
                "This is a new caller. "
                + location_text
            )


        latest_history = (
            get_latest_history(
                self.user_id
            )
        )

        history_status = (
            "A saved previous conversation is "
            "available in your conversation context."
            if latest_history
            else
            "No previous conversation history "
            "is available."
        )


        return (
            "Returning caller found. "
            f"Name: {user['name']}. "
            f"Language preference: "
            f"{user['language_preference'] or 'not recorded'}. "
            f"Age band: "
            f"{user['age_band'] or 'not recorded'}. "
            f"Ongoing conditions: "
            f"{user['ongoing_conditions'] or 'not recorded'}. "
            f"Saved district: "
            f"{self.pending_memory['district'] or 'not recorded'}. "
            f"Last interaction: "
            f"{user['last_interaction']}. "
            f"{history_status} "
            f"{location_text}"
        )


    # ========================================================
    # TEMPORARY MEMORY
    # ========================================================

    @function_tool
    async def remember_fact(
        self,
        context: RunContext,
        key: str,
        value: str,
    ) -> str:
        """Temporarily remember useful information."""

        allowed_keys = {
            "name",
            "language_preference",
            "age_band",
            "ongoing_conditions",
            "last_triage_outcome",
            "district",
        }

        key = key.strip()
        value = value.strip()

        if key not in allowed_keys:

            return (
                "That information is not part "
                "of the supported memory."
            )

        if not value:

            return "No information was stored."

        self.pending_memory[key] = value

        logger.info(
            "Temporarily remembered %s for %s",
            key,
            self.user_id,
        )

        return (
            "The information is temporarily remembered "
            "for this conversation. It has not been saved "
            "to the database."
        )


    # ========================================================
    # UI PUBLISHING
    # ========================================================

    async def publish_health_results(
        self,
        data: dict,
    ):

        if self.current_room is None:
            return

        payload = {
            "type":
                "health_facilities",

            **data,
        }

        try:

            await (
                self.current_room
                .local_participant
                .publish_data(
                    json.dumps(
                        payload,
                        ensure_ascii=False,
                    ).encode("utf-8"),

                    reliable=True,

                    destination_identities=[
                        self.user_id
                    ],

                    topic="arogya-health",
                )
            )

            logger.info(
                "Published healthcare results to UI"
            )

        except Exception:

            logger.exception(
                "Failed to publish healthcare results"
            )


    # ========================================================
    # SAVE DATABASE
    # ========================================================

    def save_session_to_database(
        self,
        session: AgentSession,
        end_time: str,
    ) -> None:

        name = (
            self.pending_memory["name"]
            or (
                self.saved_user["name"]
                if self.saved_user
                else ""
            )
        )

        if not name:
            name = "Unknown"


        history = session.history.to_dict(
            exclude_image=True,
            exclude_audio=True,
            exclude_timestamp=False,
            exclude_function_call=True,
            exclude_config_update=True,
        )

        history_json = json.dumps(
            history,
            ensure_ascii=False,
        )


        conn = sqlite3.connect(
            DB_NAME
        )


        conn.execute(
            """
            INSERT INTO users (
                user_id,
                name,
                language_preference,
                age_band,
                ongoing_conditions,
                last_triage_outcome,
                last_interaction,
                district
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)

            ON CONFLICT(user_id) DO UPDATE SET
                name = excluded.name,
                language_preference =
                    excluded.language_preference,
                age_band =
                    excluded.age_band,
                ongoing_conditions =
                    excluded.ongoing_conditions,
                last_triage_outcome =
                    excluded.last_triage_outcome,
                last_interaction =
                    excluded.last_interaction,
                district =
                    excluded.district
            """,
            (
                self.user_id,
                name,
                self.pending_memory[
                    "language_preference"
                ],
                self.pending_memory[
                    "age_band"
                ],
                self.pending_memory[
                    "ongoing_conditions"
                ],
                self.pending_memory[
                    "last_triage_outcome"
                ],
                end_time,
                self.pending_memory[
                    "district"
                ],
            ),
        )


        conn.execute(
            """
            INSERT OR REPLACE INTO calls (
                call_id,
                user_id,
                start_time,
                end_time,
                saved,
                history_json
            )
            VALUES (?, ?, ?, ?, 1, ?)
            """,
            (
                self.call_id,
                self.user_id,
                self.call_start,
                end_time,
                history_json,
            ),
        )


        conn.commit()
        conn.close()


    # ========================================================
    # CONSENT RPC
    # ========================================================

    def register_consent_rpc(
        self,
        ctx: JobContext,
        session: AgentSession,
    ):

        @ctx.room.local_participant.register_rpc_method(
            "save_memory"
        )
        async def save_memory_rpc(
            data: rtc.RpcInvocationData,
        ) -> str:

            if (
                data.caller_identity
                != self.user_id
            ):
                return "rejected"

            try:

                payload = json.loads(
                    data.payload or "{}"
                )

                end_time = (
                    payload.get(
                        "end_time"
                    )
                    or datetime.now().isoformat(
                        timespec="seconds"
                    )
                )

                self.save_session_to_database(
                    session,
                    end_time,
                )

                return "saved"

            except Exception:

                logger.exception(
                    "Failed to save session"
                )

                return "error"


        @ctx.room.local_participant.register_rpc_method(
            "discard_memory"
        )
        async def discard_memory_rpc(
            data: rtc.RpcInvocationData,
        ) -> str:

            if (
                data.caller_identity
                != self.user_id
            ):
                return "rejected"

            self.pending_memory = {
                "name": "",
                "language_preference": "",
                "age_band": "",
                "ongoing_conditions": "",
                "last_triage_outcome": "",
                "district": "",
            }

            return "discarded"


# ============================================================
# SERVER
# ============================================================

server = AgentServer()


def prewarm(
    proc: JobProcess,
):

    proc.userdata["vad"] = (
        silero.VAD.load()
    )


server.setup_fnc = prewarm


# ============================================================
# SESSION
# ============================================================

@server.rtc_session(
    agent_name="my-agent"
)
async def my_agent(
    ctx: JobContext,
):

    ctx.log_context_fields = {
        "room": ctx.room.name,
    }


    await ctx.connect()


    participant = (
        await ctx.wait_for_participant()
    )

    user_id = participant.identity

    call_id = str(
        uuid.uuid4()
    )

    call_start = (
        datetime.now().isoformat(
            timespec="seconds"
        )
    )


    saved_history = (
        get_latest_history(
            user_id
        )
    )


    if saved_history:

        try:

            chat_ctx = (
                ChatContext.from_dict(
                    saved_history
                )
            )

            chat_ctx.truncate(
                max_items=30
            )

        except Exception:

            logger.exception(
                "Failed to load saved history"
            )

            chat_ctx = (
                ChatContext.empty()
            )

    else:

        chat_ctx = (
            ChatContext.empty()
        )


    # --------------------------------------------------------
    # MCP RESULT RESOLVER
    # --------------------------------------------------------

    async def mcp_result_resolver(
        result_context:
            mcp.MCPToolResultContext,
    ) -> str:

        if (
            result_context.tool_name
            != "find_nearby_health_facilities"
        ):

            return json.dumps(
                [
                    item.model_dump()
                    for item in
                    result_context.result.content
                ],
                ensure_ascii=False,
            )


        try:

            if not result_context.result.content:

                return (
                    "The healthcare tool returned "
                    "no data."
                )


            raw_text = ""

            for item in (
                result_context
                .result
                .content
            ):

                if hasattr(
                    item,
                    "text",
                ):

                    raw_text += item.text

                else:

                    raw_text += str(item)


            data = json.loads(
                raw_text
            )


            # This will be assigned immediately
            # after Assistant is created.
            await assistant.publish_health_results(
                data
            )


            logger.info(
                "MCP healthcare result received"
            )

            return json.dumps(
                data,
                ensure_ascii=False,
            )

        except Exception:

            logger.exception(
                "Failed to resolve MCP healthcare result"
            )

            return (
                "The healthcare facility lookup "
                "returned an invalid result. "
                "Do not invent a facility."
            )


    # --------------------------------------------------------
    # MCP TOOLSET
    # --------------------------------------------------------

    logger.info(
        "Starting Arogya healthcare MCP server: %s",
        MCP_SERVER_FILE,
    )

    mcp_toolset = (
        mcp.MCPToolset(
            id="arogya-healthcare",

            mcp_server=(
                mcp.MCPServerStdio(
                    command=sys.executable,

                    args=[
                        MCP_SERVER_FILE
                    ],

                    cwd=str(
                        BASE_DIR
                    ),

                    client_session_timeout_seconds=45,

                    tool_result_resolver=
                        mcp_result_resolver,
                )
            ),
        )
    )


    # --------------------------------------------------------
    # ASSISTANT
    # --------------------------------------------------------

    assistant = Assistant(
        user_id=user_id,
        call_id=call_id,
        call_start=call_start,
        chat_ctx=chat_ctx,
        tools=[
            mcp_toolset,
        ],
    )

    assistant.current_room = (
        ctx.room
    )


    # --------------------------------------------------------
    # DEVICE LOCATION
    # --------------------------------------------------------

    @ctx.room.on("data_received")
    def on_data_received(
        packet: rtc.DataPacket,
    ):

        if packet.topic != "arogya-location":
            return

        if (
            packet.participant is None
            or packet.participant.identity
            != user_id
        ):
            return

        try:

            payload = json.loads(
                packet.data.decode(
                    "utf-8"
                )
            )

        except Exception:

            logger.warning(
                "Invalid location packet"
            )

            return

        asyncio.create_task(
            assistant.set_device_location(
                payload
            )
        )


    # --------------------------------------------------------
    # VOICE SESSION
    # --------------------------------------------------------

    session = AgentSession(

        stt=deepgram.STT(
            model="nova-3",
            language="multi",
        ),

        llm=google.LLM(
            model="gemini-3.5-flash-lite",
        ),

        tts=murf.TTS(
            voice="Samar",
            style="Conversation",

            tokenizer=(
                tokenize.basic.SentenceTokenizer(
                    min_sentence_len=2
                )
            ),

            text_pacing=True,
        ),

        turn_handling=(
            TurnHandlingOptions(
                turn_detection=(
                    inference.TurnDetector()
                ),
            )
        ),

        vad=ctx.proc.userdata[
            "vad"
        ],

        preemptive_generation=True,
    )


    # --------------------------------------------------------
    # START
    # --------------------------------------------------------

    await session.start(
        agent=assistant,
        room=ctx.room,
        room_options=(
            room_io.RoomOptions(
                audio_input=(
                    room_io.AudioInputOptions(
                        noise_cancellation=lambda params: (
                            noise_cancellation.BVCTelephony()
                            if params.participant.kind
                            == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                            else noise_cancellation.BVC()
                        ),
                    )
                ),
            )
        ),
    )


    # --------------------------------------------------------
    # CONSENT
    # --------------------------------------------------------

    assistant.register_consent_rpc(
        ctx,
        session,
    )


    # --------------------------------------------------------
    # GREETING
    # --------------------------------------------------------

    await session.generate_reply(
        instructions=(
            "This is the beginning of a new call. "
            "First use the lookup_user tool. "
            "If a returning caller is found, greet them "
            "naturally by name. "
            "If previous conversation history exists, "
            "use it naturally when relevant. "
            "If no caller is found, greet them as a new "
            "caller and naturally ask their name when "
            "appropriate. "
            "Keep the greeting short."
        )
    )


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    cli.run_app(server)