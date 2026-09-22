import { MongoClient, ObjectId, type Collection, type WithId } from "mongodb";
import { defaultLinks, type LinkInput, type NavigationLink } from "@/lib/links";

type LinkDocument = Omit<LinkInput, "categories" | "isDefault"> & {
  categories?: string[];
  isDefault?: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

// Keep one connection pool during Next.js development reloads.
const cache = globalThis as typeof globalThis & { navigationCollection?: Promise<Collection<LinkDocument>> };

export async function getLinksCollection() {
  if (!cache.navigationCollection) {
    cache.navigationCollection = (async () => {
      const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017/", { serverSelectionTimeoutMS: 2500 });
      try {
        await client.connect();
        const db = client.db(process.env.MONGODB_DB || "personal_nav");
        const links = db.collection<LinkDocument>("links");
        await links.createIndex({ order: 1, createdAt: -1 });
        const metadata = db.collection<{ _id: string; initializedAt: Date }>("metadata");
        if (!await metadata.findOne({ _id: "initialized" })) {
          if (await links.countDocuments({}, { limit: 1 }) === 0) {
            const now = new Date();
            // Stable IDs make first-time seeding safe across concurrent workers.
            await links.bulkWrite(defaultLinks.map((link, index) => ({ updateOne: {
              filter: { _id: new ObjectId(`0000000000000000000000${(index + 1).toString(16).padStart(2, "0")}`) },
              update: { $setOnInsert: { ...link, order: (index + 1) * 10, createdAt: now, updatedAt: now } },
              upsert: true,
            } })));
          }
          await links.updateMany(
            { isDefault: { $exists: false }, url: { $in: defaultLinks.flatMap((link) => [link.url, `${link.url}/`]) } },
            { $set: { isDefault: true } },
          );
          await metadata.updateOne({ _id: "initialized" }, { $setOnInsert: { initializedAt: new Date() } }, { upsert: true });
        }
        return links;
      } catch (error) {
        await client.close().catch(() => {});
        throw error;
      }
    })().catch((error) => {
      cache.navigationCollection = undefined;
      throw error;
    });
  }
  return cache.navigationCollection;
}

export function serializeLink(document: WithId<LinkDocument>): NavigationLink {
  const categories = document.categories?.length ? document.categories : [document.category || "其他"];
  return {
    ...document, _id: document._id.toHexString(), categories, category: categories[0],
    isDefault: Boolean(document.isDefault),
    createdAt: document.createdAt?.toISOString(), updatedAt: document.updatedAt?.toISOString(),
  };
}
