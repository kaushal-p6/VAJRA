#!/usr/bin/env python3
"""
VAJRA - Python 3 Local Preview Server
Running 24x7 Command Center Web Dashboard on http://localhost:8080
"""

import http.server
import socketserver
import os
import sys

PORT = 8080
DIRECTORY = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "frontend"
)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"===========================================================")
        print(f"⚡ VAJRA Command Center Web Dashboard active!")
        print(f"📍 Location: {DIRECTORY}")
        print(f"🌐 Server URL: http://localhost:{PORT}")
        print(f"===========================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            sys.exit(0)
