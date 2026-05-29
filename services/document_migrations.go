package services

import (
	"fmt"
	"time"

	"miappfiber/database"
	"miappfiber/models"

	"gorm.io/gorm"
)

const migDocumentsRecalcStatusV1 = "documents_v1_recalc_status_from_payments"

// RunDocumentMigrations migraciones idempotentes de deudas (datos).
func RunDocumentMigrations(db *gorm.DB) error {
	if err := db.AutoMigrate(&models.SchemaMigration{}); err != nil {
		return err
	}
	steps := []struct {
		name string
		fn   func(*gorm.DB) error
	}{
		{migDocumentsRecalcStatusV1, migrateDocumentsRecalcStatusFromPayments},
	}
	for _, step := range steps {
		if err := applyDocumentMigrationOnce(db, step.name, step.fn); err != nil {
			return fmt.Errorf("%s: %w", step.name, err)
		}
	}
	return nil
}

func applyDocumentMigrationOnce(db *gorm.DB, name string, fn func(*gorm.DB) error) error {
	var n int64
	if err := db.Model(&models.SchemaMigration{}).Where("name = ?", name).Count(&n).Error; err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	if err := fn(db); err != nil {
		return err
	}
	return db.Create(&models.SchemaMigration{Name: name, AppliedAt: time.Now()}).Error
}

func migrateDocumentsRecalcStatusFromPayments(db *gorm.DB) error {
	var ids []uint
	if err := db.Model(&models.Document{}).Pluck("id", &ids).Error; err != nil {
		return err
	}
	svc := NewDocumentService()
	for _, id := range ids {
		if err := svc.RecalculateStatusFromPayments(id); err != nil {
			return err
		}
	}
	return nil
}

// EnsureDocumentMigrationsOnStartup ejecutado desde main (evita ciclo database→services).
func EnsureDocumentMigrationsOnStartup() error {
	return RunDocumentMigrations(database.DB)
}
