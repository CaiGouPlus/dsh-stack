# 一键验证 webserver-keepalive 是否生效。
#   python verify.py
# 步骤：1) 读插件日志  2) 找 dsh host 监听端口  3) 实测空闲连接能撑多久
import os
import re
import socket
import subprocess
import sys
import time

LOG = os.path.join(os.path.expanduser("~"), ".dsh", "logs", "webserver-keepalive.log")


def read_log():
    if not os.path.exists(LOG):
        return "(还没有日志 —— 说明 dsh 还没重启，或插件没被加载)"
    with open(LOG, "r", encoding="utf-8", errors="replace") as f:
        return "".join(f.readlines()[-5:])


def host_pid():
    out = subprocess.run(
        ["wmic", "process", "where", "name='DeepSeek Harness.exe'", "get", "ProcessId,CommandLine"],
        capture_output=True, text=True, errors="replace",
    ).stdout
    for line in out.splitlines():
        if "dsh-desktop-host" in line:
            m = re.search(r"(\d+)\s*$", line.strip())
            if m:
                return m.group(1)
    return None


def listen_port(pid):
    out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, errors="replace").stdout
    ports = []
    for line in out.splitlines():
        if "LISTENING" not in line:
            continue
        m = re.match(r"\s*TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)", line)
        if m and m.group(2) == str(pid):
            ports.append(int(m.group(1)))
    return ports


def probe(port, wait=12):
    s = socket.create_connection(("127.0.0.1", port), timeout=5)
    s.sendall(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n")
    s.settimeout(2)
    try:
        s.recv(4096)
    except socket.timeout:
        pass
    t0 = time.time()
    s.settimeout(1)
    while time.time() - t0 < wait:
        try:
            if not s.recv(4096):
                return time.time() - t0, "closed"
        except socket.timeout:
            continue
        except ConnectionResetError:
            return time.time() - t0, "reset"
    s.close()
    return wait, "still open"


def main():
    print("=== 插件日志 (~/.dsh/logs/webserver-keepalive.log) ===")
    print(read_log().strip())
    pid = host_pid()
    print("\n=== dsh host PID ===")
    print(pid or "没找到（dsh 桌面端没在跑？）")
    if not pid:
        return
    ports = listen_port(pid)
    print("监听端口:", ports or "无")
    for p in ports:
        elapsed, state = probe(p)
        print("  port %d: 空闲 %.1fs 后 socket %s" % (p, elapsed, state))
    print("\n判定：补丁生效时应为 “still open”（或很长的秒数）；")
    print("     还是 ~6s closed 说明补丁没加载（检查 bundles / 是否重启过）。")


if __name__ == "__main__":
    main()
