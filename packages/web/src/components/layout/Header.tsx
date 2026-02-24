import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { useLogout } from '../../api/hooks';

export function Header() {
  const { user, isAdmin } = useAuthStore();
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const logout = useLogout();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => navigate('/login'),
    });
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center justify-between h-16 px-4">
        {/* Left: Menu button + Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100"
            aria-label="Toggle sidebar"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-cortex-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="font-semibold text-xl hidden sm:block">Cortex</span>
          </Link>
        </div>

        {/* Center: Search (compact) */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <Link
            to="/"
            className="w-full flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span>Search...</span>
          </Link>
        </div>

        {/* Right: User menu */}
        <div className="flex items-center gap-4">
          {isAdmin() && (
            <Link
              to="/review"
              className="hidden sm:flex items-center gap-1 text-sm text-gray-600 hover:text-cortex-600"
            >
              <span>Review</span>
            </Link>
          )}

          <div className="relative group">
            <button className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100">
              <div className="w-8 h-8 bg-cortex-100 rounded-full flex items-center justify-center">
                <span className="text-cortex-700 font-medium text-sm">
                  {user?.display_name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <span className="hidden sm:block text-sm font-medium text-gray-700">
                {user?.display_name}
              </span>
            </button>

            {/* Dropdown */}
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <div className="p-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900">{user?.display_name}</p>
                <p className="text-xs text-gray-500">@{user?.handle}</p>
              </div>
              <div className="p-1">
                <button
                  onClick={handleLogout}
                  disabled={logout.isPending}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
                >
                  {logout.isPending ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
