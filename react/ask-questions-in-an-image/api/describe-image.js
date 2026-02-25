export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, apiKey } = req.body;

    const authKey = apiKey || process.env.EYEPOP_API_KEY;

    if (!authKey) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const eyepopUrl = process.env.EYEPOP_URL || "https://compute.staging.eyepop.xyz";

    // 1. Authenticate to get access token
    const authResponse = await fetch(`${eyepopUrl}/v1/auth/authenticate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authKey}` }
    });
    if (!authResponse.ok) {
      const msg = await authResponse.text();
      throw new Error(`Auth failed (${authResponse.status}): ${msg}`);
    }
    const { access_token } = await authResponse.json();

    // 2. Get VLM API URL from config
    const configResponse = await fetch(`${eyepopUrl}/v1/configs`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    if (!configResponse.ok) {
      const msg = await configResponse.text();
      throw new Error(`Config failed (${configResponse.status}): ${msg}`);
    }
    const config = await configResponse.json();
    const vlmApiUrl = new URL(config.vlm_api_url, eyepopUrl).toString().replace(/\/+$/, "");

    // 3. Call VLM with qwen3-instruct
    const textPrompt =
      'Describe this image in detail. Return JSON with this exact format: {"description": "a detailed description of the image", "tags": ["tag1", "tag2", "tag3"], "objects": ["object1", "object2"]}';

    const inferRequest = {
      worker_release: "qwen3-instruct",
      text_prompt: textPrompt,
      config: {
        do_sample: false,
        max_new_tokens: 2000,
        temperature: 0.1,
        image_size: 400
      },
      refresh: false
    };

    const fileBlob = new Blob([Buffer.from(imageBase64, "base64")], { type: "image/png" });
    const formData = new FormData();
    formData.append("infer_request", JSON.stringify(inferRequest));
    formData.append("file", fileBlob, "image.png");

    let response = await fetch(`${vlmApiUrl}/api/v1/infer?timeout=60`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json"
      },
      body: formData
    });

    let data = await response.json();

    // Handle async polling (202 Accepted with request_id)
    if (response.status === 202 && data.request_id) {
      const requestId = data.request_id;
      for (let attempt = 0; attempt < 30; attempt++) {
        const pollResponse = await fetch(
          `${vlmApiUrl}/api/v1/requests/${requestId}?timeout=20`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${access_token}`,
              Accept: "application/json"
            }
          }
        );
        data = await pollResponse.json();
        if (data.predictions) break;
        if (pollResponse.status !== 202) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // Parse VLM response
    let description = null;

    // Try predictions array
    const predictions = data.predictions || [];
    for (const pred of predictions) {
      if (pred.classes && pred.classes.length > 0) {
        const text = pred.classes.map((c) => c.classLabel).join(" ");
        description = parseDescription(text);
      }
      if (!description && pred.texts && pred.texts.length > 0) {
        const text = pred.texts.map((t) => t.text || t).join(" ");
        description = parseDescription(text);
      }
      if (description) break;
    }

    // Try raw_output fallback
    if (!description && data.raw_output) {
      description = parseDescription(String(data.raw_output));
    }

    if (!description) {
      description = {
        description: "Unable to describe this image.",
        tags: [],
        objects: []
      };
    }

    return res.status(200).json({ description });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
}

function parseDescription(text) {
  // Try JSON parse first
  try {
    const parsed = JSON.parse(text);
    if (parsed.description) return parsed;
  } catch {}

  // Try extracting JSON from text with regex
  const jsonMatch = text.match(/\{[\s\S]*"description"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.description) return parsed;
    } catch {}
  }

  // Fallback: treat entire text as description, extract keywords as tags
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const uniqueWords = [...new Set(words)].slice(0, 10);
  return {
    description: text,
    tags: uniqueWords.slice(0, 5),
    objects: uniqueWords.slice(5, 10)
  };
}
