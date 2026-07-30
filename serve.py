#!/usr/bin/env python3
"""本機 PoC 靜態伺服器：同時支援 localhost 與同一 Wi-Fi 手機測試。"""
from __future__ import annotations

import argparse
import http.server
import socket
import socketserver
import ssl
from pathlib import Path


def local_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="啟動表單電子化 PoC")
    parser.add_argument("--port", type=int, default=8000, help="連接埠，預設 8000")
    parser.add_argument("--bind", default="0.0.0.0", help="監聽位址，預設 0.0.0.0")
    parser.add_argument("--certfile", type=Path, help="HTTPS 憑證 PEM（選填）")
    parser.add_argument("--keyfile", type=Path, help="HTTPS 私鑰 PEM（選填）")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(*a, directory=str(root), **kw)

    class ReuseTCPServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    with ReuseTCPServer((args.bind, args.port), handler) as httpd:
        use_https = bool(args.certfile and args.keyfile)
        if bool(args.certfile) != bool(args.keyfile):
            parser.error("--certfile 與 --keyfile 必須同時提供")
        if use_https:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certfile=str(args.certfile), keyfile=str(args.keyfile))
            httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
        scheme = "https" if use_https else "http"
        print("\n表單電子化 PoC 已啟動")
        print(f"Mac 開啟： {scheme}://localhost:{args.port}/web/")
        print(f"同一 Wi-Fi 手機開啟： {scheme}://{local_ip()}:{args.port}/web/")
        if not use_https:
            print("提醒：手機以區網 HTTP 測試可填寫，但 Service Worker/PWA 離線重開需要 HTTPS。")
        print("按 Control+C 停止。\n")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
