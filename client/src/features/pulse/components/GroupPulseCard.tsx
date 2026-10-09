import { useId } from "react";
import { Card } from "../../../components/ui/Card";
import { Skeleton } from "../../../components/ui/Skeleton";
import { formatMonthName, formatNumber, nounFor } from "../../../lib/format";
import type { Group } from "../../groups/types";
import { useGroupPulse } from "../hooks";

function Stat({ value, singular }: { value: number; singular: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-bg px-2 py-3">
      <dd className="text-2xl font-semibold font-stretch-112% tabular-nums">{formatNumber(value)}</dd>
      <dt className="text-[0.8125rem] text-sub">{nounFor(value, singular)}</dt>
    </div>
  );
}

/**
 * "This month" in the group and its weekly streak, above the feed. Only numbers about the group:
 * nothing here says who has posted, or who hasn't.
 */
export function GroupPulseCard({ group }: { group: Group }) {
  const pulse = useGroupPulse(group.id);
  const headingId = useId();

  // Reserve the card's space while it loads, so the feed doesn't jump down when it arrives.
  if (pulse.isPending) return <Skeleton className="mx-4 mb-4 h-[9.5rem] rounded-3xl" />;
  // A card that can't load isn't worth an error: the feed is what matters.
  if (!pulse.data) return null;

  const { month, streak } = pulse.data;
  const quiet = month.photos === 0 && month.reactions === 0 && month.comments === 0;

  return (
    <div className="px-4 pb-4">
      <Card aria-labelledby={headingId}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={headingId} className="text-lg font-semibold font-stretch-112%">
            This month
          </h2>
          <span className="text-[0.8125rem] text-sub">{formatMonthName(month.month)}</span>
        </div>

        {quiet ? (
          <p className="mt-2 text-[0.9375rem] text-sub">A fresh month. Whatever happens in {group.name} shows up here.</p>
        ) : (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat value={month.photos} singular="photo" />
            <Stat value={month.reactions} singular="reaction" />
            <Stat value={month.comments} singular="comment" />
          </dl>
        )}

        <p className="mt-3 text-[0.9375rem]">
          {streak.weeks > 0 ? (
            <>
              <span aria-hidden>🔥 </span>
              <span className="font-semibold">
                {streak.weeks} {nounFor(streak.weeks, "week")} in a row
              </span>
              {!streak.thisWeekDone && <span className="text-sub"> · a photo this week keeps it going</span>}
            </>
          ) : (
            <span className="text-sub">A photo this week starts a streak.</span>
          )}
        </p>
      </Card>
    </div>
  );
}
