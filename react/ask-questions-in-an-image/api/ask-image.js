import { EyePop, PopComponentType } from "@eyepop.ai/eyepop";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { questions, imageBase64 } = req.body;

    const endpoint = await EyePop.workerEndpoint({
      auth: { secretKey: process.env.EYEPOP_API_KEY }, // only on server
      stopJobs: false
    }).connect();

    await endpoint.changePop({
      components: [{
        type: PopComponentType.INFERENCE,
        id: 2,
        ability: "eyepop.image-contents:latest",
        params: {
          prompts: [{
            prompt:
              "Analyze the image provided and determine the categories of: " +
              questions.join(", ") +
              ". Report the values of the categories as classLabels."
          }]
        }
      }]
    });

    const buffer = Buffer.from(imageBase64, "base64");
    const results = await endpoint.process({
      file: buffer,
      mimeType: "image/*"
    });

    let collected = [];
    for await (let result of results) {
      if (result.classes) collected.push(...result.classes);
      break;
    }

    return res.status(200).json({ classes: collected });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}