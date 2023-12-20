import type { VercelRequest, VercelResponse } from "@vercel/node";
import { discordClient } from "../lib/discord";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const currentDate = new Date();
  // Get date that is exactly one year and one day before current year month day date

  // Find sunsu-vuosijäsenyys orders that were made on that date

  // Call Kajabi deactivation webhook for all such orders using the customer emails
  // and the deactivation webhook for sunsu-vuosijäsenyys

  const deactivationWebhook =
    "https://checkout.kajabi.com/webhooks/offers/9Vzzdv5M8JZxpSt5/2148528871/deactivate";

  const deactivationPromises: Promise<unknown>[] = [];
  const customerEmails: string[] = [];

  // Here we need to loop through all the customers
  const kajabiPayload = {
    name: "Teemu Testaaja",
    email: "teemu.testaaja@testaamo.fi",
    external_user_id: "teemu.testaaja@testaamo.fi",
  };

  customerEmails.push("teemu.testaaja@testaamo.fi");

  const deactivationPromise = fetch(deactivationWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kajabiPayload),
  });
  deactivationPromises.push(deactivationPromise);

  // This maintains the promise array's order
  const results = await Promise.allSettled(deactivationPromises);

  // Create an array of rejected emails and reasons why they were rejected
  const failedDeactivations = results.reduce(
    (rejectedResults, result, index) => {
      if (result.status === "rejected") {
        return [
          ...rejectedResults,
          `Rejected: ${customerEmails[index]}. Reason: ${result.reason}`,
        ];
      }
      return rejectedResults;
    },
    [] as string[]
  );

  // If any promise is rejected, include that in the Discord message as well!
  const failedDeactivationsString = failedDeactivations.join("\n");

  // TODO: Include all wanted information to the message
  const message = "Testiviesti";

  console.log(process.env.DISCORD_CHANNEL_ID_SUNSU_DEACTIVATION);

  /*
  discordClient.on("ready", async () => {
    const channel = discordClient.channels.cache.get(
      process.env.DISCORD_CHANNEL_ID_SUNSU_DEACTIVATION as string
    );
    // Type 0 means GUILD_TEXT channel
    if (channel?.type === 0) {
      await channel.send(message);
    }
  });
  */
  // Triggering login causes the message the be sent
  await discordClient.login(process.env.DISCORD_BOT_TOKEN_SUNSU);

  // Send a message to discord server such that all deactivated emails are shown there
  // with the date for which they were deactivated for.
  // Send the message even if there are no orders!
  return res.status(200).end("Hello Cron!");
}
