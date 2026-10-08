import type { ReactNode } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { usePageTitle } from "../../lib/usePageTitle";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold font-stretch-112%">{title}</h2>
      <div className="flex flex-col gap-2 text-[0.9375rem] leading-relaxed text-sub">{children}</div>
    </section>
  );
}

/** The short version of how the app treats you and your photos. */
export function TermsPage() {
  usePageTitle("Terms and privacy");

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Terms and privacy" backTo="/settings" backLabel="Back to settings" />

      <Section title="Who sees your photos">
        <p>Only the people in the group you post to. Nothing is public, and there's no feed of strangers.</p>
        <p>Location is removed from every photo before it's stored. Friends can only download your photos if you let them (Privacy &amp; safety).</p>
      </Section>

      <Section title="What's stored">
        <p>Your name, username, password (scrambled, never readable), profile photo, your groups, and the photos, reactions and comments you post.</p>
        <p>To keep you signed in we remember which devices you use; you can sign any of them out in Account.</p>
      </Section>

      <Section title="Leaving">
        <p>Download your photos any time from Account. Deleting your account deletes your photos, comments and reactions and takes you out of every group.</p>
      </Section>

      <Section title="Being kind">
        <p>Post only what the people in the photo would be happy to share with the group. Block or report anyone who makes it unpleasant.</p>
      </Section>
    </div>
  );
}
