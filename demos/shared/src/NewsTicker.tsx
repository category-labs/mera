import type { ReactElement } from "react";
import { headlineAt } from "./news";

type NewsTickerProps = {
  /** Unix seconds; picks the rotation window and its sentiment. */
  now: number;
};

function NewsTicker({ now }: NewsTickerProps): ReactElement {
  return (
    <p className="news">
      <span className="news-tag">News</span>
      {headlineAt(now)}
    </p>
  );
}

export { NewsTicker };
