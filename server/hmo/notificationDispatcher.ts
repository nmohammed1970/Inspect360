import { storage as appStorage } from "../storage";

export async function dispatchHmoNotification(params: {
  organizationId: string;
  userId?: string | null;
  title: string;
  message: string;
  link?: string | null;
  type?: string;
}): Promise<{ delivered: boolean; deferred: boolean }> {
  try {
    const createNotification = (appStorage as any).createNotification;
    if (typeof createNotification !== "function") {
      return { delivered: false, deferred: true };
    }
    if (!params.userId) {
      return { delivered: false, deferred: true };
    }
    await createNotification.call(appStorage, {
      organizationId: params.organizationId,
      userId: params.userId,
      title: params.title,
      message: params.message,
      link: params.link || null,
      type: params.type || "hmo",
    });
    return { delivered: true, deferred: false };
  } catch (error) {
    console.warn("[hmo] notification dispatch deferred:", error);
    return { delivered: false, deferred: true };
  }
}
