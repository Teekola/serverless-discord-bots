import type { VercelRequest, VercelResponse } from "@vercel/node";
import { discordClient } from "../lib/discord";
import * as z from "zod";

export const dateFormatter = new Intl.DateTimeFormat("fi-FI", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const priceFormatter = new Intl.NumberFormat("fi-FI", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const bodySchema = z.object({
  courses: z.array(
    z.object({
      name: z.string(),
      price: z.number(),
    })
  ),
  createdAt: z.date(),
  email: z.string(),
  name: z.string(),
  totalPrice: z.number(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { body } = req;

  const token = req.headers.authorization;

  if (token !== process.env.SUNSU_ORDER_ENDPOINT_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const parsedBody = bodySchema.parse(body);

    const { courses, createdAt, email, name, totalPrice } = parsedBody;

    const coursesString = courses
      .map((course) => course.name + " " + priceFormatter.format(course.price))
      .join(",");

    let message = `**Uusi tilaus!**
    **Tilausaika:** ${dateFormatter.format(createdAt)} 
    **Tilatut kurssit:** ${coursesString}
    **Kokonaissumma:** ${priceFormatter.format(totalPrice)} 
    **Tilaaja:** ${name}
    **Email:** ${email}
    `;

    discordClient.on("ready", async () => {
      const channel = discordClient.channels.cache.get(
        process.env.DISCORD_CHANNEL_ID_SUNSU as string
      );
      // Type 0 means GUILD_TEXT channel
      if (channel?.type === 0) {
        await channel.send(message);
      }
    });

    // Triggering login causes the message the be sent
    await discordClient.login(process.env.DISCORD_BOT_TOKEN_SUNSU);
    return res.status(200).end();
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error });
  }
}
