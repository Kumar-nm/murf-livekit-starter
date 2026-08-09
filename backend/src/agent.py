import json
import logging
import sqlite3
import uuid
from datetime import datetime

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
# DATABASE
# ============================================================

DB_NAME = "memory.db"


def init_database():
    conn = sqlite3.connect(DB_NAME)

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            language_preference TEXT,
            age_band TEXT,
            ongoing_conditions TEXT,
            last_triage_outcome TEXT,
            last_interaction TEXT
        )
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

def get_saved_user(user_id: str):
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row

    user = conn.execute(
        """
        SELECT *
        FROM users
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()

    conn.close()

    return dict(user) if user else None


def get_latest_history(user_id: str):
    conn = sqlite3.connect(DB_NAME)

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
        return json.loads(row[0])
    except Exception:
        logger.exception(
            "Unable to decode saved conversation history"
        )
        return None


# ============================================================
# SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """
You are Arogya, the user's AI health assistant.

Your role is to provide general health information, healthy lifestyle
guidance, first-aid information, vaccination awareness, and guidance
on when users should seek medical care.

You are not a doctor and do not replace professional medical advice.

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
Answer unrelated questions such as agriculture, mathematics,
or unrelated customer service.

If the user reports chest pain, difficulty breathing, severe bleeding,
stroke symptoms, seizures, loss of consciousness, or rapidly worsening
symptoms, immediately advise them to contact emergency services or
visit the nearest hospital.

If you are unsure, clearly say so and recommend consulting a qualified
healthcare professional.

Do not repeat the doctor disclaimer in every response.

LANGUAGE:

Detect the user's language automatically.

Mirror the user's language exactly.

If the user speaks English, reply in English.

If the user speaks Hindi, reply in Hindi.

If the user mixes Hindi and English, reply in the same mixed style.

Do not convert mixed-language conversations into only English or only Hindi.

Always use the native script for non-English languages.

Hindi must use Devanagari.

Keep replies short because they are spoken aloud.

STYLE:

Friendly, calm, and empathetic.

Keep responses brief.

Avoid unnecessary repetition.

Do not use markdown, emojis, bullet points, or special symbols.

MEMORY:

At the beginning of every call, use lookup_user.

If a returning caller is found, naturally greet them by name.

A saved previous conversation may also be present in your conversation
context. Use it naturally when relevant.

If no saved caller is found, treat this as a new conversation.

During the call, when the user gives useful information for future
conversations, temporarily remember it using remember_fact.

IMPORTANT:

remember_fact is temporary session memory only.

It does NOT save anything to the database.

Never claim that information has been permanently saved during the call.

The database is written only after the caller explicitly chooses
"Yes" on the post-call consent screen.

If the caller chooses "No", nothing from the current session should
be persisted.

Never ask the caller to give consent through an AI-generated question
at the end of the call. The application handles the consent screen
separately.
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
    ) -> None:

        super().__init__(
            instructions=SYSTEM_PROMPT,
            chat_ctx=chat_ctx,
        )

        self.user_id = user_id
        self.call_id = call_id
        self.call_start = call_start

        # Temporary memory.
        # Nothing is persisted until explicit consent.
        self.pending_memory = {
            "name": "",
            "language_preference": "",
            "age_band": "",
            "ongoing_conditions": "",
            "last_triage_outcome": "",
        }

        self.saved_user = None


    # ========================================================
    # LOOKUP TOOL
    # ========================================================

    @function_tool
    async def lookup_user(
        self,
        context: RunContext,
    ) -> str:
        """
        Look up the current caller using their persistent caller ID.

        Use this at the beginning of every conversation.
        """

        logger.info(
            "Looking up caller %s",
            self.user_id,
        )

        user = get_saved_user(
            self.user_id
        )

        if user is None:
            return (
                "No saved caller was found. "
                "This is a new caller."
            )

        self.saved_user = user

        self.pending_memory[
            "name"
        ] = user["name"] or ""

        self.pending_memory[
            "language_preference"
        ] = user["language_preference"] or ""

        self.pending_memory[
            "age_band"
        ] = user["age_band"] or ""

        self.pending_memory[
            "ongoing_conditions"
        ] = user["ongoing_conditions"] or ""

        self.pending_memory[
            "last_triage_outcome"
        ] = user["last_triage_outcome"] or ""

        latest_history = get_latest_history(
            self.user_id
        )

        history_status = (
            "A saved previous conversation is available in your conversation context."
            if latest_history
            else
            "No previous conversation history is available."
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
            f"Last triage outcome: "
            f"{user['last_triage_outcome'] or 'not recorded'}. "
            f"Last interaction: "
            f"{user['last_interaction']}. "
            f"{history_status}"
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
        """
        Temporarily remember useful information from this conversation.

        This does NOT write to the database.
        """

        allowed_keys = {
            "name",
            "language_preference",
            "age_band",
            "ongoing_conditions",
            "last_triage_outcome",
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
    # SAVE TO DATABASE
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

        # Get the complete conversation history.
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

        # Save/update user profile.
        conn.execute(
            """
            INSERT INTO users (
                user_id,
                name,
                language_preference,
                age_band,
                ongoing_conditions,
                last_triage_outcome,
                last_interaction
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)

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
                    excluded.last_interaction
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
            ),
        )

        # Save the call + complete transcript.
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

        logger.info(
            "Saved session for user %s, call %s",
            self.user_id,
            self.call_id,
        )


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

            if data.caller_identity != self.user_id:
                logger.warning(
                    "Rejected save RPC from %s",
                    data.caller_identity,
                )
                return "rejected"

            try:
                payload = json.loads(
                    data.payload or "{}"
                )

                end_time = payload.get(
                    "end_time"
                )

                if not end_time:
                    end_time = datetime.now().isoformat(
                        timespec="seconds"
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

            if data.caller_identity != self.user_id:
                logger.warning(
                    "Rejected discard RPC from %s",
                    data.caller_identity,
                )
                return "rejected"

            # Deliberately do nothing.
            #
            # Nothing from this call was inserted
            # into the database before consent.
            self.pending_memory = {
                "name": "",
                "language_preference": "",
                "age_band": "",
                "ongoing_conditions": "",
                "last_triage_outcome": "",
            }

            logger.info(
                "Caller %s declined memory save",
                self.user_id,
            )

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

    # --------------------------------------------------------
    # Connect first.
    # --------------------------------------------------------

    await ctx.connect()

    participant = (
        await ctx.wait_for_participant()
    )

    # This is the persistent browser-generated ID.
    user_id = participant.identity

    call_id = str(
        uuid.uuid4()
    )

    call_start = datetime.now().isoformat(
        timespec="seconds"
    )

    logger.info(
        "Call started: user=%s call=%s start=%s",
        user_id,
        call_id,
        call_start,
    )

    # --------------------------------------------------------
    # Load previously saved conversation.
    # --------------------------------------------------------

    saved_history = get_latest_history(
        user_id
    )

    if saved_history:
        try:
            chat_ctx = ChatContext.from_dict(
                saved_history
            )

            # Prevent an extremely large history
            # from growing indefinitely.
            chat_ctx.truncate(
                max_items=30
            )

            logger.info(
                "Loaded previous conversation for %s",
                user_id,
            )

        except Exception:
            logger.exception(
                "Failed to load saved history"
            )

            chat_ctx = ChatContext.empty()

    else:
        chat_ctx = ChatContext.empty()

    # --------------------------------------------------------
    # Create assistant.
    # --------------------------------------------------------

    assistant = Assistant(
        user_id=user_id,
        call_id=call_id,
        call_start=call_start,
        chat_ctx=chat_ctx,
    )

    # --------------------------------------------------------
    # Voice pipeline.
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
            tokenizer=tokenize.basic.SentenceTokenizer(
                min_sentence_len=2
            ),
            text_pacing=True,
        ),

        # LiveKit Agents 1.6.9 built-in
        # audio turn detector.
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
        ),

        vad=ctx.proc.userdata["vad"],

        preemptive_generation=True,
    )

    # --------------------------------------------------------
    # Start session.
    # --------------------------------------------------------

    await session.start(
        agent=assistant,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind
                    == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        ),
    )

    # Register save/discard RPC after session starts.
    assistant.register_consent_rpc(
        ctx,
        session,
    )

    # --------------------------------------------------------
    # Initial greeting.
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