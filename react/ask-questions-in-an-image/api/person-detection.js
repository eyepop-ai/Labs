import { EyePop, PopComponentType } from "@eyepop.ai/eyepop";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, apiKey } = req.body;

    // Use the provided API key from the authenticated user
    const secretKey = apiKey || process.env.EYEPOP_API_KEY;

    if (!secretKey) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const endpoint = await EyePop.workerEndpoint({
      auth: { secretKey },
      stopJobs: false
    }).connect();

    // Configure the pipeline: person detection only
    const popConfig = {
      components: [{
        type: PopComponentType.INFERENCE,
        ability: 'eyepop.person:latest'
      }]
    };

    await endpoint.changePop(popConfig);

    const blob = new Blob([Buffer.from(imageBase64, "base64")], { type: "image/png" });
    const results = await endpoint.process({
      file: blob,
      mimeType: "image/png"
    });

    let detections = [];
    
    for await (let result of results) {
      // Each result with objects represents a detection from person detection
      if (result.objects && result.objects.length > 0) {
        result.objects.forEach((obj) => {
          const detection = {
            objects: [obj]
          };
          detections.push(detection);
        });
      }
    }

    return res.status(200).json({ detections });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
}

