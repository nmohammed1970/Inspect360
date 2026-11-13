import "dotenv/config";
import { ensureSeedCatalog, getPublishedCatalog, isSelfServeEnabled } from "./catalogService";

async function main() {
  await ensureSeedCatalog("seed-script");
  const c = await getPublishedCatalog();
  console.log(
    JSON.stringify(
      {
        plans: c?.plans?.length ?? 0,
        prices: c?.prices?.length ?? 0,
        version: c?.version?.label,
        selfServe: await isSelfServeEnabled(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
