import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";
import { db } from "./db/index";
import { sendWhatsAppMessage } from "./services/evolution";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg", // Specify PostgreSQL provider
    }),
    plugins: [
        phoneNumber({
            sendOTP: async ({ phoneNumber, code }) => {
                await sendWhatsAppMessage(
                    phoneNumber,
                    `Tu código de verificación de El Placer es: ${code}`
                );
            }
        })
    ]
});
