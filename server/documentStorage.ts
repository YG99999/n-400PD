import fs from "fs";
import path from "path";
import { getSupabaseAdminClient } from "./providers";
import { config, isSupabaseConfigured } from "./config";

export async function persistGeneratedDocument(sessionId: string, localPath: string) {
  if (!isSupabaseConfigured()) {
    return {
      storageProvider: "local" as const,
      storagePath: localPath,
      remotePath: undefined,
    };
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      storageProvider: "local" as const,
      storagePath: localPath,
      remotePath: undefined,
    };
  }

  const remotePath = `generated/${sessionId}/${path.basename(localPath)}`;
  const fileBuffer = fs.readFileSync(localPath);
  const { error } = await client.storage
    .from(config.supabaseStorageBucket)
    .upload(remotePath, fileBuffer, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  return {
    storageProvider: "supabase" as const,
    storagePath: localPath,
    remotePath,
  };
}

export async function readGeneratedDocument(document: { storagePath?: string; remotePath?: string; storageProvider?: "local" | "supabase" }) {
  if (document.storageProvider === "supabase" && document.remotePath) {
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase client unavailable");
    const { data, error } = await client.storage
      .from(config.supabaseStorageBucket)
      .download(document.remotePath);
    if (error || !data) {
      throw new Error(error?.message || "Unable to download remote document");
    }
    return Buffer.from(await data.arrayBuffer());
  }

  if (!document.storagePath || !fs.existsSync(document.storagePath)) {
    throw new Error("Document storage path not found");
  }
  return fs.readFileSync(document.storagePath);
}
