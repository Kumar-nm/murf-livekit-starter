import argparse
import asyncio
import json
import uuid

from dotenv import load_dotenv
from livekit import api

load_dotenv(".env.local")

AGENT_NAME = "arogya-outbound"


async def dial(
    linphone_username: str,
    room_name: str,
):
    # LiveKit expects the SIP user here, NOT a full SIP URI.
    sip_user = linphone_username

    if sip_user.startswith("sip:"):
        sip_user = sip_user[4:]

    if "@" in sip_user:
        sip_user = sip_user.split("@", 1)[0]

    print(f"Calling Linphone SIP user: {sip_user}")

    lk = api.LiveKitAPI()

    try:
        await lk.room.create_room(
            api.CreateRoomRequest(
                name=room_name
            )
        )

        await lk.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name=AGENT_NAME,
                room=room_name,
                metadata=json.dumps(
                    {
                        "phone_number": sip_user
                    }
                ),
            )
        )

    finally:
        await lk.aclose()


def main():
    parser = argparse.ArgumentParser(
        description="Place an outbound call to Linphone."
    )

    parser.add_argument(
        "--to",
        required=True,
        help="Linphone username, e.g. kumarnm2004",
    )

    parser.add_argument(
        "--room",
        default=None,
        help="Optional LiveKit room name",
    )

    args = parser.parse_args()

    room_name = (
        args.room
        or f"arogya-outbound-{uuid.uuid4().hex[:8]}"
    )

    asyncio.run(
        dial(
            args.to,
            room_name,
        )
    )

    print()
    print(f"Dispatched {AGENT_NAME}")
    print(f"Room: {room_name}")
    print("Waiting for the Linphone call...")


if __name__ == "__main__":
    main()