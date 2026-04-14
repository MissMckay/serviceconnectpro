const iconPaths = {
  view: "M1.5 12s3.8-6.5 10.5-6.5S22.5 12 22.5 12 18.7 18.5 12 18.5 1.5 12 1.5 12Zm10.5 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  book: "M7 2.5v3M17 2.5v3M4.5 6.5h15M5.5 4.5h13a1 1 0 0 1 1 1v13a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13a1 1 0 0 1 1-1Z",
  cancel: "m7 7 10 10M17 7 7 17",
  edit: "M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Zm12-12L18 6",
  delete: "M5 7h14M9 7V4.5h6V7m-8 0 .7 11.5a1 1 0 0 0 1 .9h6.6a1 1 0 0 0 1-.9L17 7",
  accept: "m5 12 4 4L19 6",
  reject: "m7 7 10 10M17 7 7 17",
  complete: "m3.5 12 3.5 3.5 5-7M13 14l2 2 5-7",
  message: "M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 16.5H9l-4.5 3v-3H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5Z",
  refresh: "M20 6v5h-5M4 18v-5h5M19 11a7 7 0 0 0-12-3M5 13a7 7 0 0 0 12 3",
  previous: "m14.5 6-6 6 6 6",
  next: "m9.5 6 6 6-6 6",
  copy: "M9 9.5h9.5V20H9zM5.5 4H15v3",
  add: "M12 5v14M5 12h14",
  suspend: "M8.5 5.5v13M15.5 5.5v13",
  activate: "m10 7 7 5-7 5V7Z",
  review: "m12 3.8 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8 2.5-5Z",
  browse: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  save: "M5 4.5h11l3 3V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Zm3 0v5h7v-5M9 17h6",
  image: "M4.5 5.5h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Zm2 10 3.3-3.6 2.7 2.8 2.5-2.7 3.5 3.5M9 9.5a1.2 1.2 0 1 0 0-.01Z",
};

export default function DashboardActionIcon({ name, size = 16 }) {
  const path = iconPaths[name] || iconPaths.view;

  return (
    <svg
      className="dashboard-action-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}
