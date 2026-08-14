import asyncio
import json
import logging
import os
import time
import sqlite3
import sys
import urllib.parse
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path
import subprocess


from dotenv import load_dotenv
from livekit import api,rtc

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
from escalation import create_escalation as save_escalation
from clinic_specialist import ClinicSpecialist
from analytics import (
    create_call as create_analytics_call,
    finalize_call as finalize_analytics_call,
    update_call_context as update_analytics_context,
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
consciousness, severe allergic reaction, or rapidly
worsening symptoms, immediately advise them to contact
emergency services or visit the nearest hospital.

Do not diagnose the condition.

If the situation is a red-flag symptom, offer human
health support after giving immediate safety guidance.

If the user explicitly asks you to diagnose a disease,
condition, or symptom, do not provide a diagnosis.
Explain that you cannot diagnose them and offer to send
a short summary to human health support for review.

NUTRITION DISPLAY:

When the user asks for detailed nutrition information
about a food or food product, use the analyze_nutrients tool.

Examples:

"What nutrients are in a banana?"
"Show me the nutrition of oats."
"How much protein is in this food?"
"Give me the calories, vitamins and minerals in this."
"Analyze the nutrition of this product."

For detailed nutrition requests, prefer the visual table
instead of reading every nutrient aloud.

After the tool successfully displays the information,
give only a short spoken summary.

Do not repeat the entire table through voice.

If the user asks for a simple nutrition fact, such as
"How many calories are in an apple?", a short spoken answer
is acceptable. Use the visual table when the user asks for
detailed nutrition, multiple nutrients, vitamins, minerals,
macros, or a nutrient analysis.

HUMAN SUPPORT ESCALATION:

There are two situations where you should offer human
support:

1. RED-FLAG SYMPTOMS:
Potentially serious symptoms such as chest pain,
difficulty breathing, severe bleeding, stroke symptoms,
seizures, loss of consciousness, severe allergic reaction,
or rapidly worsening symptoms.

2. DIAGNOSIS REQUEST:
The user explicitly asks you to diagnose a disease,
condition, or symptom.

PERMISSION:

Before creating a human-support request, ALWAYS explain
what information you want to share.

Tell the caller you want to share only a short summary
containing what happened, what the agent already checked,
urgency, their language, and preferred follow-up method.

Ask the caller:
"Would you like me to share this short summary with human health support?"

Do NOT call create_escalation before the caller explicitly
says yes or otherwise clearly gives permission.

If the caller says NO, do not create a request and respect
their decision.

If the caller says YES, call create_escalation and pass
permission_confirmed as "yes".

Never include passwords, OTP codes, PINs, bank details,
account numbers, full payment details, or unnecessary
private information.

Do not send the entire conversation.

After create_escalation succeeds, tell the caller the
reference ID returned by the tool. Explain that the request
has been submitted for human review. Never promise an
immediate response unless the application explicitly
confirms that.

Do not create human-support requests for ordinary health
questions, vaccination information, general first aid,
healthy lifestyle questions, or healthcare facility lookups.

If you are unsure, clearly say so and recommend consulting
a qualified healthcare professional.

CALL ANALYTICS:

A successful call means the intended user task was completed.

A human-support escalation that is successfully created after
permission is a successful outcome.

After you have actually completed the user's intended task,
call record_call_outcome with outcome "success".

Use these result types:

guidance_provided
reminder_completed
facility_lookup_completed
escalation_created
task_completed

Use a concise purpose such as:

health_guidance
reminder
facility_lookup
clinic_appointment
human_escalation

If the user explicitly ends the interaction before the task
is complete, do not falsely mark it successful.

If the call ends without a recorded success, the backend will
record the call as failed.

LANGUAGE:

Detect the user's language automatically.

Mirror the user's language exactly.

If the user speaks English, reply in English.

If the user speaks any other language , reply in that language.

If the user mixes another language and English, reply in the
same mixed style.

Do not convert mixed-language conversations into
only English or only the other language.

Always write every language in its own native script.

   example:if  Hindi → Devanagari (नमस्ते), never romanized (never "namaste").
    Same rule for all non-English languages.

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



HEALTHCARE FACILITY AND APPOINTMENT SPECIALIST:

A dedicated Clinic and Appointment Specialist handles
clinic, hospital, doctor, PHC, healthcare facility, and
appointment requests.

When the user asks to:
- find a nearby clinic, hospital, doctor, PHC, or healthcare facility
- compare healthcare facilities
- choose a suitable healthcare facility
- ask about facility details
- get help with an appointment
- book, schedule, or prepare for an appointment

ALWAYS use handoff_to_clinic_specialist.

Before handing off, briefly tell the user that you will
connect them to the clinic and appointment specialist.
Do not make the user repeat their request.

The specialist has access to the existing
find_nearby_health_facilities MCP tool and the same
session location and memory state.

Do NOT hand off ordinary health questions, medication
questions, reminders, emergencies, diagnosis requests,
or human-support escalation requests.

The specialist must never invent facility names, distances,
addresses, opening hours, availability, or services.

If the specialist cannot handle the request or the user
changes to a general health topic, it can hand the
conversation back to Arogya.

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

    OUTBOUND REMINDERS:

If the user explicitly asks for a reminder call, use the
schedule_vaccination_reminder tool.

The reminder parameter must contain exactly what the user
wants to be reminded about.

Examples:

User: "Remind me to take my medicine."
reminder = "take my medicine"

User: "Call me and remind me to check my blood pressure."
reminder = "check my blood pressure"

User: "Remind me about my doctor's appointment."
reminder = "my doctor's appointment"

User: "Call me to ask how I'm feeling."
reminder = "ask how I'm feeling"

IMPORTANT:

- If the user does NOT mention a time, use 60 seconds.
- "after 1 minute" = 60 seconds.
- "after 2 minutes" = 120 seconds.
- "after 5 minutes" = 300 seconds.
- Never interpret an unspecified reminder as one day later.
- Never change the user's reminder into a vaccination reminder.

After scheduling the call, tell the user when the call
will happen.
"""

def get_food_nutrition(food_name: str) -> dict:
    """
    Fetch nutrition information from Open Food Facts.

    Uses the public read API. No API key is required.
    """

    food_name = food_name.strip()

    if not food_name:
        raise ValueError("Food name is required.")

    # Open Food Facts legacy search endpoint supports
    # plain-text search.
    params = urllib.parse.urlencode({
        "search_terms": food_name,
        "search_simple": "1",
        "action": "process",
        "json": "1",
        "page_size": "5",
        "fields": (
            "product_name,brands,nutriments,"
            "serving_size,nutrition_grades"
        ),
    })

    url = (
        "https://world.openfoodfacts.org/cgi/search.pl?"
        + params
    )

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent":
                "ArogyaHealthAccess/1.0 "
                "(10DaysOfVoiceAgents)",
            "Accept":
                "application/json",
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=15,
    ) as response:

        payload = json.loads(
            response.read().decode("utf-8")
        )

    products = payload.get(
        "products",
        [],
    )

    if not products:
        raise ValueError(
            f"No nutrition data found for {food_name}."
        )

    # Prefer a product that actually contains
    # useful nutrition information.
    product = None

    for candidate in products:

        nutriments = candidate.get(
            "nutriments",
            {},
        )

        if nutriments:
            product = candidate
            break

    if product is None:
        raise ValueError(
            f"No usable nutrition data found for {food_name}."
        )

    nutriments = product.get(
        "nutriments",
        {},
    )

    product_name = (
        product.get("product_name")
        or food_name
    )

    brands = (
        product.get("brands")
        or ""
    )

    serving_size = (
        product.get("serving_size")
        or "per 100 g"
    )

    rows = []

    nutrient_map = [
        (
            "Energy",
            "energy-kcal_100g",
            "kcal",
        ),
        (
            "Protein",
            "proteins_100g",
            "g",
        ),
        (
            "Carbohydrates",
            "carbohydrates_100g",
            "g",
        ),
        (
            "Sugars",
            "sugars_100g",
            "g",
        ),
        (
            "Fat",
            "fat_100g",
            "g",
        ),
        (
            "Saturated Fat",
            "saturated-fat_100g",
            "g",
        ),
        (
            "Fiber",
            "fiber_100g",
            "g",
        ),
        (
            "Salt",
            "salt_100g",
            "g",
        ),
        (
            "Sodium",
            "sodium_100g",
            "mg",
        ),
        (
            "Potassium",
            "potassium_100g",
            "mg",
        ),
        (
            "Calcium",
            "calcium_100g",
            "mg",
        ),
        (
            "Iron",
            "iron_100g",
            "mg",
        ),
        (
            "Vitamin C",
            "vitamin-c_100g",
            "mg",
        ),
    ]

    for label, key, unit in nutrient_map:

        value = nutriments.get(key)

        if value is None:
            continue

        try:
            numeric_value = float(value)

            if numeric_value.is_integer():
                formatted = str(
                    int(numeric_value)
                )
            else:
                formatted = f"{numeric_value:.2f}"

        except (
            TypeError,
            ValueError,
        ):
            formatted = str(value)

        rows.append({
            "Nutrient": label,
            "Amount": (
                f"{formatted} {unit}"
            ),
        })

    if not rows:
        raise ValueError(
            f"Nutrition values were unavailable "
            f"for {food_name}."
        )

    return {
        "product_name": product_name,
        "brands": brands,
        "serving_size": serving_size,
        "rows": rows,
    }


# ============================================================
# ASSISTANT
# ============================================================

class Assistant(Agent):

    def __init__(
        self,
        user_id: str,
        call_id: str,
        call_start: str,
        call_channel: str,
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
        self.call_channel = call_channel

        self.analytics_outcome = None
        self.analytics_success_type = None
        self.analytics_failure_type = None
        self.analytics_purpose = None
        self.analytics_language = None
        self.analytics_latency_ms = None
        self.analytics_finalized = False
        self.last_user_transcript_at = None
        self.facility_lookup_completed = False

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

        # Shared tools/state used when handing the conversation
        # to the Clinic and Appointment Specialist.
        self.shared_specialist_tools = []


    # ========================================================
    # DAY 9 - SPECIALIST HANDOFF
    # ========================================================
    
    @function_tool
    async def handoff_to_clinic_specialist(
        self,
        context: RunContext,
    ) -> tuple[Agent, str]:
        """Transfer clinic, facility, or appointment requests to the
        dedicated Clinic and Appointment Specialist.

        Use this only when the user needs clinic, hospital, doctor,
        PHC, healthcare facility, or appointment assistance.
        Do not use it for general health questions, reminders,
        emergencies, diagnosis requests, or human escalation.
        """

        logger.info(
            "Attempting handoff from Arogya to Clinic Specialist: user=%s call=%s",
            self.user_id,
            self.call_id,
        )

        try:
            # Preserve the conversation but do not copy Arogya's
            # system prompt into the specialist.
            specialist_ctx = self.chat_ctx.copy(
                exclude_instructions=True,
                exclude_handoff=True,
                exclude_config_update=True,
            )

            # Add the shared application state explicitly so the
            # specialist can use the saved district/location without
            # asking the user to repeat it.
            district = (
                self.pending_memory.get("district")
                or "not available"
            )

            if self.device_location:
                location_state = (
                    "Device location is available. "
                    f"Latitude: {self.device_location['latitude']:.6f}. "
                    f"Longitude: {self.device_location['longitude']:.6f}."
                )
            else:
                location_state = "Device location is not currently available."

            shared_state = (
                "Shared Arogya session state for the specialist. "
                f"User ID: {self.user_id}. "
                f"Saved district: {district}. "
                f"{location_state} "
                "Use this information when appropriate and never ask for "
                "information that is already present in the conversation."
            )

            specialist_ctx.add_message(
                role="system",
                content=shared_state,
            )

            specialist = ClinicSpecialist(
                chat_ctx=specialist_ctx,
                parent_assistant=self,
                tools=self.shared_specialist_tools,
            )

            logger.info(
                "Handoff prepared successfully: user=%s",
                self.user_id,
            )

            return (
                specialist,
                "I’ll connect you to our clinic and appointment specialist.",
            )

        except Exception:
            logger.exception(
                "Clinic Specialist handoff failed for user=%s",
                self.user_id,
            )

            # Returning the current agent keeps the conversation alive.
            return (
                self,
                "I’m unable to connect you to the clinic specialist right now, so I’ll continue helping you here.",
            )

    async def on_enter(self) -> None:
        """
        Called whenever Arogya becomes active again.

        If this is a reverse handoff, the latest system message
        already contains the user's new request, so immediately
        generate the response.
        """

        logger.info(
            "Arogya became active: user=%s call=%s",
            self.user_id,
            self.call_id,
        )

        await self.session.generate_reply(
            instructions=(
                "You have just received control back from the "
                "Clinic and Appointment Specialist.\n"
                "The user's new request is already present in "
                "the conversation context.\n"
                "Answer that request immediately.\n"
                "Do not ask the user to repeat it.\n"
                "Do not explain the handoff process."
            )
        )


    # ========================================================
    # DEVICE LOCATION
    # ========================================================
    @function_tool
    async def record_call_outcome(
        self,
        context: RunContext,
        outcome: str,
        purpose: str,
        result_type: str,
    ) -> str:
        """Record the business outcome of the current call."""

        outcome = outcome.strip().lower()
        purpose = purpose.strip().lower()
        result_type = result_type.strip().lower()

        if outcome not in {
            "success",
            "failed",
        }:
            return (
                "Outcome must be either "
                "success or failed."
            )

        success_types = {
            "guidance_provided",
            "reminder_completed",
            "facility_lookup_completed",
            "escalation_created",
            "task_completed",
            "other_success",
        }

        failure_types = {
            "user_hangup",
            "incomplete_task",
            "tool_failure",
            "api_error",
            "no_response",
            "other_failure",
        }

        if outcome == "success":

            if (
                result_type == "facility_lookup_completed"
                and not self.facility_lookup_completed
            ):
                return (
                    "A facility lookup has not been completed. "
                    "Only record facility_lookup_completed after "
                    "the healthcare facility tool returns valid results."
                )

            if result_type not in success_types:
                result_type = "other_success"

            self.analytics_success_type = (
                result_type
            )

            self.analytics_failure_type = None

        else:

            if result_type not in failure_types:
                result_type = "other_failure"

            self.analytics_failure_type = (
                result_type
            )

            self.analytics_success_type = None

        self.analytics_outcome = outcome

        self.analytics_purpose = (
            purpose
            or "general_health"
        )

        update_analytics_context(
            self.call_id,
            language=self.analytics_language,
            purpose=self.analytics_purpose,
            latency_ms=self.analytics_latency_ms,
        )

        logger.info(
            "Call outcome recorded: "
            "call=%s outcome=%s type=%s purpose=%s",
            self.call_id,
            outcome,
            result_type,
            self.analytics_purpose,
        )

        return (
            "The call outcome was recorded."
        )


    def finalize_call_analytics(
        self,
        reason: str = "session_closed",
    ) -> None:

        if self.analytics_finalized:
            return

        self.analytics_finalized = True

        outcome = self.analytics_outcome

        success_type = (
            self.analytics_success_type
        )

        failure_type = (
            self.analytics_failure_type
        )

        if outcome not in {
            "success",
            "failed",
        }:

            outcome = "failed"

            if reason == "no_response":
                failure_type = "no_response"

            elif reason == "agent_error":
                failure_type = "api_error"

            else:
                failure_type = "user_hangup"

        ended_at = (
            datetime.now().isoformat(
                timespec="seconds"
            )
        )

        try:

            finalize_analytics_call(
                self.call_id,
                outcome=outcome,
                ended_at=ended_at,
                success_type=success_type,
                failure_type=failure_type,
                language=self.analytics_language,
                purpose=self.analytics_purpose,
                latency_ms=self.analytics_latency_ms,
                notes=reason,
            )

        except Exception:

            logger.exception(
                "Failed to finalize analytics "
                "for call %s",
                self.call_id,
            )

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
    # HUMAN SUPPORT ESCALATION
    # ========================================================

    @function_tool
    async def create_escalation(
        self,
        context: RunContext,
        reason: str,
        summary: str,
        agent_checked: str,
        urgency: str,
        language: str,
        follow_up_method: str,
        permission_confirmed: str,
    ) -> str:
        """Create a human-support request after explicit caller consent.

        Use this only for a red-flag symptom or an explicit
        diagnosis request. Never include passwords, OTPs, PINs,
        account numbers, or unnecessary private information.
        """

        permission = permission_confirmed.strip().lower()

        if permission not in {
            "yes",
            "y",
            "i agree",
            "i consent",
            "consent",
            "confirmed",
        }:
            logger.warning(
                "Escalation blocked because permission was not confirmed."
            )
            return (
                "The human-support request was not created because "
                "the caller did not explicitly give permission to "
                "share the information."
            )

        reason = reason.strip()
        summary = summary.strip()
        agent_checked = agent_checked.strip()
        urgency = urgency.strip().upper()
        language = language.strip()
        follow_up_method = follow_up_method.strip()

        if not reason:
            return (
                "The human-support request could not be created "
                "because the reason was missing."
            )

        if not summary:
            return (
                "The human-support request could not be created "
                "because the summary was missing."
            )

        if not language:
            language = (
                self.pending_memory.get("language_preference")
                or "Not specified"
            )

        if not follow_up_method:
            follow_up_method = "Not specified"

        if urgency not in {
            "LOW",
            "MEDIUM",
            "HIGH",
            "EMERGENCY",
        }:
            urgency = "MEDIUM"

        try:
            ticket_id = save_escalation(
                user_id=self.user_id,
                reason=reason,
                summary=summary,
                agent_checked=agent_checked,
                urgency=urgency,
                language=language,
                follow_up_method=follow_up_method,
            )
        except Exception:
            logger.exception(
                "Failed to create human escalation"
            )
            return (
                "I couldn't create the human-support request "
                "right now. Please try again."
            )

        logger.info(
            "Created human escalation %s for user %s",
            ticket_id,
            self.user_id,
        )

        return (
            f"Human-support request created successfully. "
            f"Reference ID: {ticket_id}. "
            "Tell the caller this reference ID and explain that "
            "the request has been submitted for human review. "
            "Do not promise an immediate response."
        )


    # ========================================================
    # OUTBOUND VACCINATION REMINDER
    # ========================================================

    @function_tool
    async def schedule_vaccination_reminder(
        self,
        context: RunContext,
        reminder: str,
        delay_seconds: int = 60,
    ) -> str:
        """Schedule an outbound reminder call.

        The reminder should contain what the user wants
        to be reminded about.

        If the user does not specify a time, use 60 seconds.
        If the user explicitly specifies a delay, use it.
        """

        call_to = os.getenv("OUTBOUND_CALL_TO")

        if not call_to:
            logger.error(
                "OUTBOUND_CALL_TO is not configured"
            )
            return (
                "I could not schedule the reminder "
                "because the call destination is not configured."
            )

        reminder = reminder.strip()

        if not reminder:
            return (
                "Please tell me what you want "
                "the reminder call to be about."
            )

        # Default to 60 seconds when no time is specified.
        if delay_seconds is None:
            delay_seconds = 60

        # Prevent unreasonable delays.
        delay_seconds = max(
            1,
            min(delay_seconds, 3600)
        )

        logger.info(
            "Scheduling reminder: '%s' in %s seconds",
            reminder,
            delay_seconds,
        )

        try:
            scheduler_path = os.path.join(
                os.path.dirname(__file__),
                "telephony",
                "outbound",
                "schedule_call.py",
            )

            await asyncio.create_subprocess_exec(
                sys.executable,
                scheduler_path,
                "--delay",
                str(delay_seconds),
                "--to",
                call_to,
                "--reminder",
                reminder,
                creationflags=(
                    subprocess.CREATE_NEW_PROCESS_GROUP
                    if os.name == "nt"
                    else 0
                ),
            )

        except Exception:
            logger.exception(
                "Failed to start reminder scheduler"
            )

            return (
                "I couldn't schedule the reminder."
            )

        if delay_seconds == 60:
            return (
                f"Your reminder call about {reminder} "
                "is scheduled for about one minute from now."
            )

        minutes = delay_seconds // 60
        seconds = delay_seconds % 60

        if minutes and seconds:
            return (
                f"Your reminder call about {reminder} "
                f"is scheduled for about {minutes} minutes "
                f"and {seconds} seconds from now."
            )

        if minutes:
            return (
                f"Your reminder call about {reminder} "
                f"is scheduled for about {minutes} minutes "
                "from now."
            )

        return (
            f"Your reminder call about {reminder} "
            f"is scheduled for about {seconds} seconds "
            "from now."
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

    @function_tool
    async def display_large_data(
        self,
        context: RunContext,
        title: str,
        columns: str,
        rows: str,
        description: str = "",
    ) -> str:
        """
        Display detailed structured information on the user's screen.

        Use this when information is better shown visually instead
        of being read completely through voice.
        """

        if self.current_room is None:
            return (
                "The visual display is unavailable. "
                "Give the user a concise spoken summary instead."
            )

        try:
            parsed_columns = json.loads(columns)
            parsed_rows = json.loads(rows)

            if not isinstance(parsed_columns, list):
                raise ValueError("columns must be a JSON array")

            if not isinstance(parsed_rows, list):
                raise ValueError("rows must be a JSON array")

            parsed_columns = [
                str(column)
                for column in parsed_columns[:12]
            ]

            cleaned_rows = []

            for row in parsed_rows[:50]:

                if not isinstance(row, dict):
                    continue

                cleaned_row = {}

                for column in parsed_columns:

                    value = row.get(
                        column,
                        "",
                    )

                    if value is None:
                        value = ""

                    cleaned_row[column] = str(
                        value
                    )[:500]

                cleaned_rows.append(
                    cleaned_row
                )

            payload = {
                "type": "data_display",
                "title": title[:200],
                "description": description[:500],
                "columns": parsed_columns,
                "rows": cleaned_rows,
            }

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
                "Published large data to UI: "
                "title=%s rows=%s",
                title,
                len(cleaned_rows),
            )

            return (
                "The detailed information is now displayed "
                "on the user's screen. Give a short spoken "
                "summary instead of reading the entire table."
            )

        except Exception:
            logger.exception(
                "Failed to publish large data"
            )

            return (
                "The visual display failed. "
                "Give the user a concise spoken summary instead."
            )


    @function_tool
    async def analyze_nutrients(
        self,
        context: RunContext,
        food_name: str,
    ) -> str:
        """
        Get nutrition information for a food and display
        the detailed nutrient table on the user's screen.

        Use this when the user asks for detailed nutrition,
        nutrients, calories, macros, vitamins, or minerals
        in a food or food product.

        Do not read the entire nutrient table aloud.
        Display it visually and give only a short summary.
        """

        food_name = food_name.strip()

        if not food_name:
            return (
                "Please provide the name of the food "
                "you want nutrition information for."
            )

        logger.info(
            "Nutrition analysis requested: %s",
            food_name,
        )

        try:
            nutrition = await asyncio.to_thread(
                get_food_nutrition,
                food_name,
            )

            product_name = nutrition[
                "product_name"
            ]

            brands = nutrition[
                "brands"
            ]

            serving_size = nutrition[
                "serving_size"
            ]

            rows = nutrition[
                "rows"
            ]

            description = (
                f"Nutrition information for "
                f"{product_name}. "
                f"Values are based on "
                f"{serving_size}."
            )

            if brands:
                description += (
                    f" Product/brand: {brands}."
                )

            result = await self.display_large_data(
                context=context,
                title=(
                    f"Nutrition: {product_name}"
                ),
                columns=json.dumps(
                    [
                        "Nutrient",
                        "Amount",
                    ],
                    ensure_ascii=False,
                ),
                rows=json.dumps(
                    rows,
                    ensure_ascii=False,
                ),
                description=description,
            )

            logger.info(
                "Nutrition table displayed: "
                "food=%s rows=%d",
                food_name,
                len(rows),
            )

            return result

        except Exception as exc:

            logger.exception(
                "Nutrition lookup failed: %s",
                food_name,
            )

            return (
                f"I couldn't find reliable nutrition "
                f"data for {food_name}. "
                "Please try a more specific food or "
                "packaged product name."
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
    participant_kind = str(
        participant.kind
    ).lower()

    call_channel = (
        "sip"
        if "sip" in participant_kind
        else "browser"
    )

    create_analytics_call(
        call_id=call_id,
        user_id=user_id,
        started_at=call_start,
        channel=call_channel,
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

            if isinstance(data, (list, dict)) and data:
                assistant.facility_lookup_completed = True

            # This will be assigned immediately
            # after Assistant is created.
            await assistant.publish_health_results(
                data
            )


            logger.info(
                "MCP healthcare result received for call=%s (main/specialist shared toolset)",
                assistant.call_id,
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
        call_channel=call_channel,
        chat_ctx=chat_ctx,
        
    )

    # The existing Day 5 healthcare MCP tool is now owned by the
    # specialist. The main agent routes clinic/facility requests
    # through handoff_to_clinic_specialist instead of calling it directly.
    assistant.shared_specialist_tools = [
        mcp_toolset,
    ]

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


    #-----------

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event):

        if not event.is_final:
            return

        logger.info(
            "LANGUAGE DEBUG: language=%r source_languages=%r transcript=%r",
            getattr(event, "language", None),
            getattr(event, "source_languages", None),
            event.transcript,
        )

        assistant.last_user_transcript_at = (
            time.time()
        )

        language = getattr(
            event,
            "language",
            None,
        )

        if language:

            language_text = str(
                language
            ).strip()

            language_key = (
                language_text
                .lower()
                .replace("_", "-")
            )

            language_names = {
                "en": "English",
                "en-in": "English",
                "en-us": "English",
                "en-gb": "English",
                "hi": "Hindi",
                "hi-in": "Hindi",
                "kn": "Kannada",
                "kn-in": "Kannada",
                "ta": "Tamil",
                "ta-in": "Tamil",
                "te": "Telugu",
                "te-in": "Telugu",
                "ml": "Malayalam",
                "ml-in": "Malayalam",
            }

            assistant.analytics_language = (
                language_names.get(
                    language_key,
                    language_text,
                )
            )

            update_analytics_context(
                assistant.call_id,
                language=
                    assistant.analytics_language,
            )


    @session.on("agent_state_changed")
    def on_agent_state_changed(event):

        if event.new_state != "speaking":
            return

        if (
            assistant.last_user_transcript_at
            is None
        ):
            return

        latency_ms = max(
            0.0,
            (
                time.time()
                - assistant.last_user_transcript_at
            )
            * 1000,
        )

        assistant.analytics_latency_ms = (
            latency_ms
        )

        logger.info(
            "Analytics latency: call=%s latency_ms=%.2f",
            assistant.call_id,
            latency_ms,
        )

        assistant.last_user_transcript_at = None

        update_analytics_context(
            assistant.call_id,
            latency_ms=latency_ms,
            language=
                assistant.analytics_language,
        )


    @session.on("user_state_changed")
    def on_user_state_changed(event):

        if (
            event.new_state == "away"
            and assistant.analytics_outcome
            is None
        ):

            assistant.analytics_failure_type = (
                "no_response"
            )


    @session.on("error")
    def on_session_error(event):

        if assistant.analytics_outcome is None:

            assistant.analytics_outcome = (
                "failed"
            )

            assistant.analytics_failure_type = (
                "api_error"
            )


    @session.on("close")
    def on_session_close(event):

        reason = "session_closed"

        if (
            assistant.analytics_failure_type
            == "no_response"
        ):

            reason = "no_response"

        elif (
            assistant.analytics_failure_type
            == "api_error"
        ):

            reason = "agent_error"

        assistant.finalize_call_analytics(
            reason
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
