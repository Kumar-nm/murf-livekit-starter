import asyncio
import json
import logging
import os

from dotenv import load_dotenv
from livekit import api, rtc

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
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

logger = logging.getLogger("arogya-outbound")

load_dotenv(".env.local")

OUTBOUND_TRUNK_ID = os.getenv(
    "LIVEKIT_SIP_OUTBOUND_TRUNK_ID"
)

# ============================================================
# AROGYA OUTBOUND PROMPT
# ============================================================

SYSTEM_PROMPT = """
You are Arogya, an automated AI healthcare assistant
calling the user proactively.

This is an OUTBOUND phone call. The user did not initiate
the call, so be respectful, brief, and transparent.

The specific purpose of this call is provided dynamically
as REMINDER_PURPOSE.

You MUST use REMINDER_PURPOSE as the reason for the call.
Do not replace it with a vaccination reminder or invent
another reason.

At the beginning of the call:

1. Identify yourself as Arogya Health Access.
2. Clearly state that you are an automated AI healthcare
   assistant.
3. Explain the specific reason for calling using
   REMINDER_PURPOSE.
4. Tell the user they can say "stop" if they do not want
   to receive further calls.
5. Keep the opening short and allow the user to respond.

HEALTHCARE ROLE:

You provide general health information, vaccination
awareness, healthy lifestyle guidance, first-aid information,
medicine reminders, and guidance about when someone should
seek medical care.

You are not a doctor and do not replace professional
medical advice.

Never:

- Diagnose diseases.
- Prescribe medicines or dosages.
- Recommend prescription drugs.
- Claim to be a doctor.
- Guarantee treatment or recovery.
- Provide unrelated information.

If the user reports chest pain, difficulty breathing,
severe bleeding, stroke symptoms, seizures, loss of
consciousness, or rapidly worsening symptoms, immediately
advise them to contact emergency services or visit the
nearest hospital.

If you are unsure, clearly say so and recommend consulting
a qualified healthcare professional.

LANGUAGE & SCRIPT:

Detect the user's language automatically.

Mirror the user's language.

If the user speaks English, reply in English.

If the user speaks Hindi, reply in Hindi.

If the user mixes Hindi and English, preserve the same
mixed style.

Always use the native script for non-English languages.

Hindi must use Devanagari.

Never romanize Hindi.

Keep all responses short because this is a phone call.

STYLE:

Friendly, calm, respectful, and empathetic.

Do not use markdown, emojis, bullet points, or special
symbols in spoken responses.

Do not overwhelm the caller with information.

If the user says "stop", "don't call me", "remove me",
or otherwise clearly asks not to receive calls, acknowledge
the request respectfully and end the call.

If the user wants to continue, answer their questions
naturally based on REMINDER_PURPOSE.

If the user wants to end the conversation, say goodbye
briefly and end the call.
"""


CALLEE_IDENTITY = "phone-user"


# ============================================================
# AGENT
# ============================================================

class ArogyaOutboundAgent(Agent):

    def __init__(
        self,
        ctx: JobContext,
        reminder_purpose: str,
    ) -> None:

        super().__init__(
            instructions=(
                SYSTEM_PROMPT
                + "\n\nREMINDER_PURPOSE:\n"
                + reminder_purpose
            )
        )

        self.ctx = ctx

    @function_tool
    async def end_call(
        self,
        context: RunContext,
    ) -> str:
        """End the outbound phone call."""

        await context.session.generate_reply(
            instructions=(
                "Thank the caller briefly and say goodbye. "
                "Then end the call."
            )
        )

        await self._hangup()

        return "Call ended."

    async def _hangup(self) -> None:
        try:
            await self.ctx.api.room.delete_room(
                api.DeleteRoomRequest(
                    room=self.ctx.room.name
                )
            )

        except Exception:
            logger.exception(
                "Failed to hang up call"
            )


# ============================================================
# SERVER
# ============================================================

server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


# ============================================================
# READ PHONE NUMBER FROM DISPATCH
# ============================================================

def phone_number_from_metadata(
    ctx: JobContext,
) -> str | None:

    metadata = ctx.job.metadata

    if not metadata:
        return None

    try:
        return json.loads(metadata).get(
            "phone_number"
        )

    except json.JSONDecodeError:
        return metadata.strip() or None


# ============================================================
# READ REMINDER FROM DISPATCH
# ============================================================

def reminder_from_metadata(
    ctx: JobContext,
) -> str:

    metadata = ctx.job.metadata

    if not metadata:
        return "the reminder you requested"

    try:
        data = json.loads(metadata)

        return (
            data.get("reminder")
            or "the reminder you requested"
        )

    except json.JSONDecodeError:
        return "the reminder you requested"


# ============================================================
# OUTBOUND SESSION
# ============================================================

@server.rtc_session(
    agent_name="arogya-outbound"
)
async def outbound_agent(
    ctx: JobContext,
):

    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    phone_number = phone_number_from_metadata(ctx)

    reminder_purpose = reminder_from_metadata(ctx)

    if not phone_number:
        logger.error(
            "No phone number in job metadata"
        )

        ctx.shutdown()
        return

    if not OUTBOUND_TRUNK_ID:
        logger.error(
            "LIVEKIT_SIP_OUTBOUND_TRUNK_ID is not set"
        )

        ctx.shutdown()
        return

    await ctx.connect()

    # ========================================================
    # VOICE SESSION
    # ========================================================

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

        vad=ctx.proc.userdata["vad"],

        preemptive_generation=True,
    )

    # ========================================================
    # START VOICE SESSION
    # ========================================================

    session_started = asyncio.create_task(

        session.start(

            agent=ArogyaOutboundAgent(
                ctx,
                reminder_purpose,
            ),

            room=ctx.room,

            room_options=(
                room_io.RoomOptions(

                    audio_input=(
                        room_io.AudioInputOptions(

                            noise_cancellation=(
                                lambda params:
                                (
                                    noise_cancellation
                                    .BVCTelephony()

                                    if params.participant.kind
                                    == rtc.ParticipantKind
                                    .PARTICIPANT_KIND_SIP

                                    else
                                    noise_cancellation.BVC()
                                )
                            )
                        )
                    )
                )
            ),
        )
    )

    # ========================================================
    # PLACE CALL
    # ========================================================

    logger.info(
        "Calling %s",
        phone_number,
    )

    logger.info(
        "Reminder purpose: %s",
        reminder_purpose,
    )

    try:

        await ctx.api.sip.create_sip_participant(

            api.CreateSIPParticipantRequest(

                room_name=ctx.room.name,

                sip_trunk_id=OUTBOUND_TRUNK_ID,

                sip_call_to=phone_number,

                participant_identity=CALLEE_IDENTITY,

                participant_name="Arogya Health Access",

                wait_until_answered=True,
            )
        )

    except Exception as e:

        logger.exception(
            "Outbound call failed: %s",
            e,
        )

        session_started.cancel()

        ctx.shutdown()

        return

    await session_started

    # ========================================================
    # DYNAMIC FIRST MESSAGE
    # ========================================================

    await session.generate_reply(

        instructions=(
            "Start the outbound call now. "

            "Introduce yourself as Arogya Health Access "
            "and clearly say that you are an automated "
            "healthcare assistant. "

            "Explain briefly that you are calling because "
            "the user requested this reminder: "
            f"{reminder_purpose}. "

            "Tell the caller that they can say stop if "
            "they do not want further calls. "

            "Then wait for the caller to respond."
        ),

        allow_interruptions=True,
    )


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    cli.run_app(server)