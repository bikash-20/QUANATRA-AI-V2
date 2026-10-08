// "Developed by Bikash Talukder" credit. Reused by:
//   - the login page footer
//   - the desktop sidebar footer (mounted inside <AppShell>)
//   - the mobile-tabbar overlay line on the explore/chat pages
//
// The link is the project owner's portfolio. The component renders a
// small-caps muted line; the host decides whether to wrap it in extra
// chrome (footer rows, overlay chips, etc).

const PORTFOLIO_URL = 'https://official-portfolio-kappa-seven.vercel.app/';
const DEVELOPER_NAME = 'Bikash Talukder';

type Variant = 'inline' | 'footer' | 'mobile';

type DeveloperCreditProps = {
  variant?: Variant;
};

export function DeveloperCredit({ variant = 'inline' }: DeveloperCreditProps) {
  return (
    <a
      href={PORTFOLIO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`developer-credit developer-credit--${variant}`}
    >
      <span aria-hidden="true" className="developer-credit-dot" />
      <span>
        Developed by <strong>{DEVELOPER_NAME}</strong>
      </span>
    </a>
  );
}
