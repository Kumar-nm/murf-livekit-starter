import json
from http.server import (
    BaseHTTPRequestHandler,
    ThreadingHTTPServer,
)
from urllib.parse import (
    parse_qs,
    urlparse,
)

from escalation import (
    get_all_escalations,
    update_escalation_status,
)

from analytics import (
    get_analytics,
)


HOST = "127.0.0.1"
PORT = 8765


class Handler(BaseHTTPRequestHandler):

    def send_json(
        self,
        data,
        status=200,
    ):

        raw = json.dumps(
            data,
            ensure_ascii=False,
        ).encode("utf-8")

        self.send_response(status)

        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8",
        )

        self.send_header(
            "Access-Control-Allow-Origin",
            "http://localhost:3000",
        )

        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS",
        )

        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type",
        )

        self.send_header(
            "Cache-Control",
            "no-store",
        )

        self.send_header(
            "Content-Length",
            str(len(raw)),
        )

        self.end_headers()

        self.wfile.write(raw)


    def do_OPTIONS(self):

        self.send_response(204)

        self.send_header(
            "Access-Control-Allow-Origin",
            "http://localhost:3000",
        )

        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS",
        )

        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type",
        )

        self.end_headers()


    def do_GET(self):

        parsed_url = urlparse(
            self.path
        )

        path = parsed_url.path

        query = parse_qs(
            parsed_url.query
        )


        # ============================================================
        # DAY 7 - HUMAN SUPPORT TICKETS
        # ============================================================

        if path == "/api/tickets":

            try:

                tickets = (
                    get_all_escalations()
                )

                self.send_json(
                    tickets
                )

            except Exception as error:

                self.send_json(
                    {
                        "error": str(error)
                    },
                    500,
                )

            return


        # ============================================================
        # DAY 8 - CALL ANALYTICS
        # ============================================================

        if path == "/api/analytics":

            try:

                start_date = query.get(
                    "start_date",
                    [None],
                )[0]

                end_date = query.get(
                    "end_date",
                    [None],
                )[0]

                channel = query.get(
                    "channel",
                    [None],
                )[0]

                language = query.get(
                    "language",
                    [None],
                )[0]

                outcome = query.get(
                    "outcome",
                    [None],
                )[0]


                analytics = get_analytics(
                    start_date=start_date,
                    end_date=end_date,
                    channel=channel,
                    language=language,
                    outcome=outcome,
                )


                self.send_json(
                    analytics
                )

            except Exception as error:

                print(
                    "Analytics error:",
                    error,
                )

                self.send_json(
                    {
                        "error": str(error)
                    },
                    500,
                )

            return


        # ============================================================
        # NOT FOUND
        # ============================================================

        self.send_json(
            {
                "error": "Not found"
            },
            404,
        )


    def do_POST(self):

        parsed_url = urlparse(
            self.path
        )

        path = parsed_url.path


        # ============================================================
        # DAY 7 - UPDATE ESCALATION STATUS
        # ============================================================

        if path != "/api/tickets/status":

            self.send_json(
                {
                    "error": "Not found"
                },
                404,
            )

            return


        try:

            content_length = int(
                self.headers.get(
                    "Content-Length",
                    "0",
                )
            )


            raw_body = self.rfile.read(
                content_length
            )


            payload = json.loads(
                raw_body.decode("utf-8")
                if raw_body
                else "{}"
            )


            ticket_id = payload.get(
                "ticket_id",
                "",
            )


            status = payload.get(
                "status",
                "",
            )


            updated = (
                update_escalation_status(
                    ticket_id,
                    status,
                )
            )


            if not updated:

                self.send_json(
                    {
                        "ok": False,
                        "error":
                            "Invalid ticket ID or status",
                    },
                    400,
                )

                return


            self.send_json(
                {
                    "ok": True
                }
            )


        except Exception as error:

            print(
                "Ticket update error:",
                error,
            )

            self.send_json(
                {
                    "ok": False,
                    "error": str(error),
                },
                400,
            )


    def log_message(
        self,
        format,
        *args,
    ):

        # Keep the terminal output useful
        # without printing every browser request.
        if "/api/analytics" not in str(args):
            super().log_message(
                format,
                *args,
            )


if __name__ == "__main__":

    print(
        "Arogya dashboard API running at "
        f"http://{HOST}:{PORT}"
    )

    print(
        "Analytics endpoint:"
        f" http://{HOST}:{PORT}/api/analytics"
    )

    print(
        "Tickets endpoint:"
        f" http://{HOST}:{PORT}/api/tickets"
    )


    server = ThreadingHTTPServer(
        (
            HOST,
            PORT,
        ),
        Handler,
    )


    try:

        server.serve_forever()

    except KeyboardInterrupt:

        print(
            "\nArogya dashboard API stopped."
        )

    finally:

        server.server_close()