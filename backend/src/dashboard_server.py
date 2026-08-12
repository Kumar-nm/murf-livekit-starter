import json
from http.server import (
    BaseHTTPRequestHandler,
    ThreadingHTTPServer,
)
from urllib.parse import urlparse

from escalation import (
    get_all_escalations,
    update_escalation_status,
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

        path = urlparse(
            self.path
        ).path

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


        self.send_json(
            {
                "error": "Not found"
            },
            404,
        )


    def do_POST(self):

        path = urlparse(
            self.path
        ).path

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

            ticket_id = (
                payload.get(
                    "ticket_id",
                    "",
                )
            )

            status = (
                payload.get(
                    "status",
                    "",
                )
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

            self.send_json(
                {
                    "ok": False,
                    "error": str(error),
                },
                400,
            )


if __name__ == "__main__":

    print(
        "Arogya escalation API running at "
        f"http://{HOST}:{PORT}"
    )

    server = ThreadingHTTPServer(
        (
            HOST,
            PORT,
        ),
        Handler,
    )

    server.serve_forever()