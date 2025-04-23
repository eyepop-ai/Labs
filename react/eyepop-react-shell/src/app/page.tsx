"use client"

import Processor from "@/processors/processor";
import { useEffect, useRef, useState } from "react"

export const processors = [
  {
    name: "(Upload img) Text Ad - check text coverage",
    module: () => import("../processors/text_ads"),
  },
  {
    name: "(Live) Text Live - Detect text",
    module: () => import("../processors/text_live"),
  },
  {
    name: "(Upload img) License - check id #",
    module: () => import("../processors/text_license"),
  },
  {
    name: "(Live) Trail - Follow an object",
    module: () => import("../processors/trail_live"),
  },
  {
    name: "(Upload Img/Vid) Detect Person Pose",
    module: () => import("../processors/person_pose"),
  },
  
  //{
  //    name: "(Edge Runtime - Live) Detect Person Pose",
  //    module: () => import("../processors/person_pose_live"),
  //},
  {
    name: "(Upload Img) Sticker Effect - Detect Person and sticker them",
    module: () => import("../processors/sticker_effect_person_upload"),
  },
  {
    name: "(Upload Img) Sticker Effect - Detect Any object in a region and sticker it",
    module: () => import("../processors/sticker_effect_any_upload"),
  },
  {
    name: "(Upload Img) Building perimeter - Detect the perimeter of a building",
    module: () => import("../processors/house_perimeter"),
  },
  {
    name: "(Live) Crop to Person - Detect Person and crop display to them",
    module: () => import("../processors/crop_person"),
  },
  {
    name: "(Upload Video) Auto Hightlight to Objects - Detect Object and trim video",
    module: () => import("../processors/autohighlight_video"),
  },

  {
    name: "(Edge Runtime - Upload Img) Detect Person Pose",
    module: () => import("../processors/person_pose_upload_local"),
  },

];

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")
  const [showSettings, setShowSettings] = useState(false)
  const drawPreviewRef = useRef<boolean>(true)
  const [showReset, setShowReset] = useState(false)
  const [showLoading, setShowLoading] = useState(false)
  const [endpointDisconnected, setEndpointDisconnected] = useState(true)
  const [selectedProcessorIndex, setSelectedProcessorIndex] = useState<number>(processors.length - 1)
  const [currentProcessor, setCurrentProcessor] = useState<any | null>(processors[processors.length - 1])
  const currentModuleRef = useRef<any | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [isScreenMode, setIsScreenMode] = useState<boolean>(false)
  const roiPointsRef = useRef<any[]>([])

  useEffect(() => {
    const fetchDevices = async () => {
      if (typeof navigator !== "undefined" && navigator.mediaDevices) {
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices()
          setDevices(allDevices.filter(device => device.kind === "videoinput")) // Filter only cameras
        } catch (error) {
          console.error("Error fetching devices:", error)
        }
      }
    }

    fetchDevices()
  }, []) // Runs once after the component mounts

  

  useEffect(() => {
    startCamera()

    // setInterval(() => {
    //   if (canvasRef.current) {
    //     drawPreviewRef.current = true
    //     drawToCanvas()
    //     takePhoto()
    //   }
    // }, 2000);
    return

  }, [facingMode, currentProcessor, isScreenMode]) // Runs when facingMode or currentProcessor changes

  const startCamera = async () => {
    try {
      let newStream: MediaStream | null = null

      if (!isScreenMode) {
        const constraints = {
          video: { facingMode }
        }
        newStream = await navigator.mediaDevices.getUserMedia(constraints)
      } else {
        newStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      }

      if (currentModuleRef.current)
        await currentModuleRef.current.destroy()

      const m = await currentProcessor.module()
      currentModuleRef.current = new m.default()

      if (videoRef.current) {
        videoRef.current.srcObject = newStream
        videoRef.current.onloadedmetadata = async () => {
          if (!videoRef.current) return

          videoRef.current?.play()

          videoRef.current.muted = true

          if (!canvasRef.current) return
          ctxRef.current = canvasRef.current?.getContext("2d")

          drawToCanvas()
          await currentModuleRef.current.setCanvasContext(ctxRef.current, newStream)
        }
      }
    } catch (error) {
      console.error("Error accessing camera:", error)
    }
  }

  const drawRegionOfInterest = () => {
    //Draw ROI on canvas
    if (!roiCanvasRef.current) return
    if (!canvasRef.current) return

    roiCanvasRef.current.width = canvasRef.current.width
    roiCanvasRef.current.height = canvasRef.current.height
    const roiCtx = roiCanvasRef.current.getContext("2d")
    if (!roiCtx) return
    roiCtx.clearRect(0, 0, roiCanvasRef.current.width, roiCanvasRef.current.height)
    roiCtx.strokeStyle = "lightblue"
    roiCtx.lineWidth = 2
    
    roiPointsRef.current.forEach(point => {
      roiCtx.beginPath();
      roiCtx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
      roiCtx.fillStyle = "lightblue";
      roiCtx.fill();
    });

    if (roiPointsRef.current.length == 2) {

      //console.log("canvasROI", canvasROI)
      const roi = roiPointsRef.current
      const [start, end] = roi
      const width = end.x - start.x
      const height = end.y - start.y
      roiCtx.strokeRect(start.x, start.y, width, height)
    }

  }

  const updateFrame = async () => {

    drawRegionOfInterest();

    if (!videoRef.current || !canvasRef.current) return requestAnimationFrame(updateFrame)
    if (!drawPreviewRef.current) return requestAnimationFrame(updateFrame)

    DrawImage(videoRef.current, videoRef.current.videoWidth, videoRef.current.videoHeight, false)
    await currentModuleRef.current?.processFrame(ctxRef.current, videoRef.current, roiPointsRef.current)

    if (!currentModuleRef?.current?.endpoint) {
      setEndpointDisconnected(true)
      return requestAnimationFrame(updateFrame)
    }

    setEndpointDisconnected(false)

    requestAnimationFrame(updateFrame)
  }


  const drawToCanvas = () => {
    console.log("drawToCanvas", videoRef.current, canvasRef.current, ctxRef.current)
    if (!videoRef.current || !canvasRef.current) return
    const ctx = ctxRef.current
    if (!ctx) return

    
    canvasRef.current.width = window.innerWidth
    canvasRef.current.height = window.innerHeight

    console.log("initial call to updateFrame")
    requestAnimationFrame(updateFrame)
  }

  const processPhoto = async (image: Blob | File) => {
    if (!canvasRef.current) return

    const ctx = ctxRef.current
    if (!ctx) return

    const name = image instanceof File ? image.name : new Date().toISOString().replace(/[:.-]/g, "_") + ".jpg";

    setShowLoading(true)

    console.log("Processing photo with:", currentProcessor)
    await freezeCanvas(image)

    if (currentModuleRef.current?.roiRequired && roiPointsRef.current.length < 2) {
      console.log("ROI required but not provided")
      setShowLoading(false)
      return
    }

    if (image instanceof File) {
      image = await new Promise<Blob>((resolve, reject) => {
        canvasRef.current?.toBlob(blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create Blob from canvas."));
          }
        }, "image/jpeg");
      });
    }

    console.log("Processing photo with:", currentProcessor, image)
    await currentModuleRef.current?.processPhoto(image, ctx, name, roiPointsRef.current)
    roiPointsRef.current = []

    setShowLoading(false)
  }

  const processVideo = async (video: File) => {
    if (!canvasRef.current) return
    if (!videoRef.current) return

    const ctx = ctxRef.current
    if (!ctx) return

    setShowLoading(true)

    console.log("Processing video with:", currentProcessor)
    //set videoRef to file
    videoRef.current.srcObject = null
    videoRef.current.src = URL.createObjectURL(video)
    // Remove the current function in requestAnimationFrame
    const updateFrame = () => { };
    requestAnimationFrame(updateFrame);

    setShowReset(true)

    videoRef.current.crossOrigin = "anonymous"
    videoRef.current.pause()

    videoRef.current.onloadedmetadata = async () => {
      //setting up redraw to canvas
      if (!canvasRef.current) return

      if (videoRef.current?.videoWidth && videoRef.current?.videoHeight) {
        canvasRef.current.width = videoRef.current?.videoWidth
        canvasRef.current.height = videoRef.current?.videoHeight
      }

      console.log("videoRef.current?.videoWidth", videoRef.current?.videoWidth, videoRef.current?.videoHeight)

    }


    console.log("Processing video with:", currentProcessor, video)
    const processingResult = await currentModuleRef.current?.processVideo(video, ctx)

    videoRef.current.play()
    drawToCanvas()

    setShowLoading(false)
  }

  const DrawImage = (img: any, img_width: number, img_height: number, shouldFill = false) => {
    //console.log("DrawImage", img, img_width, img_height, shouldFill, canvasRef.current, ctxRef.current)
    if (!videoRef.current || !canvasRef.current) return

    const ctx = ctxRef.current
    if (!ctx) return

    //const videoAspectRatio = videoRef.current.videoWidth / videoRef.current.videoHeight
    const aspectRatio = img_width / img_height
    const canvasAspectRatio = canvasRef.current.width / canvasRef.current.height


    let drawWidth, drawHeight, offsetX, offsetY

    if ((!shouldFill && (canvasAspectRatio < aspectRatio)) || (shouldFill && canvasAspectRatio > aspectRatio)) {
      drawWidth = canvasRef.current.width
      drawHeight = canvasRef.current.width / aspectRatio
      offsetX = 0
      offsetY = 0 //(canvasRef.current.height - drawHeight) / 2
    } else {
      drawWidth = canvasRef.current.height * aspectRatio
      drawHeight = canvasRef.current.height
      offsetX = 0 //(canvasRef.current.width - drawWidth) / 2
      offsetY = 0
    }

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
  }

  const takePhoto = async() => {
    if (!canvasRef.current) return

    if (!videoRef.current) return

    if(showReset)
    {

      drawPreviewRef.current = true
      await updateFrame()

    }
    canvasRef.current.toBlob(blob => {
      if (blob) processPhoto(blob)
    }, "image/jpeg")
  }

  const freezeCanvas = async (image: Blob | File) => {
    if (!canvasRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    drawPreviewRef.current = false;
    setShowReset(true);

    await new Promise<void>((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        if (!canvasRef.current) return reject(new Error("Canvas not available"));

        DrawImage(img, img.width, img.height, false);
        resolve();
      };

      img.onerror = (error) => reject(error);

      img.src = URL.createObjectURL(image);
    });
  };

  const resetCanvas = () => {
    startCamera()
    drawPreviewRef.current = true
    setShowReset(false)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.type.startsWith("image/")) {
        processPhoto(file)
      } else if (file.type.startsWith("video/")) {
        processVideo(file)
      } else {
        console.error("Unsupported file type:", file.type)
      }
    }
  }

  //on click on canvasset Region Of Interest for pipelines that contain segmentation    
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const coordinates = `X: ${x}, Y: ${y}`;

    navigator.clipboard.writeText(coordinates);
    console.log("Coordinates copied to clipboard:", coordinates);

    roiPointsRef.current.push({ x, y })
  };

  //Esc clears the ROI
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        roiPointsRef.current = []
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  return (
    <div className="relative w-screen h-screen bg-black flex justify-center items-center overflow-hidden">
      <div className={`absolute w-full h-full transition-all ${showLoading ? "blur-md" : ""}`}>
        {/* Hidden Video Element */}
        <video ref={videoRef} autoPlay playsInline className="hidden" />

        {/* Canvas as the background */}
        <canvas
          ref={canvasRef}
          className="absolute w-full h-full object-cover"
        />
        <canvas
          ref={roiCanvasRef}
          className="absolute w-full h-full object-cover"
          onClick={handleCanvasClick}
        />

        {/* UI Controls */}
        <div className="absolute bottom-5 w-full flex justify-center space-x-8">

          {/* Capture Photo or Reset Button (Bottom-Center) */}
          {!showReset ? (
            <>
              <button
                className="w-16 h-16 bg-white rounded-full border-4 border-gray-400"
                onClick={takePhoto}
              />
              <label className="w-14 h-14 flex items-center justify-center bg-white rounded-full border-4 border-gray-400 cursor-pointer">
                📷
                <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
              </label>
            </>
          ) : (
            <>
              <button
                className="w-16 h-16 bg-white rounded-full border-4 border-gray-400"
                onClick={takePhoto}
              />
              <button
                className="w-16 h-16 bg-white text-white rounded-full border-4 border-gray-400"
                onClick={resetCanvas}
              >🔄</button>
            </>
          )}
        </div>
      </div>
      {/* Loading Overlay */}
      {(showLoading || endpointDisconnected) && (
        <div className="absolute w-full h-full bg-black bg-opacity-50 flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          <p className="text-white text-lg ml-4">
            {endpointDisconnected ? "Connecting..." : "Processing..."}
          </p>
        </div>
      )}

      {/* Settings Button (Top-Right) */}
      <button
        className="absolute bottom-5 right-5 text-white text-2xl bg-gray-700 rounded-full p-2"
        onClick={() => setShowSettings(true)}
      >
        ⚙️
      </button>
      {/* Settings Modal */}
      {showSettings && (
        <div className="text-black absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-80">
          <div className="bg-white p-4 rounded-lg flex flex-col space-y-4">
            <p className="text-lg font-bold">Select Camera</p>
            <select
              className="px-4 py-2 rounded-md border border-gray-300"
              value={facingMode}
              onChange={(e) => {
                const selectedValue = e.target.value;
                setIsScreenMode(false)
                if (selectedValue === "screen") {
                  setIsScreenMode(true)
                  setFacingMode("environment");
                } else {
                  setFacingMode(selectedValue as "user" | "environment");
                }
                setShowSettings(false);
              }}
            >
              {devices.map((device, index) => (
                <option key={index} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
              <option value="screen">Screen Capture</option>
            </select>


            {/* Processor Selection Dropdown */}
            <p className="text-lg font-bold">Select Processor</p>
            <select
              className="px-4 py-2 rounded-md border border-gray-300"
              value={selectedProcessorIndex}
              onChange={(e) => {
                resetCanvas()
                setSelectedProcessorIndex(Number(e.target.value))
                setCurrentProcessor(processors[Number(e.target.value)])
                setShowSettings(false)
                console.log("Selected processor:", processors[Number(e.target.value)].name)
                console.log("Selected processor module:", processors[Number(e.target.value)].module)
              }}
            >
              {processors.map((processor, index) => (
                <option key={index} value={index}>
                  {processor.name}
                </option>
              ))}
              
            </select>

            <button className="mt-4 px-4 py-2 bg-red-500 text-white rounded-md" onClick={() => setShowSettings(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}