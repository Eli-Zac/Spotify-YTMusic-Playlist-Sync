export default function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <div className="logo">
      <span className="logo-mark" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 9.5c0-3 2.5-5.5 5.5-5.5H16"
            stroke="url(#logo-grad)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path d="M13.2 1.8 16.4 4l-3.2 2.2" stroke="url(#logo-grad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path
            d="M20 14.5c0 3-2.5 5.5-5.5 5.5H8"
            stroke="url(#logo-grad)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path d="M10.8 22.2 7.6 20l3.2-2.2" stroke="url(#logo-grad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <defs>
            <linearGradient id="logo-grad" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#818cf8" />
              <stop offset="1" stopColor="#c084fc" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      {withWordmark && <span className="logo-word">playlist-sync</span>}
    </div>
  );
}
