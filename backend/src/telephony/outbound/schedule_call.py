import argparse
import asyncio
import json
import os
import uuid

from dotenv import load_dotenv
from livekit import api


load_dotenv(".env.local")


async def schedule_call(
    delay_seconds: int,
    call_to: str,
    reminder: str,
):
    print(
        f"Waiting {delay_seconds} seconds before "
        f"dispatching the reminder..."
    )

    await asyncio.sleep(delay_seconds)

    room_name = (
        f"arogya-reminder-{uuid.uuid4().hex[:8]}"
    )

    lk = api.LiveKitAPI()

    try:
        await lk.room.create_room(
            api.CreateRoomRequest(
                name=room_name
            )
        )

        metadata = json.dumps(
            {
                "phone_number": call_to,
                "reminder": reminder,
            }
        )

        await lk.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name="arogya-outbound",
                room=room_name,
                metadata=metadata,
            )
        )

        print(
            f"Reminder call dispatched to {call_to}"
        )

        print(
            f"Reminder: {reminder}"
        )

        print(
            f"Room: {room_name}"
        )

    finally:
        await lk.aclose()


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--delay",
        type=int,
        default=60,
        help="Delay before making the call in seconds",
    )

    parser.add_argument(
        "--to",
        default=None,
        help="Linphone username",
    )

    parser.add_argument(
        "--reminder",
        default="the reminder you requested",
        help="The user's requested reminder",
    )

    args = parser.parse_args()

    call_to = (
        args.to
        or os.getenv("OUTBOUND_CALL_TO")
    )

    if not call_to:
        raise RuntimeError(
            "OUTBOUND_CALL_TO is not configured"
        )

    reminder = args.reminder.strip()

    if not reminder:
        reminder = "the reminder you requested"

    asyncio.run(
        schedule_call(
            delay_seconds=args.delay,
            call_to=call_to,
            reminder=reminder,
        )
    )


if __name__ == "__main__":
    main()