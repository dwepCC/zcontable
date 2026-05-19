package routes

import (
	"miappfiber/controllers"
	"miappfiber/middleware"
	"miappfiber/rbac"

	"github.com/gofiber/fiber/v3"
)

func Setup(app *fiber.App) {
	authCtrl := controllers.NewAuthController()
	meCtrl := controllers.NewMeController()
	dashboardCtrl := controllers.NewDashboardController()
	companyCtrl := controllers.NewCompanyController()
	contactCtrl := controllers.NewContactController()
	documentCtrl := controllers.NewDocumentController()
	paymentCtrl := controllers.NewPaymentController()
	configCtrl := controllers.NewConfigController()
	tukifacCtrl := controllers.NewTukifacController()
	userCtrl := controllers.NewUserController()
	roleCtrl := controllers.NewRoleController()
	reportCtrl := controllers.NewReportController()
	planCatCtrl := controllers.NewPlanCategoryController()
	subPlanCtrl := controllers.NewSubscriptionPlanController()
	liqCtrl := controllers.NewLiquidationController()
	productCtrl := controllers.NewProductController()
	productCatCtrl := controllers.NewProductCategoryController()
	taxSettleCtrl := controllers.NewTaxSettlementController()
	supervisorCtrl := controllers.NewSupervisorController()
	calendarCtrl := controllers.NewFinanceCalendarController()

	app.Post("/api/login", authCtrl.LoginAPI)

	api := app.Group("/api", middleware.JWTProtected())
	api.Get("/dashboard", middleware.RequirePermission(rbac.DashboardView), dashboardCtrl.HomeAPI)
	api.Get("/logout", authCtrl.LogoutAPI)

	api.Get("/me/permissions", meCtrl.PermissionsAPI)

	api.Get("/roles", middleware.RequirePermission(rbac.RBACRolesView), roleCtrl.ListAPI)
	api.Get("/roles/default", middleware.RequirePermission(rbac.RBACRolesView), roleCtrl.GetDefaultAPI)
	api.Post("/roles", middleware.RequirePermission(rbac.RBACRolesManage), roleCtrl.CreateAPI)
	api.Get("/roles/:id", middleware.RequirePermission(rbac.RBACRolesView), roleCtrl.GetAPI)
	api.Put("/roles/:id/default", middleware.RequirePermission(rbac.RBACRolesManage), roleCtrl.SetDefaultAPI)
	api.Post("/roles/:id/clone", middleware.RequirePermission(rbac.RBACRolesManage), roleCtrl.CloneAPI)
	api.Put("/roles/:id", middleware.RequirePermission(rbac.RBACRolesManage), roleCtrl.UpdateAPI)
	api.Delete("/roles/:id", middleware.RequirePermission(rbac.RBACRolesManage), roleCtrl.DeleteAPI)
	api.Get("/permissions/catalog", middleware.RequirePermission(rbac.RBACPermissionsCatalog), roleCtrl.CatalogAPI)
	api.Put("/roles/:id/permissions", middleware.RequirePermission(rbac.RBACRolesManage), roleCtrl.ReplacePermissionsAPI)

	// Configuración API
	api.Get("/firm-config", middleware.RequirePermission(rbac.SettingsFirmView), configCtrl.FirmConfigAPI)
	api.Get("/firm-config/branding", middleware.RequirePermission(rbac.SettingsFirmBrandingView), configCtrl.FirmBrandingAPI)
	api.Put("/firm-config", middleware.RequirePermission(rbac.SettingsFirmUpdate), configCtrl.UpdateFirmConfigAPI)
	api.Post("/firm-config/logo", middleware.RequirePermission(rbac.SettingsFirmUploadLogo), configCtrl.UploadFirmLogoAPI)
	api.Post("/firm-config/statement-bank-logo", middleware.RequirePermission(rbac.SettingsFirmUploadBankLogo), configCtrl.UploadStatementBankLogoAPI)
	api.Post("/firm-config/statement-payment-qr", middleware.RequirePermission(rbac.SettingsFirmUploadPaymentQR), configCtrl.UploadStatementPaymentQrAPI)

	// Companies
	api.Post("/companies/validate-ruc", middleware.RequirePermission(rbac.CompaniesValidateRUC), companyCtrl.ValidateRUCAPI)
	api.Get("/companies/next-internal-code", middleware.RequirePermission(rbac.CompaniesNextCode), companyCtrl.NextInternalCodeAPI)
	api.Get("/companies/import/template", middleware.RequirePermission(rbac.CompaniesImportTemplate), companyCtrl.ImportTemplateAPI)
	api.Post("/companies/import", middleware.RequirePermission(rbac.CompaniesImportSpreadsheet), companyCtrl.ImportCompaniesAPI)
	api.Get("/companies", middleware.RequirePermission(rbac.CompaniesView), companyCtrl.ListAPI)
	api.Get("/companies/:id", middleware.RequirePermission(rbac.CompaniesView), companyCtrl.GetAPI)
	api.Get("/companies/:id/statement", middleware.RequirePermission(rbac.CompaniesView), companyCtrl.StatementAPI)
	api.Post("/companies", middleware.RequirePermission(rbac.CompaniesCreate), companyCtrl.CreateAPI)
	api.Put("/companies/:id", middleware.RequirePermission(rbac.CompaniesUpdate), companyCtrl.UpdateAPI)
	api.Patch("/companies/:id/status", middleware.RequirePermission(rbac.CompaniesStatus), companyCtrl.PatchStatusAPI)
	api.Delete("/companies/:id", middleware.RequirePermission(rbac.CompaniesDelete), companyCtrl.DeleteAPI)

	// Contacts
	api.Get("/companies/:companyID/contacts", middleware.RequirePermission(rbac.ContactsView), contactCtrl.ListByCompanyAPI)
	api.Get("/companies/:companyID/contacts/:id", middleware.RequirePermission(rbac.ContactsView), contactCtrl.GetAPI)
	api.Post("/companies/:companyID/contacts", middleware.RequirePermission(rbac.ContactsCreate), contactCtrl.CreateAPI)
	api.Put("/companies/:companyID/contacts/:id", middleware.RequirePermission(rbac.ContactsUpdate), contactCtrl.UpdateAPI)
	api.Delete("/companies/:companyID/contacts/:id", middleware.RequirePermission(rbac.ContactsDelete), contactCtrl.DeleteAPI)

	// Documents
	api.Get("/documents", middleware.RequirePermission(rbac.DocumentsView), documentCtrl.ListAPI)
	api.Get("/documents/:id", middleware.RequirePermission(rbac.DocumentsView), documentCtrl.GetAPI)
	api.Post("/documents", middleware.RequirePermission(rbac.DocumentsCreate), documentCtrl.CreateAPI)
	api.Put("/documents/:id", middleware.RequirePermission(rbac.DocumentsUpdate), documentCtrl.UpdateAPI)
	api.Delete("/documents/:id", middleware.RequirePermission(rbac.DocumentsDelete), documentCtrl.DeleteAPI)

	// Payments
	api.Get("/payments", middleware.RequirePermission(rbac.PaymentsView), paymentCtrl.ListAPI)
	api.Get("/payments/:id", middleware.RequirePermission(rbac.PaymentsView), paymentCtrl.GetAPI)
	api.Post("/payments", middleware.RequirePermission(rbac.PaymentsCreate), paymentCtrl.CreateAPI)
	api.Post("/payments/:id/issue-tukifac", middleware.RequirePermission(rbac.PaymentsIssueTukifac), paymentCtrl.IssueTukifacAPI)
	api.Put("/payments/:id", middleware.RequirePermission(rbac.PaymentsUpdate), paymentCtrl.UpdateAPI)
	api.Delete("/payments/:id", middleware.RequirePermission(rbac.PaymentsDelete), paymentCtrl.DeleteAPI)
	api.Post("/payments/upload-attachment", middleware.RequirePermission(rbac.PaymentsUploadAttachment), paymentCtrl.UploadAttachmentAPI)

	// Users API
	api.Get("/users", middleware.RequirePermission(rbac.UsersView), userCtrl.ListAPI)
	api.Get("/users/:id", middleware.RequirePermission(rbac.UsersView), userCtrl.GetAPI)
	api.Post("/users", middleware.RequirePermission(rbac.UsersCreate), userCtrl.CreateAPI)
	api.Put("/users/:id", middleware.RequirePermission(rbac.UsersUpdate), userCtrl.UpdateAPI)
	api.Delete("/users/:id", middleware.RequirePermission(rbac.UsersDelete), userCtrl.DeleteAPI)

	// Reports API
	api.Get("/reports/financial", middleware.RequirePermission(rbac.ReportsFinancialView), reportCtrl.FinancialSummaryAPI)

	// Tukifac sync
	api.Get("/tukifac/documents/lists", middleware.RequirePermission(rbac.TukifacDocumentsList), tukifacCtrl.ListDocumentsAPI)
	api.Get("/document/series", middleware.RequirePermission(rbac.TukifacDocumentSeries), tukifacCtrl.DocumentSeriesAPI)
	api.Get("/sale-note/series", middleware.RequirePermission(rbac.TukifacSaleNoteLists), tukifacCtrl.SaleNoteSeriesAPI)
	api.Get("/tukifac/sale-note/lists", middleware.RequirePermission(rbac.TukifacSaleNoteLists), tukifacCtrl.ListSaleNotesAPI)
	api.Post("/documents/sync-tukifac", middleware.RequirePermission(rbac.DocumentsSyncTukifac), tukifacCtrl.SyncDocumentsAPI)
	api.Post("/tukifac/sale-note/sync", middleware.RequirePermission(rbac.TukifacSaleNoteSync), tukifacCtrl.SyncSaleNotesAPI)
	api.Get("/tukifac/fiscal-receipts", middleware.RequirePermission(rbac.TukifacFiscalReceiptsList), tukifacCtrl.ListFiscalReceiptsAPI)
	api.Post("/tukifac/fiscal-receipts/:id/create-payment", middleware.RequirePermission(rbac.TukifacFiscalCreatePayment), tukifacCtrl.CreatePaymentFromReceiptAPI)
	api.Post("/tukifac/fiscal-receipts/:id/link-payment", middleware.RequirePermission(rbac.TukifacFiscalLinkPayment), tukifacCtrl.LinkReceiptAPI)
	api.Patch("/tukifac/fiscal-receipts/:id/tax-settlement", middleware.RequirePermission(rbac.TukifacFiscalPatchTax), tukifacCtrl.PatchReceiptTaxSettlementAPI)
	api.Post("/tukifac/fiscal-receipts/:id/discard", middleware.RequirePermission(rbac.TukifacFiscalDiscard), tukifacCtrl.DiscardReceiptAPI)
	api.Get("/tukifac/sellnow/items", middleware.RequirePermission(rbac.TukifacSellnowItems), tukifacCtrl.ListSellnowItemsAPI)

	// Productos y servicios (SUNAT / Tukifac)
	api.Get("/products", middleware.RequirePermission(rbac.ProductsView), productCtrl.ListAPI)
	api.Get("/products/:id", middleware.RequirePermission(rbac.ProductsView), productCtrl.GetAPI)
	api.Post("/products", middleware.RequirePermission(rbac.ProductsCreate), productCtrl.CreateAPI)
	api.Put("/products/:id", middleware.RequirePermission(rbac.ProductsUpdate), productCtrl.UpdateAPI)
	api.Delete("/products/:id", middleware.RequirePermission(rbac.ProductsDelete), productCtrl.DeleteAPI)
	api.Post("/products/sync-tukifac", middleware.RequirePermission(rbac.ProductsSyncTukifac), productCtrl.SyncTukifacAPI)

	api.Get("/product-categories", middleware.RequirePermission(rbac.ProductCategoriesView), productCatCtrl.ListAPI)
	api.Post("/product-categories", middleware.RequirePermission(rbac.ProductCategoriesCreate), productCatCtrl.CreateAPI)

	// Planes y liquidación
	api.Get("/plan-categories", middleware.RequirePermission(rbac.PlanCategoriesView), planCatCtrl.ListAPI)
	api.Get("/plan-categories/:id", middleware.RequirePermission(rbac.PlanCategoriesView), planCatCtrl.GetAPI)
	api.Post("/plan-categories", middleware.RequirePermission(rbac.PlanCategoriesCreate), planCatCtrl.CreateAPI)
	api.Put("/plan-categories/:id", middleware.RequirePermission(rbac.PlanCategoriesUpdate), planCatCtrl.UpdateAPI)
	api.Delete("/plan-categories/:id", middleware.RequirePermission(rbac.PlanCategoriesDelete), planCatCtrl.DeleteAPI)

	api.Get("/subscription-plans", middleware.RequirePermission(rbac.SubscriptionPlansView), subPlanCtrl.ListAPI)
	api.Get("/subscription-plans/:id", middleware.RequirePermission(rbac.SubscriptionPlansView), subPlanCtrl.GetAPI)
	api.Post("/subscription-plans", middleware.RequirePermission(rbac.SubscriptionPlansCreate), subPlanCtrl.CreateAPI)
	api.Put("/subscription-plans/:id", middleware.RequirePermission(rbac.SubscriptionPlansUpdate), subPlanCtrl.UpdateAPI)
	api.Put("/subscription-plans/:id/tiers", middleware.RequirePermission(rbac.SubscriptionPlansTiers), subPlanCtrl.ReplaceTiersAPI)
	api.Delete("/subscription-plans/:id", middleware.RequirePermission(rbac.SubscriptionPlansDelete), subPlanCtrl.DeleteAPI)

	api.Post("/liquidation/run", middleware.RequirePermission(rbac.LiquidationRun), liqCtrl.RunLiquidationAPI)

	// Liquidaciones de impuestos
	api.Get("/companies/:id/settlements/preview", middleware.RequirePermission(rbac.TaxSettlementsPreview), taxSettleCtrl.PreviewSettlementsAPI)
	api.Get("/tax-settlements", middleware.RequirePermission(rbac.TaxSettlementsList), taxSettleCtrl.ListAPI)
	api.Post("/tax-settlements", middleware.RequirePermission(rbac.TaxSettlementsCreate), taxSettleCtrl.CreateAPI)
	api.Get("/tax-settlements/:id/payment-suggestions", middleware.RequirePermission(rbac.TaxSettlementsPaymentSuggestions), taxSettleCtrl.PaymentSuggestionsAPI)
	api.Get("/tax-settlements/:id", middleware.RequirePermission(rbac.TaxSettlementsView), taxSettleCtrl.GetAPI)
	api.Put("/tax-settlements/:id", middleware.RequirePermission(rbac.TaxSettlementsUpdate), taxSettleCtrl.UpdateAPI)
	api.Post("/tax-settlements/:id/emit", middleware.RequirePermission(rbac.TaxSettlementsEmit), taxSettleCtrl.EmitAPI)
	api.Delete("/tax-settlements/:id", middleware.RequirePermission(rbac.TaxSettlementsDelete), taxSettleCtrl.DeleteAPI)

	// Supervisores contables
	sup := api.Group("/supervisors")
	sup.Get("/dashboard", middleware.RequirePermission(rbac.SupervisorsDashboardView), supervisorCtrl.DashboardAPI)
	sup.Get("/periods", middleware.RequirePermission(rbac.SupervisorsPeriodsView), supervisorCtrl.ListPeriodsAPI)
	sup.Post("/periods", middleware.RequirePermission(rbac.SupervisorsPeriodsCreate), supervisorCtrl.CreatePeriodAPI)
	sup.Put("/periods/:id", middleware.RequirePermission(rbac.SupervisorsPeriodsUpdate), supervisorCtrl.UpdatePeriodAPI)
	sup.Delete("/periods/:id", middleware.RequirePermission(rbac.SupervisorsPeriodsDelete), supervisorCtrl.DeletePeriodAPI)
	sup.Post("/periods/:id/close", middleware.RequirePermission(rbac.SupervisorsPeriodsClose), supervisorCtrl.ClosePeriodAPI)
	sup.Post("/periods/:id/bootstrap-controls", middleware.RequirePermission(rbac.SupervisorsPeriodsBootstrap), supervisorCtrl.BootstrapPeriodAPI)
	sup.Get("/controls", middleware.RequirePermission(rbac.SupervisorsControlsView), supervisorCtrl.ListControlsAPI)
	sup.Get("/controls/:id", middleware.RequirePermission(rbac.SupervisorsControlsView), supervisorCtrl.GetControlAPI)
	sup.Post("/controls", middleware.RequirePermission(rbac.SupervisorsControlsCreate), supervisorCtrl.CreateControlAPI)
	sup.Put("/controls/:id", middleware.RequirePermission(rbac.SupervisorsControlsUpdate), supervisorCtrl.UpdateControlAPI)
	sup.Post("/controls/:id/info-received", middleware.RequirePermission(rbac.SupervisorsControlsUpdate), supervisorCtrl.RegisterInfoReceivedAPI)
	sup.Delete("/controls/:id", middleware.RequirePermission(rbac.SupervisorsControlsDelete), supervisorCtrl.DeleteControlAPI)
	sup.Get("/controls/:controlId/declarations", middleware.RequirePermission(rbac.SupervisorsDeclarationsView), supervisorCtrl.ListDeclarationsAPI)
	sup.Put("/declarations/:id", middleware.RequirePermission(rbac.SupervisorsDeclarationsUpdate), supervisorCtrl.UpdateDeclarationAPI)
	sup.Post("/declarations/:id/approve", middleware.RequirePermission(rbac.SupervisorsDeclarationsApprove), supervisorCtrl.ApproveDeclarationAPI)
	sup.Post("/declarations/:id/observe", middleware.RequirePermission(rbac.SupervisorsDeclarationsObserve), supervisorCtrl.ObserveDeclarationAPI)
	sup.Delete("/declarations/:id", middleware.RequirePermission(rbac.SupervisorsDeclarationsDelete), supervisorCtrl.DeleteDeclarationAPI)
	sup.Get("/controls/:controlId/liquidation", middleware.RequirePermission(rbac.SupervisorsLiquidationsView), supervisorCtrl.GetLiquidationAPI)
	sup.Put("/controls/:controlId/liquidation", middleware.RequirePermission(rbac.SupervisorsLiquidationsUpdate), supervisorCtrl.UpdateLiquidationAPI)
	sup.Post("/controls/:controlId/liquidation/approve", middleware.RequirePermission(rbac.SupervisorsLiquidationsApprove), supervisorCtrl.ApproveLiquidationAPI)
	sup.Post("/controls/:controlId/liquidation/observe", middleware.RequirePermission(rbac.SupervisorsLiquidationsApprove), supervisorCtrl.ObserveLiquidationAPI)
	sup.Get("/controls/:controlId/nps", middleware.RequirePermission(rbac.SupervisorsNPSView), supervisorCtrl.ListNPSAPI)
	sup.Post("/nps", middleware.RequirePermission(rbac.SupervisorsNPSCreate), supervisorCtrl.CreateNPSAPI)
	sup.Put("/nps/:id", middleware.RequirePermission(rbac.SupervisorsNPSUpdate), supervisorCtrl.UpdateNPSAPI)
	sup.Post("/nps/:id/generate", middleware.RequirePermission(rbac.SupervisorsNPSGenerate), supervisorCtrl.GenerateNPSAPI)
	sup.Delete("/nps/:id", middleware.RequirePermission(rbac.SupervisorsNPSDelete), supervisorCtrl.DeleteNPSAPI)
	sup.Get("/reports/monthly", middleware.RequirePermission(rbac.SupervisorsReportsView), supervisorCtrl.ReportMonthlyAPI)
	sup.Get("/history", middleware.RequirePermission(rbac.SupervisorsHistoryView), supervisorCtrl.ListHistoryAPI)
	sup.Get("/observations", middleware.RequirePermission(rbac.SupervisorsObservationsView), supervisorCtrl.ListObservationsAPI)
	sup.Post("/observations", middleware.RequirePermission(rbac.SupervisorsObservationsCreate), supervisorCtrl.CreateObservationAPI)
	sup.Get("/attachments", middleware.RequirePermission(rbac.SupervisorsObservationsView), supervisorCtrl.ListAttachmentsAPI)
	sup.Post("/attachments/upload", middleware.RequirePermission(rbac.SupervisorsAttachmentsUpload), supervisorCtrl.UploadAttachmentAPI)
	sup.Get("/notifications", middleware.RequirePermission(rbac.SupervisorsNotificationsView), supervisorCtrl.ListNotificationsAPI)
	sup.Post("/notifications/:id/read", middleware.RequirePermission(rbac.SupervisorsNotificationsView), supervisorCtrl.MarkNotificationReadAPI)
	sup.Post("/nps/:id/register-payment", middleware.RequirePermission(rbac.SupervisorsNPSRegisterPayment), supervisorCtrl.RegisterNPSPaymentAPI)

	// Calendario contable global (Finanzas)
	cal := api.Group("/finance/calendar")
	cal.Get("/", middleware.RequirePermission(rbac.FinanceCalendarView), calendarCtrl.ListAPI)
	cal.Get("/activities/:activityId/compliance", middleware.RequirePermission(rbac.FinanceCalendarView), calendarCtrl.ComplianceAPI)
	cal.Post("/duplicate", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.DuplicateAPI)
	cal.Post("/", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.CreateAPI)
	cal.Put("/months/:id", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.UpdateAPI)
	cal.Put("/months/:id/close", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.CloseAPI)
	cal.Put("/months/:id/reopen", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.ReopenAPI)
	cal.Delete("/months/:id", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.DeleteAPI)
	cal.Post("/months/:calendarId/marks", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.CreateMarkAPI)
	cal.Delete("/marks/:id", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.DeleteMarkAPI)
	cal.Post("/months/:calendarId/activities", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.CreateActivityAPI)
	cal.Put("/activities/:id", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.UpdateActivityAPI)
	cal.Delete("/activities/:id", middleware.RequirePermission(rbac.FinanceCalendarManage), calendarCtrl.DeleteActivityAPI)
	cal.Get("/:periodYm", middleware.RequirePermission(rbac.FinanceCalendarView), calendarCtrl.GetAPI)
}
