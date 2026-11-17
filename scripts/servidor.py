"""Servidor local del dashboard, sin caché (así cada cambio se ve al recargar).

Uso:
    python scripts/servidor.py          # http://localhost:8000
    python scripts/servidor.py 8765     # otro puerto
"""
import functools
import http.server
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


class SinCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(SinCache, directory=str(RAIZ))
    with http.server.ThreadingHTTPServer(("127.0.0.1", puerto), handler) as srv:
        print(f"Dashboard en http://localhost:{puerto}  (Ctrl+C para cortar)")
        srv.serve_forever()


if __name__ == "__main__":
    main()
