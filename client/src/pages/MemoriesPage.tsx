import { useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { useMyGroups } from "../features/groups/hooks";
import { AlbumsTab } from "../features/memories/components/AlbumsTab";
import { FavoritesTab } from "../features/memories/components/FavoritesTab";
import { GroupSwitcher } from "../features/memories/components/GroupSwitcher";
import { OnThisDay } from "../features/memories/components/OnThisDay";
import { Timeline } from "../features/memories/components/Timeline";
import { formatMonthParam, parseMonthParam, type Month } from "../features/memories/months";

type Tab = "timeline" | "albums" | "favorites";

const tabs: { value: Tab; label: string }[] = [
  { value: "timeline", label: "Timeline" },
  { value: "albums", label: "Albums" },
  { value: "favorites", label: "Favorites" },
];

const parseTab = (value: string | null): Tab => tabs.find((tab) => tab.value === value)?.value ?? "timeline";

/**
 * A group's shared archive: On This Day, then the timeline, albums and your favorites.
 * The group, tab and month live in the URL (?group=…&tab=…&month=YYYY-MM), so coming
 * back from a photo lands in the same place.
 */
export function MemoriesPage() {
  const groups = useMyGroups();
  const [params, setParams] = useSearchParams();
  const tabsRef = useRef<HTMLDivElement>(null);

  function update(changes: Record<string, string | null>, keepScroll: boolean) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true, preventScrollReset: keepScroll },
    );
    // Switching tab or month keeps the page where it is, unless the tabs have scrolled away.
    if (keepScroll && tabsRef.current && tabsRef.current.getBoundingClientRect().top < 0) {
      tabsRef.current.scrollIntoView();
    }
  }

  let content;
  if (groups.isPending) {
    content = (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  } else if (groups.isError) {
    content = (
      <Card>
        <StateMessage
          emoji="📡"
          title="Couldn't load your groups"
          action={<Button onClick={() => void groups.refetch()}>Try again</Button>}
        />
      </Card>
    );
  } else if (groups.data.length === 0) {
    content = (
      <Card>
        <StateMessage
          emoji="🫶"
          title="No memories yet"
          description="Memories are made with friends. Create a group, or open an invite link from a friend."
          action={
            <Link to="/groups/new" className={buttonClasses()}>
              Create a group
            </Link>
          }
        />
      </Card>
    );
  } else {
    const group = groups.data.find(({ id }) => id === params.get("group")) ?? groups.data[0]!;
    const tab = parseTab(params.get("tab"));
    const month = parseMonthParam(params.get("month"));

    content = (
      <>
        {groups.data.length > 1 && (
          <GroupSwitcher
            groups={groups.data}
            selectedId={group.id}
            onSelect={(groupId) => update({ group: groupId, month: null }, false)}
          />
        )}
        <OnThisDay groupId={group.id} />
        <div ref={tabsRef} className="scroll-mt-20">
          <SegmentedControl
            label="Show"
            options={tabs}
            value={tab}
            onChange={(next) => update({ tab: next === "timeline" ? null : next }, true)}
          />
        </div>
        {tab === "timeline" && (
          <Timeline
            group={group}
            from={month}
            onJump={(next: Month | null) => update({ month: next && formatMonthParam(next) }, true)}
          />
        )}
        {tab === "albums" && <AlbumsTab groupId={group.id} />}
        {tab === "favorites" && <FavoritesTab groupId={group.id} />}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-2">
      <PageHeader title="Memories" />
      {content}
    </div>
  );
}
