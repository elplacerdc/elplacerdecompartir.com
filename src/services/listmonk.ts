export const addSubscriber = async (
  email: string,
  name: string,
  listIds: number[] = [1]
) => {
  try {
    const apiUrl = process.env.LISTMONK_API_URL || "http://listmonk:9000/api";
    const username = process.env.LISTMONK_USERNAME || "listmonk";
    const password = process.env.LISTMONK_PASSWORD || "listmonk";

    const encodedCredentials = Buffer.from(`${username}:${password}`).toString("base64");

    const response = await fetch(`${apiUrl}/subscribers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${encodedCredentials}`,
      },
      body: JSON.stringify({
        email,
        name: name || email,
        status: "enabled",
        lists: listIds,
        preconfirm_subscriptions: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Listmonk] Failed to add subscriber:", response.status, errorText);
      return { success: false, error: errorText };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    console.error("[Listmonk] Error adding subscriber:", error.message);
    return { success: false, error: error.message };
  }
};
