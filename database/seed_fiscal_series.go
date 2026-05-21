package database

import (
	"miappfiber/models"

	"gorm.io/gorm/clause"
)

// SeedFiscalDocumentSeries crea series por defecto (idempotente).
func SeedFiscalDocumentSeries() error {
	defaults := []models.FiscalDocumentSeries{
		{Name: "Nota de Venta", SunatCode: "00", Series: "NV01", CurrentNumber: 0, Active: true, Description: "Nota de venta interna (no se envía a SUNAT)"},
		{Name: "Boleta", SunatCode: "03", Series: "B001", CurrentNumber: 0, Active: true, Description: "Boleta de venta electrónica"},
		{Name: "Factura", SunatCode: "01", Series: "F001", CurrentNumber: 0, Active: true, Description: "Factura electrónica"},
	}
	for i := range defaults {
		row := defaults[i]
		if err := DB.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "sunat_code"}, {Name: "series"}},
			DoNothing: true,
		}).Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}
