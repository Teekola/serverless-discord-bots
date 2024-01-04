import type { VercelRequest, VercelResponse } from "@vercel/node";
import { discordClient } from "../lib/discord";
import { prisma } from "../prisma/prisma";

const membershipId = "63989b8bb528e0e359c1515c"; // sunsu yearly membership productId
const deactivationWebhook =
  "https://checkout.kajabi.com/webhooks/offers/9Vzzdv5M8JZxpSt5/2148528871/deactivate"; // kajabi deactivation webhook url

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end("Unauthorized");
  }

  // Daterange is yesterday from 00.00 upto yesterday 23.59.59.999
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  startDate.setDate(startDate.getDate() - 2);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setHours(23, 59, 59, 999);

  const timeRangeStr = `${startDate.toLocaleString("fi-FI", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })} - ${endDate.toLocaleString("fi-FI", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;

  const membershipIds = await prisma.orderProduct.findMany({
    select: { id: true },
    where: {
      product: {
        productId: membershipId,
      },
    },
  });

  // Find sunsu-vuosijäsenyys orders that were made on that date
  const orders = await prisma.order.findMany({
    select: {
      customer: {
        select: { email: true, firstName: true, lastName: true },
      },
    },
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      status: "COMPLETED",
      productIds: {
        hasSome: membershipIds.map((obj) => obj.id),
      },
    },
  });

  // find orders that were made after that date
  const newerOrders = await prisma.order.findMany({
    select: {
      customer: {
        select: { email: true },
      },
    },
    where: {
      createdAt: {
        gt: endDate,
      },
      status: "COMPLETED",
      productIds: {
        hasSome: membershipIds.map((obj) => obj.id),
      },
    },
  });
  const newEmails = new Set(newerOrders.map((o) => o.customer.email));

  const filteredOrders = orders.filter(
    (order) => !newEmails.has(order.customer.email)
  );

  const kajabiPayloads = filteredOrders.map((order) => ({
    name: order.customer.firstName + " " + order.customer.lastName,
    email: order.customer.email,
    external_user_id: order.customer.email,
  }));

  const deactivationPromises: Promise<unknown>[] = [];

  for (const kajabiPayload of kajabiPayloads) {
    const deactivationPromise = fetch(deactivationWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kajabiPayload),
    });
    deactivationPromises.push(deactivationPromise);
  }

  // This maintains the promise array's order
  const results = await Promise.allSettled(deactivationPromises);

  // Create an array of rejected emails and reasons why they were rejected
  const [successfulDeactivations, failedDeactivations] = results.reduce(
    (acc, result, index) => {
      if (result.status === "rejected") {
        return [
          [...acc[0]],
          [
            ...acc[1],
            `Rejected: ${kajabiPayloads[index].email}. Reason: ${result.reason}`,
          ],
        ];
      }
      return [[...acc[0], kajabiPayloads[index].email], [...acc[1]]];
    },
    [[], []] as [string[], string[]]
  );

  // If any promise is rejected, include that in the Discord message as well!
  const successfulDeactivationsString = successfulDeactivations.join("\n");
  const failedDeactivationsString = failedDeactivations.join("\n");

  const message = `
  **Deaktivoitu aikavälillä ${timeRangeStr} alkaneet jäsenyydet:**
${
  successfulDeactivations.length > 0
    ? `*Deaktivoidut jäsenyydet (${successfulDeactivations.length} kpl)*: 
${successfulDeactivationsString}`
    : "Ei deaktivoitavia jäsenyyksiä."
}
${
  failedDeactivations.length > 0
    ? `*Epäonnistuneet deaktivoinnit (${failedDeactivations.length} kpl)*: 
${failedDeactivationsString}`
    : ""
}`;

  discordClient.on("ready", async () => {
    const channel = discordClient.channels.cache.get(
      process.env.DISCORD_CHANNEL_ID_SUNSU_DEACTIVATION as string
    );
    // Type 0 means GUILD_TEXT channel
    if (channel?.type === 0) {
      await channel.send(message);
    }
  });

  // Triggering login causes the message the be sent
  await discordClient.login(process.env.DISCORD_BOT_TOKEN_SUNSU);

  // Send a message to discord server such that all deactivated emails are shown there
  // with the date for which they were deactivated for.
  // Send the message even if there are no orders!
  return res.status(200).json({ message });
}
