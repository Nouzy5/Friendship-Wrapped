import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 18l-6-6 6-6" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 18l6-6-6-6" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </Icon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1.4-2h6.2l1.4 2H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  );
}

export function ImagesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 16-5-5-8 8" />
    </Icon>
  );
}

export function SwitchCameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 9a8 8 0 0 0-14.5-2M4 4v3h3" />
      <path d="M4 15a8 8 0 0 0 14.5 2M20 20v-3h-3" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Icon>
  );
}

/** A stack of photos: the Memories tab. */
export function MemoriesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="14" height="14" rx="2" />
      <path d="M7 3h12a2 2 0 0 1 2 2v12" />
      <path d="m3 17 4-4 4 4 2-2 4 4" />
    </Icon>
  );
}

export function AlbumIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 3v8l2.5-1.5L14 11V3" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </Icon>
  );
}

/** Pass `fill="currentColor"` for the filled (selected) star. */
export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </Icon>
  );
}

export function CommentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h13M12 5l7 7-7 7" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

/** One photo per row (the feed layout). */
export function FeedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="3" width="16" height="11" rx="2" />
      <path d="M4 18h16M4 21h10" />
    </Icon>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </Icon>
  );
}

/** Bars of different heights, like everyone's share of the year: the Wrapped tab. */
export function WrappedIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.6} {...props}>
      <path d="M5 20v-5M10 20V7M15 20v-9M20 20V4" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5v14M16 5v14" strokeWidth={3} />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4.5v15L19.5 12z" fill="currentColor" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** Marks an error or a warning (instead of red). */
export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </Icon>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z" />
      <path d="M10 21h4" />
    </Icon>
  );
}

/** A circle half filled: light and dark. */
export function AppearanceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" />
    </Icon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01" />
    </Icon>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
    </Icon>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </Icon>
  );
}

export function ComputerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16.5V20" />
    </Icon>
  );
}

export function FlashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 2 5 13.5h6L10 22l9-12h-6.2z" />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.6} />
    </Icon>
  );
}

/** A smiley with a plus: add or change your reaction. */
export function ReactIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.5 11.5a8.5 8.5 0 1 1-8-8.5" />
      <path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01M19 2.5v5M16.5 5h5" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v11M7 10.5 12 15.5l5-5M5 20h14" />
    </Icon>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15V3M8 7l4-4 4 4M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />
    </Icon>
  );
}

export function BlockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </Icon>
  );
}

export function FlagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Icon>
  );
}

export function SignOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
    </Icon>
  );
}
