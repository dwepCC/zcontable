package database

import (
	"strings"
	"testing"

	"miappfiber/rbac"
)

// TestRolePermissionCodes_invariants valida propiedades estructurales de la matriz
// canónica (derivada del registro), sin números mágicos que se desincronicen.
func TestRolePermissionCodes_invariants(t *testing.T) {
	all := make(map[string]struct{}, len(rbac.AllPermissionCodes))
	for _, c := range rbac.AllPermissionCodes {
		all[c] = struct{}{}
	}

	for _, roleCode := range rbac.SystemRoleCodes() {
		codes := rbac.RolePermissionCodes(roleCode)
		if len(codes) == 0 {
			t.Fatalf("rol %s: sin permisos canónicos", roleCode)
		}
		seen := make(map[string]struct{}, len(codes))
		for _, c := range codes {
			if _, ok := all[c]; !ok {
				t.Fatalf("rol %s referencia permiso inexistente %q", roleCode, c)
			}
			if _, dup := seen[c]; dup {
				t.Fatalf("rol %s tiene permiso duplicado %q", roleCode, c)
			}
			seen[c] = struct{}{}
		}
	}
}

// TestSuperusuarioHasAllPermissions super_usuario debe tener el catálogo completo.
func TestSuperusuarioHasAllPermissions(t *testing.T) {
	codes := rbac.RolePermissionCodes(rbac.RoleSuperusuario)
	if len(codes) != len(rbac.AllPermissionCodes) {
		t.Fatalf("super_usuario tiene %d permisos, catálogo tiene %d", len(codes), len(rbac.AllPermissionCodes))
	}
}

// TestContadorHasNoSupervisorPermissions el rol Contador no debe tener el módulo supervisores.
func TestContadorHasNoSupervisorPermissions(t *testing.T) {
	for _, c := range rbac.RolePermissionCodes(rbac.RoleContador) {
		if strings.HasPrefix(c, "supervisors.") {
			t.Fatalf("Contador no debería tener %q", c)
		}
	}
}

// TestPrivilegedRolesExcludeStudioAndUsers roles operativos no deben tener alcance global ni gestión de usuarios/roles.
func TestPrivilegedRolesExcludeStudioAndUsers(t *testing.T) {
	for _, roleCode := range []string{rbac.RoleSupervisor, rbac.RoleAdministrador, rbac.RoleGerencia, rbac.RoleContador} {
		for _, forbidden := range []string{rbac.AccessStudio, rbac.UsersView, rbac.RBACRolesManage} {
			for _, c := range rbac.RolePermissionCodes(roleCode) {
				if c == forbidden {
					t.Fatalf("rol %s no debería tener %q", roleCode, forbidden)
				}
			}
		}
	}
}

// TestAsistenteHasKeyPermissions el Asistente debe conservar permisos clave de su flujo.
func TestAsistenteHasKeyPermissions(t *testing.T) {
	have := make(map[string]struct{})
	for _, c := range rbac.RolePermissionCodes(rbac.RoleAsistente) {
		have[c] = struct{}{}
	}
	for _, required := range []string{
		rbac.SupervisorsControlsView,
		rbac.SupervisorsNotificationsView,
		rbac.CompanyCredentialsView,
	} {
		if _, ok := have[required]; !ok {
			t.Fatalf("Asistente falta permiso %q", required)
		}
	}
}
