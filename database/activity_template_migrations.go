package database

import (
	"fmt"

	"miappfiber/models"

	"gorm.io/gorm"
)

const migActivityCodeSequenceSeed = "activity_templates_v1_seed_code_sequence"
const migDropCalendarActivityLegacyCols = "finance_calendar_activities_v9_drop_legacy_columns"

// RunActivityTemplateMigrations migraciones idempotentes del catálogo de actividades.
func RunActivityTemplateMigrations(db *gorm.DB) error {
	if err := db.AutoMigrate(&models.SchemaMigration{}); err != nil {
		return err
	}
	steps := []struct {
		name string
		fn   func(*gorm.DB) error
	}{
		{migActivityCodeSequenceSeed, seedActivityCodeSequence},
		{migDropCalendarActivityLegacyCols, dropFinanceCalendarActivityLegacyColumns},
		{migEnforceCalendarActivityNotNull, enforceFinanceCalendarActivityNotNull},
	}
	for _, step := range steps {
		if err := applyMigrationOnce(db, step.name, step.fn); err != nil {
			return fmt.Errorf("%s: %w", step.name, err)
		}
	}
	return nil
}

func seedActivityCodeSequence(db *gorm.DB) error {
	var n int64
	if err := db.Model(&models.ActivityCodeSequence{}).
		Where("prefix = ?", models.ActivityCodePrefix).
		Count(&n).Error; err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	return db.Create(&models.ActivityCodeSequence{
		Prefix:     models.ActivityCodePrefix,
		LastNumber: 0,
	}).Error
}

func dropFinanceCalendarActivityLegacyColumns(db *gorm.DB) error {
	if !db.Migrator().HasTable("finance_calendar_activities") {
		return nil
	}
	legacyCols := []string{"name", "description", "activity_kind", "priority", "text_color"}
	for _, col := range legacyCols {
		if db.Migrator().HasColumn("finance_calendar_activities", col) {
			if err := db.Migrator().DropColumn("finance_calendar_activities", col); err != nil {
				return fmt.Errorf("drop column %s: %w", col, err)
			}
		}
	}
	return nil
}
