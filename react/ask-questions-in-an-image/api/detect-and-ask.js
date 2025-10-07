import { EyePop, PopComponentType, ForwardOperatorType } from "@eyepop.ai/eyepop";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { detectPrompt, questions, imageBase64, apiKey } = req.body;

    // Use the provided API key from the authenticated user
    const secretKey = apiKey || process.env.EYEPOP_API_KEY;

    if (!secretKey) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const endpoint = await EyePop.workerEndpoint({
      auth: { secretKey },
      stopJobs: false
    }).connect();

    // Configure the pipeline: localize-objects → crop → image-contents
    await endpoint.changePop({
      components: [{
        type: PopComponentType.INFERENCE,
        ability: 'ci-eyepop.localize-objects:component-api-v8.2.16',
        params: {
          prompts: [
            { prompt: detectPrompt }
          ]
        },
        // Forward cropped detections to image-contents for analysis
        forward: {
          operator: {
            type: ForwardOperatorType.CROP,
          },
          targets: [{
            type: PopComponentType.INFERENCE,
            ability: 'eyepop.image-contents:latest',
            params: {
              prompts: [{
                prompt:
                  "Analyze the image provided and determine the categories of: " +
                  questions.join(", ") +
                  ". Report the values of the categories as classLabels. If you are unable to provide a category with a value then set its classLabel to null"
              }]
            }
          }]
        }
      }]
    });

    const blob = new Blob([Buffer.from(imageBase64, "base64")], { type: "image/png" });
    const results = await endpoint.process({
      file: blob,
      mimeType: "image/png"
    });

    let detections = [];
    
    for await (let result of results) {
      // Each result with objects represents a detection from localize-objects
      if (result.objects && result.objects.length > 0) {
        result.objects.forEach((obj) => {
          // Extract classes from within the object (nested structure)
          const classes = obj.classes || [];
          
          const detection = {
            objects: [obj],
            classes: classes  // Use the classes nested inside the object
          };
          detections.push(detection);
        });
      }
      
      // Also check for top-level classes (alternative response structure)
      if (result.classes && result.classes.length > 0) {
        result.classes.forEach((cls) => {
          const sourceId = cls.source_id;
          const detection = detections.find(d => 
            d.objects.some(obj => obj.id === sourceId)
          );
          
          if (detection) {
            detection.classes.push(cls);
          } else {
            if (detections.length > 0) {
              detections[detections.length - 1].classes.push(cls);
            }
          }
        });
      }
    }

    return res.status(200).json({ detections });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
