from __future__ import annotations

import logging
from typing import Any

from livekit.agents import Agent, ChatContext, RunContext, function_tool

from analytics import update_call_context as update_analytics_context

logger = logging.getLogger("clinic_specialist")


# DAY 9 - CLINIC AND APPOINTMENT SPECIALIST
# ============================================================

CLINIC_SPECIALIST_PROMPT = """
You are Arogya's Clinic and Appointment Specialist.

Your job is strictly limited to clinic, hospital, doctor,
healthcare facility, and appointment assistance.

You can:
- Find nearby clinics, hospitals, PHCs, doctors, and healthcare facilities.
- Compare facilities returned by the live healthcare tool.
- Answer questions about facility details returned by tools.
- Help the user prepare for or understand an appointment request.
- Help with appointment-related questions when the application has enough information.

You are NOT a doctor and you must not diagnose conditions,
prescribe medicines, recommend dosages, or replace professional
medical advice.

You must NOT:
- Diagnose diseases or symptoms.
- Prescribe or recommend prescription medicines.
- Handle emergencies yourself.
- Create human-support escalations.
- Handle ordinary health questions that do not involve a clinic,
  healthcare facility, or appointment.

HANDOFF CONTEXT:

The main Arogya agent has already spoken with the user and handed
the conversation to you. The previous conversation is available
in your chat context. Never ask the user to repeat information
that is already available.

When you take over, briefly introduce yourself as the Clinic and
Appointment Specialist and acknowledge the request you inherited.
Then continue directly with the task.

LOCATION AND MEMORY:

The handoff may include the user's saved district and current
device coordinates. Use them when searching for nearby facilities.
If the user explicitly gives another place, use that place instead.
Do not ask for a district or location again when a valid location
is already available.

FACILITY LOOKUP:

Use the find_nearby_health_facilities MCP tool for live facility
information. Never invent facility names, addresses, distances,
opening hours, availability, or services.

If the healthcare tool returns no data or fails, clearly tell the
user that live facility information is unavailable right now.
Do not invent a replacement result.

APPOINTMENTS:

You may help the user discuss or prepare for an appointment, but
do not claim that an appointment was actually booked unless a
real booking tool confirms it.

HAND BACK TO AROGYA:

If the user changes to a general health question, medication
reminder, emergency, diagnosis request, or another topic outside
clinic and appointment assistance, use hand_back_to_arogya.

Pass the user's new request in the user_request argument.

Never ask the user to repeat the new request.

The conversation must continue naturally without restarting.

ANALYTICS:

After a clinic/facility task is actually completed, call
record_specialist_outcome with result_type facility_lookup_completed
when a live facility lookup was completed, or task_completed for
another completed specialist task. Do not mark success if the task
was not completed.

LANGUAGE AND STYLE:

Mirror the user's language exactly. Preserve mixed-language speech
when appropriate. Always use native script for non-English languages.
Keep spoken replies short, friendly, calm, and natural.
Do not use markdown, emojis, bullets, or special symbols in speech.
"""


class ClinicSpecialist(Agent):

    def __init__(
        self,
        chat_ctx: ChatContext,
        parent_assistant: Any,
        tools=None,
    ) -> None:

        super().__init__(
            instructions=CLINIC_SPECIALIST_PROMPT,
            chat_ctx=chat_ctx,
            tools=tools,
        )

        self.parent_assistant = parent_assistant

    async def on_enter(self) -> None:
        """Introduce the specialist after the handoff."""

        await self.session.generate_reply(
            instructions=(
                "You have just taken over from the main Arogya agent. "
                "Briefly introduce yourself as the clinic and appointment "
                "specialist, acknowledge the user's existing request from "
                "the conversation context, and continue helping immediately. "
                "Do not ask the user to repeat their request."
            )
        )

    @function_tool
    async def record_specialist_outcome(
        self,
        context: RunContext,
        result_type: str = "task_completed",
    ) -> str:
        """Record a successful specialist task after it is actually completed."""

        result_type = result_type.strip().lower()

        if result_type not in {
            "facility_lookup_completed",
            "task_completed",
        }:
            return (
                "Use facility_lookup_completed after a valid live facility lookup, "
                "or task_completed for another completed clinic or appointment task."
            )

        if result_type == "facility_lookup_completed" and not self.parent_assistant.facility_lookup_completed:
            return (
                "A valid facility lookup has not been completed yet. "
                "Do not record the facility lookup as successful."
            )

        # Update the shared call analytics directly instead of invoking
        # the parent's decorated tool as a normal Python function.
        parent = self.parent_assistant

        parent.analytics_outcome = "success"
        parent.analytics_success_type = result_type
        parent.analytics_failure_type = None
        parent.analytics_purpose = (
            "facility_lookup"
            if result_type == "facility_lookup_completed"
            else "clinic_appointment"
        )

        update_analytics_context(
            parent.call_id,
            language=parent.analytics_language,
            purpose=parent.analytics_purpose,
            latency_ms=parent.analytics_latency_ms,
        )

        logger.info(
            "Specialist outcome recorded: call=%s type=%s purpose=%s",
            parent.call_id,
            result_type,
            parent.analytics_purpose,
        )

        return "The specialist task outcome was recorded."

    @function_tool
    async def hand_back_to_arogya(
        self,
        context: RunContext,
        user_request: str,
    ) -> tuple[Agent, str]:
        """
        Return control to a fresh Arogya agent and immediately
        continue with the user's new request.

        The user must not have to repeat the request.
        """

        user_request = (
            user_request or ""
        ).strip()

        if not user_request:
            return (
                self,
                "I need the new request before I can return you to Arogya.",
            )

        logger.info(
            "Reverse handoff requested: "
            "user=%s request=%r",
            self.parent_assistant.user_id,
            user_request,
        )

        try:
            # Preserve the specialist's latest conversation.
            resumed_ctx = self.chat_ctx.copy(
                exclude_instructions=True,
                exclude_handoff=True,
                exclude_config_update=True,
            )

            # Keep context bounded.
            resumed_ctx.truncate(
                max_items=20
            )

            # Explicitly inject the request that triggered
            # the reverse handoff.
            resumed_ctx.add_message(
                role="system",
                content=(
                    "REVERSE HANDOFF TO AROGYA.\n"
                    "The user has changed topic while speaking "
                    "with the Clinic and Appointment Specialist.\n\n"
                    "The user's new request is:\n"
                    f"{user_request}\n\n"
                    "Continue directly with this request.\n"
                    "Do not ask the user to repeat it.\n"
                    "Do not say that the user needs to ask again."
                ),
            )

            parent = self.parent_assistant
            from agent import Assistant

            # Create a NEW Arogya instance instead of returning
            # the already-used parent agent.
            resumed_arogya = Assistant(
                user_id=parent.user_id,
                call_id=parent.call_id,
                call_start=parent.call_start,
                call_channel=parent.call_channel,
                chat_ctx=resumed_ctx,
            )

            # Preserve application state.
            resumed_arogya.saved_user = (
                parent.saved_user
            )

            resumed_arogya.pending_memory = dict(
                parent.pending_memory
            )

            resumed_arogya.device_location = (
                parent.device_location
            )

            resumed_arogya.location_status = (
                parent.location_status
            )

            resumed_arogya.location_ready = (
                parent.location_ready
            )

            resumed_arogya.location_task = (
                parent.location_task
            )

            resumed_arogya.current_room = (
                parent.current_room
            )

            # Preserve analytics.
            resumed_arogya.analytics_outcome = (
                parent.analytics_outcome
            )

            resumed_arogya.analytics_success_type = (
                parent.analytics_success_type
            )

            resumed_arogya.analytics_failure_type = (
                parent.analytics_failure_type
            )

            resumed_arogya.analytics_purpose = (
                parent.analytics_purpose
            )

            resumed_arogya.analytics_language = (
                parent.analytics_language
            )

            resumed_arogya.analytics_latency_ms = (
                parent.analytics_latency_ms
            )

            resumed_arogya.analytics_finalized = (
                parent.analytics_finalized
            )

            resumed_arogya.last_user_transcript_at = (
                parent.last_user_transcript_at
            )

            resumed_arogya.facility_lookup_completed = (
                parent.facility_lookup_completed
            )

            resumed_arogya.shared_specialist_tools = (
                parent.shared_specialist_tools
            )

            logger.info(
                "Reverse handoff prepared: "
                "new Arogya instance user=%s",
                parent.user_id,
            )

            return (
                resumed_arogya,
                "I'll continue with that.",
            )

        except Exception:
            logger.exception(
                "Reverse handoff failed: user=%s",
                self.parent_assistant.user_id,
            )

            return (
                self,
                "I couldn't switch back right now. I'll continue helping you here.",
            )