
# RTSP Stream Listener Using EyePop.ai

This Python example uses the EyePop.ai SDK to asynchronously connect to a remote RTSP or HLS stream and run inference using the latest person detection model.

### Requirements

- Python 3.8+
- `eyepop` Python SDK (install via pip)
- A valid EyePop.ai secret key

### What It Does

- Connects to a live or VOD video stream via RTSP or RTMP
- Sends the stream to an EyePop.ai worker endpoint with a configured model
- Runs real-time inference on each frame to detect people
- Prints the results as they are returned
- Measures the duration of the inference run

# RTSP Stream Testing from MP4

This demo provides two ways to serve an RTSP stream locally from an MP4 file, useful for testing video ingestion pipelines.

---

## Option 1: GStreamer Python RTSP Server

This method uses GStreamer's built-in RTSP server to stream an MP4.

### Requirements

Install dependencies:

```bash
brew install gstreamer gst-plugins-base gst-plugins-good gst-python
pip install PyGObject
```

### Python Code

```python
import gi
gi.require_version('Gst', '1.0')
gi.require_version('GstRtspServer', '1.0')
from gi.repository import Gst, GstRtspServer, GObject

Gst.init(None)

class RTSPMediaFactory(GstRtspServer.RTSPMediaFactory):
    def __init__(self, mp4_path):
        super().__init__()
        self.mp4_path = mp4_path

    def do_create_element(self, url):
        pipeline = (
            f"filesrc location={self.mp4_path} ! "
            "qtdemux name=demux demux.video_0 ! "
            "decodebin ! x264enc tune=zerolatency ! rtph264pay config-interval=1 name=pay0 pt=96"
        )
        return Gst.parse_launch(pipeline)

class RTSPServer:
    def __init__(self, mp4_path):
        self.server = GstRtspServer.RTSPServer()
        self.factory = RTSPMediaFactory(mp4_path)
        self.factory.set_shared(True)
        self.mounts = self.server.get_mount_points()
        self.mounts.add_factory("/test", self.factory)
        self.server.attach(None)

    def run(self):
        print("RTSP stream available at rtsp://127.0.0.1:8554/test")
        loop = GObject.MainLoop()
        loop.run()

if __name__ == "__main__":
    mp4_file = "your_video.mp4"
    server = RTSPServer(mp4_file)
    server.run()
```

---

## Option 2: FFmpeg + rtsp-simple-server

This approach streams video to a local RTSP server using FFmpeg.

### Setup

Install and run `rtsp-simple-server`:

```bash
brew install rtsp-simple-server
rtsp-simple-server &
```

Stream your MP4 to it using FFmpeg:

```bash
ffmpeg -re -stream_loop -1 -i your_video.mp4 -c copy -f rtsp rtsp://localhost:8554/mystream
```

Or use Python:

```python
import subprocess

mp4_file = "your_video.mp4"
rtsp_url = "rtsp://localhost:8554/mystream"

subprocess.run([
    "ffmpeg",
    "-re",
    "-stream_loop", "-1",
    "-i", mp4_file,
    "-c", "copy",
    "-f", "rtsp",
    rtsp_url
])
```

### Result


RTSP stream available at:

- GStreamer: `rtsp://localhost:8554/test`
- FFmpeg: `rtsp://localhost:8554/mystream`

---
