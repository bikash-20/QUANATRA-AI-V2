// "Developed by Bikash Talukder" credit. Used on the login page footer.

const PORTFOLIO_URL = 'https://official-portfolio-kappa-seven.vercel.app/';
const DEVELOPER_NAME = 'Bikash Talukder';

export function DeveloperCredit() {
  return (
    <a
      href={PORTFOLIO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="developer-credit developer-credit--inline"
    >
      <span aria-hidden="true" className="developer-credit-dot" />
      <span>
        Developed by <strong>{DEVELOPER_NAME}</strong>
      </span>
    </a>
  );
}
