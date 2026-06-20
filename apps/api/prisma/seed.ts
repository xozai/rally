import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@rally.app" },
    update: { name: "Demo Organizer" },
    create: {
      email: "demo@rally.app",
      name: "Demo Organizer"
    }
  });

  const event = await prisma.event.create({
    data: {
      title: "Summer BBQ",
      organizerId: user.id,
      duration: 120,
      constraints: {
        windowType: "next_n_days",
        nDays: 14,
        daysOfWeek: ["sat", "sun"],
        timeOfDay: "afternoon"
      } satisfies Prisma.InputJsonValue
    }
  });

  const participants = await prisma.participant.createMany({
    data: [
      {
        eventId: event.id,
        email: "alice@example.com",
        name: "Alice",
        token: randomUUID(),
        availability: [],
        preferences: {}
      },
      {
        eventId: event.id,
        email: "bob@example.com",
        name: "Bob",
        token: randomUUID(),
        availability: [],
        preferences: {}
      }
    ]
  });

  console.log("Seed completed successfully");
  console.log(`Created demo user: ${user.email}`);
  console.log(`Created demo event: ${event.title}`);
  console.log(`Created demo participants: ${participants.count}`);
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
