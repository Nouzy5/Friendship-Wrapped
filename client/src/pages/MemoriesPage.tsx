import { useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Spinner } from "../components/ui/Spinner";
import { StateMessage } from "../components/ui/StateMessage";
import { setCurrentGroupId, useCurrentGroup } from "../features/groups/current-group";
import { GroupPicker } from "../features/groups/components/GroupPicker";
import { useMyGroups } from "../features/groups/hooks";
import { AlbumsTab } from "../features/memories/components/AlbumsTab";
import { FavoritesTab } from "../features/memories/components/FavoritesTab";
import { OnThisDay } from "../features/memories/components/OnThisDay";
import { PeopleFilter } from "../features/memories/components/PeopleFilter";
import { Timeline } from "../features/memories/components/Timeline";
import { formatMonthParam, parseMonthParam, type Month } from "../features/memories/months";
import { usePageTitle } from "../lib/usePageTitle";

type Tab = "timeline" | "albums" | "favorites";

const tabs: { value: Tab; label: string }[] = [
  { value: "timeline", label: "Timeline" },
  { value: "albums", label: "Albums" },
  { value: "favorites", label: "Favorites" },
];

const parseTab = (value: string | null): Tab => tabs.find((tab) => tab.value === value)?.value ?? "timeline";

/**
 * A group's shared archive: On This Day, then the timeline (everyone's, or one person's), albums and
 * your favorites. The group, tab, person and month live in the URL (?group=…&tab=…&by=…&month=YYYY-MM),
 * so coming back from a photo lands in the same place.
 */
export function MemoriesPage() {
  usePageTitle("Memories");
  const groups = useMyGroups();
  const current = useCurrentGroup();
  const [params, setParams] = useSearchParams();
  const tabsRef = useRef<HTMLDivElement>(null);

  function update(changes: Record<string, string | null>, keepScroll: boolean) {
    setParams(
      (existing) => {
        const next = new URLSearchParams(existing);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true, preventScrollReset: keepScroll },
    );
    // Switching tab, person or month keeps the page where it is, unless the tabs have scrolled away.
    if (keepScroll && tabsRef.current && tabsRef.current.getBoundingClientRect().top < 0) tabsRef.current.scrollIntoView();
  }

  const group = groups.data?.find(({ id }) => id === params.get("group")) ?? current;

  let content;
  if (groups.isPending) {
    content = (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  } else if (groups.isLoadingError) {
    content = <StateMessage emoji="📡" title="Couldn't load your groups" action={<Button onClick={() => void groups.refetch()}>Try again</Button>} />;
  } else if (!group) {
    content = (
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
    );
  } else {
    const tab = parseTab(params.get("tab"));
    const month = parseMonthParam(params.get("month"));
    const by = params.get("by");

    content = (
      <>
        <OnThisDay groupId={group.id} />
        <div ref={tabsRef} className="flex scroll-mt-4 flex-col gap-3">
          <SegmentedControl label="Show" options={tabs} value={tab} onChange={(next) => update({ tab: next === "timeline" ? null : next }, true)} />
          {tab === "timeline" && <PeopleFilter groupId={group.id} selected={by} onSelect={(userId) => update({ by: userId }, true)} />}
        </div>
        {/* Each tab crossfades in when chosen. */}
        <div key={tab} className="animate-page-fade">
        {tab === "timeline" && (
          <Timeline
            group={group}
            from={month}
            uploaderId={by}
            onJump={(next: Month | null) => update({ month: next && formatMonthParam(next) }, true)}
          />
        )}
        {tab === "albums" && <AlbumsTab groupId={group.id} />}
        {tab === "favorites" && <FavoritesTab groupId={group.id} />}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-3">
      <header className="flex items-center gap-3">
        <h1 className="text-[1.875rem] leading-tight font-semibold font-stretch-112%">Memories</h1>
        {group && (
          <div className="ml-auto min-w-0">
            <GroupPicker
              variant="pill"
              align="right"
              current={group}
              onSelect={(next) => {
                setCurrentGroupId(next.id);
                update({ group: next.id, month: null, by: null }, false);
              }}
            />
          </div>
        )}
      </header>
      {content}
    </div>
  );
}
