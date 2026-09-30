const PATHS = {
  shelf: "M4 20h16M6 20V6h3v14M11 20V4h3v16M16 20l-1-12 3-.5 1.5 12.5",
  book: "M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h10",
  plus: "M12 5v14M5 12h14",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM16 16l4 4",
  back: "M15 5l-7 7 7 7",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  out: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
