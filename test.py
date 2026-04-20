from zk import ZK
from datetime import datetime

DEVICE_IP = "192.168.0.200"
PORT = 8080   # try 4370 first; if it fails, we’ll adjust

zk = ZK(DEVICE_IP, port=PORT, timeout=5)

try:
    print("Connecting to device...")
    conn = zk.connect()
    conn.disable_device()

    print("Fetching attendance logs...")
    records = conn.get_attendance()

    for r in records:
        print(f"User: {r.user_id} | Time: {r.timestamp}")

    print(f"\nTotal records: {len(records)}")

    conn.enable_device()
    conn.disconnect()

except Exception as e:
    print("Error:", e)
