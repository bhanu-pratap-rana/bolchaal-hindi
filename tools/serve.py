"""Static server for dist/ with HTTP Range support (browsers need it to seek inside audio).

  python3 tools/serve.py            # http://localhost:8788
  python3 tools/serve.py 9000 dist
  python3 tools/serve.py 8788 dist /bolchaal-hindi   # serve under a subpath, like GitHub Pages
"""
from __future__ import annotations

import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class RangeHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript",
                      ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".mp3": "audio/mpeg"}

    prefix = ""

    def translate_path(self, path):
        if self.prefix:
            if not path.startswith(self.prefix):
                return "/nonexistent-outside-prefix"
            path = path[len(self.prefix):] or "/"
        return super().translate_path(path)

    def log_message(self, *args):  # keep test output quiet
        pass

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        start = int(m.group(1)) if m and m.group(1) else 0
        end = int(m.group(2)) if m and m.group(2) else size - 1
        if start >= size:
            self.send_error(416)
            return None
        end = min(end, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        try:
            self._copy(source, outputfile)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser cancelled the request (normal while seeking audio)

    def _copy(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        while remaining > 0:
            chunk = source.read(min(65536, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)
        self._remaining = None


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8788
    root = sys.argv[2] if len(sys.argv) > 2 else "dist"
    RangeHandler.prefix = (sys.argv[3].rstrip("/") if len(sys.argv) > 3 else "")
    print(f"serving {root} on http://localhost:{port}{RangeHandler.prefix}/")
    ThreadingHTTPServer(("", port), partial(RangeHandler, directory=root)).serve_forever()
