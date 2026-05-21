import { Navigate } from 'react-router-dom';
import { auth } from '../services/auth';
import { P } from '../rbac/codes';

/** Redirige al inicio según permisos (emisor POS → /pos). */
const HomeRedirect = () => {
  if (auth.hasPermission(P.salesEmit) && !auth.hasPermission(P.dashboardView)) {
    return <Navigate to="/pos" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

export default HomeRedirect;
