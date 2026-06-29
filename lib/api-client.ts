export async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      res.ok
        ? "Server returned an empty response."
        : `Request failed (${res.status}). The server may have timed out — try fewer results or disable email scraping.`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(
      res.ok
        ? "Server returned an invalid response."
        : `Request failed (${res.status}): ${preview || "non-JSON response"}`
    );
  }
}
