import { currentUser } from "@clerk/nextjs/server";
import { router } from "../__internals/router";
import { publicProcedure } from "../procedures";
import { db } from "@/db";

export const authRouter = router({
  getDatabaseSyncStatus: publicProcedure.query(async ({ c }) => {
    try {
      const auth = await currentUser();

      if (!auth) {
        return c.json({ isSynced: false });
      }

      const email = auth.emailAddresses?.[0]?.emailAddress;
      if (!email) {
        return c.json({ isSynced: false, reason: "No email on auth user" });
      }

      // 1) Try by externalId first
      const byExternal = await db.user.findUnique({
        where: { externalId: auth.id },
      });

      if (byExternal) {
        await db.user.update({
          where: { id: byExternal.id },
          data: { email },
        });
        return c.json({ isSynced: true });
      }

      // 2) If no externalId match, try by email (legacy row / old data)
      const byEmail = await db.user.findUnique({
        where: { email },
      });

      if (byEmail) {
        await db.user.update({
          where: { id: byEmail.id },
          data: { externalId: auth.id },
        });
        return c.json({ isSynced: true });
      }

      // 3) Create fresh user
      await db.user.create({
        data: {
          externalId: auth.id,
          email,
          quotaLimit: 100,
        },
      });

      return c.json({ isSynced: true });
    } catch (err: any) {
      console.error("getDatabaseSyncStatus failed:", err);
      return c.json(
        {
          isSynced: false,
          error: "SYNC_FAILED",
          message: err?.message ?? "Unknown error",
        },
        500
      );
    }
  }),
});
