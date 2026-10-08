const otpStore = new Map<string, { code: string; expiresAt: number }>();

export async function sendOTP(phone: string): Promise<void> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  otpStore.set(phone, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const apiUrl = import.meta.env.EVOLUTION_API_URL;
  const apiKey = import.meta.env.EVOLUTION_API_KEY;

  if (!apiUrl || !apiKey) {
    console.warn("Evolution API credentials not configured. OTP generated:", code);
    return;
  }

  // The instanceName is typically part of the URL, but if the URL already contains it or 
  // we just use a fallback. We'll assume the URL might already be the full endpoint or base.
  // Using a generic POST as requested by instructions.
  const endpoint = apiUrl.endsWith('/') ? `${apiUrl}message/sendText/instance` : `${apiUrl}/message/sendText/instance`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        number: phone,
        text: `Your verification code is: ${code}`,
      }),
    });

    if (!response.ok) {
      console.error("Evolution API error:", await response.text());
    }
  } catch (error) {
    console.error("Evolution API request failed:", error);
  }
}

export async function verifyOTP(phone: string, code: string): Promise<boolean> {
  const stored = otpStore.get(phone);
  
  if (!stored) {
    return false;
  }
  
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phone);
    return false;
  }
  
  if (stored.code === code) {
    otpStore.delete(phone);
    return true;
  }
  
  return false;
}

export async function sendWhatsAppMessage(phone: string, text: string): Promise<void> {
  const apiUrl = import.meta.env.EVOLUTION_API_URL;
  const apiKey = import.meta.env.EVOLUTION_API_KEY;

  if (!apiUrl || !apiKey) {
    console.warn("Evolution API credentials not configured. Message:", text);
    return;
  }

  const endpoint = apiUrl.endsWith('/') ? `${apiUrl}message/sendText/instance` : `${apiUrl}/message/sendText/instance`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        number: phone,
        text,
      }),
    });

    if (!response.ok) {
      console.error("Evolution API error:", await response.text());
    }
  } catch (error) {
    console.error("Evolution API request failed:", error);
  }
}
