package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost          string
	DBPort          string
	DBUser          string
	DBPassword      string
	DBName          string
	JWTSecret       string
	ServerPort      string
	StoragePath     string
	TukifacBaseURL           string
	TukifacAPIToken          string
	TukifacPostDocumentsPath string
	TukifacPostSaleNotePath  string
}

var AppConfig *Config

func Load() error {
	if err := godotenv.Load(); err != nil {
		// .env opcional en producción
	}

	AppConfig = &Config{
		DBHost:          getEnv("DB_HOST", "127.0.0.1"),
		DBPort:          getEnv("DB_PORT", "3306"),
		DBUser:          getEnv("DB_USER", "root"),
		DBPassword:      getEnv("DB_PASSWORD", ""),
		DBName:          getEnv("DB_NAME", "miweb_db"),
		JWTSecret:       getEnv("JWT_SECRET", "your-super-secret-key-change-in-production"),
		ServerPort:      getEnv("PORT", "3000"),
		StoragePath:     getEnv("STORAGE_PATH", "./storage"),
		TukifacBaseURL:           getEnv("TUKIFAC_BASE_URL", ""),
		TukifacAPIToken:          getEnv("TUKIFAC_API_TOKEN", ""),
		TukifacPostDocumentsPath: getEnv("TUKIFAC_POST_DOCUMENTS_PATH", "/api/documents"),
		TukifacPostSaleNotePath:  getEnv("TUKIFAC_POST_SALE_NOTE_PATH", "/api/sale-note"),
	}
	return nil
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
