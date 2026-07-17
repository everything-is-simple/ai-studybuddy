import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/courses', label: '课程与考试' },
  { to: '/materials', label: '资料' },
  { to: '/settings', label: '设置' },
];

export function AppNavigation() {
  const location = useLocation();

  return (
    <nav className="app-navigation" aria-label="主导航">
      {NAV_ITEMS.map((item) => (
        <Link key={item.to} to={item.to} className={location.pathname.startsWith(item.to) ? 'active' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
