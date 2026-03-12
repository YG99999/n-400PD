import "dotenv/config";
import { documentJobs } from "./documentJobs";
import { config } from "./config";
import { storage } from "./storage";

async function runLoop() {
  const workerId = `worker-${process.pid}`;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const nextJob = await storage.claimNextQueuedJob(workerId);
      if (nextJob) {
        await documentJobs.process(nextJob.id);
        continue;
      }
    } catch (error) {
      console.error("Document worker loop failed:", error);
    }

    await new Promise((resolve) => setTimeout(resolve, config.documentWorkerPollMs));
  }
}

void runLoop();
