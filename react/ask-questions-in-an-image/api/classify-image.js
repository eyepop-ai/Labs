export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, categories, apiKey } = req.body;

    const authKey = apiKey || process.env.EYEPOP_API_KEY;

    if (!authKey) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!categories || categories.length === 0) {
      return res.status(400).json({ error: "Categories are required" });
    }

    const eyepopUrl = process.env.EYEPOP_URL || "https://compute.staging.eyepop.xyz";

    // 1. Authenticate to get access token
    console.log("[classify] Authenticating...");
    const authResponse = await fetch(`${eyepopUrl}/v1/auth/authenticate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authKey}` }
    });
    if (!authResponse.ok) {
      const msg = await authResponse.text();
      console.error("[classify] Auth failed:", authResponse.status, msg);
      throw new Error(`Auth failed (${authResponse.status}): ${msg}`);
    }
    const { access_token } = await authResponse.json();
    console.log("[classify] Auth OK");

    // 2. Get VLM API URL from config
    const configResponse = await fetch(`${eyepopUrl}/v1/configs`, {
      headers: { Authorization: `Bearer ${authKey}` }
    });
    if (!configResponse.ok) {
      const msg = await configResponse.text();
      throw new Error(`Config failed (${configResponse.status}): ${msg}`);
    }
    const config = await configResponse.json();
    const vlmApiUrl = new URL(config.vlm_api_url, eyepopUrl).toString().replace(/\/+$/, "");
    console.log("[classify] VLM URL:", vlmApiUrl);

    // 3. Call VLM with qwen3-instruct
    const textPrompt =
      "Classify this image into exactly one of the following categories: " +
      categories.join(", ") +
      ". Return only the category name.";

    console.log("[classify] Prompt:", textPrompt);
    console.log("[classify] Categories:", categories);

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

    console.log("[classify] Calling VLM infer...");
    let response = await fetch(`${vlmApiUrl}/api/v1/infer?timeout=60`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json"
      },
      body: formData
    });

    console.log("[classify] VLM response status:", response.status);
    let data = await response.json();
    console.log("[classify] VLM raw response:", JSON.stringify(data, null, 2));

    // Handle async polling (202 Accepted with request_id)
    if (response.status === 202 && data.request_id) {
      const requestId = data.request_id;
      console.log("[classify] Async request, polling:", requestId);
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
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
        console.log("[classify] Poll", attempt + 1, "status:", pollResponse.status);
        data = await pollResponse.json();
        if (data.predictions) {
          console.log("[classify] Got predictions:", JSON.stringify(data, null, 2));
          break;
        }
        if (pollResponse.status !== 202) {
          console.log("[classify] Poll ended:", JSON.stringify(data));
          break;
        }
      }
    }

    // Parse predictions into classes
    let collected = [];
    const predictions = data.predictions || [];
    console.log("[classify] Predictions count:", predictions.length);

    for (const pred of predictions) {
      console.log("[classify] Prediction:", JSON.stringify(pred));

      if (pred.classes && pred.classes.length > 0) {
        console.log("[classify] Found classes:", pred.classes);
        collected.push(...pred.classes);
      }
      if (pred.texts && pred.texts.length > 0) {
        console.log("[classify] Found texts:", pred.texts);
        pred.texts.forEach((t) => {
          const text = (t.text || t).trim();
          console.log("[classify] Text value:", JSON.stringify(text));
          // Fuzzy match against categories
          const match =
            categories.find((c) => c.toLowerCase() === text.toLowerCase()) ||
            categories.find(
              (c) =>
                text.toLowerCase().includes(c.toLowerCase()) ||
                c.toLowerCase().includes(text.toLowerCase())
            );
          console.log("[classify] Matched category:", match);
          collected.push({
            classLabel: match || text,
            confidence: t.confidence || 0.8,
            category: "classification"
          });
        });
      }
    }

    // Fallback: check raw_output
    if (collected.length === 0 && data.raw_output) {
      const text = String(data.raw_output).trim();
      console.log("[classify] Using raw_output fallback:", JSON.stringify(text));
      const match =
        categories.find((c) => c.toLowerCase() === text.toLowerCase()) ||
        categories.find(
          (c) =>
            text.toLowerCase().includes(c.toLowerCase()) ||
            c.toLowerCase().includes(text.toLowerCase())
        );
      console.log("[classify] raw_output matched:", match);
      collected.push({
        classLabel: match || text,
        confidence: 0.8,
        category: "classification"
      });
    }

    if (collected.length === 0) {
      console.log("[classify] No matches at all, returning Other");
      collected.push({
        classLabel: "Other",
        confidence: 0.0,
        category: "classification"
      });
    }

    console.log("[classify] Final result:", JSON.stringify(collected));
    return res.status(200).json({ classes: collected });
  } catch (err) {
    console.error("[classify] ERROR:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
