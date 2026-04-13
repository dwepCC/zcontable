import client from '../api/client';
import type { FirmConfig } from '../types/dashboard';

export const configService = {
  async getFirmConfig(): Promise<FirmConfig> {
    const res = await client.get<FirmConfig>('/firm-config');
    return res.data;
  },

  /** Membrete del estudio sin tokens Tukifac (PDF, listados). */
  async getFirmBranding(): Promise<FirmConfig> {
    const res = await client.get<FirmConfig>('/firm-config/branding');
    return res.data;
  },

  async updateFirmConfig(input: Partial<FirmConfig>): Promise<FirmConfig> {
    const res = await client.put<FirmConfig>('/firm-config', input);
    return res.data;
  },

  async uploadFirmLogo(file: File): Promise<{ logo_url: string; config: FirmConfig }> {
    const form = new FormData();
    form.append('file', file);
    const res = await client.post<{ success: boolean; data: { logo_url: string; config: FirmConfig } }>(
      '/firm-config/logo',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data.data;
  },
};

