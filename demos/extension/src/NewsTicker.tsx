import { priceAt } from "@category-labs/mera-demo-shared/market";
import type { ReactElement } from "react";

const ROTATE_SECONDS = 90;
const FLAT_THRESHOLD_WEI = 15n * 10n ** 16n;
const HEADLINES = {
  up: [
    "Nad Computer ships a keyboard with a working escape key; pros rejoice",
    "Nad unveils 1nm process; analysts unsure what happens at zero",
    "Nad Computer announces programs for writing programs; margins double",
    "Reviewers agree: the computers are simply very good",
    "Sovereign wealth fund buys one of everything",
    "New Nad chip so efficient it allegedly returns power to the grid",
    "Update makes every Nad computer boot faster; nobody knows why",
    "Nad monitor now curves in two directions; analysts see no downside",
  ],
  down: [
    "Nad Computer delays next machine to add more machine",
    "Intern unplugs the wrong rack; shipments slip a quarter",
    "Rival claims a faster computer, presents slideshow as proof",
    "Operating system update reintroduces every fixed bug",
    "Recall issued after keyboards found typing on their own",
    "Short seller publishes report written by a competitor's chatbot",
    "Fab humidity slightly off, says person with clipboard",
    "CFO says moderating tailwinds; everyone panics",
  ],
  flat: [
    "Nad Computer unchanged; analysts blame nothing happening",
    "Markets await earnings, vibes",
    "Nad Computer CEO seen eating lunch; significance unclear",
    "Trading flat as investors admire the chart's shape",
    "Nad Computer reiterates that it makes computers",
    "Volatility takes a personal day",
    "Nothing moved today, and experts say that is fine",
    "Wall Street agrees to disagree about agreeing",
  ],
} as const;

type Props = { now: number };

function NewsTicker({ now }: Props): ReactElement {
  const bucket = Math.floor(now / ROTATE_SECONDS);
  const change =
    priceAt(BigInt(bucket * ROTATE_SECONDS)) -
    priceAt(BigInt((bucket - 1) * ROTATE_SECONDS));
  const sentiment =
    change > FLAT_THRESHOLD_WEI
      ? "up"
      : change < -FLAT_THRESHOLD_WEI
        ? "down"
        : "flat";
  const options = HEADLINES[sentiment];
  const hash = Math.imul(bucket, 2654435761) >>> 0;
  return (
    <p className="news">
      <span className="news-tag">News</span>
      {options[hash % options.length] ?? options[0]}
    </p>
  );
}

export { NewsTicker };
