import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logo from '../assets/logo.svg'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { to: '/invoices', label: 'Invoices', icon: '📄' },
  { to: '/budgets', label: 'Budgets', icon: '💰' },
  { to: '/reports', label: 'Reports', icon: '📊' },
  { to: '/cost-centers', label: 'Cost Centers', icon: '🏢' },
]

const adminItem = { to: '/admin', label: 'Admin', icon: '⚙️' }

export default function Sidebar() {
  const { user, logout } = useAuth()

  const items = user?.role === 'admin'
    ? [...navItems, adminItem]
    : navItems

  return (
    <aside className="w-64 bg-sigvaris-blue flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <img src={logo} alt="SIGVARIS" className="h-8 brightness-0 invert" />
        <p className="text-white/60 text-xs mt-1 font-medium tracking-wide uppercase">
          Cost Center Manager
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
            {user?.display_name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.display_name}</p>
            <p className="text-white/50 text-xs capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full text-left text-white/60 hover:text-white text-xs py-1 transition-colors"
        >
          Sign out →
        </button>
      </div>
    </aside>
  )
}
