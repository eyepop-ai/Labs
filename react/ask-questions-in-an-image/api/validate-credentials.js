import { EyePop } from "@eyepop.ai/eyepop";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      return res.status(400).json({ 
        valid: false, 
        error: "API key is required" 
      });
    }

    // Attempt to connect to EyePop with the provided credentials
    try {
      const endpoint = await EyePop.workerEndpoint({
        auth: { secretKey: apiKey },
        stopJobs: false
      }).connect();

      // If we successfully connected, the credentials are valid
      // Disconnect immediately as this is just a validation check
      await endpoint.disconnect();

      return res.status(200).json({ 
        valid: true,
        message: "Credentials validated successfully" 
      });
    } catch (authError) {
      // Authentication failed
      console.error('EyePop authentication error:', authError.message);
      return res.status(401).json({ 
        valid: false, 
        error: "Invalid API key. Please check your credentials and try again." 
      });
    }
  } catch (err) {
    console.error('Validation error:', err);
    return res.status(500).json({ 
      valid: false,
      error: "Internal server error occurred during validation" 
    });
  }
}

