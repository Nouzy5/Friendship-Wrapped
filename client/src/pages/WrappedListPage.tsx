import { Link } from "react-router";
import { Badge } from "../components/ui/Badge";
import { Button, buttonClasses } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { WrappedCard } from "../features/wrapped/components/WrappedCard";
import { useWrappedList } from "../features/wrapped/hooks";
import type { WrappedSummary } from "../features/wrapped/types";

/** The list is newest year first, so consecutive runs are the years. */
function byYear(list: WrappedSummary[]): { year: number; final: boolean; items: WrappedSummary[] }[] {
  const years: { year: number; final: boolean; items: WrappedSummary[] }[] = [];
  for (const item of list) {
    const last = years.at(-1);
    if (last?.year === item.year) last.items.push(item);
    else years.push({ year: item.year, final: item.final, items: [item] });
  }
  return years;
}

/** Every Wrapped you can play: one per group and year with photos. */
export function WrappedListPage() {
  const list = useWrappedList();

  let content;
  if (list.isPending) {
    content = (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  } else if (list.isError) {
    content = (
      <Card>
        <StateMessage
          emoji="📡"
          title="Couldn't load your Wrapped"
          action={<Button onClick={() => void list.refetch()}>Try again</Button>}
        />
      </Card>
    );
  } else if (list.data.length === 0) {
    content = (
      <Card>
        <StateMessage
          emoji="🎁"
          title="No Wrapped yet"
          description="Your group's Wrapped starts with its first photo. Every photo, reaction and comment ends up in it."
          action={
            <Link to="/camera" className={buttonClasses()}>
              Take a photo
            </Link>
          }
        />
      </Card>
    );
  } else {
    content = byYear(list.data).map(({ year, final, items }) => (
      <section key={year} aria-labelledby={`wrapped-${year}`} className="flex flex-col gap-3">
        <h2 id={`wrapped-${year}`} className="flex items-center gap-2 text-lg font-bold">
          {year}
          {!final && <Badge>In progress</Badge>}
        </h2>
        {items.map((item) => (
          <WrappedCard key={item.group.id} wrapped={item} />
        ))}
      </section>
    ));
  }

  return (
    <div className="flex flex-col gap-5 py-2">
      <PageHeader title="Wrapped" />
      {content}
    </div>
  );
}
